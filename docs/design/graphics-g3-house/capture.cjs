/* Run from any directory: node docs/design/graphics-g3-house/capture.cjs
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
        nativeLocal.setItem('g3-review-sentinel','preserve');
        window.__g3StorageIntact=()=>nativeLocal.length===1 && nativeLocal.getItem('g3-review-sentinel')==='preserve' && nativeSession.length===0;
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
      await page.evaluate(()=>{window.g3Art=a=>G3House.sprite(a,tdStyleV2());});
      await page.evaluate(()=>{
        clearInterval(tickTimer); clearInterval(ticketTimer); clearInterval(autoSaveTimer); TD.running=false;
        state.village.district={x:state.world.base.x+2,y:state.world.base.y+2,layout:0};
        const home=villageDistrict().house;
        Object.assign(state.world.player,{x:home.x+0.45,y:home.y+0.65,facing:'down',pose:'idle'});
        TD.tracker={}; TD.quality=0; TD.forceDarkness=.10; tdClosePanels();
        // Fixed simulation snapshot across all three art choices.
      });
      // Warm ground chunk caches at the same camera; freeze the render clock.
      for(let i=0;i<8;i++){await page.evaluate(()=>tdRender(0)); await page.waitForTimeout(80);}
      // Finish sliced neighbour chunks before freezing the minimap for comparisons.
      await page.evaluate(()=>{for(let i=0;i<256;i++)tdRender(0);tdUpdateMinimapChunks(10000);tdRender(0);});
      await page.waitForTimeout(250); // allow existing hint-opacity transition to settle
      const baseline=await page.evaluate(()=>JSON.stringify(state));
      for(const art of ['existing','A','B','C']) {
        const result=await page.evaluate(art=>{
          const original=g3Art('existing'), proposal=g3Art(art);
          const o=tdRaster(original), p=tdRaster(proposal);
          const same=(x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(JSON.stringify(o.px[yy*84+xx])!==JSON.stringify(p.px[yy*84+xx]))return false;return true;};
          const door=same(34,43,16,25),step=same(31,68,22,2),lights=same(15,45,11,11)&&same(59,45,11,11)&&same(54,46,6,7);
          const bounds=proposal.rects.every(([x,y,w,h])=>[x,y,w,h].every(Number.isInteger)&&x>=0&&y>=0&&x+w<=84&&y+h<=73);
          const home=villageDistrict().house;
          const signature=()=>JSON.stringify({box:VILLAGE.DISTRICT.HOUSE_BOX,foot:PLAYER_FOOT,door:villageHouseDoor(),targets:Array.from({length:25},(_,i)=>tdInteractTarget(home.x+(i%5-2)*.2,home.y+(Math.floor(i/5)-2)*.2))});
          const before=signature(); TD.sheet.house=tdSpriteImage(proposal); tdRender(0);
          const raw=tdSpriteImage(proposal).toDataURL();
          const enlarged=document.createElement('canvas'); enlarged.width=504;enlarged.height=438;
          const g=enlarged.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(tdSpriteImage(proposal),0,0,504,438);
          const bp=topdownToScreen(home.x,home.y,TD.cam,TD.view.w,TD.view.h,TD.view.zoom);
          const cr=TD.canvas ? TD.canvas.getBoundingClientRect() : TD.ctx.canvas.getBoundingClientRect();
          const z=TD.view.zoom, d=devicePixelRatio;
          const spriteBox=[(cr.left+Math.round(bp.x-42*z))*d,(cr.top+Math.round(bp.y-70*z))*d,84*z*d,73*z*d];
          return {spriteBox,size:[proposal.w,proposal.h],door,step,lights,bounds,contractUnchanged:before===signature(),storageIntact:__g3StorageIntact(),state:JSON.stringify(state),raw,enlarged:enlarged.toDataURL(),zoom:TD.view.zoom,player:{...state.world.player},camera:{...TD.cam}};
        },art);
        for(const k of ['door','step','lights','bounds','contractUnchanged','storageIntact']) assert.equal(result[k],true,`${device}/${style}/${art} ${k}`);
        assert.deepEqual(result.size,[84,73]); assert.equal(result.state,baseline,'render changed game state');
        if(device==='pc') for(const [suffix,data] of [['84x73',result.raw],['6x',result.enlarged]]) fs.writeFileSync(path.join(OUT,`sprite-${style}-${art}-${suffix}.png`),Buffer.from(data.split(',')[1],'base64'));
        delete result.raw;delete result.enlarged;delete result.state;
        await page.screenshot({path:path.join(OUT,`${device}-${style}-${art}.png`)});
        {
          await page.evaluate(()=>{TD.forceDarkness=.34;tdRender(240000);});
          await page.screenshot({path:path.join(OUT,`dusk-${device}-${style}-${art}.png`)});
          await page.evaluate(()=>{TD.forceDarkness=.10;tdRender(0);});
        }
        log.cases.push({device,style,art,...result});
      }
      const ratio=await page.evaluate(()=>{
        const c=document.createElement('canvas');c.width=1440;c.height=330;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
        g.fillStyle='#e7dcc3';g.fillRect(0,0,c.width,c.height);
        ['existing','A','B','C'].forEach((a,i)=>{
          const x=i*360;g.fillStyle='#493c32';g.font='18px sans-serif';g.fillText(a,x+16,25);
          g.fillStyle='#b7ab90';g.fillRect(x+8,280,344,1);
          g.drawImage(tdSpriteImage(g3Art(a)),x+8,70,252,219);
          g.drawImage(tdSpriteImage(tdStyleV2()?tdPlayerSpriteV2('down',0):tdPlayerSprite('down',0)),x+270,220,48,66);
        });return c.toDataURL();
      });
      if(device==='pc') fs.writeFileSync(path.join(OUT,`ratio-${style}.png`),Buffer.from(ratio.split(',')[1],'base64'));
      const alongside=await page.evaluate(()=>{
        const c=document.createElement('canvas');c.width=1440;c.height=330;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
        g.fillStyle='#e7dcc3';g.fillRect(0,0,c.width,c.height);
        ['existing','A','B','C'].forEach((a,i)=>{
          const x=i*360;g.fillStyle='#493c32';g.font='18px sans-serif';g.fillText(a+' / G2',x+16,25);
          g.drawImage(tdSpriteImage(g3Art(a)),x+8,112,168,146);
          g.drawImage(TD.sheet.base,x+184,142,128,116);
          g.drawImage(tdSpriteImage(tdStyleV2()?tdPlayerSpriteV2('down',0):tdPlayerSprite('down',0)),x+316,214,32,44);
        });return c.toDataURL();
      });
      if(device==='pc') fs.writeFileSync(path.join(OUT,`alongside-g2-${style}.png`),Buffer.from(alongside.split(',')[1],'base64'));
      assert.deepEqual(errors,[],`${device}/${style} console errors`);
      log.cases.filter(x=>x.device===device&&x.style===style).forEach(x=>x.errors=errors);
      await context.close(); console.log(`${device}/${style}: four renders, day/dusk + contracts passed`);
    }
    fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify(log,null,2)+'\n');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
