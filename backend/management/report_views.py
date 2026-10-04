"""
Server-side data for the back-office pages that used to download every
session ever recorded and filter it in the browser: Reports, Sessions,
Statements, Subscriptions and the member card.

As with dashboard_views, the frontend owns the calendar and sends resolved
instants; this module filters, pages and sums inside them.
"""
import re
from bisect import bisect_right
from datetime import timedelta

from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Replace, TruncMonth, Upper
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .dashboard_views import _parse_instant
from .models import ParkingConfiguration, ParkingPass, ParkingSession, VehicleType
from .permissions import IsPOSOrAbove
from .serializers import TenantBillSerializer, TicketStampSerializer

MAX_BUCKETS = 400
MAX_PAGE_SIZE = 100
# The CSV export takes every filtered row in one go.
MAX_EXPORT_ROWS = 20000
OVERSTAY_MINUTES = 12 * 60


def _int_param(params, name, default):
    raw = params.get(name)
    return default if raw in (None, '') else int(raw)


def _num(value):
    return float(value or 0)


# ---------------------------------------------------------------------------
# Reports — a port of components/reports/metrics.ts#computeMetrics. Keep the
# two in step: the comments there explain every rule applied here.
# ---------------------------------------------------------------------------

LOSS_CAUSE_LABELS = {
    'VALIDATION': 'Tenant validation',
    'PASS': 'Monthly pass',
    'COUPON': 'Coupon',
    'WAIVED': 'Waived at gate',
    'GRACE': 'Free grace period',
}

TWO_WHEELER_NAME = re.compile(r'bike|motor|scoot|moped|two[\s-]*wheel|2[\s-]*w', re.I)


def _vehicle_classifier():
    """Mirrors reports/vehicle-class.ts#buildVehicleClassifier."""
    types = list(VehicleType.objects.values_list('name', 'category'))
    trust_category = any(category == 'BIKE' for _, category in types)

    def by_name(name):
        return 'two' if TWO_WHEELER_NAME.search(name or '') else 'four'

    classes = {
        name: ('two' if category == 'BIKE' else 'four') if trust_category else by_name(name)
        for name, category in types
    }
    return lambda name: classes.get(name) or by_name(name)


def _plate_key(plate):
    return ' '.join((plate or '').strip().upper().split())


def _report_rows(start, end):
    """Sessions entered in [start, end), flattened to what the metrics read."""
    config = ParkingConfiguration.get_solo()
    sessions = (
        ParkingSession.objects.valid()
        .filter(entry_time__gte=start, entry_time__lt=end)
        .select_related('vehicle_type__pricing_plan', 'tenant_bill__vendor', 'applied_coupon')
        .prefetch_related('stamps__vendor')
        .order_by()
    )
    rows = []
    for s in sessions:
        s._solo_config = config
        stamps = list(s.stamps.all())
        bill = getattr(s, 'tenant_bill', None)
        exited = s.exit_time is not None
        rows.append({
            'id': s.pk,
            'entry_time': s.entry_time,
            'plate': _plate_key(s.license_plate),
            'registered': s.registered_staff_member_id is not None,
            'vehicle_type': s.vehicle_type.name,
            'status': s.status,
            'pass': s.status == 'COVERED_BY_PASS' or s.applied_pass_id is not None,
            'coupon': s.applied_coupon_id is not None,
            'stamps': [(stamp.vendor.name, stamp.free_minutes_granted) for stamp in stamps],
            'bill': (bill.vendor.name, bill.overage_minutes, _num(bill.amount)) if bill else None,
            'duration': s.duration_minutes,
            'exited': exited,
            # The pricing properties only matter once the car has left.
            'gross': _num(s.undiscounted_charge) if exited else 0.0,
            'collected': _num(s.calculated_charge),
            'discount': _num(s.discount_value) if exited else 0.0,
            'payment_method': s.payment_method,
        })
    return rows


def _primary_cause(row):
    if row['pass']:
        return 'PASS'
    if row['status'] == 'WAIVED':
        return 'WAIVED'
    if row['stamps']:
        return 'VALIDATION'
    if row['coupon']:
        return 'COUPON'
    return 'GRACE'


def _is_digital(method):
    m = (method or '').lower()
    return m != '' and m != 'cash'


def _new_tenant(vendor):
    return {
        'vendor': vendor, 'stamps': 0, 'sessionsValidated': 0, 'freeMinutesGranted': 0,
        'overageSessions': 0, 'overageMinutes': 0, 'amountBilled': 0.0,
    }


