/* Run from any directory: node docs/design/graphics-g2-workshop/final/capture.cjs
 * Requires Playwright + Chromium. Only writes this folder's screenshots/.
 * Serves the checked-out game, never a remote deployment. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..'), OUT = path.join(__dirname, 'screenshots');
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png' };
const server = http.createServer((req,res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
  const file = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!file.startsWith(ROOT + '/') && file !== ROOT) { res.writeHead(403).end(); return; }
  const target = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file,'index.html') : file;
  fs.readFile(target,(e,data) => { res.writeHead(e ? 404 : 200,{'Content-Type':TYPES[path.extname(target)] || 'application/octet-stream'}); res.end(e ? 'Not found' : data); });
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const results=[];
 try{
  for(const style of ['classic','v2']){
   const context=await browser.newContext({viewport:{width:1280,height:800}});
   await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
   const page=await context.newPage();
   await page.goto(`http://127.0.0.1:${server.address().port}/?style=${style}`);
   await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.sheet);
   await page.addScriptTag({path:path.join(__dirname,'proposal.js')});
   const result=await page.evaluate(()=>{
    clearInterval(tickTimer);clearInterval(ticketTimer);clearInterval(autoSaveTimer);TD.running=false;
    state.village.district={x:state.world.base.x+2,y:state.world.base.y+2,layout:0};
    state.gold=137;state.resources.iron=42;permanent.tickets=7;
    const home=villageHouseDoor(),room=JSON.stringify(tdHomeRoomSprite()),checks=[];
    for(const art of G3House.variants){
     TD.sheet.house=tdSpriteImage(G3House.sprite(art,tdStyleV2()));
     Object.assign(state.world.player,{x:home.x,y:home.y+.2});
     const target=tdInteractTarget(home.x,home.y+.2);
     const enter=villageHomeEnter(),inside=villageHomeInside(),exit=villageHomeExit();
     checks.push({art,target:target.type,enter,inside,exit,roomUnchanged:room===JSON.stringify(tdHomeRoomSprite()),exitDoor:state.world.player.x===home.x&&state.world.player.y===home.y+.25});
    }
    const save=saveGame(),raw=localStorage.getItem(SAVE_KEY),version=JSON.parse(raw).saveVersion;
    return {checks,save,version,box:VILLAGE.DISTRICT.HOUSE_BOX,defaultStyle:TD.style};
   });
   for(const c of result.checks){assert.equal(c.target,'house');for(const k of ['enter','inside','exit','roomUnchanged','exitDoor'])assert.equal(c[k],true);}
   assert.equal(result.save,true);assert.equal(result.version,1);
   await page.reload();await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.sheet);
   const loaded=await page.evaluate(()=>({gold:state.gold,iron:state.resources.iron,tickets:permanent.tickets,version:CURRENT_SAVE_VERSION}));
   assert.deepEqual(loaded,{gold:137,iron:42,tickets:7,version:1});
   results.push({style,...result,loaded});await context.close();
  }
  fs.writeFileSync(path.join(OUT,'game-verification.json'),JSON.stringify(results,null,2)+'\n');
  console.log('Both styles: four exterior variants retain house target, enter/exit, room, door and save roundtrip');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
