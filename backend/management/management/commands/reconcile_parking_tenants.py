# management/management/commands/reconcile_parking_tenants.py
"""
Pulls tenant data from EasyManage's /api/integrations/parking pull API and
upserts local Vendor rows through sync_vendor_from_payload() — the same
function the inbound webhook receiver uses, so there is one upsert code path
for both directions (webhook.md §4/§6).

Run nightly via system crontab (Django has no in-process scheduler today).
The same command with no --updated-since is also the phase-1 bootstrap step:
run it once to seed Vendor rows for existing tenants before enabling the
EasyManage webhook dispatch cron.

Usage:
    python manage.py reconcile_parking_tenants
    python manage.py reconcile_parking_tenants --updated-since 2026-07-01T00:00:00Z
"""
import requests

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from management.sync import sync_vendor_from_payload

PAGE_SIZE = 100
REQUEST_TIMEOUT_SECONDS = 30


class Command(BaseCommand):
    help = (
        "Pulls tenant data from EasyManage (GET /api/integrations/parking/tenants) "
        "and upserts local Vendor rows. No --updated-since = full bootstrap run."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--updated-since", default=None,
            help="ISO 8601 timestamp. Only pulls tenants updated at/after this time. "
                 "Omit for a full sync (phase-1 bootstrap).",
        )

    def handle(self, *args, **options):
        base_url = settings.EASYMANAGE_API_BASE_URL
        api_key = settings.EASYMANAGE_INTEGRATION_API_KEY
        if not base_url or not api_key:
            raise CommandError(
                "EASYMANAGE_API_BASE_URL / EASYMANAGE_INTEGRATION_API_KEY are not configured."
            )

        updated_since = options["updated_since"]
        synced_count = 0
        page = 1

        while True:
            params = {"limit": PAGE_SIZE, "page": page}
            if updated_since:
                params["updatedSince"] = updated_since

            response = requests.get(
                f"{base_url.rstrip('/')}/tenants",
                params=params,
                headers={"X-Api-Key": api_key},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            body = response.json()
            tenants = body.get("data", [])

            if not tenants:
                break

            with transaction.atomic():
                for tenant_data in tenants:
                    sync_vendor_from_payload(tenant_data, source="pull")
                    synced_count += 1

            if len(tenants) < PAGE_SIZE:
                break
            page += 1

        self.stdout.write(self.style.SUCCESS(
            f"Reconciled {synced_count} tenant(s) from EasyManage."
        ))
