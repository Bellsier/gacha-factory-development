/* Run from any directory: node docs/design/graphics-g2-workshop/capture.cjs
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
(async () => {
  fs.mkdirSync(OUT,{recursive:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const log = { base:execFileSync('git',['merge-base','HEAD','origin/develop'],{cwd:ROOT,encoding:'utf8'}).trim(), browser:browser.version(), seed:20261101, timeMs:0, duskMs:240000, cases:[] };
  try {
    for (const device of ['pc','mobile']) for (const style of ['classic','v2']) {
      const context = await browser.newContext(device === 'pc' ? {viewport:{width:1280,height:800},deviceScaleFactor:1} : {viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
      await context.addInitScript(() => {
        let seed=20261101; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
        // The game sees disposable in-memory storage, even during boot/unload.
        const nativeLocal=window.localStorage, nativeSession=window.sessionStorage;
        nativeLocal.setItem('g2-review-sentinel','preserve');
        window.__g2StorageIntact=()=>nativeLocal.length===1 && nativeLocal.getItem('g2-review-sentinel')==='preserve' && nativeSession.length===0;
        for(const name of ['localStorage','sessionStorage']) {
          const map=new Map();
          Object.defineProperty(window,name,{value:{getItem:k=>map.get(String(k))??null,setItem:(k,v)=>map.set(String(k),String(v)),removeItem:k=>map.delete(String(k)),clear:()=>map.clear(),key:i=>[...map.keys()][i]??null,get length(){return map.size;}}});
        }
      });
      // External font CSS is intentionally omitted for offline/reproducible captures.
      await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
      const page=await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
      await page.goto(`${origin}/?style=${style}`,{waitUntil:'load'});
      await page.waitForFunction(()=>typeof TD!=='undefined' && TD.sheet && TD.groundMap);
      await page.addScriptTag({path:path.join(__dirname,'proposal.js')});
      await page.evaluate(()=>{
        clearInterval(tickTimer); clearInterval(ticketTimer); clearInterval(autoSaveTimer); TD.running=false;
        Object.assign(state.world.player,{x:state.world.base.x+0.45,y:state.world.base.y+0.65,facing:'down',pose:'idle'});
        TD.tracker={}; TD.quality=0; TD.forceDarkness=tdAmbientDarkness(0); tdClosePanels();
        // Fixed simulation snapshot across all four art choices.
      });
      // Warm ground chunk caches at the same camera; freeze the render clock.
      for(let i=0;i<8;i++){await page.evaluate(()=>tdRender(0)); await page.waitForTimeout(80);}
      await page.evaluate(()=>{tdUpdateMinimapChunks(10000);tdRender(0);});
      await page.waitForTimeout(250); // allow existing hint-opacity transition to settle
      const baseline=await page.evaluate(()=>JSON.stringify(state));
      for(const art of ['current','A','B','C']) {
        const result=await page.evaluate(art=>{
          const original=tdBaseSprite(), proposal=G2Workshop.sprite(art);
          const o=tdRaster(original), p=tdRaster(proposal);
          let door=true,step=true;
          for(let y=32;y<52;y++) for(let x=25;x<39;x++) if(JSON.stringify(o.px[y*64+x])!==JSON.stringify(p.px[y*64+x])) door=false;
          for(let y=52;y<54;y++) for(let x=23;x<41;x++) if(JSON.stringify(o.px[y*64+x])!==JSON.stringify(p.px[y*64+x])) step=false;
          const lights=[17,49].every(x=>JSON.stringify(o.px[35*64+x])===JSON.stringify(p.px[35*64+x]));
          const bounds=proposal.rects.every(([x,y,w,h])=>[x,y,w,h].every(Number.isInteger)&&x>=0&&y>=0&&x+w<=64&&y+h<=58);
          const signature=()=>JSON.stringify({box:WORLD_OBSTACLE_BOXES.base,foot:PLAYER_FOOT,target:tdInteractTarget(state.world.base.x,state.world.base.y+0.4)});
          const before=signature(); TD.sheet.base=tdSpriteImage(tdStyleFinish(proposal,'building')); tdRender(0);
          const raw=tdSpriteImage(proposal).toDataURL();
          const enlarged=document.createElement('canvas'); enlarged.width=384;enlarged.height=348;
          const g=enlarged.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(tdSpriteImage(proposal),0,0,384,348);
          const bp=topdownToScreen(state.world.base.x,state.world.base.y,TD.cam,TD.view.w,TD.view.h,TD.view.zoom);
          const cr=TD.canvas ? TD.canvas.getBoundingClientRect() : TD.ctx.canvas.getBoundingClientRect();
          const z=TD.view.zoom, d=devicePixelRatio;
          const spriteBox=[(cr.left+Math.round(bp.x-32*z))*d,(cr.top+Math.round(bp.y-54*z))*d,64*z*d,58*z*d];
          return {spriteBox,size:[proposal.w,proposal.h],door,step,lights,bounds,contractUnchanged:before===signature(),storageIntact:__g2StorageIntact(),state:JSON.stringify(state),raw,enlarged:enlarged.toDataURL(),zoom:TD.view.zoom,player:{...state.world.player},camera:{...TD.cam}};
        },art);
        for(const k of ['door','step','lights','bounds','contractUnchanged','storageIntact']) assert.equal(result[k],true,`${device}/${style}/${art} ${k}`);
        assert.deepEqual(result.size,[64,58]); assert.equal(result.state,baseline,'render changed game state');
        if(device==='pc'&&style==='classic') for(const [suffix,data] of [['64x58',result.raw],['6x',result.enlarged]]) fs.writeFileSync(path.join(OUT,`sprite-${art}-${suffix}.png`),Buffer.from(data.split(',')[1],'base64'));
        delete result.raw;delete result.enlarged;delete result.state;
        await page.screenshot({path:path.join(OUT,`${device}-${style}-${art}.png`)});
        if(device==='pc') {
          await page.evaluate(()=>{TD.forceDarkness=tdAmbientDarkness(240000);tdRender(240000);});
          await page.screenshot({path:path.join(OUT,`dusk-${style}-${art}.png`)});
          await page.evaluate(()=>{TD.forceDarkness=tdAmbientDarkness(0);tdRender(0);});
        }
        log.cases.push({device,style,art,...result});
      }
      // Shared ground line, current G1 character at native 16x22 beside each workshop.
      const ratio=await page.evaluate(()=>{
        const c=document.createElement('canvas');c.width=960;c.height=260;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
        g.fillStyle='#e7dcc3';g.fillRect(0,0,c.width,c.height);
        ['current','A','B','C'].forEach((a,i)=>{
          g.fillStyle='#493c32';g.font='16px sans-serif';g.fillText(a==='current'?'Current':a,i*240+16,22);
          g.fillStyle='#b7ab90';g.fillRect(i*240+8,220,224,1);
          g.drawImage(tdSpriteImage(tdStyleFinish(G2Workshop.sprite(a),'building')),i*240+8,58,192,174);
          const player=tdStyleV2()?tdPlayerSpriteV2('down',0):tdPlayerSprite('down',0);
          g.drawImage(tdSpriteImage(player),i*240+190,157,48,66);
        });return c.toDataURL();
      });
      if(device==='pc') fs.writeFileSync(path.join(OUT,`ratio-${style}.png`),Buffer.from(ratio.split(',')[1],'base64'));
      // Real keyboard movement and a wall approach, for each proposal on desktop.
      if(device==='pc') for(const art of ['A','B','C']) {
        await page.evaluate(a=>{TD.sheet.base=tdSpriteImage(tdStyleFinish(G2Workshop.sprite(a),'building'));Object.assign(state.world.player,{x:state.world.base.x,y:state.world.base.y+1.2});tickClockLast=null;tickTimer=setInterval(tickClockInterval,TICK_MS);TD.running=true;requestAnimationFrame(tdFrame);},art);
        const start=await page.evaluate(()=>state.world.player.y);
        await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');
        const movement=await page.evaluate(()=>({y:state.world.player.y,stand:playerCanStand(state.world.player.x,state.world.player.y),edge:state.world.base.y+WORLD_OBSTACLE_BOXES.base.maxY,storageIntact:__g2StorageIntact()}));
        assert(movement.y<start,'keyboard did not move');assert(movement.stand && movement.y>=movement.edge,'wall penetration');assert(movement.storageIntact);
        log.cases.find(x=>x.device===device&&x.style===style&&x.art===art).movement={start,...movement};
        await page.evaluate(()=>{TD.running=false;clearInterval(tickTimer);});await page.waitForTimeout(50);
      }
      assert.deepEqual(errors,[],`${device}/${style} console errors`);
      log.cases.filter(x=>x.device===device&&x.style===style).forEach(x=>x.errors=errors);
      await context.close(); console.log(`${device}/${style}: four renders + contracts passed`);
    }
    fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify(log,null,2)+'\n');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
