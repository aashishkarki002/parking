"""
Admin dashboard data — aggregated in SQL so the page never has to download
every session ever recorded.

The frontend owns the calendar (presets, like-for-like baselines, bucket
granularity — see parking-frontend-master/src/components/dashboard/scope.ts)
and sends the resolved instants; this module only counts and sums inside them.
"""
from decimal import Decimal

from django.db.models import Case, CharField, Count, DecimalField, IntegerField, Q, Sum, Value, When
from django.db.models.functions import Coalesce
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import ParkingSession
from .permissions import IsAdminOrAbove, IsPOSOrAbove

MAX_BUCKETS = 400
MAX_PAGE_SIZE = 100

# Mirrors isDigitalPayment on the frontend: any recorded method other than cash.
DIGITAL = Q(payment_method__isnull=False) & ~Q(payment_method='') & ~Q(payment_method__iexact='cash')
CASH = ~DIGITAL

ZERO = Value(Decimal('0'), output_field=DecimalField(max_digits=12, decimal_places=2))


def _charge_sum(filter=None):
    return Coalesce(Sum('calculated_charge', filter=filter), ZERO)


def _parse_instant(raw, name):
    value = parse_datetime(raw or '')
    if value is None:
        raise ValueError(f'{name} must be an ISO 8601 datetime.')
    return value


def _window(qs, start, end):
    return qs.filter(entry_time__gte=start, entry_time__lt=end)


def _totals(qs):
    totals = qs.aggregate(count=Count('id'), revenue=_charge_sum(), digital=_charge_sum(DIGITAL))
    return {
        'count': totals['count'],
        'revenue': float(totals['revenue']),
        'digital': float(totals['digital']),
    }


def _counts(qs, field):
    return [[row[field] or '', row['n']] for row in qs.values(field).annotate(n=Count('id')).order_by('-n')]


@api_view(['GET'])
@permission_classes([IsAdminOrAbove])
def dashboard_summary(request):
    """
    GET /parking/dashboard/summary
        ?start=&end=&prev_start=&prev_end=   window and baseline, ISO instants
        &edges=<iso>,<iso>,...               bucket boundaries for the revenue chart

    KPI totals for both windows, cash/digital revenue per bucket, and the
    vehicle / payment / status breakdowns for the current window.
    """
    params = request.query_params
    try:
        start = _parse_instant(params.get('start'), 'start')
        end = _parse_instant(params.get('end'), 'end')
        prev_start = _parse_instant(params.get('prev_start'), 'prev_start')
        prev_end = _parse_instant(params.get('prev_end'), 'prev_end')
        edges = [_parse_instant(e, 'edges') for e in (params.get('edges') or '').split(',') if e]
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    if len(edges) > MAX_BUCKETS + 1:
        return Response({'error': f'At most {MAX_BUCKETS} buckets.'}, status=status.HTTP_400_BAD_REQUEST)

    sessions = ParkingSession.objects.all()
    current = _window(sessions, start, end)
    previous = _window(sessions, prev_start, prev_end)

    buckets = [{'cash': 0.0, 'digital': 0.0} for _ in range(max(len(edges) - 1, 0))]
    if buckets:
        bucket_of = Case(
            *[
                When(entry_time__gte=lo, entry_time__lt=hi, then=Value(i))
                for i, (lo, hi) in enumerate(zip(edges, edges[1:]))
            ],
            default=Value(-1),
            output_field=IntegerField(),
        )
        rows = (
            current.annotate(bucket=bucket_of)
            .filter(bucket__gte=0)
            .values('bucket')
            .annotate(cash=_charge_sum(CASH), digital=_charge_sum(DIGITAL))
            .order_by()
        )
        for row in rows:
            buckets[row['bucket']] = {'cash': float(row['cash']), 'digital': float(row['digital'])}

    payment_kind = Case(
        When(Q(payment_method__isnull=True) | Q(payment_method=''), then=Value('Unpaid')),
        When(payment_method__iexact='cash', then=Value('Cash')),
        default=Value('Online / QR'),
        output_field=CharField(),
    )

    return Response({
        'current': _totals(current),
        'previous': _totals(previous),
        'buckets': buckets,
        'mix': {
            'vehicle': _counts(current, 'vehicle_type__name'),
            'payment': _counts(current.annotate(kind=payment_kind), 'kind'),
            'status': _counts(current, 'status'),
        },
    })


@api_view(['GET'])
@permission_classes([IsPOSOrAbove])
def session_counts(request):
    """
    GET /parking/dashboard/session-counts

    The sidebar's badges: cars still parked, and exits waiting on payment.
    """
    return Response(ParkingSession.objects.aggregate(
        active=Count('id', filter=Q(status='ACTIVE')),
        unpaid_exits=Count('id', filter=Q(status='COMPLETED', calculated_charge__gt=0)),
    ))


@api_view(['GET'])
@permission_classes([IsAdminOrAbove])
def dashboard_sessions(request):
    """
    GET /parking/dashboard/sessions?start=&end=&status=&page=&page_size=

    One page of the dashboard's sessions table, newest first, with only the
    columns the table shows — no stamps, bills or student lookups per row.
    """
    params = request.query_params
    try:
        start = _parse_instant(params.get('start'), 'start')
        end = _parse_instant(params.get('end'), 'end')
        page = max(int(params.get('page', 1)), 1)
        page_size = min(max(int(params.get('page_size', 10)), 1), MAX_PAGE_SIZE)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    qs = _window(ParkingSession.objects.all(), start, end)
    session_status = params.get('status')
    if session_status and session_status != 'all':
        qs = qs.filter(status=session_status)

    count = qs.count()
    offset = (page - 1) * page_size
    rows = qs.order_by('-entry_time').values(
        'id', 'ticket_number', 'license_plate', 'status', 'entry_time', 'calculated_charge'
    )[offset:offset + page_size]

    return Response({
        'count': count,
        'results': [
            {
                **row,
                'calculated_charge': None if row['calculated_charge'] is None else str(row['calculated_charge']),
            }
            for row in rows
        ],
    })
