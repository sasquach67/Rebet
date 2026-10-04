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
    return { title: '', pick: '', sport: '', league: '', market: '', marketDetail: '', side: '', line: null, units: null, odds: null, ev: null, winPct: null, fv: null, sharpOdds: '', betKey: '', start: null, hasTime: false, sentAt: null, repeat: false, gameLines: [], selectedGameLine: null, warnings: [], format: 'generic', raw: '' };
  }

  /* ---------- Rebet bot format ---------- */
  const BOT_REST = /^(.*?)\s*\(([+-]?\d+)\)\s*(?:[•·]\s*EV:\s*(-?[\d.]+)\s*%)?\s*$/;
  function botHeader(line) {
    const parts = line.trim().split(/\s+-\s+/);
    // International leagues sometimes omit the country; keep the existing
    // country/sport/league format's support for separators inside the pick.
    if (parts.length < 3) return null;
    const offset = parts.length === 3 ? 0 : 1;
    const m = parts.slice(offset + 2).join(' - ').match(BOT_REST);
    if (!m || !/[A-Za-z]/.test(m[1])) return null;
    return { sport: parts[offset], league: parts[offset + 1], market: m[1].trim(), odds: +m[2], ev: num(m[3]) };
  }
  const isFooter = l => /^Forged by\b/i.test(l.trim()) || /^#.*[•·].*\d{1,2}:\d{2}\s*[ap]m\s*$/i.test(l.trim());

  function selection(pick, defaultMarket = '') {
    const market = /\b(?:spread|handicap|SPR)\b/i.test(pick) ? 'spread'
      : /\b(?:money\s*line|ML)\b/i.test(pick) ? 'moneyline'
      : /\btotal\b|O\/U/i.test(pick) ? 'total' : defaultMarket || 'other';
    const side = (pick.match(/\b(over|under)\b/i) || [,''])[1].toLowerCase();
    const lineMatch = pick.match(/\b(?:over|under)\s+([+-]?\d+(?:\.\d+)?)/i)
      || (market === 'spread' && pick.match(/([+-]?\d+(?:\.\d+)?)\s*(?:(?:spread|handicap|SPR)\b)?\s*$/i));
    return { market, side, line: lineMatch ? +lineMatch[1] : null };
  }
  function stats(text) {
    const read = regex => { const m = text.match(regex); return m ? +m[1] : null; };
    return {
      winPct: read(/\bW%:\s*([\d.]+)\s*%/i),
      fv: read(/\bFV:\s*([+-]?\d+)/i),
      ev: read(/\bEV:\s*(-?[\d.]+)\s*%/i),
      units: read(/\bQK:\s*(\d+(?:\.\d+)?)\s*u\b/i)
    };
  }
  const normalizedPick = pick => pick.toLowerCase().replace(/\b(?:spread|handicap|spr)\b/g, 'spr')
    .replace(/\b(?:money\s*line|ml)\b/g, 'ml').replace(/\btotal\b|o\/u/g, 'total')
    .replace(/\+(?=\d)/g, '').replace(/\s+/g, ' ').trim();

  function parseBot(lines, hdr, ctx) {
    const b = blankBet(); const text = lines.join('\n');
    b.format = 'rebet-bot'; b.raw = text;
    b.sport = hdr.sport; b.league = hdr.league; b.odds = hdr.odds; b.ev = hdr.ev; b.pick = hdr.market;
    Object.assign(b, selection(b.pick));
    const tl = lines.slice(1).find(l => /\s(?:@|vs\.?)\s/i.test(l) && !/^(game lines|rebet)/i.test(l));
    if (tl) {
      const detail = tl.match(/\s+-\s+\((.*)\)\s*$/);
      b.marketDetail = detail ? detail[1] : '';
      b.title = tl.replace(/\s+-\s+\(.*\)\s*$/, '').trim();
    } else b.title = hdr.market;

    // Only a game-date line can schedule a reminder. Never borrow a footer's
    // posting time or the Bet Key's UTC date when the game time is absent.
    b.sentAt = parseSent(lines.find(l => /^Forged by\b/i.test(l)) || text, ctx);
    const dateLine = new RegExp('^(?:(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*[.,]?\\s*)?(?:' + MON_RE + '\\s+\\d|\\d{1,2}\\s+' + MON_RE + '|20\\d\\d-\\d{1,2}-\\d{1,2}|\\d{1,2}/\\d{1,2}|today\\b|tomorrow\\b|tonight\\b|<t:)', 'i');
    const dl = lines.slice(1).find(l => dateLine.test(l) || /^(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*\s+\d/i.test(l));
    const d = dl ? parseDate(dl, Object.assign({}, ctx, { sentAt: b.sentAt })) : null;
    if (d) {
      b.hasTime = d.hasTime;
      b.start = d.hasTime ? d.ms : null;
      b.warnings.push(...d.warnings);
    } else b.warnings.push('no game date found');

    // Every Game Lines price has its own stats. The headline is the selected
    // bet; other prices are retained for review, never silently added as bets.
    const start = lines.findIndex(l => /^Game Lines\s*$/i.test(l));
    const end = lines.findIndex((l, i) => i > start && /^(Pinnacle|Bet Key|Forged by)\b/i.test(l));
    const game = start < 0 ? [] : lines.slice(start + 1, end < 0 ? lines.length : end);
    const price = /^(.+?)\s*\(([+-]?\d+)\s*\/\s*([+-]?\d+)\)\s*$/;
    game.forEach((l, i) => {
      const m = l.match(price); if (!m) return;
      const next = game.findIndex((s, j) => j > i && price.test(s));
      b.gameLines.push(Object.assign({ pick: m[1].trim(), odds: +m[2], oppositeOdds: +m[3] },
        selection(m[1], b.market), stats(game.slice(i + 1, next < 0 ? game.length : next).join('\n'))));
    });
    const index = b.gameLines.findIndex(g => g.odds === b.odds &&
      (normalizedPick(g.pick) === normalizedPick(b.pick)
        || (b.market === 'spread' && normalizedPick(g.pick + ' SPR') === normalizedPick(b.pick))));
    if (index >= 0) {
      b.selectedGameLine = index;
      const g = b.gameLines[index];
      b.units = g.units; b.winPct = g.winPct; b.fv = g.fv;
      if (b.ev == null) b.ev = g.ev;
    } else if (b.gameLines.length) {
      // Edited messages can have a stale headline. Using another line's QK
      // would misstate the intended stake and probability.
      b.warnings.push('headline pick does not match listed game lines; review odds and units');
    } else {
      const s = stats(text);
      b.units = s.units; b.winPct = s.winPct; b.fv = s.fv;
      if (b.ev == null) b.ev = s.ev;
    }
    if (b.gameLines.length > 1 && index >= 0) b.warnings.push(b.gameLines.length + ' game lines; headline pick selected');
    // Keep the market qualifier visible: "Over 4 Total" on a first-half market is a
    // different bet from the full-game total, and the UI shows only `pick`.
    const qualifier = b.marketDetail.replace(/^(?:money\s*line|moneyline|spread|handicap|total|o\/u)\b\s*/i, '').trim();
    if (qualifier && !/^\(?\s*match\s*\)?$/i.test(qualifier)) b.pick += ' (' + qualifier.replace(/^\(|\)$/g, '') + ')';
    b.repeat = /message about this bet has been already sent before/i.test(text);
    if (b.repeat) b.warnings.push('signal was already sent before');
    let m;
    if ((m = text.match(/\bPinnacle\s+Odds:\s*([+-]\d+)\s*\/\s*([+-]\d+)/i))) b.sharpOdds = `${m[1]} / ${m[2]}`;
    if ((m = text.match(/(?:^|\n)Bet Key\s*:?[\s`|]*([^\s|]+\|20\d\d-\d{2}-\d{2}\|[^\n]+)/i))) b.betKey = m[1].replace(/[|`\s]+$/, '');
    if (b.units == null) b.warnings.push('no QK units found');
    return b;
  }

  function applyQkLine(b, tail) {
    const notes=[];
    for(const raw of tail){
      const l=raw.trim();
      // A new Discord author/message ends the preceding signal's annotation area.
      if (/\s[—–]\s/.test(l) || /^(?:Forwarded|@Rebet)$/i.test(l) || /[✅☑✔]/u.test(l)) break;
      const m=l.match(/^(?:@\S+\s+)*QK\s+([+-]?\d+(?:\.\d+)?)(?:\s+@\S+)*\s*$/i);
      if(m)notes.push({line:+m[1],raw:l});
    }
    if(!notes.length)return b;
    b.raw+='\n'+notes.map(n=>n.raw).join('\n');
    const requested=[...new Set(notes.map(n=>n.line))];
    const matches=b.gameLines.map((g,i)=>({g,i})).filter(({g})=>requested.length===1&&g.line===requested[0]&&g.market===b.market&&g.side===b.side);
    if(matches.length!==1){b.warnings.push('QK line selection missing or ambiguous in Game Lines; review selection');return b}
    const {g,i}=matches[0];
    b.selectionOverride={note:notes[0].raw,originalPick:b.pick,originalLine:b.line,originalOdds:b.odds,originalBetKey:b.betKey};
    const suffix=(b.pick.match(/\s+\(.*\)$/)||[''])[0];
    b.pick=g.pick.replace(/O\/U/gi,'Total').replace(/\bSPR\b/gi,'Spread')+suffix;
    for(const key of ['line','odds','units','ev','winPct','fv'])b[key]=g[key];
    b.selectedGameLine=i;
    if(b.betKey)b.betKey=b.betKey.replace(/\|line=[^|]+$/, '|line='+g.line);
    b.warnings=b.warnings.filter(w=>!w.includes('headline pick')&&w!=='no QK units found');
    b.warnings.push('Selected listed line from '+notes[0].raw);
    if(b.units==null)b.warnings.push('no QK units found');
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
    if (d) { b.hasTime = d.hasTime; b.start = d.hasTime ? d.ms : null; b.warnings.push(...d.warnings); } else b.warnings.push('no game date found');
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


  /* ---------- win posts ----------
     The capper posts "CASH ... LFG @Premium Member ..." followed by the winning bet, e.g.
       Tasmania Jackjumpers +8.5 (-145)
       Melbourne United @ Tasmania Jackjumpers u182.5 Total (-122)
       Fukuoka Hawks @ Tohoku Rakuten Golden Eagles o4 1H Total (-109)
     Recognize explicit CASH/WINNER headings or a checkmark directly on a result line. */
  const clean = l => l.replace(/[*_`~|>\uFE0F\uFE0E\u200D]/g, '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '').trim();
  const RES_TOTAL = /^(.+?)\s+(o|u|over|under)\s*(\d+(?:\.\d+)?)\s*(1h|1st\s*half)?\s*total(?:\s*\(([+-]?\d+)\))?\s*$/i;
  const RES_ML = /^(.+?)\s+(?:ml|moneyline)\s*(1h|1st\s*half)?(?:\s*\(([+-]?\d+)\))?\s*$/i;
  const RES_SPREAD = /^(.+?)\s+([+-]\d+(?:\.\d+)?)\s*(1h|1st\s*half)?(?:\s*\(([+-]?\d+)\))?\s*$/i;
  function parseResultLine(line) {
    let m = line.match(RES_TOTAL);
    if (m) return { teams: m[1], market: 'total', side: /^o/i.test(m[2]) ? 'over' : 'under', line: +m[3], period: m[4] ? '1h' : 'game', odds: m[5] == null ? null : +m[5] };
    m = line.match(RES_ML);
    if (m) return { teams: m[1], market: 'moneyline', side: '', line: null, period: m[2] ? '1h' : 'game', odds: m[3] == null ? null : +m[3] };
    m = line.match(RES_SPREAD);
    if (m) return { teams: m[1], market: 'spread', side: '', line: +m[2], period: m[3] ? '1h' : 'game', odds: m[4] == null ? null : +m[4] };
    return null;
  }
  function scanResults(text) {
    const rawLines = text.replace(/\r/g, '').split('\n'), lines = rawLines.map(clean);
    const out = [], consumed = new Set();
    for (let i = 0; i < lines.length; i++) {
      if (consumed.has(i)) continue;
      const checked = /[✅☑✔]/u.test(rawLines[i]) && !/[❌✖✗]/u.test(rawLines[i]);
      let j = i, r = checked ? parseResultLine(lines[i]) : null;
      const cheer = /\b(?:cash|winner)\b/i.test(lines[i]) && !/\b(?:not|no|never|if|hope|hoping)\b|\?/i.test(lines[i]);
      if (!r && cheer) {
        j = i + 1; while (j < lines.length && !lines[j]) j++;
        r = j < lines.length && !/[❌✖✗]/u.test(rawLines[j]) ? parseResultLine(lines[j]) : null;
      }
      if (r) {
        out.push(Object.assign(r, { kind: 'win', raw: lines[j], cheer: lines[i].slice(0, 120) }));
        consumed.add(i); consumed.add(j);
      }
    }
    return { results: out, remaining: rawLines.map((l,i)=>consumed.has(i)?'':l).join('\n') };
  }
  function parseResults(text) { return scanResults(text).results; }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Explicit observed aliases, applied only to team identity (never odds or timing).
  const teamNorm = value => norm(value).replace(/\bnc courage\b/g, 'north carolina courage');
  const teamOf = pick => teamNorm(String(pick || '').replace(/\s*\(.*\)\s*$/, '').replace(/\s+[+-]?\d+(?:\.\d+)?\s*(?:spread|spr|handicap)?\s*$/i, '').replace(/\s+(?:moneyline|ml)\s*$/i, ''));
  const periodOf = b => (/1st\s*half|\b1h\b/i.test(b.marketDetail || '') || /1st\s*half|\b1h\b/i.test(b.pick || '')) ? '1h' : 'game';
  function resultMatchScore(b, r) {
    const title = teamNorm(b.title);
    const sides = r.teams.split('@').map(teamNorm).filter(Boolean);
    if (!sides.length || !sides.every(t => title.includes(t))) return 0;
    if (b.market !== r.market) return 0;
    const periodMismatch = periodOf(b) !== r.period;
    const lines = [{ line: b.line, odds: b.odds }].concat((b.gameLines || []).map(g => ({ line: g.line, odds: g.odds })));
    if (r.market === 'total') {
      if (b.side !== r.side) return 0;
    } else {
      const t = teamOf(b.pick);
      if (!t || !(t.includes(sides[sides.length - 1]) || sides[sides.length - 1].includes(t))) return 0;
    }
    const lineHit = r.line != null && lines.some(x => x.line === r.line);
    const oddsHit = r.odds != null && lines.some(x => x.odds === r.odds);
    if (r.market === 'moneyline') return periodMismatch ? 0 : (oddsHit ? 3 : 1); // team + market is enough; the price may have moved
    if (!lineHit && !oddsHit) return 0;
    const score = (lineHit ? 2 : 0) + (oddsHit ? 1 : 0);
    // Spread posts never state the period, so one may match a first-half spread, but only on an exact line+price match.
    // Total posts always say "1H" for first-half totals, so a mismatch there is a different bet.
    if (periodMismatch && !(r.market === 'spread' && r.period === 'game' && score === 3)) return 0;
    return score;
  }
  /* Matches win posts to bets. Each win goes to the best-scoring bet (ties: most recently sent).
     Unmatched wins are reported. With assumeLost, bets that are still unresolved, started more than
     lossAfterHours ago, and were part of a paste containing at least one win post, are returned as lost. */
  function settle(bets, results, opts) {
    const o = Object.assign({ now: Date.now(), assumeLost: true, lossAfterHours: 5 }, opts || {});
    const wins = new Map(), unmatched = [];
    results.forEach((r, ri) => {
      let best = 0, pick = -1;
      bets.forEach((b, bi) => {
        const sc = resultMatchScore(b, r);
        if (sc > best || (sc === best && sc > 0 && pick >= 0 && (b.sentAt || 0) > (bets[pick].sentAt || 0))) { best = sc; pick = bi; }
      });
      if (pick >= 0 && best > 0) { if (!wins.has(pick)) wins.set(pick, { result: ri, score: best }); } else unmatched.push(ri);
    });
    const lost = [];
    if (o.assumeLost && results.length) {
      bets.forEach((b, bi) => {
        if (!wins.has(bi) && b.start && b.hasTime && b.start < o.now - o.lossAfterHours * 3600e3) lost.push(bi);
      });
    }
    return { wins: [...wins].map(([bet, w]) => ({ bet, result: w.result, score: w.score })), unmatched, lost };
  }

  // Automatic writes require one exact selected line/period, never price-only or an alternative line.
  function matchConfirmedWins(bets, results, now = Date.now()) {
    const matches = [], unmatched = [];
    results.forEach((r, result) => {
      const candidates = [];
      bets.forEach((b, bet) => {
        if (b.start != null && b.start > now) return;
        if (periodOf(b) !== r.period) return;
        if (r.market !== 'moneyline' && (b.line == null || b.line !== r.line)) return;
        if (resultMatchScore(b, r) > 0) candidates.push(bet);
      });
      if (candidates.length === 1) matches.push({bet:candidates[0],result});
      else unmatched.push(result);
    });
    return { matches, unmatched };
  }

  /* ---------- entry point ---------- */
  function parse(text, ctxIn) {
    const ctx = Object.assign({ tz: 'America/New_York', localTz: Intl.DateTimeFormat().resolvedOptions().timeZone, now: Date.now() }, ctxIn || {});
    const lines = text.replace(/\r/g, '').split('\n').map(l=>l.replace(/\*\*|`/g,'').replace(/&#x20;/g,' ').replace(/^\s*\d+\.\s+(?=[A-Za-z@])/,'').trim())
      .flatMap(l=>/message about this bet has been already sent before/i.test(l)?l.split(/\s+(?=(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s)/):[l]);
    const heads = [];
    lines.forEach((l, i) => { const h = botHeader(l); if (h) heads.push({ i, h }); });
    if (heads.length) {
      const signals = heads.map((x, k) => {
        const next = k + 1 < heads.length ? heads[k + 1].i : lines.length;
        let end = next;
        for (let j = x.i + 1; j < next; j++) if (isFooter(lines[j])) { end = j + 1; break; }
        const b=parseBot(lines.slice(x.i, end).map(l => l.trim()).filter(Boolean), x.h, ctx);
        return applyQkLine(b,lines.slice(end,next));
      });
      return { signals, results: parseResults(text), ignored: 0 };
    }
    const scan = scanResults(text);
    const blocks = scan.remaining.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
    const signals = blocks.map(block => parseGeneric(block, ctx)).filter(b =>
      !scan.results.length || b.start != null || b.units != null || !!b.pick);
    return { signals, results: scan.results, ignored: 0 };
  }

  const api = { parse, parseResults, settle, matchConfirmedWins, parseDate, parseSent, americanToDec, zonedToUtc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RebetParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
