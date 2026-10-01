const fs = require('fs'), path = require('path'), assert = require('assert');
const P = require('../parser.js');
const NOW = Date.UTC(2026, 9, 1, 19, 0); // Thu Oct 1 2026 3pm EDT
const ctx = { tz: 'America/New_York', localTz: 'America/New_York', now: NOW };
const iso = ms => new Date(ms).toISOString();
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

t('rebet bot: two signals, chatter ignored', () => {
  const r = P.parse(fs.readFileSync(path.join(__dirname, 'fixtures/rebet-bot-2.txt'), 'utf8'), ctx);
  assert.strictEqual(r.signals.length, 2);
  const [a, b] = r.signals;
  assert.strictEqual(a.title, 'Florida Gators @ Missouri Tigers');
  assert.strictEqual(a.pick, 'Over 55.5 Total');
  assert.strictEqual(a.market, 'total'); assert.strictEqual(a.side, 'over'); assert.strictEqual(a.line, 55.5);
  assert.strictEqual(a.odds, -128); assert.strictEqual(a.units, 0.62); assert.strictEqual(a.ev, 1.9);
  assert.strictEqual(a.winPct, 57.26); assert.strictEqual(a.fv, -134); assert.strictEqual(a.sharpOdds, '-148 / +121');
  assert.strictEqual(a.league, 'ncaa'); assert.strictEqual(a.sport, 'American Football');
  assert.strictEqual(a.betKey, 'ncaa|2026-10-04|Missouri Tigers|Florida Gators|total_game|over|line=55.5');
  assert.strictEqual(iso(a.start), '2026-10-03T19:30:00.000Z'); // 3:30 PM EDT
  assert.strictEqual(iso(a.sentAt), '2026-10-01T17:56:00.000Z'); // today 1:56 PM EDT
  assert.ok(a.hasTime); assert.deepStrictEqual(a.warnings, []);
  assert.strictEqual(b.title, 'Kentucky Wildcats @ South Carolina Gamecocks');
  assert.strictEqual(b.odds, -137); assert.strictEqual(b.units, 0.42); assert.strictEqual(b.line, 51.5);
  assert.strictEqual(iso(b.start), '2026-10-03T20:15:00.000Z');
});

t('explicit EDT/EST wins over default zone and DST is respected', () => {
  const d1 = P.parseDate('Sun, Nov 01, 1:00 PM EST', ctx); assert.strictEqual(iso(d1.ms), '2026-11-01T18:00:00.000Z');
  const d2 = P.parseDate('Sat, Oct 03, 3:30 PM PT', ctx); assert.strictEqual(iso(d2.ms), '2026-10-03T22:30:00.000Z');
  const d3 = P.parseDate('Sun, Nov 01, 1:00 PM ET', ctx); assert.strictEqual(iso(d3.ms), '2026-11-01T18:00:00.000Z'); // ET = EST after DST ends
});

t('no tz token falls back to signal tz, not the machine zone', () => {
  const d = P.parseDate('Oct 5, 8:20 PM', ctx); assert.strictEqual(iso(d.ms), '2026-10-06T00:20:00.000Z');
});

t('weekday mismatch and missing time are flagged', () => {
  const d = P.parseDate('Mon, Oct 03, 3:30 PM EDT', ctx); assert.ok(d.warnings.some(w => /weekday/.test(w)));
  const e = P.parseDate('Oct 5', ctx); assert.ok(!e.hasTime); assert.ok(e.warnings.includes('no time found'));
});

t('relative dates use message time', () => {
  const sent = Date.UTC(2026, 9, 1, 17, 56);
  const d = P.parseDate('Sat 1pm', Object.assign({}, ctx, { sentAt: sent })); assert.strictEqual(iso(d.ms), '2026-10-03T17:00:00.000Z');
});

t('discord <t:unix> is exact', () => {
  const d = P.parseDate('<t:1791400000:F>', ctx); assert.strictEqual(d.ms, 1791400000000);
});

t('generic fallback still works', () => {
  const r = P.parse('**Chiefs @ Bills**\nPick: Chiefs +3.5 (-110)\nUnits: 2u\nOct 5, 8:20 PM EDT\n\nYankees vs Red Sox - ML +150 - 3 units - <t:1791400000:F>', ctx);
  assert.strictEqual(r.signals.length, 2);
  assert.strictEqual(r.signals[0].title, 'Chiefs @ Bills'); assert.strictEqual(r.signals[0].units, 2); assert.strictEqual(r.signals[0].odds, -110);
  assert.strictEqual(iso(r.signals[0].start), '2026-10-06T00:20:00.000Z');
  assert.strictEqual(r.signals[1].pick, 'ML +150'); assert.strictEqual(r.signals[1].units, 3);
});
console.log(n + ' passed');
