/* Assumed outcomes from elapsed time; no live scores or Discord access. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./calendar'));else root.RebetSettlement=factory(root.RebetCalendar)})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  const GRACE=36*C.HOUR;
  function deadline(b){
    if(!b.hasTime||b.start==null||!Number.isFinite(b.start))return null;
    // Wait for the estimated whole game, even for a first-half pick.
    return b.start+C.durationFor({...b,marketDetail:'',pick:''})+GRACE;
  }
  function shouldLose(b,now){const at=deadline(b);return !b.autoLossDisabled&&(b.status==='pending'||b.status==='placed')&&at!==null&&now>=at}
  function apply(bets,now){let count=0;for(const b of bets){if(shouldLose(b,now)){b.status='lost';b.autoLossAt=now;count++}}return count}
  function canMatchWin(b){return b.status==='pending'||b.status==='placed'||(b.status==='lost'&&b.autoLossAt!=null)}
  function confirmWin(b){b.status='won';delete b.autoLossAt;delete b.autoLossDisabled}
  function manualStatus(b,status){const reopen=!['pending','placed'].includes(b.status);b.status=status;delete b.autoLossAt;b.autoLossDisabled=(status==='pending'||status==='placed')&&(reopen||!!b.autoLossDisabled)}
  return {deadline,shouldLose,apply,canMatchWin,confirmWin,manualStatus};
});
