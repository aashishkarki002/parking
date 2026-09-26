# management/rfid.py
"""
RFID gate: one keyboard-wedge reader at the booth handles both directions,
so every tap toggles the tenant member's state — open session -> EXIT,
no open session -> ENTRY. The card carries only a UID; all timestamps are
server-side.

Sessions are the same ParkingSession rows the tenant QR-card flow writes
(registered_staff_member set), so a tenant who entered by QR can exit by
RFID and vice versa, and exits are billed by update_and_calculate_charges()
exactly like a QR-card exit (tenant access window, pass coverage).

Each function returns (http_status, payload). payload['status'] is the
machine-readable outcome the POS screen switches on.
"""
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from .models import CardScanLog, ParkingPass, ParkingSession, RFIDCard

TAP_COOLDOWN_SECONDS = 10


def _log(card, uid, action, reject_reason=''):
    CardScanLog.objects.create(
        staff=card.staff if card else None, card_code_used=uid[:64],
        action=action, source='RFID', reject_reason=reject_reason,
    )


def _duration_minutes(session):
    if not session.exit_time:
        return None
    return int((session.exit_time - session.entry_time).total_seconds() // 60)


def _tenant_payload(card):
    staff = card.staff
    return {
        'uid': card.uid,
        'tenant_name': staff.name,
        'company': staff.company.name if staff.company else None,
        'license_plate': staff.license_plate,
    }


def _lock_active_card(uid):
    """The active card for this UID, row-locked so concurrent taps of the
    same card serialize. None if unknown or deactivated."""
    return (
        RFIDCard.objects.select_for_update(of=('self',))
        .select_related('staff__company', 'staff__vehicle_type')
        .filter(uid=uid, is_active=True)
        .first()
    )


def _lock_open_session(staff):
    return (
        ParkingSession.objects.select_for_update()
        .filter(registered_staff_member=staff, exit_time__isnull=True)
        .order_by('-entry_time')
        .first()
    )


def _entry_denied(card):
    """(http_status, payload) if this member may not enter now, else None.
    Exit is never gated — only entry is."""
    staff = card.staff
    # EasyManage-driven revoke (tenant terminated/vacated) — same gate rule
    # as the QR-card flow's _resolve_staff_from_scan.
    if staff.company is not None and not staff.company.gate_access_allowed:
        return 403, {'status': 'access_revoked', **_tenant_payload(card),
                     'message': 'This tenant no longer has gate access. Contact the office.'}
    if ParkingPass.active_for_staff(staff) is None:
        return 403, {'status': 'subscription_expired', **_tenant_payload(card),
                     'message': 'No active monthly subscription.'}
    if staff.vehicle_type is None:
        return 400, {'status': 'no_vehicle_type', **_tenant_payload(card),
                     'message': 'This tenant member has no vehicle type assigned.'}
    return None


def _open_entry(card, now):
    staff = card.staff
    return ParkingSession.objects.create(
        vehicle_type=staff.vehicle_type,
        license_plate=staff.license_plate,
        registered_staff_member=staff,
        rfid_card=card,
        entry_time=now,
        status='ACTIVE',
    )


def _mark_auto_closed(session, now):
    """Flag a session whose exit_time is not a real exit. Its charge is
    dropped since there is no real duration to bill."""
    if session.exit_time is None:
        session.exit_time = now
    session.auto_closed = True
    session.duration_minutes = None
    session.calculated_charge = 0
    session.status = 'WAIVED'
    session.notes = (session.notes + '\n' if session.notes else '') + \
        f'Auto-closed by staff correction at {timezone.localtime(now):%Y-%m-%d %H:%M:%S}.'
    session.save()


def tap(uid):
    uid = (uid or '').strip()
    try:
        with transaction.atomic():
            card = _lock_active_card(uid)
            if card is None:
                _log(None, uid, 'REJECTED', 'unknown or inactive RFID card')
                return 404, {'status': 'unknown_card', 'uid': uid,
                             'message': 'Card not recognised or deactivated.'}

            now = timezone.now()
            staff = card.staff
            open_session = _lock_open_session(staff)

            # Readers repeat a UID if the card lingers on the pad; treat any
            # tap within the cooldown of this member's last entry/exit as
            # the same tap.
            last = open_session or ParkingSession.objects.filter(
                registered_staff_member=staff).order_by('-entry_time').first()
            if last is not None:
                last_event = last.exit_time or last.entry_time
                if now - last_event < timedelta(seconds=TAP_COOLDOWN_SECONDS):
                    return 200, {'status': 'ignored_duplicate', **_tenant_payload(card)}

            if open_session is not None:
                open_session.exit_time = now
                open_session.update_and_calculate_charges()
                open_session.save()
                _log(card, uid, 'EXIT')
                return 200, {
                    'status': 'exit', **_tenant_payload(card),
                    'session_id': str(open_session.id),
                    'ticket_number': open_session.ticket_number,
                    'entry_time': open_session.entry_time,
                    'exit_time': open_session.exit_time,
                    'duration_minutes': _duration_minutes(open_session),
                    'calculated_charge': open_session.calculated_charge,
                }

            denied = _entry_denied(card)
            if denied:
                _log(card, uid, 'REJECTED', denied[1]['status'])
                return denied

            session = _open_entry(card, now)
            _log(card, uid, 'ENTRY')
            return 201, {
                'status': 'entry', **_tenant_payload(card),
                'session_id': str(session.id),
                'ticket_number': session.ticket_number,
                'entry_time': session.entry_time,
            }
    except IntegrityError:
        # one_open_session_per_rfid_card caught a concurrent double tap
        # that slipped past the row lock — the other tap already won.
        return 200, {'status': 'ignored_duplicate', 'uid': uid}


def force_entry(uid, corrects_session_id=None):
    """
    Staff correction for a tenant who left without tapping: their arrival
    tap closed the stale session as an EXIT when it should have been an
    ENTRY. Flags the wrongly-closed session (the still-open one, or the one
    the POS just showed as an exit — `corrects_session_id`) as auto_closed
    and opens a fresh entry. All-or-nothing: if entry is denied, nothing
    changes.
    """
    uid = (uid or '').strip()
    with transaction.atomic():
        card = _lock_active_card(uid)
        if card is None:
            return 404, {'status': 'unknown_card', 'uid': uid,
                         'message': 'Card not recognised or deactivated.'}

        denied = _entry_denied(card)
        if denied:
            return denied

        now = timezone.now()
        staff = card.staff
        stale = _lock_open_session(staff)

        if stale is None and corrects_session_id:
            latest = (
                ParkingSession.objects.select_for_update()
                .filter(registered_staff_member=staff).order_by('-entry_time').first()
            )
            if latest is None or str(latest.id) != str(corrects_session_id):
                return 409, {'status': 'stale_correction', **_tenant_payload(card),
                             'message': 'That exit is no longer the latest session for this card.'}
            if latest.status == 'PAID':
                return 409, {'status': 'already_paid', **_tenant_payload(card),
                             'message': 'That exit was already paid — correct it from the admin.'}
            stale = latest

        if stale is not None and not stale.auto_closed:
            _mark_auto_closed(stale, now)

        session = _open_entry(card, now)
        _log(card, uid, 'FORCED_ENTRY')
        return 201, {
            'status': 'entry', **_tenant_payload(card),
            'forced': True,
            'auto_closed_session_id': str(stale.id) if stale else None,
            'session_id': str(session.id),
            'ticket_number': session.ticket_number,
            'entry_time': session.entry_time,
        }


def lookup(uid):
    """
    Who holds this card — read-only, for identifying a card on the desk.
    Unlike tap(), a deactivated card is still found (that's usually the one
    someone is holding up asking "whose is this?"), and nothing is logged
    or toggled.
    """
    uid = (uid or '').strip()
    card = (
        RFIDCard.objects.select_related('staff__company', 'staff__vehicle_type')
        .filter(uid=uid).first()
    )
    if card is None:
        return {'found': False, 'uid': uid}

    staff = card.staff
    active_pass = ParkingPass.active_for_staff(staff)
    open_session = (
        ParkingSession.objects.filter(registered_staff_member=staff, exit_time__isnull=True)
        .order_by('-entry_time').first()
    )
    last_card_session = ParkingSession.objects.filter(rfid_card=card).order_by('-entry_time').first()
    last_used = (last_card_session.exit_time or last_card_session.entry_time) if last_card_session else None

    return {
        'found': True,
        'uid': card.uid,
        'card': {
            'id': card.pk,
            'is_active': card.is_active,
            'issued_at': card.created_at,
            'last_used': last_used,
            'other_cards': staff.rfid_cards.exclude(pk=card.pk).count(),
        },
        'tenant': {
            'id': staff.pk,
            'name': staff.name,
            'email': staff.email,
            'company': staff.company.name if staff.company else None,
            'company_id': staff.company_id,
            'gate_access_allowed': staff.company.gate_access_allowed if staff.company else True,
            'license_plate': staff.license_plate,
            'vehicle_type': staff.vehicle_type.name if staff.vehicle_type else None,
            'vehicle_category': staff.vehicle_type.category if staff.vehicle_type else None,
        },
        'subscription': {
            'active': active_pass is not None,
            'valid_until': active_pass.valid_until if active_pass else None,
        },
        'parked_since': open_session.entry_time if open_session else None,
    }


def todays_sessions():
    """
    Tenant sessions relevant to today's local date: everything currently
    parked (whenever it started) plus everything that entered or exited
    today. Currently parked first. Durations come only from valid()
    sessions; an auto_closed row is listed but carries no duration.
    """
    now = timezone.now()
    start_of_day = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)

    qs = (
        ParkingSession.objects
        .filter(registered_staff_member__isnull=False)
        .filter(Q(exit_time__isnull=True) | Q(entry_time__gte=start_of_day) | Q(exit_time__gte=start_of_day))
        .select_related('registered_staff_member__company', 'rfid_card')
    )
    valid_ids = set(qs.valid().values_list('id', flat=True))

    rows = []
    for s in qs:
        is_open = s.exit_time is None
        if s.id not in valid_ids:
            minutes = None
        else:
            minutes = int(((s.exit_time or now) - s.entry_time).total_seconds() // 60)
        staff = s.registered_staff_member
        rows.append({
            'session_id': str(s.id),
            'ticket_number': s.ticket_number,
            'tenant_name': staff.name,
            'company': staff.company.name if staff.company else None,
            'license_plate': s.license_plate,
            'rfid_uid': s.rfid_card.uid if s.rfid_card else None,
            'entry_time': s.entry_time,
            'exit_time': s.exit_time,
            'duration_minutes': minutes,
            'auto_closed': s.auto_closed,
            'is_open': is_open,
        })

    rows.sort(key=lambda r: (not r['is_open'], -r['entry_time'].timestamp()))
    completed_minutes = sum(
        r['duration_minutes'] for r in rows
        if not r['is_open'] and r['duration_minutes'] is not None
    )
    return {
        'date': start_of_day.date(),
        'currently_parked': sum(1 for r in rows if r['is_open']),
        'completed_minutes': completed_minutes,
        'sessions': rows,
    }
