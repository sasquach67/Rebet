# send-reminders

Emails a reminder shortly before each pending bet's game time. Push is handled in milestone 4 (the claim function already supports `p_channels => array['push']`).

Flow: `pg_cron` (every minute) -> `pg_net` POST with `x-cron-secret` -> this function -> `rebet_claim_due_reminders()` (atomic claim in `reminders_sent`) -> Resend -> mark `sent`/`failed`. Failed sends retry (3 attempts) until the game starts; a crashed run is re-claimed after its 5 minute lease; Resend's `Idempotency-Key` prevents a double send on retry.

## Not done yet (needs Andy / hosted project access)
1. Apply migration `20261002000000_rebet_claim_due_reminders.sql` to the Rebet project and run the hosted security advisors.
2. Create a Resend account, verify a sending domain, and set secrets: `supabase secrets set CRON_SECRET=<random 32+ chars> RESEND_API_KEY=... REMINDER_FROM="Rebet <reminders@your-domain>"`.
3. `supabase functions deploy send-reminders --no-verify-jwt` (auth is the shared secret).
4. Schedule it. In the SQL editor, with the secret kept in Vault rather than in the statement text:
   ```sql
   select cron.schedule('rebet-send-reminders', '* * * * *', $$
     select net.http_post(
       url := 'https://vuiesmzwsbfqclklfcgv.supabase.co/functions/v1/send-reminders',
       headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rebet_cron_secret')),
       body := '{}'::jsonb) $$);
   ```
5. Turn on `settings.email_reminders` for the account (the app's settings panel will do this).

## Tests
`node tests/reminders.test.js` (claim logic in PGlite) and `node tests/reminder-message.test.js` (email text, time zones, secret check). The Deno entrypoint itself is not executed by tests; verify with a real deploy and a test bet.