def compute_metrics(rows):
    m = {
        'sessions': 0, 'exited': 0, 'stillParked': 0, 'uniqueVehicles': 0, 'repeatVisits': 0,
        'registeredSessions': 0, 'registeredVehicles': 0, 'visitorSessions': 0, 'visitorVehicles': 0,
        'avgDurationMinutes': 0, 'grossValue': 0.0, 'collected': 0.0, 'foregone': 0.0,
        'recoveredFromTenants': 0.0, 'passValue': 0.0, 'passSessions': 0, 'passVehicles': 0,
        'leakage': 0.0, 'netLost': 0.0, 'minimumSurcharge': 0.0, 'freeMinutesValue': 0.0,
        'captureRate': 0.0, 'chargeableValue': 0.0, 'chargeableCaptureRate': 0.0,
        'cashCollected': 0.0, 'digitalCollected': 0.0, 'unpaidValue': 0.0, 'stampsIssued': 0,
        'sessionsValidated': 0, 'freeMinutesGranted': 0, 'overageSessions': 0, 'overageMinutes': 0,
        'overageBilled': 0.0, 'leakCauses': [], 'tenants': [],
    }
    if not rows:
        return m

    all_plates, registered_plates, visitor_plates, pass_plates = set(), set(), set(), set()
    by_cause = {}
    by_tenant = {}
    duration_total = duration_count = 0

    for s in rows:
        m['sessions'] += 1
        plate = s['plate']
        if plate:
            all_plates.add(plate)
            (registered_plates if s['registered'] else visitor_plates).add(plate)
            if s['pass']:
                pass_plates.add(plate)
        m['registeredSessions' if s['registered'] else 'visitorSessions'] += 1

        if s['stamps']:
            m['stampsIssued'] += len(s['stamps'])
            m['sessionsValidated'] += 1
        for vendor, minutes in s['stamps']:
            m['freeMinutesGranted'] += minutes
            tenant = by_tenant.setdefault(vendor, _new_tenant(vendor))
            tenant['stamps'] += 1
            tenant['freeMinutesGranted'] += minutes
        for vendor in {vendor for vendor, _ in s['stamps']}:
            by_tenant[vendor]['sessionsValidated'] += 1

        if s['bill']:
            vendor, overage, amount = s['bill']
            m['overageSessions'] += 1
            m['overageMinutes'] += overage
            m['overageBilled'] += amount
            tenant = by_tenant.setdefault(vendor, _new_tenant(vendor))
            tenant['overageSessions'] += 1
            tenant['overageMinutes'] += overage
            tenant['amountBilled'] += amount

        if s['duration'] is not None:
            duration_total += s['duration']
            duration_count += 1

        if not s['exited']:
            m['stillParked'] += 1
            continue
        m['exited'] += 1

        gross, collected = s['gross'], s['collected']
        recovered = s['bill'][2] if s['bill'] else 0.0
        foregone = max(0.0, gross - collected)
        m['grossValue'] += gross
        m['collected'] += collected
        m['foregone'] += foregone
        m['minimumSurcharge'] += max(0.0, collected - gross)
        m['recoveredFromTenants'] += recovered
        m['freeMinutesValue'] += s['discount']
        if collected > 0:
            m['digitalCollected' if _is_digital(s['payment_method']) else 'cashCollected'] += collected
        if collected > 0 and s['status'] != 'PAID':
            m['unpaidValue'] += collected

        bucket = by_cause.setdefault(_primary_cause(s), {'sessions': 0, 'foregone': 0.0, 'recovered': 0.0})
        bucket['sessions'] += 1
        bucket['foregone'] += foregone
        bucket['recovered'] += recovered

    m['uniqueVehicles'] = len(all_plates)
    m['repeatVisits'] = max(0, m['sessions'] - m['uniqueVehicles'])
    m['registeredVehicles'] = len(registered_plates)
    m['visitorVehicles'] = len(visitor_plates)
    m['avgDurationMinutes'] = round(duration_total / duration_count) if duration_count else 0

    m['passVehicles'] = len(pass_plates)
    pass_bucket = by_cause.get('PASS')
    m['passValue'] = pass_bucket['foregone'] if pass_bucket else 0.0
    m['passSessions'] = pass_bucket['sessions'] if pass_bucket else 0

    m['leakage'] = max(0.0, m['foregone'] - m['passValue'])
    m['netLost'] = max(0.0, m['leakage'] - m['recoveredFromTenants'])
    m['captureRate'] = m['collected'] / m['grossValue'] * 100 if m['grossValue'] > 0 else 0.0
    m['chargeableValue'] = m['collected'] + m['leakage']
    m['chargeableCaptureRate'] = (
        m['collected'] / m['chargeableValue'] * 100 if m['chargeableValue'] > 0 else 0.0
    )

    m['leakCauses'] = sorted(
        (
            {
                'cause': cause,
                'label': LOSS_CAUSE_LABELS[cause],
                'sessions': v['sessions'],
                'foregone': v['foregone'],
                'recovered': v['recovered'],
                'pct': v['foregone'] / m['leakage'] * 100 if m['leakage'] > 0 else 0.0,
            }
            for cause, v in by_cause.items()
            if cause != 'PASS' and v['foregone'] > 0
        ),
        key=lambda c: -c['foregone'],
    )
    m['tenants'] = sorted(by_tenant.values(), key=lambda t: (-t['amountBilled'], -t['stamps']))
    return m


