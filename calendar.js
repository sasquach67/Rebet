/* Local civil-day layout. Inputs/outputs that identify moments remain UTC milliseconds. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RebetCalendar=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const HOUR=3600000;
  function dayStart(value){const d=new Date(value);d.setHours(0,0,0,0);return +d}
  function addDays(value,n){const d=new Date(value);d.setDate(d.getDate()+n);return +d}
  function weekRange(value){const start=dayStart(value),day=new Date(start).getDay();const first=addDays(start,-((day+6)%7));return {start:first,end:addDays(first,7),days:Array.from({length:7},(_,i)=>addDays(first,i))}}
  function weekNumber(value){const d=new Date(value);const u=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));u.setUTCDate(u.getUTCDate()+4-(u.getUTCDay()||7));return Math.ceil((((u-Date.UTC(u.getUTCFullYear(),0,1))/86400000)+1)/7)}
  function durationFor(b){const s=(b.sport||b.league||'').toLowerCase();const half=/1st\s*half|first\s*half/i.test((b.marketDetail||'')+' '+(b.pick||''));let h=/baseball|mlb|cpbl|npb/.test(s)?3:/american football|nfl|ncaa football/.test(s)?3.5:/basketball|nba|wnba|euroleague/.test(s)?2.5:/hockey|nhl/.test(s)?2.5:/soccer|football|tennis/.test(s)?2:2.5;return (half?Math.min(1.5,h/2):h)*HOUR}
  function minute(value){const d=new Date(value);return d.getHours()*60+d.getMinutes()+d.getSeconds()/60}
  function nowPosition(now,day){return now>=dayStart(day)&&now<addDays(dayStart(day),1)?minute(now):null}
  // Split at civil midnights, not 24-hour millisecond increments (DST-safe).
  function segments(bets,days){const out=[];for(const day of days){const next=addDays(day,1);for(const bet of bets){if(!bet.hasTime||bet.start==null||!Number.isFinite(+bet.start))continue;const end=+bet.start+durationFor(bet);if(+bet.start>=next||end<=day)continue;const start=Math.max(+bet.start,day),finish=Math.min(end,next);const top=minute(start),bottom=finish===next?1440:minute(finish);out.push({bet,day,start,end:finish,top,bottom:Math.max(top+15,bottom),continuesBefore:+bet.start<day,continuesAfter:end>next})}}return out}
  // Interval graph coloring; each connected group shares its maximum column count.
  function pack(items){const sorted=items.map(x=>({...x})).sort((a,b)=>a.top-b.top||b.bottom-a.bottom||String(a.bet?.id||'').localeCompare(String(b.bet?.id||'')));let group=[],ends=[],groupEnd=-Infinity;function flush(){for(const x of group)x.columns=ends.length;group=[];ends=[]}
    for(const x of sorted){if(x.top>=groupEnd){flush();groupEnd=-Infinity}let column=ends.findIndex(end=>end<=x.top);if(column<0)column=ends.length;ends[column]=x.bottom;x.column=column;group.push(x);groupEnd=Math.max(groupEnd,x.bottom)}flush();return sorted}
  return {HOUR,dayStart,addDays,weekRange,weekNumber,durationFor,minute,nowPosition,segments,pack};
});
