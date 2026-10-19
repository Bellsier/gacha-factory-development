const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start}=require('./stage3-browser-utils.cjs');
const {createHash}=require('node:crypto');
const generate=new Function(fs.readFileSync(path.join(__dirname,'../js/chunkgen.js'),'utf8')+';return generateWorldChunk;')();
(async()=>{
 const app=await start(),results=[];
 const out=path.resolve(__dirname,'../docs/screenshots/worldgen-stage3');fs.mkdirSync(out,{recursive:true});
 try{
 for(const [name,viewport,dpr,mobile] of [['pc',{width:1280,height:800},1,false],['mobile',{width:390,height:844},3,true]]){
  const ctx=await app.browser.newContext({viewport,deviceScaleFactor:dpr,isMobile:mobile,hasTouch:mobile});const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(app.url);await page.waitForFunction(()=>typeof state!=='undefined');
  assert.equal(await page.locator('#worldgen-teleport').count(),0);
  const legacy=await page.evaluate(()=>{saveGame();saveBlocked=true;return localStorage.getItem('gachaFactorySave');});
  await page.goto(app.url+'/?worldgen=256&chunks=debug');
  await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.groundMap?.cols===256);
  await page.evaluate(()=>{clearInterval(tickTimer);clearInterval(autoSaveTimer);clearInterval(ticketTimer);});
  await page.screenshot({path:path.join(out,name+'-village.png')});
  await page.locator('#worldgen-teleport').click();
  await page.waitForFunction(()=>state.world.player.x===16);
  await page.screenshot({path:path.join(out,name+'-generated.png')});
  // Real keyboard events, same game input path used on Chromebook.
  const x=await page.evaluate(()=>state.world.player.x);
  if(mobile){
   const cdp=await ctx.newCDPSession(page),box=await page.locator('#tdStick').boundingBox();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2+30,y:box.y+box.height/2}]});
   await page.evaluate(()=>{for(let i=0;i<8;i++)tickPlayer();});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{await page.keyboard.down('ArrowRight');await page.evaluate(()=>{for(let i=0;i<8;i++)tickPlayer();});await page.keyboard.up('ArrowRight');}
  assert.ok(await page.evaluate(x=>state.world.player.x>x,x));
  const mining=await page.evaluate(()=>{
   worldEnsureRect({minX:16,maxX:28,minY:0,maxY:8});
   const m=state.world.mines.find(m=>m.id.startsWith('gen:'));if(!m)throw Error('no mine');
   state.world.player.x=m.x+0.45;state.world.player.y=m.y;tickExploration();
   if(!isMineDiscovered(m))throw Error('not discovered');
   secureMine(m.id);const before=state.resources[m.resource];
   return {id:m.id,resource:m.resource,before,x:state.world.player.x,y:state.world.player.y};
  });
  if(mobile) await page.locator('#tdAction').tap(); else await page.keyboard.press('e');
  // Interact events can be disabled while a panel is focused; assert actual resource change.
  const mined=await page.evaluate(m=>({amount:state.resources[m.resource],state:mineById(m.id).developmentState}),mining);
  assert.ok(mined.amount>mining.before,'E must mine the generated vein');assert.equal(mined.state,'secured');
  await page.evaluate(()=>saveGame());assert.ok(await page.evaluate(raw=>localStorage.getItem('gachaFactorySave')===raw,legacy),'legacy storage unchanged');
  const saved=await page.evaluate(()=>localStorage.getItem(WORLDGEN_TEST_KEY));
  await page.reload();await page.waitForFunction(()=>typeof state!=='undefined'&&state.world.size===256);
  const restored=await page.evaluate(m=>({mine:mineById(m.id)?.developmentState,discovered:isMineDiscovered(mineById(m.id)),amount:state.resources[m.resource],x:state.world.player.x,y:state.world.player.y,seed:state.world.seed}),mining);
  assert.equal(restored.mine,'secured');assert.equal(restored.discovered,true);assert.ok(restored.amount>=mined.amount);assert.equal(restored.x,mining.x);assert.equal(restored.y,mining.y);
  await page.screenshot({path:path.join(out,name+'-reloaded-mine.png')});
  await page.evaluate(()=>{state.world.player.x=20;state.world.player.y=0;clearInterval(tickTimer);});
  await page.waitForTimeout(250);await page.screenshot({path:path.join(out,name+'-seam.png')});
  await page.evaluate(()=>saveGame());await page.goto(app.url+'/?worldgen=256');await page.waitForFunction(()=>typeof TD!=='undefined'&&TD.groundMap?.cols===256);
  await page.screenshot({path:path.join(out,name+'-seam-clean.png')});
  const hash=await page.evaluate(()=>chunkHash(0,0,0,1));assert.equal(hash,726357435);
  for(const seed of [0,123456789,4294967295]){
   const chunks=[];for(let y=-4;y<4;y++)for(let x=-4;x<4;x++)chunks.push(generate({seed,generatorVersion:1},x,y));
   const expected=createHash('sha256').update(JSON.stringify(chunks)).digest('hex');
   const actual=await page.evaluate(async seed=>{
    const chunks=[];for(let y=-4;y<4;y++)for(let x=-4;x<4;x++)chunks.push(generateWorldChunk({seed,generatorVersion:1},x,y));
    const bytes=new TextEncoder().encode(JSON.stringify(chunks));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   },seed);assert.equal(actual,expected,'Node/Chromium full-world digest');
  }
  assert.deepEqual(errors,[]);results.push({name,viewport,dpr,emulation:true,restored,saveBytes:Buffer.byteLength(saved),errors});await ctx.close();
 }
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({browser:app.browser.version(),results},null,2));console.log(JSON.stringify(results));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
