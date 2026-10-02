const assert = require('node:assert/strict');
(async () => {
  const M = await import('../supabase/functions/send-reminders/message.mjs');
  let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  message: ' + name); };
  const row = { o_title: 'Florida Gators @ Missouri Tigers', o_pick: 'Over 55.5 Total', o_units: '0.62', o_odds: -128,
    o_game_start: new Date('2026-10-03T19:30:00Z'), o_signal_tz: 'America/New_York', o_display_tz: null };
  const now = new Date('2026-10-03T16:30:00Z');

  t('email states the bet, local game time and countdown', () => {
    const m = M.buildEmail(row, now);
    assert.match(m.subject, /Place bet: Florida Gators @ Missouri Tigers — Over 55.5 Total \(starts in 3h\)/);
    assert.match(m.text, /Over 55.5 Total · 0.62u · -128/);
    assert.match(m.text, /Sat, Oct 3, 3:30 PM EDT \(starts in 3h\)/);
    assert.match(m.text, /Odds may have moved/);
  });
  t('display time zone wins; an invalid zone falls back instead of throwing', () => {
    assert.match(M.buildEmail({ ...row, o_display_tz: 'America/Los_Angeles' }, now).text, /12:30 PM PDT/);
    assert.match(M.buildEmail({ ...row, o_display_tz: 'Not/AZone', o_signal_tz: 'Also/Bad' }, now).text, /3:30 PM EDT/);
  });
  t('countdown wording', () => {
    assert.equal(M.untilText(0), 'starting now'); assert.equal(M.untilText(25), 'starts in 25 min');
    assert.equal(M.untilText(90), 'starts in 1h 30m'); assert.equal(M.untilText(120), 'starts in 2h');
  });
  t('html output escapes untrusted signal text', () => {
    const m = M.buildEmail({ ...row, o_title: '<script>alert(1)</script> & co' }, now);
    assert.ok(!m.html.includes('<script>')); assert.match(m.html, /&lt;script&gt;/);
  });
  t('cron secret check fails closed and compares exactly', () => {
    const s = 'a-long-enough-secret-value-123';
    assert.equal(M.isCronAuthorized(s, s), true);
    assert.equal(M.isCronAuthorized(s + 'x', s), false); assert.equal(M.isCronAuthorized('nope', s), false);
    assert.equal(M.isCronAuthorized(null, s), false); assert.equal(M.isCronAuthorized(s, undefined), false);
    assert.equal(M.isCronAuthorized('short', 'short'), false); // weak secrets are rejected outright
  });
  console.log(n + ' message checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
