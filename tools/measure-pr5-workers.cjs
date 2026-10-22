// Additional actual-Chromium load case: 13 workers navigating to one generated mine.
const fs=require('node:fs'),path=require('node:path');
const {start}=require('../tests/stage3-browser-utils.cjs'),fixture=require('../tests/fixtures/save_v1_midgame.json');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/pr5-matrix');fs.mkdirSync(out,{recursive:true});
const summary=a=>{a=a.slice().sort((x,y)=>x-y);return {n:a.length,p95:a[Math.floor(a.length*.95)]||0,max:a.at(-1)||0};};
(async()=>{const results=[];for(const [variant,dir] of [['before',process.env.PR5_BEFORE||'/workspace/work/pr5-before'],['after',root]]){
 const app=await start(dir);try{for(const [device,viewport,dpr,mobile] of [['pc',{width:1280,height:800},1,false],['chromebook',{width:1366,height:768},1,false],['mobile',{width:390,height:844},3,true]])for(const rate of [1,4]){
 const ctx=await app.browser.newContext({viewport,deviceScaleFactor:dpr,isMobile:mobile,hasTouch:mobile}),page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await ctx.addInitScript(f=>{Object.assign(f.run.world,{seed:7,size:256,generatorVersion:1,chunkEditsVersion:1,chunkEdits:{}});localStorage.setItem('gachaFactorySave.worldgen256.v1',JSON.stringify(f));},JSON.parse(JSON.stringify(fixture)));
 await page.goto(app.url+'/?worldgen=256');await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.groundMap);
 await page.evaluate(()=>{clearInterval(tickTimer);clearInterval(autoSaveTimer);clearInterval(ticketTimer);worldEnsureRect({minX:-32,maxX:31,minY:-32,maxY:31});const m=state.world.mines.find(m=>m.id.startsWith('gen:')&&m.resource==='iron'&&m.y<=-19&&Math.abs(m.x)<8);if(!m)throw Error('missing stress vein');state.world.mines.forEach(m=>m.developmentState='unsecured');discoverMine(m.id);m.developmentState='secured';recordGeneratedMineEdit(m.id);const c=state.characters[0];state.characters=Array.from({length:13},(_,i)=>({...c,id:'stress-'+i,resource:'iron'}));Object.assign(state.world.player,{x:2,y:2});tdWorkerSimReset();window.__stressMine=m.id;});
 await page.waitForTimeout(1000);
 await page.evaluate(()=>{tdWorkerSimReset();window.__stress={frames:[],navigation:[]};const fn=tdWorkerSimStep;tdWorkerSimStep=function(...a){const t=performance.now(),r=fn(...a);window.__stress.navigation.push(performance.now()-t);return r;};window.__measuring=true;let last=0;function frame(t){if(!window.__measuring)return;if(last)window.__stress.frames.push(t-last);last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);});
 await page.waitForTimeout(30000);
 const raw=await page.evaluate(()=>{window.__measuring=false;return {...window.__stress,mine:window.__stressMine,workers:Object.values(TD.workerSim.byId).map(s=>({id:s.id,snaps:s.snaps,mode:s.mode,x:s.x,y:s.y}))};});
 const r={variant,device,rate,emulation:true,errors,frames:summary(raw.frames),navigation:summary(raw.navigation),snaps:raw.workers.reduce((n,s)=>n+s.snaps,0),arrived:raw.workers.filter(s=>s.mode==='work').length,raw};results.push(r);fs.writeFileSync(path.join(out,'workers.json'),JSON.stringify({durationMs:30000,browser:app.browser.version(),results},null,2));console.log(variant,device,rate,'nav p95',r.navigation.p95,'snaps',r.snaps,'arrived',r.arrived);await ctx.close();
 }}finally{await app.close();}}
})().catch(e=>{console.error(e);process.exitCode=1;});
