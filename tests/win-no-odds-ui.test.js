const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'America/New_York'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.clock.install({time:new Date('2026-10-03T09:33:00-04:00')});
const base={title:'Temple Owls @ Delaware Blue Hens',sport:'American Football',market:'spread',hasTime:true,start:Date.parse('2026-10-02T19:00:00-04:00'),units:.29,status:'pending'};
await page.addInitScript(data=>{if(!localStorage.getItem('rebet.v1'))localStorage.setItem('rebet.v1',JSON.stringify(data))},{bets:[{...base,id:'liberty',pick:'Temple Owls 8 Spread',line:8,odds:-147},{...base,id:'delaware',pick:'Delaware Blue Hens 7.5 Spread',line:7.5,odds:-116,status:'placed'}],settings:{lead:3,defaultOdds:-110}});
await page.goto('file://'+path.resolve(__dirname,'../dist/rebet.html'));
const text='Another CFB cash 🔥 @Premium Member\n\n✅🥉Temple Owls +8';
await page.locator('#paste').fill(text);await page.locator('#parseBtn').click();assert.equal(await page.locator('#review .inc').count(),0);assert.match(await page.locator('#review').innerText(),/Updated Tracker: 1 bet marked Won/);assert.match(await page.locator('#review').innerText(),/Temple Owls 8/);
await page.locator('#review').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,'screenshots/win-no-odds-phone.png'),fullPage:true});
await page.getByRole('button',{name:'Tracker',exact:true}).click();assert.match(await page.locator('#t-trk').innerText(),/won/);await page.reload();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('rebet.v1')));assert.equal(saved.bets.length,2);assert.equal(saved.bets[0].status,'won');assert.equal(saved.bets[1].status,'placed');
await page.locator('#paste').fill(text);await page.locator('#parseBtn').click();assert.equal(await page.locator('#review .ex').count(),0);assert.equal(await page.locator('#review .inc').count(),0);assert.deepEqual(errors,[]);console.log('Win-post browser regression passed: screenshot recognized, no new bet, Temple won, Delaware untouched, repeat idempotent.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
