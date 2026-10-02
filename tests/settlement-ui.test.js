// Isolated browser storage and mocked time; never opens the user's live data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path'),S=require('../settlement');
(async()=>{const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});try{
const page=await browser.newPage({viewport:{width:1400,height:1000},timezoneId:'America/New_York'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base={title:'Away @ Home',pick:'Home Moneyline',market:'moneyline',sport:'Baseball',hasTime:true,start:Date.parse('2026-10-01T18:00:00Z'),status:'pending',units:1,odds:120};
const deadline=S.deadline(base);
await page.clock.install({time:new Date(deadline-60000)});
await page.addInitScript(data=>{if(!localStorage.getItem('rebet.v1'))localStorage.setItem('rebet.v1',JSON.stringify(data))},{bets:[{...base,id:'auto'},{...base,id:'skip',status:'skipped'},{...base,id:'unknown',start:null,hasTime:false},{...base,id:'manual',status:'lost'}],settings:{lead:3,defaultOdds:-110}});
await page.goto('file://'+path.resolve(__dirname,'../dist/rebet.html'));
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('rebet.v1')));
assert.equal((await state()).bets[0].status,'pending');
await page.clock.fastForward(90000);
assert.equal((await state()).bets[0].status,'lost');
assert.ok((await state()).bets[0].autoLossAt);
assert.equal((await state()).bets[1].status,'skipped');assert.equal((await state()).bets[2].status,'pending');
await page.getByRole('button',{name:'Tracker',exact:true}).click();assert.match(await page.locator('#t-trk').innerText(),/Assumed loss/);
await page.screenshot({path:path.resolve(__dirname,'screenshots/settlement-desktop.png'),fullPage:true});
await page.reload();assert.equal((await state()).bets[0].status,'lost');
await page.getByRole('button',{name:'Add signals',exact:true}).click();await page.locator('#paste').fill('CASH LFG\nHome ML (+120)');await page.locator('#parseBtn').click();assert.equal(await page.locator('#review .ex').count(),1);
// Result-only paste must not add the generic fallback row as another bet.
for(const checkbox of await page.locator('#review .inc').all())await checkbox.uncheck();
await page.locator('#addAll').click();assert.equal((await state()).bets.length,4);assert.equal((await state()).bets[0].status,'won');assert.equal((await state()).bets[3].status,'lost');
await page.getByRole('button',{name:'Tracker',exact:true}).click();await page.locator('[data-a="pending"][data-id="auto"]').click();await page.clock.fastForward(60000);assert.equal((await state()).bets[0].status,'pending');
await page.reload();assert.equal((await state()).bets[0].status,'pending');
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Tracker',exact:true}).click();await page.screenshot({path:path.resolve(__dirname,'screenshots/settlement-phone.png'),fullPage:true});
// Catch-up on startup after being closed past deadline.
await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('rebet.v1'));s.bets[0].autoLossDisabled=false;localStorage.setItem('rebet.v1',JSON.stringify(s))});await page.reload();assert.equal((await state()).bets[0].status,'lost');
assert.deepEqual(errors,[]);console.log('Settlement UI passed: timed expiry, persistence, late win, manual override, startup catch-up.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
