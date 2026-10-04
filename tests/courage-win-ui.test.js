// Reproduce saved assumed-loss correction through the same mixed-paste/dedupe path as the user.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),P=require('../parser');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'America/New_York'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const now=Date.parse('2026-10-04T14:20:00-04:00'),text=fs.readFileSync(path.join(__dirname,'fixtures/win-courage-alias.txt'),'utf8'),signal=P.parse(text,{now,tz:'America/New_York'}).signals[0];
const saved={...signal,id:'courage',status:'lost',autoLossAt:now-3600000};
const total={...signal,id:'total',betKey:'separate-total',pick:'Over 3 Total',market:'total',side:'over',line:3,status:'lost',autoLossAt:now-3600000};
await page.clock.install({time:new Date(now)});await page.addInitScript(data=>{if(!localStorage.getItem('rebet.v1'))localStorage.setItem('rebet.v1',JSON.stringify(data))},{bets:[saved,total],settings:{lead:3,defaultOdds:-110}});
await page.goto('file://'+path.resolve(__dirname,'../dist/rebet.html'));
await page.locator('#paste').fill(text);await page.locator('#parseBtn').click();assert.match(await page.locator('#review').innerText(),/1 duplicate signal skipped/);assert.equal(await page.locator('#review .inc').count(),0);assert.equal(await page.locator('#review .ex').count(),1);assert.match(await page.locator('#review').innerText(),/NC Courage ML/);
await page.locator('#addAll').click();await page.reload();const bets=await page.evaluate(()=>JSON.parse(localStorage.getItem('rebet.v1')).bets);assert.equal(bets.length,2);assert.equal(bets[0].status,'won');assert.equal(bets[0].autoLossAt,undefined);assert.equal(bets[0].units,.21);assert.equal(bets[0].odds,176);assert.equal(bets[1].status,'lost');
await page.getByRole('button',{name:'Tracker',exact:true}).click();assert.match(await page.locator('#t-trk').innerText(),/won \+0.37u/);await page.screenshot({path:path.join(__dirname,'screenshots/courage-corrected-phone.png'),fullPage:true});
assert.deepEqual(errors,[]);console.log('Courage browser regression passed: duplicate signal skipped, existing assumed loss corrected, total unchanged, odds/stake retained, +0.37u displayed.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
