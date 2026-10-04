const assert=require('node:assert/strict'),D=require('../dedupe');
const a={title:'Away @ Home',pick:'Over 8.5 Total',market:'total',marketDetail:'Total',side:'over',line:8.5,start:1,hasTime:true,odds:-110,units:1};
assert.equal(D.filter([a,{...a}],[]).skipped,1);
assert.equal(D.filter([a],[{...a,status:'won',odds:120,units:2}]).skipped,1);
assert.equal(D.same({...a,betKey:'abc'},{...a,betKey:'abc',odds:-150}),true);
assert.equal(D.same({...a,betKey:'abc'},{...a,betKey:'def'}),false);
assert.equal(D.same({...a,betKey:'abc'},a),true);
for(const different of [{pick:'Over 9.5 Total',line:9.5},{side:'under',pick:'Under 8.5 Total'},{marketDetail:'1st Half'},{start:2},{market:'spread'},{pick:'Home +8.5'}])assert.equal(D.same(a,{...a,...different}),false);
assert.equal(D.same(a,{...a,title:' AWAY   @ Home '}),true);
assert.equal(D.same({...a,start:null,hasTime:false},{...a,start:null,hasTime:false}),false);
assert.equal(D.same({...a,start:null,raw:'original signal'},{...a,start:null,raw:'original signal'}),true);
assert.equal(D.same({...a,start:null,raw:'original signal'},{...a,start:null,raw:'different signal'}),false);
const saved=[{...a,status:'won',notes:'keep this'}],snapshot=JSON.stringify(saved);D.filter([a],saved);assert.equal(JSON.stringify(saved),snapshot);
console.log('Dedupe checks passed: saved/batch repeats, changed odds, key fallback, distinct picks/periods/dates, incomplete signals, no mutation');

const P=require('../parser'),fs=require('fs'),path=require('path');
const raw=fs.readFileSync(path.join(__dirname,'fixtures/total-qk-49.txt'),'utf8');
const selected=P.parse(raw).signals[0],original=P.parse(raw.replace('QK 49','QK')).signals[0];
const pending={...original,id:'keep-id',status:'pending',notes:'keep notes'};
assert.deepEqual(D.correctPendingSelections([selected],[pending]),['Over 49 Total']);
assert.equal(pending.line,49);assert.equal(pending.units,.49);assert.equal(pending.id,'keep-id');assert.equal(pending.notes,'keep notes');
assert.equal(D.filter([selected,original],[pending]).skipped,2);
for(const status of ['placed','won','lost','skipped']){const b={...original,status};assert.equal(D.correctPendingSelections([selected],[b]).length,0);assert.equal(b.line,51)}
console.log('QK correction checks passed: pending corrected in place, repeated headlines skipped, recorded results preserved');

assert.equal(D.filter([original,selected],[]).kept[0].line,49);
assert.equal(D.filter([selected,original],[]).kept[0].line,49);
