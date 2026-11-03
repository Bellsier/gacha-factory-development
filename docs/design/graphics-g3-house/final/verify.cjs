/* Run from any directory: node docs/design/graphics-g3-house/final/verify.cjs
 * Requires Playwright + Chromium. Only writes this folder's screenshots/.
 * Serves the checked-out game, never a remote deployment. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../../..'), OUT = path.join(__dirname, 'screenshots');
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png' };
const server = http.createServer((req,res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
  const file = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!file.startsWith(ROOT + '/') && file !== ROOT) { res.writeHead(403).end(); return; }
  const target = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file,'index.html') : file;
  fs.readFile(target,(e,data) => { res.writeHead(e ? 404 : 200,{'Content-Type':TYPES[path.extname(target)] || 'application/octet-stream'}); res.end(e ? 'Not found' : data); });
});
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const results=[];
 try {
 for(const device of ['pc','mobile'])for(const style of ['classic','v2']){
  const context=await browser.newContext(device==='mobile'?{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}:{viewport:{width:1280,height:800}});
  await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?style=${style}`);await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.sheet);
  await page.evaluate(()=>{clearInterval(tickTimer);clearInterval(ticketTimer);clearInterval(autoSaveTimer);TD.running=false;
   state.village.district={x:state.world.base.x+2,y:state.world.base.y+2,layout:0};
   const home=villageDistrict().house;Object.assign(state.world.player,{x:home.x+.45,y:home.y+.65,facing:'down',pose:'idle'});
   TD.tracker={};TD.quality=0;tdClosePanels();for(let i=0;i<256;i++)tdRender(0);tdUpdateMinimapChunks(10000);
  });
  const contract=await page.evaluate(()=>{
   const art=tdStyleV2()?tdHouseSpriteV2():tdHouseSprite(),before=JSON.stringify(state);TD.sheet=tdBuildSpriteSheet();tdRender(0);
   return {size:[art.w,art.h],stateUnchanged:before===JSON.stringify(state),resolution:tdResFactor(),sheet:[TD.sheet.house.width,TD.sheet.house.height]};
  });assert.deepEqual(contract.size,[84,73]);assert.equal(contract.stateUnchanged,true);
  for(const [light,dark,time] of [['day',.10,0],['dusk',.34,240000]]){await page.evaluate(([d,t])=>{TD.forceDarkness=d;tdRender(t);},[dark,time]);await page.screenshot({path:path.join(OUT,`${device}-${style}-${light}.png`)});}
  await page.evaluate(()=>{const d=villageHouseDoor();Object.assign(state.world.player,{x:d.x,y:d.y+.2});tdRender(0);TD.target=tdInteractTarget(state.world.player.x,state.world.player.y);tdUpdateActionButton();});
  if(device==='mobile')await page.locator('#tdAction').tap();else await page.keyboard.press('e');
  assert.equal(await page.evaluate(()=>villageHomeInside()),true,'real input enters home');
  const checks=await page.evaluate(()=>{const room=JSON.stringify(tdHomeRoomSprite()),exit=villageHomeExit(),d=villageHouseDoor();state.gold=137;state.resources.iron=42;permanent.tickets=7;return {exit,door:state.world.player.x===d.x&&state.world.player.y===d.y+.25,save:saveGame(),version:JSON.parse(localStorage.getItem(SAVE_KEY)).saveVersion,room:room===JSON.stringify(tdHomeRoomSprite())};});
  for(const k of ['exit','door','save','room'])assert.equal(checks[k],true,k);assert.equal(checks.version,1);
  await page.reload();await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.sheet);
  const loaded=await page.evaluate(()=>({gold:state.gold,iron:state.resources.iron,tickets:permanent.tickets,version:CURRENT_SAVE_VERSION}));assert.deepEqual(loaded,{gold:137,iron:42,tickets:7,version:1});assert.deepEqual(errors,[]);
  results.push({device,style,contract,checks,loaded,errors});await context.close();console.log(device,style,'production render, real enter input, exit and save reload passed');
 }
 fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify({browser:browser.version(),cases:results},null,2)+'\n');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
