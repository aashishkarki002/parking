# Parking management

- `backend/` — Django API (`management` app) and Django admin at `/admin/`.
- `parking-frontend-master/` — React POS and back-office UI.

## RFID tenant gate

### How the reader connects
The booth has one 13.56MHz USB RFID reader that acts as a **HID keyboard
wedge**. It is always on and needs no driver, SDK or trigger. When a card is
tapped, it types the card's UID digits and then Enter. The POS screen
(`useRfidReader`, mounted in `Options.tsx`) listens to every keystroke:

- It buffers keys and starts over whenever the gap between two keys is
  longer than 50ms. A reader types far faster than that; a person doesn't.
- On Enter, it checks the buffer against `VITE_RFID_UID_PATTERN`
  (default `^\d{8,10}$`). On a match, it swallows the Enter, removes the
  digits from any input that had focus, and posts the UID to
  `POST /api/v1/parking/rfid-tap`.
- Anything that doesn't match (tickets `TI…`, coupons `B-…`, tenant QR
  UUIDs) passes through untouched, so the USB barcode scanner keeps working.
  If you ever print barcodes made only of 8–10 digits, narrow the pattern.

### Entry / exit rule
There is one reader for both directions, so **each tap toggles**:

| Member's state | Tap result |
|---|---|
| Has an open session | **EXIT**, always allowed (even if the subscription lapsed while they were parked). Billed like a tenant QR-card exit. |
| No open session | **ENTRY**, only with an active subscription pass (`ParkingPass.active_for_staff`) and tenant gate access. Otherwise shown in red. |
| Last entry/exit under 10s ago | Ignored as a duplicate tap (the card was left on the reader). |

All timestamps come from the server (`Asia/Kathmandu`, `USE_TZ=True`).
RFID and tenant QR cards write the same `ParkingSession` rows, so a member
can come in with one and leave with the other. The database allows only one
open session per card (`one_open_session_per_rfid_card`).

### Staff correction ("Wrong — mark as Entry")
If a member left without tapping, their next arrival tap closes the stale
session as an EXIT. The orange EXIT banner has a **Wrong — mark as Entry**
button (`POST /api/v1/parking/rfid-force-entry`). In one transaction it:

1. flags the wrongly closed (or still open) session as `auto_closed=True`,
   with no charge,
2. opens a new entry session. The subscription check still applies.

Nothing cleans up stale sessions on a schedule. This button is the only
correction path.

### `auto_closed` sessions are excluded from all figures
An `auto_closed` session's exit time records when staff made the
correction, not when the car left. Any duration, usage or billing figure
must use `ParkingSession.objects.valid()`, which excludes these sessions.
The admin revenue total, the "Tenant gate today" totals, the Reports page
and the Sessions page average stay all exclude them. They are still listed,
marked **Auto-closed**, for audit.

### 12-hour free allowance
Every registered tenant vehicle (a **Tenant Member**, with or without a
subscription pass) parks free for **12 hours per rolling 24 hours**. Time
past that is charged at the vehicle type's pricing plan (same minimum charge
and round-up to 5 as visitors).

The allowance is counted **per vehicle, across all its sessions**. At exit:

```
free left this visit = 12h − time this vehicle parked in the 24h before this entry
charged              = duration − free left − coupon free minutes
```

So leaving and coming back does not restart the clock:

| Visits | Charged |
|---|---|
| One 13h stay | 1h |
| 6h, out 1h, back for 8h | 2h on the second visit |
| 6h, 6h, 6h back to back | the whole third visit (6h) |
| 3-day stay | everything after the first 12h |

When a tenant exit (RFID tap or tenant card) has a charge, the POS opens the
same **Current Transaction** bill a visitor ticket gets: coupon, Cash/Online
Pay and a printed receipt. Free tenant exits still print nothing. If staff
press **Wrong — mark as Entry** on that exit, the unpaid bill is removed.

Each billed session gets a line in its **notes**, e.g. *Free allowance (12h
per 24h): 6h used before this entry, 6h free this visit, 2h charged.* Use it
to answer disputes at the booth. `auto_closed` sessions don't count toward
the allowance.

Settings live in Django admin → **Parking System Configuration**:
`tenant_free_hours` (12), `tenant_lookback_hours` (24), and
`tenant_allowance_enabled`. Unticking it returns to the old behaviour: pass
holders park free without limit, other tenants pay like visitors.

### Registering a card
1. Tap the new card on the reader with Notepad open, and copy the digits
   exactly (leading zeros matter).
2. Django admin → **Tenant Members** → open the member → **RFID Cards**
   inline → add the UID. You can also use **RFID Cards → Add**.
3. The member needs a vehicle type and an active **Subscription Pass**.

For a lost card, untick **is active** instead of deleting it, so its
history stays. Then add the replacement card.

### Testing a card
Tap the **same card 3–4 times into Notepad** and check that the UID is
identical every time. Some bank and phone NFC cards send a random UID on
each tap. Those can't be used as gate cards: they'll always come up as
"Unknown card". Then, on the POS screen: tap once to see green ENTRY, wait
more than 10s, and tap again to see orange EXIT. **Tenant gate today**
(sidebar → Sessions) shows who is currently parked.
