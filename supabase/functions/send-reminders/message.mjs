// Pure helpers for the send-reminders Edge Function (no Deno APIs, so Node tests can import it).
const FALLBACK_TZ = 'America/New_York';

export function validTimeZone(tz) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export function formatGameTime(iso, tz) {
  const zone = validTimeZone(tz) ? tz : FALLBACK_TZ;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(iso));
}

export const formatOdds = o => (o == null ? '' : o > 0 ? '+' + o : String(o));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function minutesUntil(iso, now) { return Math.round((new Date(iso).getTime() - now.getTime()) / 60000); }

export function untilText(mins) {
  if (mins <= 0) return 'starting now';
  if (mins < 60) return `starts in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `starts in ${h}h${m ? ` ${m}m` : ''}`;
}

/** row: one object from rebet_claim_due_reminders (o_* columns). */
export function buildEmail(row, now = new Date()) {
  const tz = row.o_display_tz || row.o_signal_tz;
  const when = formatGameTime(row.o_game_start, tz);
  const mins = minutesUntil(row.o_game_start, now);
  const bet = [row.o_pick, row.o_units != null ? `${Number(row.o_units)}u` : '', formatOdds(row.o_odds)].filter(Boolean).join(' · ');
  const title = row.o_title || 'Your bet';
  const lines = [
    `${title}`,
    bet,
    `${when} (${untilText(mins)})`,
    '',
    'Odds may have moved since the signal was sent. Check the current price before placing.',
  ].filter((l, i) => l !== '' || i > 0);
  return {
    subject: `Place bet: ${title}${row.o_pick ? ' — ' + row.o_pick : ''} (${untilText(mins)})`,
    text: lines.join('\n'),
    html: `<p><strong>${esc(title)}</strong></p><p>${esc(bet)}</p><p>${esc(when)} (${esc(untilText(mins))})</p>` +
      `<p style="color:#666">Odds may have moved since the signal was sent. Check the current price before placing.</p>`,
  };
}

/** Constant-time check of the shared cron secret. Fails closed when the secret is unset or short. */
export function isCronAuthorized(provided, secret) {
  if (!secret || secret.length < 16 || typeof provided !== 'string') return false;
  const a = new TextEncoder().encode(provided), b = new TextEncoder().encode(secret);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
