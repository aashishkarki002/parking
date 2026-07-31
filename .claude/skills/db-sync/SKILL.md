---
name: db-sync
description: Keeps management/management/commands/seed_parking_data.py in sync with management/models.py (and user_app/models.py). Use this whenever management/models.py or user_app/models.py changes, whenever a new migration file is added under */migrations/, or when the user asks to "sync seed data" / "update the seed command" / "refresh the dev sync endpoint". Diffs live model fields against what the seed command populates and updates fake-data generation for new/changed/removed fields.
---

# db-sync

Keeps `seed_parking_data` (the management command behind the `/api/dev/sync-db/`
dev-refresh endpoint) honest against the real models, so the frontend
developer's one-click DB refresh never silently drifts out of date as the
schema evolves.

Relevant files:
- `backend/management/models.py`, `backend/user_app/models.py` — source of truth for fields.
- `backend/management/management/commands/seed_parking_data.py` — what actually gets seeded.
- `backend/management/migrations/0011_add_is_sample.py` — the migration that added `is_sample`; later migrations may add/alter fields the seed command needs to know about.
- `backend/management/views.py` (`dev_sync_db`) — the endpoint that runs `migrate` then `seed_parking_data --flush --count N`.
- `backend/parkingcore/settings.py` — `ENVIRONMENT` / `DEV_SYNC_TOKEN`.

## Hard rules — never violate these

1. **Never weaken or remove `is_sample` tagging or filtering.** Every model the
   seed command creates records for must keep an `is_sample=True` set on every
   created row, and `--flush` must keep filtering strictly on
   `is_sample=True`. Never change a flush/delete call to a broader queryset
   (e.g. never let `.objects.all().delete()` creep back in), and never add a
   new seeded model without also giving it an `is_sample` field (via a real
   migration) before seeding it.
2. **Never run migrate, seed, or flush against production.** Before running
   *any* Django management command as part of this skill (`makemigrations`,
   `migrate`, `seed_parking_data`, or hitting `/api/dev/sync-db/`), confirm
   you are operating against a local/dev/staging database:
   - Check `settings.ENVIRONMENT` (or the `ENVIRONMENT` env var) is not
     `"production"`.
   - Check the resolved `DATABASES['default']['HOST']` / `DB_HOST` isn't a
     known production host.
   - If either check is ambiguous or you cannot confirm the target DB, **stop
     and ask the user** rather than guessing. Do not add a "just in case"
     bypass flag.
3. **Never guess the meaning of an ambiguous field.** If a new/changed field
   is a `choices`/enum field, a boolean whose semantics aren't obvious from
   its name, a FK whose fake-linkage strategy isn't obvious, or anything
   where a wrong guess would produce misleading data for the frontend dev,
   stop and ask the user for the intended fake-value strategy instead of
   picking one. Obvious cases (e.g. a new `CharField` clearly holding a name,
   email, phone number, address, or a `DateTimeField` clearly meaning "when
   X happened") don't need to be asked about — use Faker with a provider that
   matches the field name/purpose.

## Workflow

1. **Read the current models.** Open `management/models.py` and
   `user_app/models.py` in full. For every field on every model, note: type,
   `null`/`blank`, `choices`, `unique`, default, and any FK relation.

2. **Read the current seed command.** Open `seed_parking_data.py` and build a
   map of, for each model it touches: which fields it sets, and whether that
   model has `is_sample` in its `SAMPLE_MODELS_CHILD_FIRST` deletion-order
   list (if it creates rows for a model, that model must be in this list, in
   an order where dependents are deleted before what they depend on — check
   `on_delete` on every FK to get the order right, especially `PROTECT` FKs
   like `VehicleType.pricing_plan` and `ParkingSession.vehicle_type`).

3. **Diff them.** For each model in models.py, classify every field as:
   - **Covered** — seed command already sets it sensibly. Leave it.
   - **New/uncovered** — field exists in the model but the seed command
     doesn't set it (or the model itself isn't seeded yet). Needs handling.
   - **Removed** — seed command references a field/model that no longer
     exists in models.py (this will already be a hard error when the
     command runs — check `git log`/the diff that triggered this skill to
     confirm the field was actually removed, not renamed).
   - **Changed semantics** — e.g. a field changed from `CharField` to a
     `choices` field, or a FK's `on_delete` changed in a way that affects
     safe flush ordering.

4. **Also check migrations.** Run `git diff` (or look at the migration file
   that triggered this skill) to see exactly what changed — this is more
   reliable than eyeballing models.py for subtle changes like a new
   `unique=True` or a changed `default`.

5. **For each new/changed field needing a fake value:**
   - Infer intent from field name, type, `help_text`, and nearby code (e.g.
     how the field is used in `views.py`/`serializers.py`/methods on the
     model). Match Faker providers to purpose (name → `fake.name()`, email →
     `fake.email()`, money → a `Decimal` in a plausible range for this
     domain, plate numbers → the existing `random_plate()` helper style,
     dates → relative to `timezone.now()` like the rest of the command).
   - For `choices` fields: if the choices are self-explanatory (e.g.
     `('ACTIVE', 'Active')`), pick a realistic distribution. If the choices'
     business meaning isn't obvious (e.g. an enum whose values imply
     different downstream behavior you can't verify by reading the code),
     **ask the user** which values are appropriate for sample data and in
     what proportion.
   - For new required FKs: reuse the existing reference-data collections
     already built in the command (`vendors`, `vehicle_types`, `staff`,
     `coupons`) rather than creating a new parallel set of fake objects.

6. **For each new model that needs seeding from scratch:**
   - Confirm it needs an `is_sample` field. If it doesn't have one yet, add
     it via `python manage.py makemigrations` (never hand-write migration
     field definitions from scratch — generate them so they match Django's
     actual state) — using the same pattern as the other `is_sample` fields
     (`BooleanField(default=False, db_index=True)`).
   - Add it to `SAMPLE_MODELS_CHILD_FIRST` in the correct dependency-safe
     position.
   - Add a `_create_<model>()` method following the existing style
     (`update_or_create` for reference/lookup-style data so reruns without
     `--flush` don't duplicate rows; plain `.create()` for
     transactional/scenario data that's expected to accumulate or get
     flushed).

7. **Update `handle()`** to call any new creation methods and include the
   new model in the final summary line.

8. **Verify before finishing:**
   - Confirm the target DB is not production (see rule 2).
   - Run `python manage.py makemigrations --check` to confirm no model
     changes are missing a migration.
   - Run `python manage.py seed_parking_data --flush --count 10` locally and
     confirm it completes without error.
   - Spot-check that `is_sample=True` on every row the command just created,
     and that re-running with `--flush` again is idempotent (no duplicate
     reference data, no orphaned rows).
   - Show the user a summary of what fields/models were added and what fake
     data strategy was used for each, so they can sanity-check it the same
     way they did when this was first built.

## When the user just says "sync seed data"

Treat it as a request to run the full workflow above end-to-end: diff
models vs. the seed command, apply the updates, verify, and report back —
not just a request to re-run the existing command.
