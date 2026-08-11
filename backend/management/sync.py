"""
Shared upsert path for EasyManage tenant data, used by both the webhook
receiver (management/views.py#easymanage_webhook) and the nightly
reconcile_parking_tenants management command — one sync code path for both
directions, per webhook.md §3/§4.
"""

from django.utils import timezone

from .models import Staff, Vendor


def sync_vendor_from_payload(data, source):
    """
    Upserts a Vendor from an EasyManage tenant payload (the shared shape used
    by both the pull API and webhook envelopes — see webhook.md §2).

    `source` is 'webhook' or 'pull', stored on Vendor.sync_source for
    observability into which path last touched a given row.

    On any payload resolving gate_access_allowed=False, cascades to block
    every linked Staff card immediately — the exact enforcement point that
    _resolve_staff_from_scan() checks on every scan path. Does NOT reverse
    this automatically when gate_access_allowed flips back to True; a
    restored tenant does not blindly reactivate cards that may have been
    individually deactivated for unrelated reasons (lost card, etc).
    """
    external_tenant_id = data['externalTenantId']
    parking_quota = data.get('parkingQuota') or {}
    property_name = (data.get('property') or {}).get('name')
    unit_name = (data.get('unit') or {}).get('name')
    location = " - ".join(filter(None, [property_name, unit_name]))

    vendor, _created = Vendor.objects.update_or_create(
        external_tenant_id=external_tenant_id,
        defaults={
            'name': data.get('companyName') or data.get('name') or external_tenant_id,
            'location': location,
            'contact_person': data.get('name') or '',
            'contact_email': data.get('email') or '',
            'car_quota': parking_quota.get('carQuota', 0),
            'bike_quota': parking_quota.get('bikeQuota', 0),
            'gate_access_allowed': bool(data.get('gateAccessAllowed', True)),
            'last_synced_at': timezone.now(),
            'sync_source': source,
        },
    )

    if not vendor.gate_access_allowed:
        Staff.objects.filter(company=vendor).update(is_card_active=False)

    return vendor
