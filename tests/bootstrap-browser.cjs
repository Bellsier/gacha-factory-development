'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM,args:['--no-sandbox']}:{})});
try{const origin='http://127.0.0.1:'+server.address().port;
const ctx=await browser.newContext();await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,body:''}));
const page=await ctx.newPage();let release;const hold=new Promise(r=>release=r);
await page.route('**/css/style.css',async r=>{await hold;await r.continue();});
await page.route('**/js/data.js',async r=>{await hold;await r.continue();});await page.goto(origin,{waitUntil:'commit'});
await page.locator('#gameBootstrap').waitFor({state:'visible',timeout:3000});
assert.equal(await page.locator('.wrap').evaluate(e=>getComputedStyle(e).visibility),'hidden');
release();await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-game-boot'));
assert.equal(await page.locator('#gameBootstrap').isVisible(),false);assert.equal(await page.evaluate(()=>!!S2Runtime.session),true);
console.log('PASS bootstrap: first HTML hides unfinished UI during slow scripts and reveals complete game');
const villageId=await page.evaluate(()=>S2Runtime.session.id);
// Revisit while menu data is still pending: no default world behind the picker.
let listDelayed=true;
await page.route('**/js/save-engine.js',async r=>{let body=await fs.readFile(path.join(root,'js/save-engine.js'),'utf8');if(listDelayed)body+='\nconst realList=SaveEngine.prototype.list;SaveEngine.prototype.list=async function(){await new Promise(r=>window.releaseList=r);SaveEngine.prototype.list=realList;return realList.call(this);};';await r.fulfill({status:200,contentType:'text/javascript',body});});
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof window.releaseList==='function');
assert.equal(await page.locator('#gameBootstrap').isVisible(),true);assert.equal(await page.locator('#s2Menu').evaluate(e=>getComputedStyle(e).visibility),'hidden');
await fs.mkdir(path.join(root,'work/bootstrap'),{recursive:true});await page.screenshot({path:path.join(root,'work/bootstrap/pc-loading.png')});
await page.evaluate(()=>window.releaseList());await page.waitForFunction(()=>GameBootstrap.state==='ready');
assert.equal(await page.locator('#s2Menu').isVisible(),true);assert.equal(await page.locator('#tdCanvas').evaluate(e=>getComputedStyle(e).visibility),'hidden');
assert.equal(await page.evaluate(()=>S2Runtime.engine.list().then(l=>l.recent)),villageId);
console.log('PASS bootstrap: reload/revisit waits for village list and hides default world behind ready picker');
listDelayed=false;
// Transient list read failure: retry reloads, without erasing saves or bypassing ownership.
await page.unroute('**/js/save-engine.js');let failList=true;
await page.route('**/js/save-engine.js',async r=>{let body=await fs.readFile(path.join(root,'js/save-engine.js'),'utf8');if(failList){failList=false;body+='\nSaveEngine.prototype.list=async()=>{throw new DOMException("isolated read fault","UnknownError");};';}await r.fulfill({status:200,contentType:'text/javascript',body});});
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>GameBootstrap.state==='error');
assert.equal(await page.locator('#gameBootRetry').isVisible(),true);assert.equal(await page.evaluate(()=>S2Runtime.canPlay()),false);
await page.locator('#gameBootRetry').click();await page.waitForFunction(()=>GameBootstrap.state==='ready');
await page.locator('[data-s2-recent]').click();await page.waitForFunction(id=>S2Runtime.session?.id===id,villageId);
assert.equal(await page.locator('#tdCanvas').evaluate(e=>getComputedStyle(e).visibility),'visible');
console.log('PASS bootstrap: failed list initialization shows safe retry and reload preserves the recent village');
await ctx.close();
// Deliberately slow storage with an opaque mobile first screen.
const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});await mobile.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,body:''}));
await mobile.route('**/js/save-engine.js',async r=>{const body=await fs.readFile(path.join(root,'js/save-engine.js'),'utf8');await r.fulfill({status:200,contentType:'text/javascript',body:body+'\nconst realOpen=SaveEngine.open;SaveEngine.open=async function(...args){await new Promise(r=>window.releaseStorage=r);return realOpen.apply(this,args);};'});});
const phone=await mobile.newPage();await phone.goto(origin,{waitUntil:'domcontentloaded'});await phone.waitForFunction(()=>typeof window.releaseStorage==='function');
assert.equal(await phone.locator('#gameBootstrap').isVisible(),true);assert.equal(await phone.locator('.wrap').evaluate(e=>getComputedStyle(e).visibility),'hidden');
await phone.screenshot({path:path.join(root,'work/bootstrap/mobile-loading.png')});await phone.evaluate(()=>window.releaseStorage());await phone.waitForFunction(()=>GameBootstrap.state==='ready');
assert.equal(await phone.evaluate(()=>S2Runtime.canPlay()),true);await mobile.close();
console.log('PASS bootstrap: slow mobile IndexedDB startup reveals only the complete scene');
// Storage unavailable once; reload retry must preserve the legacy source bytes.
const faulty=await browser.newContext();await faulty.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,body:''}));
const fixture={saveVersion:1,savedAt:123,run:{gold:321},permanent:{tickets:7}};
await faulty.addInitScript(payload=>{if(!sessionStorage.getItem('bootFault')){sessionStorage.setItem('bootFault','1');localStorage.setItem('gachaFactorySave',JSON.stringify(payload));Object.defineProperty(window,'indexedDB',{value:undefined});}},fixture);
const bad=await faulty.newPage();await bad.goto(origin);await bad.waitForFunction(()=>GameBootstrap.state==='error');
const raw=await bad.evaluate(()=>localStorage.getItem('gachaFactorySave'));assert.equal(await bad.evaluate(()=>saveGame()),false);
await bad.screenshot({path:path.join(root,'work/bootstrap/storage-error.png')});
await bad.evaluate(()=>{window.backgroundKey=false;document.addEventListener('keydown',()=>window.backgroundKey=true);});
await bad.locator('#gameBootRetry').focus();await bad.keyboard.press('t');assert.equal(await bad.evaluate(()=>window.backgroundKey),false,'retry focus must not leak shortcuts to hidden game');
await bad.locator('#gameBootRetry').press('Enter');await bad.waitForFunction(()=>GameBootstrap.state==='ready');
assert.equal(await bad.evaluate(()=>localStorage.getItem('gachaFactorySave')),raw);assert.equal(await bad.evaluate(()=>state.gold),321);await faulty.close();
console.log('PASS bootstrap: unavailable storage fails safely, retry retains original bytes and restored progress');
// No endless spinner and no late-success reveal after the finite watchdog.
const stalled=await browser.newContext();await stalled.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,body:''}));
await stalled.route('**/js/save-engine.js',async r=>{const body=await fs.readFile(path.join(root,'js/save-engine.js'),'utf8');await r.fulfill({status:200,contentType:'text/javascript',body:body+'\nconst realOpen=SaveEngine.open;SaveEngine.open=async function(...args){await new Promise(r=>window.releaseStorage=r);return realOpen.apply(this,args);};'});});
const slow=await stalled.newPage();await slow.clock.install();await slow.goto(origin,{waitUntil:'domcontentloaded'});await slow.waitForFunction(()=>typeof window.releaseStorage==='function');
await slow.clock.fastForward(21000);await slow.waitForFunction(()=>GameBootstrap.state==='error');assert.equal(await slow.locator('#gameBootRetry').isVisible(),true);
await slow.evaluate(()=>window.releaseStorage());await slow.waitForFunction(()=>!!S2Runtime.session);
assert.equal(await slow.evaluate(()=>GameBootstrap.state),'error');assert.equal(await slow.evaluate(()=>S2Runtime.canPlay()),false);await stalled.close();
console.log('PASS bootstrap: finite timeout offers retry and late completion cannot reveal a failed startup');
// A head-phase error must become actionable even if a later script never loads.
const early=await browser.newContext();await early.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,body:''}));
await early.route(origin+'/',async r=>{const html=await fs.readFile(path.join(root,'index.html'),'utf8');await r.fulfill({status:200,contentType:'text/html',body:html.replace('</head>','<script>GameBootstrap.fail()</script></head>')});});
let releaseEarly;const earlyHold=new Promise(r=>releaseEarly=r);await early.route('**/js/data.js',async r=>{await earlyHold;await r.continue();});
const ep=await early.newPage();await ep.goto(origin,{waitUntil:'commit'});await ep.locator('#gameBootstrap').waitFor({state:'visible'});
await ep.locator('#gameBootRetry').waitFor({state:'visible',timeout:3000});
releaseEarly();await ep.waitForLoadState('load');await early.close();console.log('PASS bootstrap: head-phase failure offers retry before DOMContentLoaded despite a stalled script');
// Main stylesheet failure is explicit, rather than an unstyled game flash.
const cssError=await browser.newContext();await cssError.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,body:''}));await cssError.route('**/css/style.css',r=>r.abort());
const noStyle=await cssError.newPage();await noStyle.goto(origin);await noStyle.waitForFunction(()=>GameBootstrap.state==='error');assert.equal(await noStyle.locator('#gameBootRetry').isVisible(),true);assert.equal(await noStyle.locator('.wrap').evaluate(e=>getComputedStyle(e).visibility),'hidden');await cssError.close();
console.log('PASS bootstrap: stylesheet failure keeps critical error UI usable');
const scriptError=await browser.newContext();await scriptError.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,body:''}));let missing=true;
await scriptError.route('**/js/save-runtime.js',r=>{if(missing){missing=false;return r.fulfill({status:404,body:''});}return r.continue();});
await scriptError.addInitScript(payload=>{if(!localStorage.getItem('gachaFactorySave'))localStorage.setItem('gachaFactorySave',JSON.stringify(payload));},fixture);
const noScript=await scriptError.newPage();await noScript.goto(origin);await noScript.waitForFunction(()=>GameBootstrap.state==='error');
assert.equal(await noScript.locator('#gameBootRetry').isVisible(),true);assert.equal(await noScript.evaluate(()=>saveGame()),false);
await noScript.locator('#gameBootRetry').click();await noScript.waitForFunction(()=>GameBootstrap.state==='ready');assert.equal(await noScript.evaluate(()=>state.gold),321);await scriptError.close();
console.log('PASS bootstrap: missing startup module offers retry without legacy-write fallback');


}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);console.log('::error::'+String(e.stack||e).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));server.close();process.exitCode=1;});
