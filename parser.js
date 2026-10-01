/* Rebet signal parser. Works in the browser (window.RebetParser) and Node (module.exports).
   parse(text, ctx) -> { signals: [...], ignored: n }
   ctx: { tz: zone used when a signal has no timezone token (default America/New_York),
          localTz: zone the Discord "Today at 1:56 PM" stamps are shown in (default: this machine),
          now: ms }                                                                              */
(function (root) {
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  const WDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const TZ_FIXED = { EDT: -240, EST: -300, CDT: -300, CST: -360, MDT: -360, MST: -420, PDT: -420, PST: -480, UTC: 0, GMT: 0 };
  const TZ_NAMED = { ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver', PT: 'America/Los_Angeles' };
  const MON_RE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';
  const TZ_RE = '(EDT|EST|CDT|CST|MDT|MST|PDT|PST|UTC|GMT|ET|CT|MT|PT)';

  /* ---------- time zones ---------- */
  function partsIn(tz, ms) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const o = {};
    f.formatToParts(new Date(ms)).forEach(p => { o[p.type] = +p.value; });
    return o;
  }
  function tzOffsetMs(tz, ms) {
    const p = partsIn(tz, ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  }
  function zonedToUtc(y, mo, d, h, mi, tz) {
    const g = Date.UTC(y, mo, d, h, mi);
    const first = g - tzOffsetMs(tz, g);
    return g - tzOffsetMs(tz, first);
  }
  function toUtc(y, mo, d, h, mi, tzTok, fallbackTz) {
    const t = tzTok && tzTok.toUpperCase();
    if (t && t in TZ_FIXED) return Date.UTC(y, mo, d, h, mi) - TZ_FIXED[t] * 60000;
    return zonedToUtc(y, mo, d, h, mi, (t && TZ_NAMED[t]) || fallbackTz);
  }

  /* ---------- dates ---------- */
  function parseTime(t) {
    const m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/i) || t.match(/\b([01]?\d|2[0-3]):([0-5]\d)()(?!\s*[ap]m)/i);
    if (!m) return null;
    let h = +m[1]; const mi = +(m[2] || 0); const ap = (m[3] || '').toLowerCase();
    if (ap) { if (ap[0] === 'p' && h < 12) h += 12; if (ap[0] === 'a' && h === 12) h = 0; }
    return { h, mi };
  }
  function findTzToken(text) {
    const m = text.match(new RegExp('\\d\\s*(?:[ap]\\.?m\\.?)?\\s*' + TZ_RE + '\\b', 'i'));
    return m ? m[1] : null;
  }
  /* "Today at 1:56 PM" / "Yesterday at 9:00 AM" / "10/01/2026 1:56 PM", shown in the Discord viewer's zone */
  function parseSent(text, ctx) {
    let m = text.match(/\b(today|yesterday)\s+at\s+(\d{1,2}:\d{2}\s*[ap]m)/i);
    if (m) {
      const t = parseTime(m[2]); const p = partsIn(ctx.localTz, ctx.now);
      let d = new Date(Date.UTC(p.year, p.month - 1, p.day));
      if (/yesterday/i.test(m[1])) d = new Date(d.getTime() - 864e5);
      return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), t.h, t.mi, ctx.localTz);
    }
    m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*,?\s*(?:at\s+)?(\d{1,2}:\d{2}\s*[ap]m)/i);
    if (m) {
      const t = parseTime(m[4]); const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      return zonedToUtc(y, +m[1] - 1, +m[2], t.h, t.mi, ctx.localTz);
    }
    return null;
  }
  function parseDate(text, ctx) {
    const warnings = [];
    let m = text.match(/<t:(\d{9,11})(?::[a-zA-Z])?>/);
    if (m) return { ms: +m[1] * 1000, hasTime: true, warnings };
    const tm = parseTime(text);
    const tzTok = tm ? findTzToken(text) : null;
    const ref = ctx.sentAt || ctx.now;
    const refY = partsIn(ctx.tz, ref).year;
    let y = refY, mo, da, explicitYear = false;
    const wdm = text.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b\.?,?/i);
    const wd = wdm ? WDAYS[wdm[1].toLowerCase()] : null;
    if ((m = text.match(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/))) { y = +m[1]; mo = +m[2] - 1; da = +m[3]; explicitYear = true; }
    else if ((m = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) { mo = +m[1] - 1; da = +m[2]; if (m[3]) { y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; explicitYear = true; } }
    else if ((m = text.match(new RegExp('\\b(' + MON_RE + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d\\d))?', 'i')))) { mo = MONTHS[m[1].toLowerCase().slice(0, 3)]; da = +m[2]; if (m[3]) { y = +m[3]; explicitYear = true; } }
    else if ((m = text.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + MON_RE + ')', 'i')))) { da = +m[1]; mo = MONTHS[m[2].toLowerCase().slice(0, 3)]; }
    else if (/\b(tonight|today)\b/i.test(text)) { const p = partsIn(ctx.tz, ref); mo = p.month - 1; da = p.day; y = p.year; explicitYear = true; }
    else if (/\btomorrow\b/i.test(text)) { const p = partsIn(ctx.tz, ref + 864e5); mo = p.month - 1; da = p.day; y = p.year; explicitYear = true; }
    else if (wd != null) { const p = partsIn(ctx.tz, ref); const cur = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); const add = (wd - cur + 7) % 7; const d = new Date(Date.UTC(p.year, p.month - 1, p.day + add)); y = d.getUTCFullYear(); mo = d.getUTCMonth(); da = d.getUTCDate(); explicitYear = true; }
    if (mo == null || da == null) return null;
    const h = tm ? tm.h : 12, mi = tm ? tm.mi : 0;
    let ms = toUtc(y, mo, da, h, mi, tzTok, ctx.tz);
    if (!explicitYear && ms < ref - 30 * 864e5) { y += 1; ms = toUtc(y, mo, da, h, mi, tzTok, ctx.tz); }
    if (wd != null && new Date(Date.UTC(y, mo, da)).getUTCDay() !== wd) warnings.push('weekday does not match date');
    if (!tm) warnings.push('no time found');
    if (ms < ctx.now - 36e5) warnings.push('game time is in the past');
    return { ms, hasTime: !!tm, tz: tzTok, warnings };
  }

  /* ---------- helpers ---------- */
  const americanToDec = o => (o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o));
  const num = s => (s == null ? null : +s);
  function blankBet() {
    return { title: '', pick: '', sport: '', league: '', market: '', side: '', line: null, units: null, odds: null, ev: null, winPct: null, fv: null, sharpOdds: '', betKey: '', start: null, hasTime: false, sentAt: null, warnings: [], format: 'generic', raw: '' };
  }

  /* ---------- Rebet bot format ----------
     USA - American Football - ncaa - Over 55.5 Total (-128) • EV: 1.9%
     Florida Gators @ Missouri Tigers - (Total)
     Sat, Oct 03, 3:30 PM EDT
     ... W%: / FV: / EV: / QK: 0.62U / Pinnacle Odds: / Bet Key / Forged by X•Today at 1:56 PM        */
  const BOT_REST = /^(.*?)\s*\(([+-]?\d+)\)\s*(?:[•·]\s*EV:\s*(-?[\d.]+)\s*%)?\s*$/;
  function botHeader(line) {
    const parts = line.trim().split(/\s+-\s+/);
    if (parts.length < 4) return null;
    const m = parts.slice(3).join(' - ').match(BOT_REST);
    if (!m || !/[A-Za-z]/.test(m[1])) return null;
    return { country: parts[0], sport: parts[1], league: parts[2], market: m[1].trim(), odds: +m[2], ev: num(m[3]) };
  }
  const isFooter = l => /^#.*[•·].*\d{1,2}:\d{2}\s*[ap]m\s*$/i.test(l.trim());

  function parseBot(lines, hdr, ctx) {
    const b = blankBet(); const text = lines.join('\n');
    b.format = 'rebet-bot'; b.raw = text;
    b.sport = hdr.sport; b.league = hdr.league; b.odds = hdr.odds; b.ev = hdr.ev; b.pick = hdr.market;
    const mk = hdr.market;
    b.market = /total/i.test(mk) ? 'total' : /spread|handicap/i.test(mk) ? 'spread' : /money\s*line|\bML\b/i.test(mk) ? 'moneyline' : 'other';
    const sd = mk.match(/\b(over|under)\b/i); if (sd) b.side = sd[1].toLowerCase();
    const ln = mk.match(/(?:over|under)\s+(\d+(?:\.\d+)?)/i) || mk.match(/([+-]\d+(?:\.\d+)?)\s*(?:spread|handicap)/i) || mk.match(/([+-]?\d+(?:\.\d+)?)\s*(?:spread|handicap)/i);
    if (ln) b.line = +ln[1];
    const tl = lines.slice(1).find(l => /\s(?:@|vs\.?)\s/i.test(l) && !/^(game lines|rebet)/i.test(l));
    if (tl) { const t = tl.match(/^(.+?)\s+(?:@|vs\.?)\s+(.+?)(?:\s+-\s+\(.*\))?\s*$/i); b.title = t ? `${t[1].trim()} @ ${t[2].trim()}` : tl.trim(); }
    else b.title = hdr.market;
    if (/\bvs\.?\b/i.test(tl || '') && !/@/.test(tl || '')) b.title = b.title.replace(' @ ', ' vs ');
    // game time
    const dl = lines.find(l => /\b\d{1,2}:\d{2}\s*[ap]m\b/i.test(l) && new RegExp('\\b' + MON_RE + '\\s+\\d', 'i').test(l));
    b.sentAt = parseSent(text, ctx);
    const dctx = Object.assign({}, ctx, { sentAt: b.sentAt });
    const d = parseDate(dl || text, dctx);
    if (d) { b.start = d.ms; b.hasTime = d.hasTime; b.warnings.push(...d.warnings); } else b.warnings.push('no game date found');
    // stats
    let m;
    if ((m = text.match(/\bW%:\s*([\d.]+)\s*%/))) b.winPct = +m[1];
    if ((m = text.match(/\bFV:\s*([+-]?\d+)/))) b.fv = +m[1];
    if (b.ev == null && (m = text.match(/\bEV:\s*(-?[\d.]+)\s*%/))) b.ev = +m[1];
    if ((m = text.match(/\bQK:\s*(\d+(?:\.\d+)?)\s*u/i))) b.units = +m[1];
    if ((m = text.match(/\bOdds:\s*([+-]\d+)\s*\/\s*([+-]\d+)/))) b.sharpOdds = `${m[1]} / ${m[2]}`;
    if ((m = text.match(/Bet Key\s*\n\s*([^\n]+)/i))) b.betKey = m[1];
    if (b.units == null) b.warnings.push('no QK units found');
    return b;
  }

  /* ---------- generic fallback ---------- */
  function parseGeneric(raw, ctx) {
    const lines = raw.split('\n').map(l => l.replace(/[*_`>|~]/g, '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '').trim()).filter(Boolean)
      .filter(l => !/^.{1,40}\s[—–-]\s(today|yesterday|\d{1,2}\/\d{1,2}\/\d{2,4})\b.*\d/i.test(l) && !/^(app|bot)$/i.test(l));
    const text = lines.join('\n');
    const b = blankBet(); b.raw = raw.trim();
    let m = text.match(/(\d+(?:\.\d+)?)\s*(?:u\b|units?\b)/i) || text.match(/\bunits?\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);
    if (m) b.units = +m[1];
    m = text.match(/(?<![\w.:\/])([+-]\d{3,4})(?![\d:\/])/);
    if (m) { const o = +m[1]; if (Math.abs(o) >= 100) b.odds = o; }
    else if ((m = text.match(/(?:odds?|price|@)\s*[:=]?\s*(\d\.\d{1,3})\b/i))) { const dec = +m[1]; if (dec > 1) b.odds = Math.round(dec >= 2 ? (dec - 1) * 100 : -100 / (dec - 1)); }
    b.sentAt = parseSent(text, ctx);
    const d = parseDate(raw.includes('<t:') ? raw : text, Object.assign({}, ctx, { sentAt: b.sentAt }));
    if (d) { b.start = d.ms; b.hasTime = d.hasTime; b.warnings.push(...d.warnings); } else b.warnings.push('no game date found');
    const gl = lines.find(l => /[A-Za-z].*\s(?:vs\.?|v\.?|@|at)\s+[A-Za-z]/i.test(l));
    if (gl) {
      const g = gl.match(/([A-Za-z][^@]*?\s(?:vs\.?|v\.?|at)\s+[A-Za-z][^()\n]*|[A-Za-z][^@]*?\s@\s+[A-Za-z][^()\n]*)/i);
      b.title = (g ? g[1] : gl).replace(/\s+[-–—|•].*$/, '').replace(/\s*[+-]\d{3,4}.*$/, '').trim();
    }
    const pl = lines.find(l => /^(pick|bet|play|selection)\s*[:\-]/i.test(l));
    if (pl) b.pick = pl.replace(/^[^:\-]*[:\-]\s*/, '').trim();
    else { const ol = lines.find(l => l !== gl && (/[+-]\d{3,4}(?!\d)/.test(l) || /\b(over|under|ml|moneyline|spread|o\/u|[+-]\d+(\.\d)?)\b/i.test(l)) && !/^\s*\d+(\.\d+)?\s*u/i.test(l)); if (ol) b.pick = ol; }
    if (!b.title) b.title = (lines.find(l => l !== b.pick) || lines[0] || 'Untitled signal').slice(0, 90);
    if (b.pick && b.pick === b.title) b.pick = '';
    if (!b.pick && gl) { const rest = gl.split(/\s[-–—|•]\s/).slice(1).find(x => /\b(ml|moneyline|over|under|spread)\b|[+-]\d/i.test(x) && !/^\s*\d+(\.\d+)?\s*u/i.test(x)); if (rest) b.pick = rest.trim(); }
    return b;
  }

  /* ---------- entry point ---------- */
  function parse(text, ctxIn) {
    const ctx = Object.assign({ tz: 'America/New_York', localTz: Intl.DateTimeFormat().resolvedOptions().timeZone, now: Date.now() }, ctxIn || {});
    const lines = text.replace(/\r/g, '').split('\n');
    const heads = [];
    lines.forEach((l, i) => { const h = botHeader(l); if (h) heads.push({ i, h }); });
    if (heads.length) {
      const signals = heads.map((x, k) => {
        const next = k + 1 < heads.length ? heads[k + 1].i : lines.length;
        let end = next;
        for (let j = x.i + 1; j < next; j++) if (isFooter(lines[j])) { end = j + 1; break; }
        return parseBot(lines.slice(x.i, end).map(l => l.trim()).filter(Boolean), x.h, ctx);
      });
      return { signals, ignored: 0 };
    }
    const blocks = text.replace(/\r/g, '').split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
    return { signals: blocks.map(b => parseGeneric(b, ctx)), ignored: 0 };
  }

  const api = { parse, parseDate, parseSent, americanToDec, zonedToUtc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RebetParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
