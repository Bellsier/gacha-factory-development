// Identical real-input comparison. No tracked screenshot/results are overwritten.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {start}=require('../tests/stage3-browser-utils.cjs'),fixture=require('../tests/fixtures/save_v1_midgame.json');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/pr5-matrix');fs.mkdirSync(out,{recursive:true});
const summary=a=>{a=a.slice().sort((x,y)=>x-y);return {n:a.length,p95:a[Math.min(a.length-1,Math.floor(a.length*.95))]||0,max:a.at(-1)||0,total:a.reduce((x,y)=>x+y,0)};};
const variants=[['develop-normal',process.env.PR5_DEVELOP||'/workspace/work/pr5-develop',false],['before-normal',process.env.PR5_BEFORE||'/workspace/work/pr5-before',false],['before-worldgen',process.env.PR5_BEFORE||'/workspace/work/pr5-before',true],['after-normal',root,false],['after-worldgen',root,true]];
(async()=>{const results=[];
for(const [variant,dir,trial] of variants){const app=await start(dir);try{
 for(const [device,viewport,dpr,mobile] of [['pc',{width:1280,height:800},1,false],['chromebook',{width:1366,height:768},1,false],['mobile',{width:390,height:844},3,true]])for(const rate of [1,4]){
  const ctx=await app.browser.newContext({viewport,deviceScaleFactor:dpr,isMobile:mobile,hasTouch:mobile}),page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  await ctx.addInitScript(({fixture,trial})=>{const p=JSON.parse(JSON.stringify(fixture));if(trial)Object.assign(p.run.world,{seed:7,size:256,generatorVersion:1,chunkEditsVersion:1,chunkEdits:{}});localStorage.setItem(trial?'gachaFactorySave.worldgen256.v1':'gachaFactorySave',JSON.stringify(p));},{fixture,trial});
  await page.goto(app.url+(trial?'/?worldgen=256':'/'));await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.groundMap);
  await page.evaluate(trial=>{clearInterval(tickTimer);clearInterval(autoSaveTimer);clearInterval(ticketTimer);Object.assign(state.world.player,{x:trial?9:6,y:trial?0:2});clearPlayerHeld();},trial);
  await page.waitForTimeout(1000);
  await page.evaluate(()=>{
   window.__m={frames:[],ground:[],chunks:[],drawList:[],ticks:[],rebuilds:0,positions:[],indexBuilds0:WORLD_INDEX.builds,chunk0:{...tdChunkStats()}};
   function wrap(name,key){const fn=window[name];window[name]=function(...args){const before=TD.groundMap,t=performance.now();const r=fn.apply(this,args);window.__m[key].push(performance.now()-t);if(name==='tdEnsureGround'&&before!==TD.groundMap)window.__m.rebuilds++;return r;};}
   wrap('tdEnsureGround','ground');wrap('tdChunkWork','chunks');wrap('tdDrawList','drawList');wrap('tickLoop','ticks');
   window.__measure=true;let last=0;function frame(t){if(!window.__measure)return;if(last)window.__m.frames.push(t-last);last=t;window.__m.positions.push({x:state.world.player.x,y:state.world.player.y});requestAnimationFrame(frame);}requestAnimationFrame(frame);
   tickTimer=setInterval(()=>window.tickLoop(),TICK_MS);
  });
  const points=trial?[[16,0],[16,4],[28,4],[16,4],[16,0],[9,0]]:[[9.5,2],[6,2]];let target=0,held=null,touch=null;
  if(mobile){const b=await page.locator('#tdStick').boundingBox();touch={x:b.x+b.width/2,y:b.y+b.height/2};}
  const begin=Date.now();while(Date.now()-begin<20000){
   const p=await page.evaluate(()=>({x:state.world.player.x,y:state.world.player.y}));let [x,y]=points[target];if(Math.hypot(x-p.x,y-p.y)<.3){target=(target+1)%points.length;[x,y]=points[target];}
   const dx=x-p.x,dy=y-p.y,dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'ArrowRight':'ArrowLeft'):(dy>0?'ArrowDown':'ArrowUp');
   if(dir!==held){if(mobile){if(held)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x+(dir==='ArrowRight'?30:dir==='ArrowLeft'?-30:0),y:touch.y+(dir==='ArrowDown'?30:dir==='ArrowUp'?-30:0)}]});}else{if(held)await page.keyboard.up(held);await page.keyboard.down(dir);}held=dir;}
   await page.waitForTimeout(100);
  }
  if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else if(held)await page.keyboard.up(held);
  const raw=await page.evaluate(()=>{window.__measure=false;clearInterval(tickTimer);return {...window.__m,chunk1:{...tdChunkStats()},indexBuilds:WORLD_INDEX.builds-window.__m.indexBuilds0};});
  const visited=[...new Set(raw.positions.map(p=>Math.floor(p.x/8)+','+Math.floor(p.y/8)))];
  const result={variant,device,rate,viewport,dpr,emulation:true,trialGenerator:trial?1:null,errors,visitedChunks:visited,rebuilds:raw.rebuilds,indexBuilds:raw.indexBuilds,chunkStats:raw.chunk1,summary:Object.fromEntries(['frames','ground','chunks','drawList','ticks'].map(k=>[k,summary(raw[k])])),raw};results.push(result);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({environment:{browser:app.browser.version(),node:process.version,cpu:os.cpus()[0]?.model},durationMs:20000,results},null,2));console.log(variant,device,rate,'frames',result.summary.frames.p95,'rebuilds',raw.rebuilds,'visited',visited.join(';'));await ctx.close();
 }
}finally{await app.close();}}
})().catch(e=>{console.error(e);process.exitCode=1;});