def _traffic(rows, edges):
    """Arrivals per bucket plus the traffic figures, for one vehicle class."""
    arrivals = [0] * max(len(edges) - 1, 0)
    for s in rows:
        i = bisect_right(edges, s['entry_time']) - 1
        if 0 <= i < len(arrivals):
            arrivals[i] += 1
    metrics = compute_metrics(rows)
    return {
        'arrivals': arrivals,
        'sessions': metrics['sessions'],
        'avgDurationMinutes': metrics['avgDurationMinutes'],
        'uniqueVehicles': metrics['uniqueVehicles'],
        'registeredVehicles': metrics['registeredVehicles'],
        'repeatVisits': metrics['repeatVisits'],
    }


def _pass_fees(start, end):
    """Mirrors reports/passes.ts#passFeesInWindow: fees apportioned by overlap."""
    summary = {'feesEarned': 0.0, 'passes': 0, 'fullTermValue': 0.0}
    for valid_from, valid_until, price in (
        ParkingPass.objects.filter(valid_from__lt=end, valid_until__gt=start)
        .values_list('valid_from', 'valid_until', 'price_paid')
    ):
        term = (valid_until - valid_from).total_seconds()
        overlap = (min(valid_until, end) - max(valid_from, start)).total_seconds()
        if term <= 0 or overlap <= 0:
            continue
        summary['passes'] += 1
        summary['fullTermValue'] += _num(price)
        summary['feesEarned'] += _num(price) * overlap / term
    return summary


