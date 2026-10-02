const fs = require('fs'), path = require('path'), assert = require('assert');
const P = require('../parser.js');
const NOW = Date.UTC(2026, 9, 1, 20, 0); // Thu Oct 1 2026 4pm EDT, capture day
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
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name + '.txt'), 'utf8');
const realCases = require('./fixtures/real-signals.expected.json');
for (const expected of realCases) {
  t('real capture: ' + expected.fixture, () => {
    const r = P.parse(fixture(expected.fixture), ctx);
    assert.strictEqual(r.signals.length, 1);
    const b = r.signals[0];
    assert.strictEqual(b.format, 'rebet-bot');
    for (const key of ['title','pick','sport','league','market','marketDetail','side','line','odds','units','ev','winPct','fv','sharpOdds','repeat','selectedGameLine']) {
      assert.strictEqual(b[key], expected[key], expected.fixture + ': ' + key);
    }
    assert.strictEqual(iso(b.start), expected.start);
    assert.strictEqual(iso(b.sentAt), expected.sentAt);
    assert.strictEqual(b.hasTime, true);
    assert.strictEqual(b.betKey, '', 'a hidden spoiler is not a deduplication key');
    assert.strictEqual(b.gameLines.length, expected.gameLineCount);
    assert.strictEqual(b.warnings.includes('signal was already sent before'), expected.repeat);
  });
}
t('all real captures pasted together retain every message and correct stats', () => {
  const r = P.parse(realCases.map(c => fixture(c.fixture)).join('\n\n'), ctx);
  assert.strictEqual(r.signals.length, realCases.length);
  r.signals.forEach((b, i) => {
    assert.strictEqual(b.title, realCases[i].title);
    assert.strictEqual(b.units, realCases[i].units);
    assert.strictEqual(iso(b.sentAt), realCases[i].sentAt);
  });
});
t('spread alternatives retain their own price, line, units and probabilities', () => {
  const b = P.parse(fixture('spread-multiple-hawaii'), ctx).signals[0];
  assert.deepStrictEqual(b.gameLines.map(g => [g.line,g.odds,g.oppositeOdds,g.units,g.winPct,g.ev,g.fv]), [
    [-2.5,-125,-105,0.33,56.14,1.1,-128],
    [-1.5,-137,102,0.21,58.16,0.6,-139]
  ]);
});
t('a stale real headline never borrows stake from a different line', () => {
  const b = P.parse(fixture('total-stale-headline-ncaa'), ctx).signals[0];
  assert.strictEqual(b.units, null);
  assert.strictEqual(b.winPct, null);
  assert.ok(b.warnings.some(w => /headline pick does not match/.test(w)));
  assert.ok(!b.warnings.some(w => /headline pick selected/.test(w)));
});
// Controlled mutations exercise incomplete pastes; these are not additional real captures.
t('missing game time never uses the posting time or Bet Key date', () => {
  const original = fixture('rebet-bot-2').split('#🤖┃rebet')[0];
  for (const replacement of ['Sat, Oct 03', '']) {
    const input = original.replace('Sat, Oct 03, 3:30 PM EDT', replacement);
    const b = P.parse(input, ctx).signals[0];
    assert.strictEqual(b.start, null);
    assert.strictEqual(b.hasTime, false);
    assert.strictEqual(iso(b.sentAt), '2026-10-01T17:56:00.000Z');
    assert.ok(b.warnings.some(w => /no time|no game date/.test(w)));
  }
});
t('footer boundaries stop a later message supplying units or a date', () => {
  const input = fixture('moneyline-argentina').replace('QK: 0.20U', '')
    + '\nAnother bot\nQK: 9U\nOct 10, 11:00 PM EDT\nForged by Someone • Yesterday at 1:00 PM';
  const b = P.parse(input, ctx).signals[0];
  assert.strictEqual(b.units, null);
  assert.strictEqual(iso(b.start), '2026-10-02T00:15:00.000Z');
  assert.strictEqual(iso(b.sentAt), '2026-10-01T16:47:00.000Z');
});
t('Bet Key supports inline and spoiler-wrapped copies, but not hidden labels', () => {
  const key = 'ncaa|2026-10-04|Missouri Tigers|Florida Gators|total_game|over|line=55.5';
  const raw = fixture('rebet-bot-2').split('#🤖┃rebet')[0];
  for (const copy of ['Bet Key ' + key, 'Bet Key\n||' + key + '||']) {
    assert.strictEqual(P.parse(raw.replace('Bet Key\n' + key, copy), ctx).signals[0].betKey, key);
  }
  const hidden = fixture('moneyline-argentina').replace('[Spoiler not expanded]', 'Spoiler');
  assert.strictEqual(P.parse(hidden, ctx).signals[0].betKey, '');
});
t('market qualifiers stay visible in the pick, so a 1st-half or regulation bet is not misread', () => {
  const half = P.parse(fixture('total-first-half-mlb'), ctx).signals[0];
  assert.strictEqual(half.pick, 'Over 4 Total (1st Half)');
  assert.strictEqual(half.market, 'total'); assert.strictEqual(half.line, 4); assert.strictEqual(half.selectedGameLine, 0);
  assert.strictEqual(P.parse(fixture('moneyline-regulation-hockey'), ctx).signals[0].pick, 'Ceske Budejovice Moneyline (Regulation Time)');
  assert.strictEqual(P.parse(fixture('moneyline-argentina'), ctx).signals[0].pick, 'Estudiantes de La Plata Moneyline'); // "(match)" is noise
});
t('generic signal with a date but no time stays unscheduled (no invented noon)', () => {
  const b = P.parse('Chiefs @ Bills\nPick: Chiefs +3.5 (-110)\nUnits: 2u\nOct 5', ctx).signals[0];
  assert.strictEqual(b.start, null); assert.strictEqual(b.hasTime, false);
  assert.ok(b.warnings.includes('no time found'));
});
t('win posts ("CASH ...") are read from chat, matched to bets, and unmatched old bets are assumed lost', () => {
  const now = Date.UTC(2026, 9, 2, 2, 0);
  const r = P.parse(fixture('chat-with-results'), { ...ctx, now });
  assert.strictEqual(r.signals.length, 7); // chatter, tennis post and win posts are not signals
  assert.deepStrictEqual(r.results.map(x => x.raw), [
    'Zakharova, Anastasia @ Shao, Yushan u18.5 Total (-153)', 'SSG Landers +1 (-128)',
    'Yomiuri Giants @ Hanshin Tigers u3 1H Total (-130)',
    'Fukuoka Hawks @ Tohoku Rakuten Golden Eagles o4 1H Total (-109)', 'Tasmania Jackjumpers +8.5 (-145)']);
  const st = P.settle(r.signals, r.results, { now });
  const won = st.wins.map(w => r.signals[w.bet].title + ' | ' + r.signals[w.bet].pick).sort();
  assert.deepStrictEqual(won, [
    'Fukuoka Hawks @ Tohoku Rakuten Golden Eagles | Over 4 Total (1st Half)',
    'LG Twins @ SSG Landers | SSG Landers 1 Spread (1st Half)',  // "SSG Landers +1 (-128)": exact line+price, 1H not stated
    'Melbourne United @ Tasmania Jackjumpers | Tasmania Jackjumpers 6.5 Spread'].sort()); // won on its listed 8.5 line
  assert.deepStrictEqual(st.unmatched.map(i => r.results[i].raw), [
    'Zakharova, Anastasia @ Shao, Yushan u18.5 Total (-153)', 'Yomiuri Giants @ Hanshin Tigers u3 1H Total (-130)']);
  assert.deepStrictEqual(st.lost.map(i => r.signals[i].pick), ['Hanwha Eagles Moneyline']); // only games >5h old
});
t('no win posts means nothing is assumed lost, and a different line/side never matches', () => {
  const now = Date.UTC(2026, 9, 2, 2, 0);
  const r = P.parse(fixture('moneyline-cpbl'), { ...ctx, now: now + 864e5 });
  assert.deepStrictEqual(P.settle(r.signals, r.results, { now: now + 864e5 }).lost, []);
  const b = P.parse(fixture('total-first-half-mlb'), ctx).signals[0];
  const parse1 = line => P.parseResults('CASH IT\n\n' + line)[0];
  assert.strictEqual(P.settle([b], [parse1('Philadelphia Phillies @ Atlanta Braves u4 1H Total (-108)')]).wins.length, 0); // under, not over
  assert.strictEqual(P.settle([b], [parse1('Philadelphia Phillies @ Atlanta Braves o4 Total (-108)')]).wins.length, 0);  // full game, not 1H
  assert.strictEqual(P.settle([b], [parse1('Philadelphia Phillies @ Atlanta Braves o4 1H Total (-108)')]).wins.length, 1);
  assert.strictEqual(P.parseResults('Over 4 Total (-108)\nSSG Landers +1 (-128)').length, 0); // no CASH cheer, no win
});
console.log(n + ' passed');
