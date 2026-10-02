const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-01T12:00:00-04:00')});
await page.goto('file://'+path.resolve(__dirname,'../dist/rebet.html'));
const signal=fs.readFileSync(path.join(__dirname,'fixtures/total-stale-headline-ncaa.txt'),'utf8');
const paste=async text=>{await page.getByRole('button',{name:'Add signals',exact:true}).click();await page.locator('#paste').fill(text);await page.locator('#parseBtn').click()};
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('rebet.v1')));
await paste(signal+'\n\n'+signal);assert.equal(await page.locator('#review .inc').count(),1);assert.match(await page.locator('#review').innerText(),/1 duplicate signal skipped automatically/);await page.locator('#addAll').click();assert.equal((await state()).bets.length,1);
const before=(await state()).bets[0];
await paste(signal);assert.equal(await page.locator('#review .inc').count(),0);assert.match(await page.locator('#review').innerText(),/No new signals/);assert.deepEqual((await state()).bets[0],before);
// No Bet Key: same game with a different total must stay distinct.
const withoutKey=signal.split('\n').filter(l=>!l.includes('Bet Key')&&!l.includes('|total_game|')).join('\n');
const different=withoutKey.replace(/149\.5/g,'150.5');
await paste(withoutKey+'\n\n'+different);assert.equal(await page.locator('#review .inc').count(),1);await page.locator('#addAll').click();assert.equal((await state()).bets.length,2);
await paste(signal+'\n\n'+different);assert.equal(await page.locator('#review .inc').count(),0);assert.match(await page.locator('#review').innerText(),/2 duplicate signals skipped/);
await page.locator('#review').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,'screenshots/dedupe-phone.png'),fullPage:true});
assert.deepEqual(errors,[]);console.log('Dedupe UI passed: within-paste, saved, missing-key fallback, different line, preserved saved fields.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
