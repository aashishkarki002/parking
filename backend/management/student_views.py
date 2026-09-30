"""
Student parking: tenants submit student lists from the tenant portal, admins
approve or reject each student, and the POS recognises approved students at
the gate (by vehicle number on a ticket, or by a student QR card).

  Tenant portal (IsTenant, always scoped to request.user.vendor)
    GET/POST  tenant/student-requests            list / submit (JSON rows or a CSV/XLSX file)
    POST      tenant/student-requests/preview    check a file or rows, save nothing
    GET       tenant/student-requests/<id>
    GET       tenant/students                    this tenant's students (view only)

  Admin (IsAdminOrAbove)
    GET       student-requests?status=pending|reviewed&vendor=<id>
    GET       student-requests/<id>
    POST      student-requests/<id>/review       {approve: [ids], reject: [{id, reason}]}
    GET       students?search=&vendor=&review_status=
    GET       students/<id>/card                 printable QR card (HTML)

  Both
    GET       student-requests/template.csv

  POS (IsPOSOrAbove)
    POST      student-card/scan                  {code: "ST-<uuid>"} toggles entry/exit
"""
from datetime import timedelta

from django.db import transaction
from django.db.models import Prefetch, Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import ParkingSession, Staff, Student, StudentRequest
from .notifications import notify_student_request_submitted
from .permissions import IsAdminOrAbove, IsPOSOrAbove, IsTenant
from .serializers import (
    ParkingSessionSerializer, StudentRequestListSerializer, StudentRequestSerializer,
    StudentReviewSerializer, StudentSerializer,
)
from .student_import import StudentFileError, normalize_rows, read_upload, template_csv

# A card left on the scanner, or scanned twice by a nervous operator, must
# not turn an entry straight into an exit. Same window as the RFID reader.
CARD_COOLDOWN_SECONDS = 10


def _requests_with_students(queryset):
    return queryset.select_related('vendor', 'submitted_by').prefetch_related(
        Prefetch('students', queryset=Student.objects.select_related(
            'vendor', 'vehicle_type', 'reviewed_by')))


def _filter_by_status(queryset, value):
    value = (value or '').lower()
    if value == 'pending':
        return queryset.filter(students__review_status=Student.PENDING).distinct()
    if value == 'reviewed':
        return queryset.exclude(students__review_status=Student.PENDING)
    return queryset


def _row_to_json(clean):
    vehicle_type = clean.get('vehicle_type')
    fmt_time = lambda t: t.strftime('%H:%M') if t else None  # noqa: E731
    return {
        'sn': clean.get('sn', ''),
        'name': clean.get('name', ''),
        'contact_number': clean.get('contact_number', ''),
        'license_plate': clean.get('license_plate', ''),
        'vehicle_type': vehicle_type.id if vehicle_type else None,
        'vehicle_type_name': vehicle_type.name if vehicle_type else None,
        'batch_start_date': clean['batch_start_date'].isoformat() if clean.get('batch_start_date') else None,
        'batch_end_date': clean['batch_end_date'].isoformat() if clean.get('batch_end_date') else None,
        'class_days': clean.get('class_days', []),
        'class_time_from': fmt_time(clean.get('class_time_from')),
        'class_time_to': fmt_time(clean.get('class_time_to')),
        'is_active': clean.get('is_active', True),
    }


def _warnings(vendor, clean_rows):
    """Things the tenant should know but that don't block the submission."""
    plates = {row['license_plate']: i for i, row in enumerate(clean_rows, start=1) if row.get('license_plate')}
    warnings = []
    existing = (Student.objects.filter(vendor=vendor, license_plate__in=plates)
                .exclude(review_status=Student.REJECTED).values_list('license_plate', 'review_status'))
    for plate, review_status in existing:
        warnings.append({'row': plates[plate], 'field': 'license_plate',
                         'message': f'{plate} is already {review_status.lower()} for your students.'})
    members = Staff.objects.filter(license_plate__in=plates).values_list('license_plate', flat=True)
    for plate in members:
        warnings.append({'row': plates[plate], 'field': 'license_plate',
                         'message': f'{plate} is a registered tenant vehicle; tenant rules apply, not student time.'})
    return sorted(warnings, key=lambda w: w['row'])


def _read_rows(request):
    """(source, upload, raw_rows) from either a multipart `file` or JSON
    `students`. Raises StudentFileError for anything unreadable."""
    upload = request.FILES.get('file')
    if upload:
        source, raw_rows = read_upload(upload)
        return source, upload, raw_rows
    raw_rows = request.data.get('students')
    if not isinstance(raw_rows, list) or not raw_rows:
        raise StudentFileError('Add at least one student, or upload a .csv / .xlsx file.')
    if not all(isinstance(row, dict) for row in raw_rows):
        raise StudentFileError('Each student must be an object of fields.')
    return 'MANUAL', None, raw_rows


class TenantStudentRequestViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                                  mixins.CreateModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsTenant]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        queryset = StudentRequest.objects.filter(vendor_id=self.request.user.vendor_id)
        queryset = _filter_by_status(queryset, self.request.query_params.get('status'))
        return _requests_with_students(queryset)

    def get_serializer_class(self):
        return StudentRequestListSerializer if self.action == 'list' else StudentRequestSerializer

    def _check(self, request):
        """Parse and validate the submission. Returns (source, upload,
        clean_rows, payload) — payload is the preview/error body."""
        source, upload, raw_rows = _read_rows(request)
        clean_rows, errors = normalize_rows(raw_rows)
        payload = {
            'source': source,
            'rows': [_row_to_json(row) for row in clean_rows],
            'errors': errors,
            'warnings': _warnings(request.user.vendor, clean_rows),
        }
        return source, upload, clean_rows, payload

    @action(detail=False, methods=['post'])
    def preview(self, request):
        try:
            *_, payload = self._check(request)
        except StudentFileError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload)

    def create(self, request, *args, **kwargs):
        try:
            source, upload, clean_rows, payload = self._check(request)
        except StudentFileError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if payload['errors']:
            count = len({e['row'] for e in payload['errors']})
            return Response({'error': f'{count} row(s) need fixing before this can be submitted.', **payload},
                            status=status.HTTP_400_BAD_REQUEST)

        vendor = request.user.vendor
        with transaction.atomic():
            student_request = StudentRequest(
                vendor=vendor, submitted_by=request.user, source=source,
                note=str(request.data.get('note') or '')[:2000],
            )
            if upload:
                upload.seek(0)
                student_request.original_file.save(upload.name, upload, save=False)
            student_request.save()
            Student.objects.bulk_create(
                Student(request=student_request, vendor=vendor, **row) for row in clean_rows
            )
        notify_student_request_submitted(student_request)

        student_request = _requests_with_students(StudentRequest.objects.filter(pk=student_request.pk)).get()
        return Response(StudentRequestSerializer(student_request).data, status=status.HTTP_201_CREATED)


class TenantStudentViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Tenants only view their students; changes go through the admin."""
    permission_classes = [IsTenant]
    serializer_class = StudentSerializer

    def get_queryset(self):
        queryset = Student.objects.filter(vendor_id=self.request.user.vendor_id).select_related(
            'vendor', 'vehicle_type', 'reviewed_by').order_by('name')
        review_status = self.request.query_params.get('review_status')
        if review_status:
            queryset = queryset.filter(review_status=review_status.upper())
        return queryset


class StudentRequestViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAdminOrAbove]

    def get_queryset(self):
        queryset = StudentRequest.objects.all()
        vendor = self.request.query_params.get('vendor')
        if vendor:
            queryset = queryset.filter(vendor_id=vendor)
        queryset = _filter_by_status(queryset, self.request.query_params.get('status'))
        return _requests_with_students(queryset)

    def get_serializer_class(self):
        return StudentRequestListSerializer if self.action == 'list' else StudentRequestSerializer

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        student_request = self.get_object()
        serializer = StudentReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        approve = set(serializer.validated_data['approve'])
        reject = {item['id']: item['reason'] for item in serializer.validated_data['reject']}

        now = timezone.now()
        with transaction.atomic():
            # Not student_request.students: that reuses the prefetch queryset,
            # whose nullable select_related can't be locked FOR UPDATE.
            students = {s.pk: s for s in Student.objects.select_for_update().filter(request=student_request)}
            unknown = (approve | set(reject)) - set(students)
            if unknown:
                return Response({'error': f'Not in this request: {sorted(unknown)}.'},
                                status=status.HTTP_400_BAD_REQUEST)
            for pk in approve:
                students[pk].review_status, students[pk].reject_reason = Student.APPROVED, ''
            for pk, reason in reject.items():
                students[pk].review_status, students[pk].reject_reason = Student.REJECTED, reason
            changed = [students[pk] for pk in approve | set(reject)]
            for student in changed:
                student.reviewed_by, student.reviewed_at = request.user, now
            Student.objects.bulk_update(
                changed, ['review_status', 'reject_reason', 'reviewed_by', 'reviewed_at'])

        student_request = self.get_queryset().get(pk=student_request.pk)
        return Response(StudentRequestSerializer(student_request).data)


class StudentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAdminOrAbove]
    serializer_class = StudentSerializer

    def get_queryset(self):
        queryset = Student.objects.select_related('vendor', 'vehicle_type', 'reviewed_by').order_by('name')
        params = self.request.query_params
        if params.get('vendor'):
            queryset = queryset.filter(vendor_id=params['vendor'])
        if params.get('review_status'):
            queryset = queryset.filter(review_status=params['review_status'].upper())
        search = (params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(contact_number__icontains=search)
                | Q(license_plate__icontains=''.join(search.split()).upper()))
        return queryset

    @action(detail=True, methods=['get'])
    def card(self, request, pk=None):
        """A printable QR card; the POS scanner reads it as ST-<uuid>."""
        student = self.get_object()
        name, vendor, plate = escape(student.name), escape(student.vendor.name), escape(student.license_plate)
        html = f"""<!doctype html><html><head><meta charset="utf-8"><title>Student card — {name}</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 24px; }}
  .card {{ width: 320px; border: 1px solid #ccc; border-radius: 12px; padding: 16px; text-align: center; }}
  .card img {{ width: 200px; height: 200px; }}
  h1 {{ font-size: 18px; margin: 8px 0 4px; }} p {{ margin: 2px 0; color: #444; font-size: 13px; }}
  @media print {{ body {{ margin: 0; }} .card {{ border: 1px solid #000; }} }}
</style></head><body onload="window.print()">
<div class="card">
  <p><strong>STUDENT PARKING</strong></p>
  <img src="data:image/png;base64,{student.generate_card_qr_code()}" alt="QR code">
  <h1>{name}</h1><p>{vendor}</p><p>{plate}</p>
  <p>Valid until {student.batch_end_date:%Y-%m-%d}</p>
</div></body></html>"""
        return HttpResponse(html)


@api_view(['GET'])
@permission_classes([IsTenant | IsAdminOrAbove])
def student_template_csv(request):
    response = HttpResponse(template_csv(), content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="student-list-template.csv"'
    return response


@api_view(['POST'])
@permission_classes([IsPOSOrAbove])
def student_card_scan(request):
    """
    A student's QR card toggles them in and out, like an RFID tap. With an
    open session it's an EXIT (always allowed, billed with the student's free
    time if they were valid when they came in); otherwise an ENTRY, only for
    a student who is valid today.
    """
    student = Student.from_card_payload(str(request.data.get('code') or ''))
    if student is None:
        return Response({'action': 'INVALID', 'error': 'Unknown student card.'}, status=status.HTTP_404_NOT_FOUND)

    now = timezone.now()
    cooldown = now - timedelta(seconds=CARD_COOLDOWN_SECONDS)
    student_data = {'id': student.id, 'name': student.name, 'vendor': student.vendor.name,
                    'license_plate': student.license_plate, 'batch_end_date': student.batch_end_date}

    with transaction.atomic():
        open_session = (ParkingSession.objects.select_for_update()
                        .filter(Q(student=student) | Q(license_plate__iexact=student.license_plate),
                                exit_time__isnull=True, auto_closed=False)
                        .order_by('-entry_time').first())
        recent = ParkingSession.objects.filter(
            Q(student=student), Q(entry_time__gte=cooldown) | Q(exit_time__gte=cooldown)).exists()
        if recent:
            return Response({'action': 'DUPLICATE', 'student': student_data})

        if open_session:
            if open_session.status not in ('ACTIVE', 'STAMPED'):
                return Response({'action': 'INVALID', 'student': student_data,
                                 'error': f'Ticket {open_session.ticket_number} is already settled.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if not open_session.student_id and not open_session.registered_staff_member_id:
                open_session.student = student
            open_session.exit_time = now
            open_session.update_and_calculate_charges()
            open_session.save()
            return Response({'action': 'EXIT', 'student': student_data,
                             'session': ParkingSessionSerializer(open_session).data})

        reason = student.invalid_reason()
        if reason:
            return Response({'action': 'INVALID', 'student': student_data, 'error': reason},
                            status=status.HTTP_400_BAD_REQUEST)
        if not student.vehicle_type_id:
            return Response({'action': 'INVALID', 'student': student_data,
                             'error': 'This student has no vehicle type. Set one in the admin first.'},
                            status=status.HTTP_400_BAD_REQUEST)
        session = ParkingSession(vehicle_type=student.vehicle_type, license_plate=student.license_plate,
                                 student=student, entry_time=now)
        session.save()
        return Response({'action': 'ENTRY', 'student': student_data,
                         'session': ParkingSessionSerializer(session).data}, status=status.HTTP_201_CREATED)
