"""
Outbound email notifications to the Sallyan House office.

Sent over the SMTP account in settings (EMAIL_HOST / EMAIL_HOST_USER, i.e.
noreply@sallyanhouse.com) to settings.STAFF_NOTIFICATION_EMAILS. A failed
send is logged, never raised: the tenant's submission is already saved and
must not error out because the mail server is slow or down.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

logger = logging.getLogger(__name__)


def notify_student_request_submitted(student_request):
    recipients = getattr(settings, 'STAFF_NOTIFICATION_EMAILS', [])
    if not recipients:
        return

    students = list(student_request.students.select_related('vehicle_type'))
    vendor = student_request.vendor
    submitter = student_request.submitted_by
    submitted_by = (submitter.get_full_name() or submitter.get_username()) if submitter else 'Unknown'

    lines = [
        f"{vendor.name} submitted {len(students)} student(s) for parking approval.",
        "",
        f"Submitted by: {submitted_by}",
        f"Submitted at: {timezone.localtime(student_request.submitted_at):%Y-%m-%d %H:%M}",
        f"Source: {student_request.get_source_display()}",
    ]
    if student_request.note:
        lines += ["", "Note from tenant:", student_request.note]
    lines += ["", "Students:"]
    for i, s in enumerate(students, start=1):
        vehicle = f" ({s.vehicle_type.name})" if s.vehicle_type else ''
        lines.append(f"  {i}. {s.name} — {s.license_plate}{vehicle}, batch ends {s.batch_end_date:%Y-%m-%d}")
    lines += ["", "Review it in the admin panel under Student Requests."]

    try:
        send_mail(
            subject=f"New student approval request — {vendor.name} ({len(students)})",
            message="\n".join(lines),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipients,
            fail_silently=False,
        )
    except Exception:
        logger.exception("Could not email student request %s", student_request.pk)
