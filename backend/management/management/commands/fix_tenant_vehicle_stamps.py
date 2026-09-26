"""
One-off repair for stamps/bills that landed on a tenant's own vehicle.

A tenant is only ever billed for the *visitor* tickets it stamps (see
ParkingSession.refresh_stamp_coverage). Before add_stamp() rejected them,
a session belonging to a registered tenant vehicle — a Staff card holder's
own car, linked via ParkingSession.registered_staff_member — could be
stamped, which produced a TenantBill against that tenant for their own
parking. This command finds those rows and clears them.

Dry-run by default; pass --apply to write.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from management.models import ParkingSession, TenantBill, TicketStamp


class Command(BaseCommand):
    help = (
        "Remove stamps and tenant bills that were recorded against tenants' own "
        "registered vehicles (tenants are only billed for stamped visitor tickets)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually delete the bad rows. Without this the command only reports.',
        )

    def handle(self, *args, **options):
        apply_changes = options['apply']

        bills = TenantBill.objects.filter(
            session__registered_staff_member__isnull=False
        ).select_related('session', 'vendor')
        stamps = TicketStamp.objects.filter(
            session__registered_staff_member__isnull=False
        ).select_related('session', 'vendor')

        for bill in bills:
            self.stdout.write(
                f"  bill: {bill.session.ticket_number} "
                f"({bill.session.license_plate or 'no plate'}) "
                f"-> {bill.vendor.name} {bill.amount} ({bill.overage_minutes}min)"
            )
        for stamp in stamps:
            self.stdout.write(
                f"  stamp: {stamp.session.ticket_number} by {stamp.vendor.name} "
                f"({stamp.free_minutes_granted}min)"
            )

        bill_count = bills.count()
        stamp_count = stamps.count()

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                f"Dry run: {bill_count} tenant bill(s) and {stamp_count} stamp(s) "
                f"on tenant vehicles. Re-run with --apply to remove them."
            ))
            return

        # Sessions the stamps had flipped to STAMPED need their real charge
        # back — recalculate each one through the normal (visitor) path now
        # that its stamps are gone.
        session_ids = set(
            stamps.values_list('session_id', flat=True)
        ) | set(
            bills.values_list('session_id', flat=True)
        )

        with transaction.atomic():
            bills.delete()
            stamps.delete()

            recalculated = 0
            for session in ParkingSession.objects.filter(pk__in=session_ids):
                if session.status != 'STAMPED':
                    continue
                if session.exit_time:
                    session.update_and_calculate_charges()
                else:
                    session.status = 'ACTIVE'
                session.save()
                recalculated += 1

        self.stdout.write(self.style.SUCCESS(
            f"Removed {bill_count} tenant bill(s) and {stamp_count} stamp(s); "
            f"recalculated {recalculated} session(s)."
        ))
