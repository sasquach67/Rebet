# Rebet database preparation

The migration is **prepared and tested locally, not applied to a Supabase project**. The connected account currently exposes only `premed-os`. Andy must identify the intended Rebet project or confirm sharing that project before any live mutation. No credentials or Supabase keys are stored here.

`migrations/20261001201348_rebet_owner_tables.sql` was created with Supabase CLI 2.119.0 using `supabase migration new rebet_owner_tables`. It creates `bets`, `settings`, `push_subscriptions`, and `reminders_sent` in `public`. It deliberately fails if those names already exist, preventing accidental reuse of another app's schema.

## Data contract

- A bet is keyed by `(user_id, id)`, preserving existing local string IDs without cross-account collisions. Scheduling uses `game_start` as a UTC instant (`timestamptz`). Unknown-time bets have `game_start = null` and `has_time = false`.
- Native columns hold the fields used for reminders and tracking. `signal` holds extra parser metadata such as raw text, alternate game lines, EV, fair value and source warnings. It must not override the native scheduling fields when read back.
- `revision` and `updated_at` are set by a server trigger. Sync must condition updates on the last acknowledged revision. A zero-row update is a conflict to present to the user, not a reason to retry with an unconditional overwrite.
- Use `deleted_at` tombstones in sync so an offline device cannot resurrect a deleted bet. Do not infer deletions from a partial fetch or failed request.
- Settings and subscriptions are owner-only. Email and push reminders default off until configured and verified.
- The client may read its own reminder records but cannot create, alter, or delete delivery claims. The future server sender owns those writes. A unique key across owner, bet, channel, delivery target and scheduled instant prevents duplicate claims for the same delivery.
- The future sender must validate push provider endpoints before making outbound requests. The table's HTTPS constraint alone does not validate a push service.

## Validation

Run `npm ci --ignore-scripts`, then `npm test` and `npm run test:timezone`.

`tests/schema.test.js` executes the migration and queries in a disposable in-memory PGlite Postgres instance. It supplies a minimal `auth.users` table and `auth.uid()` test function. Checks cover UTC storage, server revisions, owner access, cross-account denial, anonymous denial, invalid schedules, and server-only/unique delivery claims. This does **not** verify hosted Supabase Auth, the Data API, email delivery, or cloud sync. Hosted advisors and live owner-isolation checks are still required after the project is selected.

## Next integration steps

1. Identify the correct project and inspect table names/permissions read-only. If sharing an existing application project, inspect compatibility before applying anything.
2. Apply the reviewed migration through the authorized dashboard workflow and run hosted security advisors and owner-isolation checks.
3. Bundle a pinned `@supabase/supabase-js` client locally so CDN availability cannot break the offline app. Configure only the project URL and publishable/anon key in client code.
4. Add magic-link login, with automatic account creation disabled. Ask before entering credentials or changing the project's redirect/email settings. Preserve existing settings for other apps.
5. Keep `rebet.v1` as the original local workspace. Use a separate local cache/outbox per authenticated account; an explicit “Import local data” button copies reviewed local bets into that account. Login must not silently upload or replace local data.
6. Test offline edits, reconnect, conflicting edits from two devices, interrupted requests, sign-out/account switching and repeated imports. Keep queued edits durable until the server acknowledges them.

## References checked October 1, 2026

- [Supabase passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Owner policies and RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Explicit Data API table grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [PGlite API](https://pglite.dev/docs/api)

The current Supabase changelog was checked. This migration explicitly grants only the required operations after enabling RLS, matching the Data API grant change. It does not change managed Auth/Realtime schemas, install extensions, or modify existing project settings.
