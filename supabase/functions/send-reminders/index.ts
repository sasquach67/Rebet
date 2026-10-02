// Edge Function: claims due reminders atomically (SQL) and emails them via Resend.
// Invoked every minute by pg_cron/pg_net with header `x-cron-secret`. Deploy with --no-verify-jwt.
// Secrets (set with `supabase secrets set`, never in the repo): CRON_SECRET (>=16 chars), RESEND_API_KEY,
// REMINDER_FROM (e.g. "Rebet <reminders@your-verified-domain>"). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the platform. Pin the supabase-js version before deploying.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildEmail, isCronAuthorized } from './message.mjs';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!isCronAuthorized(req.headers.get('x-cron-secret'), Deno.env.get('CRON_SECRET'))) {
    return new Response('unauthorized', { status: 401 });
  }
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('REMINDER_FROM');
  if (!apiKey || !from) return new Response('email provider not configured', { status: 500 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const now = new Date();
  const { data, error } = await db.rpc('rebet_claim_due_reminders', { p_now: now.toISOString(), p_channels: ['email'] });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results = { claimed: data.length, sent: 0, failed: 0 };
  for (const row of data) {
    const finish = (patch: Record<string, unknown>) =>
      db.from('reminders_sent').update(patch).eq('user_id', row.o_user_id).eq('id', row.o_claim_id);
    try {
      if (!row.o_email) throw new Error('account has no email address');
      const mail = buildEmail(row, now);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // A retried claim must not double-send if the first attempt actually went out.
          'Idempotency-Key': `rebet-${row.o_claim_id}`,
        },
        body: JSON.stringify({ from, to: [row.o_email], subject: mail.subject, text: mail.text, html: mail.html }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
      await finish({ status: 'sent', sent_at: new Date().toISOString(), lease_until: null, last_error: null });
      results.sent++;
    } catch (e) {
      await finish({ status: 'failed', lease_until: null, last_error: String((e as Error).message ?? e).slice(0, 500) });
      results.failed++;
    }
  }
  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
});
