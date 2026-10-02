/* Signal identity excludes odds/stake: a repost must not replace the saved bet. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RebetDedupe=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const norm=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  function fallback(b){
    if(!norm(b.title)||!norm(b.pick))return null;
    if(!b.hasTime||!Number.isFinite(b.start))return null;
    return JSON.stringify([norm(b.title),b.start,norm(b.pick),norm(b.market),norm(b.marketDetail),norm(b.side),b.line??null]);
  }
  function same(a,b){
    const ak=norm(a.betKey),bk=norm(b.betKey);
    if(ak&&bk)return ak===bk;
    const af=fallback(a),bf=fallback(b);
    if(af&&bf)return af===bf;
    // Without a scheduled time, only an identical original message is safe to skip.
    return !!norm(a.raw)&&norm(a.raw)===norm(b.raw)&&norm(a.title)===norm(b.title)&&norm(a.pick)===norm(b.pick);
  }
  function filter(incoming,saved){const kept=[],seen=saved.slice();let skipped=0;for(const b of incoming){if(seen.some(x=>same(x,b)))skipped++;else{kept.push(b);seen.push(b)}}return {kept,skipped}}
  return {same,filter};
});
