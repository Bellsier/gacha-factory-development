// Real Chromium; device sizes and CPU throttling are emulation, not hardware measurements.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {start}=require('../tests/stage3-browser-utils.cjs');
const fixture=require('../tests/fixtures/save_v1_midgame.json');
const out=path.resolve(process.env.WORLDGEN_OUTPUT||path.join(__dirname,'../work/worldgen-review'));
const summary=values=>{const a=values.slice().sort((a,b)=>a-b);return {n:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],p99:a[Math.min(a.length-1,Math.floor(a.length*.99))],max:a.at(-1)};};
(async()=>{
 const app=await start(),results=[];fs.mkdirSync(out,{recursive:true});
 try{
 for(const [name,viewport,dpr,mobile] of [['pc',{width:1280,height:800},1,false],['chromebook',{width:1366,height:768},1,false],['mobile',{width:390,height:844},3,true]])for(const rate of [1,4]){
  const startup={cold:[],warm:[]};let context,page,cdp;
  for(let run=0;run<10;run++){
   context=await app.browser.newContext({viewport,deviceScaleFactor:dpr,isMobile:mobile,hasTouch:mobile});page=await context.newPage();cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});
   await context.addInitScript(({fixture})=>{
    if(!localStorage.getItem('gachaFactorySave.worldgen256.v1')){
     Object.assign(fixture.run.world,{seed:123456789,size:256,generatorVersion:1,chunkEditsVersion:1,chunkEdits:{}});
     localStorage.setItem('gachaFactorySave.worldgen256.v1',JSON.stringify(fixture));
    }
    const ready=()=>{try{if(typeof TD!=='undefined'&&TD.groundMap){window.__readyAt=performance.now();return;}}catch(_){}requestAnimationFrame(ready);};requestAnimationFrame(ready);
   },{fixture});
   await page.goto(app.url+'/?worldgen=256');await page.waitForFunction(()=>window.__readyAt>0);startup.cold.push(await page.evaluate(()=>window.__readyAt));
   await page.reload();await page.waitForFunction(()=>window.__readyAt>0);startup.warm.push(await page.evaluate(()=>window.__readyAt));
   if(run<9)await context.close();
  }
  await page.evaluate(()=>{clearInterval(tickTimer);clearInterval(autoSaveTimer);clearInterval(ticketTimer);});
  const generation=await page.evaluate(()=>{
   const c={seed:123456789,generatorVersion:1},raw=[],prep=[];
   for(let round=-1;round<30;round++)for(let cy=-4;cy<4;cy++)for(let cx=-4;cx<4;cx++){
    const t=performance.now();generateWorldChunk(c,cx,cy);(round<0?prep:raw).push(performance.now()-t);
   }
   return {raw,prep};
  });
  await cdp.send('HeapProfiler.collectGarbage');const before=await cdp.send('Runtime.getHeapUsage');
  const data=await page.evaluate(()=>{
   window.__benchData=[];let tileBytes=0,mines=0,props=0;
   for(let y=-4;y<4;y++)for(let x=-4;x<4;x++){const c=generateWorldChunk({seed:123456789,generatorVersion:1},x,y);window.__benchData.push(c);tileBytes+=c.tiles.byteLength;mines+=c.mines.length;props+=c.props.length;}
   return {tileBytes,mines,props,serializedBytes:new TextEncoder().encode(JSON.stringify(window.__benchData)).byteLength};
  });
  await cdp.send('HeapProfiler.collectGarbage');const after=await cdp.send('Runtime.getHeapUsage');
  await page.evaluate(()=>{
   window.__benchData=null;state.world.player.x=20;state.world.player.y=-20;clearPlayerHeld();
   window.__frames=[];window.__long=[];window.__measure=true;let last=0;
   const loop=t=>{if(!window.__measure)return;if(last)window.__frames.push(t-last);last=t;requestAnimationFrame(loop);};requestAnimationFrame(loop);
   window.__observer=new PerformanceObserver(l=>window.__long.push(...l.getEntries().map(e=>e.duration)));window.__observer.observe({entryTypes:['longtask']});
   tickTimer=setInterval(tickLoop,TICK_MS);
  });
  let touch;
  if(mobile){const box=await page.locator('#tdStick').boundingBox();touch={x:box.x+box.width/2,y:box.y+box.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y+30}]});}
  else await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(15000);
  if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x,y:touch.y-30}]});}
  else{await page.keyboard.up('ArrowDown');await page.keyboard.down('ArrowUp');}
  await page.waitForTimeout(15000);
  if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('ArrowUp');
  const walk=await page.evaluate(()=>{
   window.__measure=false;window.__observer.disconnect();clearInterval(tickTimer);
   return {frames:window.__frames,longTasks:window.__long,player:{...state.world.player},dataChunks:worldRuntime().data.size,renderChunks:TD.chunks.size,canvasBytes:[...TD.chunks.values()].reduce((s,c)=>s+(c.canvas?c.canvas.width*c.canvas.height*4:0),0),chunkStats:{...TD.chunkStats}};
  });
  results.push({name,viewport,dpr,cpuSlowdown:rate,emulation:true,startup:{raw:startup,cold:summary(startup.cold),warm:summary(startup.warm)},generation:{...generation,summary:summary(generation.raw)},memory:{...data,before,after,retainedHeapDelta:after.usedSize-before.usedSize},walk:{...walk,summary:summary(walk.frames),over33:walk.frames.filter(x=>x>33.4).length,over50:walk.frames.filter(x=>x>50).length}});
  fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify({environment:{browser:app.browser.version(),node:process.version,platform:os.platform(),cpu:os.cpus()[0]?.model,cpus:os.cpus().length},results},null,2));console.log(name,rate,JSON.stringify(results.at(-1).generation.summary));await context.close();
 }
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
