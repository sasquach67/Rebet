/* Signal identity excludes odds/stake: a repost must not replace the saved bet. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RebetDedupe=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const norm=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  function fallback(b){
    if(!norm(b.title)||!norm(b.pick))return null;
    if(!b.hasTime||!Number.isFinite(b.start))return null;
    return JSON.stringify([norm(b.title),b.start,norm(b.pick),norm(b.market),norm(b.marketDetail),norm(b.side),b.line??null]);
  }
  function originalOf(selected,original){const o=selected.selectionOverride;return !!o&&!original.selectionOverride&&norm(selected.title)===norm(original.title)&&selected.start===original.start&&norm(o.originalPick)===norm(original.pick)&&o.originalLine===original.line&&o.originalOdds===original.odds}
  function same(a,b){
    if(originalOf(a,b)||originalOf(b,a))return true;
    const ak=norm(a.betKey),bk=norm(b.betKey);
    if(ak&&bk)return ak===bk;
    const af=fallback(a),bf=fallback(b);
    if(af&&bf)return af===bf;
    // Without a scheduled time, only an identical original message is safe to skip.
    return !!norm(a.raw)&&norm(a.raw)===norm(b.raw)&&norm(a.title)===norm(b.title)&&norm(a.pick)===norm(b.pick);
  }
  function filter(incoming,saved){const kept=[],seen=saved.slice();let skipped=0;for(const b of incoming){const found=seen.find(x=>same(x,b));if(found){skipped++;const i=kept.indexOf(found);if(i>=0&&originalOf(b,found)){kept[i]=b;seen[seen.indexOf(found)]=b}}else{kept.push(b);seen.push(b)}}return {kept,skipped}}
  function correctPendingSelections(incoming,saved){
    const changed=[];
    for(const b of incoming){
      const o=b.selectionOverride;
      if(!o||saved.some(x=>same(x,b)&&x.line===b.line&&norm(x.pick)===norm(b.pick)))continue;
      const candidates=saved.filter(x=>x.status==='pending'&&norm(x.title)===norm(b.title)&&x.start===b.start&&x.hasTime&&
        norm(x.market)===norm(b.market)&&norm(x.pick)===norm(o.originalPick)&&x.line===o.originalLine&&x.odds===o.originalOdds);
      if(candidates.length!==1)continue;
      const x=candidates[0];
      for(const key of ['pick','line','odds','units','ev','winPct','fv','betKey','gameLines','selectedGameLine','selectionOverride','warnings','raw'])x[key]=b[key];
      changed.push(x.pick);
    }
    return changed;
  }
  return {same,filter,correctPendingSelections};
});
