# Tenant Stamp Flow — Test Cases

Covers the tenant-stamp feature: a tenant physically stamps a visitor's
parking chit, granting free minutes (`Vendor.stamp_free_minutes`) toward
that visitor's `ParkingSession` (`ParkingSession.add_stamp` /
`refresh_stamp_coverage` in `management/models.py`).

## Background — bugs already fixed

1. **Exit time not recorded for stamped tickets.** `calculate-charge`
   (`management/views.py:577`) only allowed sessions with status `ACTIVE`
   or `COMPLETED`. But a stamp (or even a read-only ticket lookup) flips a
   covered session's status to `STAMPED`, so the real exit scan got
   rejected with a 400 and `exit_time` was never set. Fixed by allowing
   `STAMPED` in that guard.
2. **Stamp appears to do nothing.** If a vendor's `stamp_free_minutes` is
   `0` (or too small), `refresh_stamp_coverage()` correctly leaves the
   session's status unchanged (`ACTIVE`) because there's no free-minute
   window to cover it with. Not a code bug — it's vendor configuration.
   Worth a regression test so it doesn't get "fixed" into silently
   swallowing a real config problem.

## Test cases

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| TC-01 | Stamp within free window | Create session, entry_time = now. Stamp with a vendor whose `stamp_free_minutes` >> elapsed time. | `status` → `STAMPED`, `total_stamp_minutes` = vendor's `stamp_free_minutes`, no `TenantBill` created. |
| TC-02 | Exit a fully-covered stamped ticket | Take a `STAMPED` session (from TC-01) and call `calculate-charge`. | Returns 200 (not 400). `exit_time` is set. `calculated_charge` = 0.00. Status stays `STAMPED` (or becomes `COMPLETED` if overage occurred exactly at exit — see TC-04). |
| TC-03 | Session exceeds free minutes while still parked | Backdate `entry_time` so elapsed > vendor's `stamp_free_minutes`, then stamp. | `status` stays `ACTIVE` (not `STAMPED`). A `TenantBill` row is created for the overage, billed to the vendor. Visitor's `calculated_charge` is untouched (still 0 until exit). |
| TC-04 | Exit an overage session | Call `calculate-charge` on the TC-03 session. | `exit_time` set, `status` → `COMPLETED`, `calculated_charge` = 0.00 for the visitor (tenant is billed via `TenantBill`, not the visitor). |
| TC-05 | Multiple stamps stack | Stamp the same session twice (same or different vendors). | `total_stamp_minutes` = sum of each stamp's `free_minutes_granted` snapshot. Coverage window widens accordingly. |
| TC-06 | Vendor configured with 0 free minutes | Set a vendor's `stamp_free_minutes` = 0. Stamp a session with it. | `TicketStamp` row is created (`free_minutes_granted` = 0), but `status` is unchanged (stays whatever it was, e.g. `ACTIVE`) since `total_stamp_minutes` <= 0 short-circuits `refresh_stamp_coverage`. This is expected — not a bug. |
| TC-07 | Boundary: overage exactly 0 | Backdate entry so elapsed minutes == vendor's `stamp_free_minutes` exactly, then stamp. | `overage` = 0 → treated as covered → `status` = `STAMPED`, no `TenantBill`. |
| TC-08 | Re-stamp an already-stamped/completed session | Call `add_stamp` again on a session with status `STAMPED` or `COMPLETED`. | Succeeds (allowed statuses are `ACTIVE`, `COMPLETED`, `STAMPED`). |
| TC-09 | Stamp a paid session | Call `add_stamp` on a session with status `PAID`. | Raises `ValidationError("Cannot stamp a completed or paid session.")`. |
| TC-10 | `apply-stamp` with bad vendor | POST `apply-stamp` with a non-existent or missing `vendor_id`. | 400 if `vendor_id` missing, 404 if vendor doesn't exist. |
| TC-11 | Live status re-evaluation on lookup | Stamp a session so it's `STAMPED` while still within the window. Wait (or backdate) until elapsed time crosses the free-minute window, then `GET` the session (`retrieve()`). | Status flips from `STAMPED` to `ACTIVE` on the GET itself (no separate write action needed) — `retrieve()` calls `refresh_stamp_coverage()` and saves if it changed. A `TenantBill` appears for the overage. |
| TC-12 | Active pass short-circuit still sets exit_time | Exit a session whose license plate has an active `ParkingPass`, while it also has stamps. | `calculate-charge` takes the pass branch (checked first), sets `status` = `WAIVED`, `exit_time` set, charge = 0 — stamps are irrelevant here since the pass branch returns before the stamp logic runs. |

## How to test the 60-minute window without waiting 60 real minutes

You don't need to sit and wait — backdate `entry_time` instead. Two ways:

### Option A — Django admin (fastest, no code)

1. Open the session in the admin (`ParkingSession` is registered at
   `management/admin.py:367`).
2. Edit `entry_time` to `now - 60 minutes` (or whatever offset you want to
   test) and save.
3. Use the app normally (stamp it, scan it, print bill) — the backend
   computes elapsed time from `entry_time`, so it behaves exactly as if
   60 real minutes had passed.

### Option B — Django shell (for scripted/repeatable tests)

```bash
source venv/bin/activate
python manage.py shell
```

```python
from django.utils import timezone
from datetime import timedelta
from management.models import ParkingSession, Vendor

# Pick (or create) the session/vendor you're testing with
session = ParkingSession.objects.get(ticket_number='TIxxxxxxxx-xxxxx')
vendor = Vendor.objects.get(name__icontains='International')

print('vendor free minutes:', vendor.stamp_free_minutes)  # e.g. 60

# --- TC-07: exactly at the boundary (no overage) ---
session.entry_time = timezone.now() - timedelta(minutes=vendor.stamp_free_minutes)
session.save(update_fields=['entry_time'])
session.add_stamp(vendor)
print(session.status)  # expect STAMPED

# --- TC-03: just past the boundary (1 minute overage) ---
session.entry_time = timezone.now() - timedelta(minutes=vendor.stamp_free_minutes + 1)
session.save(update_fields=['entry_time'])
session.refresh_stamp_coverage()
session.save()
print(session.status)  # expect ACTIVE, with a TenantBill row

# --- TC-04: exit it and confirm exit_time gets recorded ---
session.exit_time = timezone.now()
session.update_and_calculate_charges()
session.save()
print(session.exit_time, session.status, session.calculated_charge)
```

This exercises the exact same model methods the API views call
(`add_stamp`, `refresh_stamp_coverage`, `update_and_calculate_charges`),
so it's a faithful test without needing an HTTP client, auth token, or
real elapsed time.

### Option C — through the actual API/UI with a backdated session

Combine A + normal usage: backdate `entry_time` via admin, then drive the
rest of the flow (Stamp a Visitor Ticket → Record Stamp → Print Bill)
through the real frontend to confirm the fix end-to-end, including the
`exit_time` regression fixed above.