@api_view(['GET'])
@permission_classes([IsPOSOrAbove])
def report_summary(request):
    """
    GET /parking/reports/summary?start=&end=&prev_start=&prev_end=&edges=

    The Reports page: metrics for the window and its baseline, pass fees
    apportioned to the window, and arrivals per bucket by vehicle class.
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

    current = _report_rows(start, end)
    classify = _vehicle_classifier()
    two = [s for s in current if classify(s['vehicle_type']) == 'two']
    four = [s for s in current if classify(s['vehicle_type']) == 'four']

    return Response({
        'current': compute_metrics(current),
        'previous': compute_metrics(_report_rows(prev_start, prev_end)),
        'passFees': _pass_fees(start, end),
        'traffic': {
            'all': _traffic(current, edges),
            'two': _traffic(two, edges),
            'four': _traffic(four, edges),
        },
    })


# ---------------------------------------------------------------------------
# Sessions page — one filtered page at a time, plus its KPI strip.
# ---------------------------------------------------------------------------

class SessionRowSerializer(serializers.ModelSerializer):
    """The list columns only — no stamps, bills, students or re-pricing."""
    vehicle_type = serializers.StringRelatedField()
    registered_staff_member = serializers.StringRelatedField()
    applied_coupon = serializers.StringRelatedField()
    applied_pass = serializers.StringRelatedField()

    class Meta:
        model = ParkingSession
        fields = [
            'id', 'ticket_number', 'vehicle_type', 'license_plate', 'registered_staff_member',
            'entry_time', 'exit_time', 'duration_minutes', 'applied_coupon', 'applied_pass',
            'calculated_charge', 'payment_method', 'status', 'notes', 'auto_closed',
        ]


UNPAID = Q(status='COMPLETED', calculated_charge__gt=0)


def _normalized_plate(raw):
    return re.sub(r'[\s-]', '', raw or '').upper()


def _filtered_sessions(params):
    qs = ParkingSession.objects.all()
    session_status = params.get('status')
    if session_status and session_status != 'ALL':
        qs = qs.filter(status=session_status)
    vehicle_type = params.get('vehicle_type')
    if vehicle_type and vehicle_type != 'ALL':
        qs = qs.filter(vehicle_type__name=vehicle_type)
    payment = params.get('payment')
    if payment == 'UNPAID':
        qs = qs.filter(UNPAID)
    elif payment in ('CASH', 'ONLINE_PAYMENT'):
        qs = qs.filter(payment_method=payment)
    if params.get('entry_after'):
        qs = qs.filter(entry_time__gte=_parse_instant(params['entry_after'], 'entry_after'))
    if params.get('entry_before'):
        qs = qs.filter(entry_time__lt=_parse_instant(params['entry_before'], 'entry_before'))
    search = (params.get('search') or '').strip()
    if search:
        qs = qs.filter(Q(ticket_number__icontains=search) | Q(license_plate__icontains=search))
    plate = _normalized_plate(params.get('plate'))
    if plate:
        # Exact plate, ignoring spaces, dashes and case (the member card).
        qs = qs.annotate(
            _plate=Upper(Replace(Replace('license_plate', Value(' '), Value('')), Value('-'), Value('')))
        ).filter(_plate=plate)
    return qs


@api_view(['GET'])
@permission_classes([IsPOSOrAbove])
def sessions_table(request):
    """
    GET /parking/sessions-table?status=&vehicle_type=&payment=&entry_after=
        &entry_before=&search=&plate=&page=&page_size=&export=1

    One page of the sessions table, newest first. `export=1` lifts the page
    size cap so the CSV download gets every filtered row.
    """
    params = request.query_params
    try:
        qs = _filtered_sessions(params)
        page = max(_int_param(params, 'page', 1), 1)
        cap = MAX_EXPORT_ROWS if params.get('export') == '1' else MAX_PAGE_SIZE
        page_size = min(max(_int_param(params, 'page_size', 10), 1), cap)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    offset = (page - 1) * page_size
    rows = (
        qs.select_related('vehicle_type', 'registered_staff_member', 'applied_coupon', 'applied_pass__staff')
        .order_by('-entry_time')[offset:offset + page_size]
    )
    return Response({'count': qs.count(), 'results': SessionRowSerializer(rows, many=True).data})


@api_view(['GET'])
@permission_classes([IsPOSOrAbove])
def sessions_overview(request):
    """
    GET /parking/sessions-table/overview?day_start=<iso>

    The sessions page's KPI strip, tab counts, what's parked by vehicle type,
    the vehicle-type filter options and today's entry/exit spans for the
    occupancy chart. `day_start` is local midnight, from the browser.
    """
    try:
        day_start = _parse_instant(request.query_params.get('day_start'), 'day_start')
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    day_end = day_start + timedelta(days=1)
    now = timezone.now()
    sessions = ParkingSession.objects.all()

    tab_counts = dict(sessions.order_by().values_list('status').annotate(n=Count('id')))
    tab_counts['ALL'] = sum(tab_counts.values())

    active = sessions.filter(status='ACTIVE')
    oldest = active.order_by('entry_time').select_related('vehicle_type').first()
    longest_mins = int((now - oldest.entry_time).total_seconds() // 60) if oldest else 0

    closed_today = sessions.filter(exit_time__gte=day_start, exit_time__lt=day_end).exclude(status='ACTIVE')
    timed = closed_today.filter(auto_closed=False, duration_minutes__isnull=False).aggregate(
        n=Count('id'), total=Sum('duration_minutes'))
    closed_count = closed_today.count()

    paid_today = closed_today.filter(status='PAID')
    money = paid_today.aggregate(
        cash=Sum('calculated_charge', filter=Q(payment_method='CASH')),
        online=Sum('calculated_charge', filter=Q(payment_method='ONLINE_PAYMENT')),
    )
    unsettled = sessions.filter(UNPAID).aggregate(n=Count('id'), total=Sum('calculated_charge'))

    parked_mix = list(
        active.order_by().values_list('vehicle_type__name').annotate(n=Count('id')).order_by('-n')
    )
    vehicle_types = sorted(
        sessions.order_by().values_list('vehicle_type__name', flat=True).distinct()
    )
    # Anyone on site at some point today: entered before midnight tonight and
    # either still parked or left after midnight this morning.
    spans = list(
        sessions.filter(entry_time__lt=day_end)
        .filter(Q(exit_time__isnull=True, status='ACTIVE') | Q(exit_time__gte=day_start))
        .order_by()
        .values('entry_time', 'exit_time')
    )

    cash, online = _num(money['cash']), _num(money['online'])
    return Response({
        'stats': {
            'activeCount': tab_counts.get('ACTIVE', 0),
            'longestMins': max(longest_mins, 0),
            'longestVehicle': oldest.vehicle_type.name if oldest else '',
            'overstayCount': active.filter(entry_time__lte=now - timedelta(minutes=OVERSTAY_MINUTES)).count(),
            'closedTodayCount': closed_count,
            'avgStay': (timed['total'] or 0) / timed['n'] if timed['n'] else 0,
            'hasTimedExits': timed['n'] > 0,
            'autoClosedToday': closed_count - timed['n'],
            'cashToday': cash,
            'onlineToday': online,
            'collectedToday': cash + online,
            'unsettledCount': unsettled['n'],
            'unsettledTotal': _num(unsettled['total']),
        },
        'tabCounts': tab_counts,
        'parkedMix': [[name or 'Unknown', n] for name, n in parked_mix],
        'vehicleTypes': [v for v in vehicle_types if v],
        'todaySpans': spans,
    })


# ---------------------------------------------------------------------------
# Statements — only stamped guest visits ever reach the page.
# ---------------------------------------------------------------------------

class GuestVisitSerializer(serializers.ModelSerializer):
    vehicle_type = serializers.StringRelatedField()
    registered_staff_member = serializers.StringRelatedField()
    stamps = TicketStampSerializer(many=True, read_only=True)
    total_stamp_minutes = serializers.IntegerField(read_only=True)
    tenant_bill = TenantBillSerializer(read_only=True)

    class Meta:
        model = ParkingSession
        fields = [
            'id', 'ticket_number', 'license_plate', 'vehicle_type', 'registered_staff_member',
            'entry_time', 'exit_time', 'duration_minutes', 'status', 'stamps',
            'total_stamp_minutes', 'tenant_bill',
        ]


def _guest_visits():
    # Mirrors statements/derive.ts#isGuestVisit.
    return ParkingSession.objects.filter(
        registered_staff_member__isnull=True, stamps__isnull=False
    ).distinct()


@api_view(['GET'])
@permission_classes([IsPOSOrAbove])
def statement_visits(request):
    """
    GET /parking/statements/visits?start=&end=

    Stamped guest visits entered in [start, end] (both optional — "all time").
    """
    params = request.query_params
    qs = _guest_visits()
    try:
        if params.get('start'):
            qs = qs.filter(entry_time__gte=_parse_instant(params['start'], 'start'))
        if params.get('end'):
            qs = qs.filter(entry_time__lte=_parse_instant(params['end'], 'end'))
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    qs = (
        qs.select_related('vehicle_type', 'registered_staff_member', 'tenant_bill__vendor')
        .prefetch_related('stamps__vendor')
        .order_by('-entry_time')
    )
    return Response(GuestVisitSerializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([IsPOSOrAbove])
def statement_months(request):
    """
    GET /parking/statements/months

    Local months ('YYYY-MM') that have at least one stamped guest visit,
    newest first, so the period picker never offers an empty month.
    """
    months = (
        _guest_visits().order_by()
        .annotate(month=TruncMonth('entry_time', tzinfo=timezone.get_current_timezone()))
        .values_list('month', flat=True)
        .distinct()
    )
    return Response(sorted({m.strftime('%Y-%m') for m in months}, reverse=True))


# ---------------------------------------------------------------------------
# Subscriptions — lapsed passes still being used.
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsPOSOrAbove])
def lapsed_pass_usage(request):
    """
    GET /parking/pass-lapsed-usage

    For each active pass past its end date: sessions its vehicles have
    started since, and what is still unpaid on them.
    """
    now = timezone.now()
    lapsed = list(
        ParkingPass.objects.filter(is_active=True, valid_until__lt=now).prefetch_related('extra_vehicles')
    )
    if not lapsed:
        return Response([])
    vehicles = {p.pk: {p.staff_id, *(v.pk for v in p.extra_vehicles.all())} for p in lapsed}
    # One query for every candidate session, matched to its passes below.
    sessions = ParkingSession.objects.filter(
        registered_staff_member_id__in=set().union(*vehicles.values()),
        entry_time__gt=min(p.valid_until for p in lapsed),
    ).values_list('registered_staff_member_id', 'entry_time', 'status', 'calculated_charge')

    usage = {p.pk: {'pass_id': p.pk, 'sessions_count': 0, 'unbilled': 0.0} for p in lapsed}
    for staff_id, entry_time, session_status, charge in sessions:
        for p in lapsed:
            if staff_id in vehicles[p.pk] and entry_time > p.valid_until:
                usage[p.pk]['sessions_count'] += 1
                if session_status == 'COMPLETED':
                    usage[p.pk]['unbilled'] += _num(charge)
    return Response([u for u in usage.values() if u['sessions_count']])
