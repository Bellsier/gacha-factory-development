/* Real-storage/browser acceptance: node docs/design/graphics-g2-workshop/final/check-game.cjs */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const {execFileSync}=require('node:child_process');
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
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
  const results=[];
  try {
    for(const device of ['pc','mobile'])for(const style of ['classic','v2']){
      const ctx=await browser.newContext(device==='pc'?{viewport:{width:1280,height:800}}:{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
      await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
      await ctx.addInitScript(()=>{let s=20261101;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};});
      const page=await ctx.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      // Make a real save using the old workshop, then reload with the shipped final code.
      const current=fs.readFileSync(path.join(ROOT,'js/topdown/sprites.js'),'utf8');
      const before=fs.readFileSync(path.join(__dirname,'baseline-sprite.js'),'utf8').match(/function tdBaseSpriteBeforeG2\(\)\{[\s\S]*?\n\}/)[0].replace('tdBaseSpriteBeforeG2','tdBaseSprite');
      await page.route('**/js/topdown/sprites.js',r=>r.fulfill({contentType:'application/javascript',body:current.replace(/function tdBaseSprite\(\)\{[\s\S]*?\n\}/,before)}));
      await page.goto(`${origin}/?style=${style}`);await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.sheet);
      const saved=await page.evaluate(()=>{
        clearInterval(tickTimer);clearInterval(autoSaveTimer);clearInterval(ticketTimer);TD.running=false;
        state.gold=137;state.resources.iron=42;permanent.tickets=7;
        if(!saveGame())throw Error('old save failed');const raw=localStorage.getItem(SAVE_KEY);return {raw,key:SAVE_KEY,version:JSON.parse(raw).saveVersion};
      });
      await page.unroute('**/js/topdown/sprites.js');await page.reload();await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.sheet);
      const loaded=await page.evaluate(()=>{
        clearInterval(autoSaveTimer);clearInterval(ticketTimer);
        return {gold:state.gold,iron:state.resources.iron,tickets:permanent.tickets,version:CURRENT_SAVE_VERSION,save:saveGame(),load:loadGame().ok};
      });
      assert.deepEqual(loaded,{gold:137,iron:42,tickets:7,version:saved.version,save:true,load:true});
      await page.reload();await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.sheet);
      assert.equal(await page.evaluate(()=>state.gold),137);
      await page.evaluate(()=>{clearInterval(autoSaveTimer);clearInterval(ticketTimer);});
      const movement=[];
      // Four real keyboard directions in clear ground near the workshop.
      for(const [key,axis,sign] of [['d','x',1],['a','x',-1],['s','y',1],['w','y',-1]]){
        await page.evaluate(()=>{tdClosePanels();Object.assign(state.world.player,{x:state.world.base.x+1.6,y:state.world.base.y+1.8});TD.tracker={};});
        const a=await page.evaluate(axis=>state.world.player[axis],axis);
        await page.keyboard.down(key);await page.waitForTimeout(250);await page.keyboard.up(key);
        const b=await page.evaluate(axis=>state.world.player[axis],axis);assert((b-a)*sign>0,`${device}/${style}/${key} move`);movement.push({key,delta:b-a});
      }
      await page.evaluate(()=>{Object.assign(state.world.player,{x:state.world.base.x,y:state.world.base.y+1.2});TD.tracker={};});
      await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');
      const wall=await page.evaluate(()=>({stand:playerCanStand(state.world.player.x,state.world.player.y),y:state.world.player.y,edge:state.world.base.y+WORLD_OBSTACLE_BOXES.base.maxY}));
      assert(wall.stand&&wall.y>=wall.edge);
      // The existing workshop "enter" action opens the development panel, not a new interior.
      await page.evaluate(()=>{Object.assign(state.world.player,{x:state.world.base.x,y:state.world.base.y+0.4});TD.tracker={};tdRender(0);tdUpdateActionButton();});
      assert.equal(await page.evaluate(()=>tdInteractTarget(state.world.player.x,state.world.player.y).type),'base');
      if(device==='mobile')await page.locator('#tdAction').click();else await page.keyboard.press('e');
      assert(await page.evaluate(()=>tdPanelOpen()&&document.querySelector('.tab-btn[data-tab="dev"]').classList.contains('active')));
      if(device==='mobile')await page.locator('#tdClose').click();else await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>tdPanelOpen()),false);
      // Real pointer drag on the mobile joystick, not a direct movement-function call.
      let joystick=null;
      if(device==='mobile'){
        await page.evaluate(()=>Object.assign(state.world.player,{x:state.world.base.x+1.6,y:state.world.base.y+1.8}));
        const box=await page.locator('#tdStick').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
        const start=await page.evaluate(()=>state.world.player.x);
        await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y);await page.waitForTimeout(350);await page.mouse.up();
        joystick=await page.evaluate(()=>state.world.player.x)-start;assert(joystick>0,'mobile joystick pointer movement');
      }
      assert.deepEqual(errors,[]);
      results.push({device,style,oldSaveLoaded:loaded,newSaveReloaded:true,movement,wall,interactionOpenedAndClosed:true,joystick,errors});
      await ctx.close();console.log(`${device}/${style}: save roundtrip, movement, collision, interaction passed`);
    }
    fs.writeFileSync(path.join(OUT,'game-verification.json'),JSON.stringify(results,null,2)+'\n');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
