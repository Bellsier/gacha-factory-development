// Stage 3 tests: run before 99.js.

{
const test=(name,fn)=>{try{fn();check("Stage3: "+name,true);}catch(e){check("Stage3: "+name,false,e.stack);}};

const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const file=require('node:path').join(__dirname,'../js/chunkgen.js');
const g=fs.existsSync(file)?new Function(fs.readFileSync(file,'utf8')+';return {generateWorldChunk,sampleGeneratedTile,chunkHash};')():{};
test('generator exists and creates a 32x32 chunk',()=>{
 assert.equal(typeof g.generateWorldChunk,'function');
 const c=g.generateWorldChunk({seed:0,generatorVersion:1},2,0);
 assert.equal(c.tiles.length,1024);
});
test('100 seeds: order-independent chunks, stable ownership and absolute tile samples',()=>{
 assert.equal(typeof g.generateWorldChunk,'function');
 for(let s=0;s<100;s++){
  const ctx={seed:s===99?4294967295:s,generatorVersion:1};
  const keys=Array.from({length:64},(_,i)=>[i%8-4,Math.floor(i/8)-4]);
  const expected=keys.map(([x,y])=>JSON.stringify(g.generateWorldChunk(ctx,x,y)));
  for(let i=63;i>=0;i--){const [x,y]=keys[i],c=g.generateWorldChunk(ctx,x,y);
   assert.equal(JSON.stringify(c),expected[i]);
   for(let j=0;j<32;j++)for(let k=0;k<32;k++)assert.equal(c.tiles[j*32+k],g.sampleGeneratedTile(ctx,x*32+k,y*32+j));
   for(const p of [...c.mines,...c.props]){assert.equal(Math.floor(p.x/8),x);assert.equal(Math.floor(p.y/8),y);assert.ok(Math.max(Math.abs(p.x),Math.abs(p.y))>=14);}
  }
 }
});
test('invalid contexts and coordinates rejected; seed changes terrain',()=>{
 assert.equal(typeof g.generateWorldChunk,'function');
 for(const seed of [-1,NaN,Infinity,1.5,4294967296])assert.throws(()=>g.generateWorldChunk({seed,generatorVersion:1},0,0));
 assert.throws(()=>g.generateWorldChunk({seed:0,generatorVersion:3},0,0));
 assert.throws(()=>g.generateWorldChunk({seed:0,generatorVersion:1},0.5,0));
 assert.notEqual(JSON.stringify(g.generateWorldChunk({seed:0,generatorVersion:1},2,2)),JSON.stringify(g.generateWorldChunk({seed:1,generatorVersion:1},2,2)));
});
test('generator v1 integer hash golden vectors',()=>{
 assert.equal(g.chunkHash(0,0,0,1),726357435);assert.equal(g.chunkHash(4294967295,-32,31,6),3200509438);
});
test('v1 complete generated worlds match frozen SHA256 digests',()=>{
 const {createHash}=require('node:crypto'),vectors=require('./fixtures/worldgen-v1-digests.json');
 for(const [seed,digest] of Object.entries(vectors)){
  const chunks=[];for(let y=-4;y<4;y++)for(let x=-4;x<4;x++)chunks.push(g.generateWorldChunk({seed:Number(seed),generatorVersion:1},x,y));
  assert.equal(createHash('sha256').update(JSON.stringify(chunks)).digest('hex'),digest);
 }
});

}

{
const test=(name,fn)=>{try{fn();check("Stage3: "+name,true);}catch(e){check("Stage3: "+name,false,e.stack);}};
const assert=require('node:assert/strict');
const {open}=require('./stage3-harness.cjs');
const key='gachaFactorySave.worldgen256.v1';
test('test mode copies legacy state and only writes isolated key',()=>{
 const a=open(false);a.w.saveGame();const raw=a.data.get('gachaFactorySave');a.close();
 const b=open(true,{'gachaFactorySave':raw});
 assert.equal(b.w.getState().world.size,256);
 assert.deepEqual(JSON.parse(JSON.stringify(b.w.getState().world.base)),JSON.parse(raw).run.world.base);
 b.w.saveGame();assert.equal(b.data.get('gachaFactorySave'),raw);assert.ok(b.data.has(key));b.close();
});
test('fresh test seed persists, invalid versions block writes',()=>{
 const a=open();assert.equal(a.w.getState().world.generatorVersion,2);a.w.saveGame();
 const raw=a.data.get(key),seed=a.w.getState().world.seed;a.close();
 const b=open(true,{[key]:raw});assert.equal(b.w.getState().world.seed,seed);b.close();
 for(const patch of [{generatorVersion:3},{seed:-1},{size:2048},{chunkEditsVersion:2},{chunkEdits:{'99,0':{mines:{}}}}]){
 const payload=JSON.parse(raw);Object.assign(payload.run.world,patch);const bad=JSON.stringify(payload);
 const c=open(true,{[key]:bad});assert.equal(c.w.isBlocked(),true);assert.equal(c.w.saveGame(),false);assert.equal(c.data.get(key),bad);c.close();
 }
});
test('outer coordinates, discoveries, secured mines and mined resources round trip',()=>{
 const a=open();const w=a.w,s=w.getState();
 assert.equal(typeof w.worldTestTeleport,'function');assert.equal(w.worldTestTeleport(),true);assert.equal(s.world.player.x,16);
 w.worldEnsureRect({minX:16,maxX:24,minY:0,maxY:8});
 const m=s.world.mines.find(m=>m.id.startsWith('gen:'));assert.ok(m);
 assert.equal(w.discoverMine(m.id),true);assert.equal(w.secureMine(m.id),true);
 w.worldRuntime(s.world).data.clear();w.worldEnsureRect({minX:m.x-1,maxX:m.x+1,minY:m.y-1,maxY:m.y+1});
 assert.equal(w.mineById(m.id),m);assert.equal(m.developmentState,'secured');assert.equal(w.isMineDiscovered(m),true);
 const before=s.resources[m.resource];assert.equal(w.mineMine(m.id),true);assert.ok(s.resources[m.resource]>before);
 s.world.torches.push({x:16,y:0});s.world.workshops.push({id:'outer-hut',x:18,y:0,level:1,recipeKey:null,auto:false,progress:null});
 w.saveGame();const raw=a.data.get(key),id=m.id,amount=s.resources[m.resource];
 assert.ok(!JSON.parse(raw).run.world.mines.some(m=>m.id===id));a.close();
 const b=open(true,{[key]:raw}),r=b.w.getState();
 assert.equal(r.world.player.x,16);assert.equal(r.world.player.y,0);
 assert.equal(r.world.torches.at(-1).x,16);assert.equal(r.world.workshops.at(-1).x,18);
 assert.equal(b.w.mineById(id).developmentState,'secured');assert.equal(b.w.isMineDiscovered(b.w.mineById(id)),true);assert.equal(r.resources[m.resource],amount);b.close();
});
test('teleport is unavailable outside explicit test mode',()=>{
 const a=open(false),before=JSON.stringify(a.w.getState().world.player);
 assert.equal(typeof a.w.worldTestTeleport,'function');assert.equal(a.w.worldTestTeleport(),false);assert.equal(JSON.stringify(a.w.getState().world.player),before);a.close();
});
test('invalid return position and generated ID collisions preserve the trial save',()=>{
 const a=open();a.w.saveGame();const raw=a.data.get(key);a.close();
 for(const patch of [{testReturnPosition:{x:999,y:0}},{mines:[{id:'gen:v1:mine:9:1',x:2,y:2,resource:'iron',grade:1,miningPower:1,developmentState:'secured'}]}]){
 const p=JSON.parse(raw);Object.assign(p.run.world,patch);const bad=JSON.stringify(p),b=open(true,{[key]:bad});assert.equal(b.w.isBlocked(),true);b.w.saveGame();assert.equal(b.data.get(key),bad);b.close();
 }
});
test('worker placement retains the generated mine reference after reload',()=>{
 const a=open(),w=a.w,s=w.getState();w.worldEnsureRect({minX:16,maxX:24,minY:0,maxY:8});
 const m=s.world.mines.find(m=>m.id.startsWith('gen:'));assert.ok(m);
 for(const other of s.world.mines)other.developmentState='unsecured';
 w.discoverMine(m.id);w.secureMine(m.id);
 const worker={...require('./fixtures/save_v1_midgame.json').run.characters[0],resource:m.resource};s.characters=[worker];
 const before=w.tdWorkerPlacements().find(p=>p.id===worker.id);assert.equal(before.mineId,m.id);
 w.saveGame();const raw=a.data.get(key);a.close();
 const b=open(true,{[key]:raw}),after=b.w.tdWorkerPlacements().find(p=>p.id===worker.id);
 assert.equal(after.mineId,before.mineId);assert.equal(after.x,before.x);assert.equal(after.y,before.y);b.close();
});
test('midgame fixture keeps run and permanent progress in the trial copy',()=>{
 const raw=JSON.stringify(require('./fixtures/save_v1_midgame.json'));
 const a=open(false,{'gachaFactorySave':raw}),b=open(true,{'gachaFactorySave':raw});
 const before=JSON.parse(JSON.stringify(a.w.getState())),after=JSON.parse(JSON.stringify(b.w.serializeRunForSave(b.w.getState())));
 for(const k of ['seed','size','generatorVersion','chunkEditsVersion','chunkEdits'])delete after.world[k];
 assert.deepEqual(after,before);b.w.saveGame();assert.equal(b.data.get('gachaFactorySave'),raw);a.close();b.close();
});
test('a fresh run after prestige remains an isolated 256 world',()=>{
 const h=open();assert.equal(h.w.freshRunState().world.size,256);h.close();
});
test('existing trial storage without generator metadata is rejected instead of re-seeded',()=>{
 const legacy=open(false);legacy.w.saveGame();const raw=legacy.data.get('gachaFactorySave');legacy.close();
 const trial=open(true,{[key]:raw});assert.equal(trial.w.isBlocked(),true);trial.w.saveGame();assert.equal(trial.data.get(key),raw);trial.close();
});
test('quota failure keeps the last trial save and legacy bytes',()=>{
 const h=open();h.w.saveGame();const before=h.data.get(key);h.data.set('gachaFactorySave','legacy-bytes');
 h.w.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};
 assert.equal(h.w.saveGame(),false);assert.equal(h.data.get(key),before);assert.equal(h.data.get('gachaFactorySave'),'legacy-bytes');h.close();
});

}

{
const test=(name,fn)=>{try{fn();check("Stage3: "+name,true);}catch(e){check("Stage3: "+name,false,e.stack);}};
const assert=require('node:assert/strict');const {open}=require('./stage3-harness.cjs');
test('256 tiles, independent data/render caches and preserved legacy terrain',()=>{
 const a=open(false);a.w.saveGame();const raw=a.data.get('gachaFactorySave');
 const b=open(true,{'gachaFactorySave':raw});const map=b.w.tdBuildTileMap(false,b.w.getState().world.base,b.w.villageGroundLayout());
 assert.equal(map.cols,256);assert.equal(map.rows,256);
 for(let ty=-48;ty<48;ty++)for(let tx=-48;tx<48;tx++){
  const x=(tx+.5)/4,y=(ty+.5)/4;
  if(!(x>=10 && x<14 && Math.abs(y)<.5)) assert.equal(b.w.tdTileAt(x,y,false,b.w.getState().world.base,b.w.villageGroundLayout()),a.w.tdTileAt(x,y,false,a.w.getState().world.base,a.w.villageGroundLayout()));
  if(!(x>=10 && x<14 && Math.abs(y)<.5)) assert.equal(b.w.isWorldPointWalkable(x,y),a.w.isWorldPointWalkable(x,y));
 }
 const chunk=b.w.worldChunk(b.w.getState().world,2,0);b.w.tdEnsureGround();b.w.getTD().chunks.clear();assert.equal(b.w.worldChunk(b.w.getState().world,2,0),chunk);
 a.close();b.close();
});
test('legacy boundary ring is solid with no overlapping generated props or mines; outer grid traversable',()=>{
 const a=open(),w=a.w;assert.equal(typeof w.worldEnsureRect,'function');w.worldEnsureRect({minX:-32,maxX:32,minY:-32,maxY:32});
 for(const m of w.getState().world.mines.filter(m=>m.id.startsWith('gen:')))assert.ok(Math.max(Math.abs(m.x),Math.abs(m.y))>=15);
 for(let p=-13.875;p<14;p+=.25){assert.equal(w.playerCanStand(p,13.875),false);if(Math.abs(p)>=.5)assert.equal(w.playerCanStand(13.875,p),false);}
 for(let y=-28;y<28;y+=.125)assert.equal(w.playerCanStand(20,y),true);
 assert.equal(w.playerCanStand(32,0),false);a.close();
});
for(const style of ['', 'v2'])test('protected village pixels stay identical after changing map origin '+style,()=>{
 const a=open(false,{},style);a.w.saveGame();const b=open(true,{'gachaFactorySave':a.data.get('gachaFactorySave')},style);
 function paint(h){const m=h.w.tdBuildTileMap(false,h.w.getState().world.base,h.w.villageGroundLayout());const i=Math.round(-m.originX*4),j=Math.round(-m.originY*4);return h.w.worldPaintTileMap(m,{i0:i,i1:i+8,j0:j,j1:j+8}).data;}
 assert.equal(Buffer.compare(Buffer.from(paint(a)),Buffer.from(paint(b))),0);a.close();b.close();
});
for(const style of ['', 'v2'])test('four adjacent chunk canvases exactly match one regional paint '+style,()=>{
 const h=open(true,{},style),w=h.w,m=w.tdBuildTileMap(false,w.getState().world.base,w.villageGroundLayout());
 const area={i0:192,i1:256,j0:128,j1:192},whole=w.worldPaintTileMap(m,area),joined=Buffer.alloc(whole.data.length);
 for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
  const p=w.worldPaintTileMap(m,{i0:192+dx*32,i1:224+dx*32,j0:128+dy*32,j1:160+dy*32});
  for(let row=0;row<p.height;row++)Buffer.from(p.data.buffer,row*p.width*4,p.width*4).copy(joined,((dy*p.height+row)*whole.width+dx*p.width)*4);
 }
 assert.equal(Buffer.compare(Buffer.from(whole.data),joined),0);h.close();
});
test('movement into an unseen chunk loads its mine collision before rendering',()=>{
 const h=open(),w=h.w,c=w.getState().world;let candidate;
 for(let y=2;y<4&&!candidate;y++)for(let x=2;x<4&&!candidate;x++)candidate=w.generateWorldChunk(c,x,y).mines[0];
 assert.ok(candidate);assert.equal(w.mineById(candidate.id),null);
 const p=w.worldStepFoot(candidate.x-.6,candidate.y,1,0,.6);
 assert.ok(p.x<candidate.x-.2,'must stop before the unseen mine');assert.ok(w.mineById(candidate.id));h.close();
});

}

{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');
const test=(name,fn)=>{try{fn();check('Stage3 recovery: '+name,true);}catch(e){check('Stage3 recovery: '+name,false,e.stack);}};
test('east connector crosses legacy border by walking, with solid shoulders',()=>{
 const h=open(),w=h.w;
 try{for(const step of [.01,.05,.1,.25]){let p={x:9.75,y:0};for(let i=0;i<Math.ceil(7/step);i++)p=w.worldStepFoot(p.x,p.y,1,0,step);
 assert.ok(p.x>16,'continuous walking must cross x=10,12,14,16 at step '+step);}
 for(let x=10.25;x<14;x+=.25){assert.ok(w.playerCanStand(x,0));assert.equal(w.playerCanStand(x,.75),false);}
 assert.equal(w.terrainTunnelOpen(),false);}finally{h.close();}
});
test('development preview trial imports development save without changing original',()=>{
 const fixture=JSON.stringify(require('./fixtures/save_v1_midgame.json'));
 const h=open(true,{'gachaFactorySave.dev':fixture,'gachaFactorySave':'original sentinel'},'', 'https://bellsier.github.io/gacha-factory-development/?worldgen=256');
 try{assert.equal(h.w.getState().gold,JSON.parse(fixture).run.gold);assert.ok(h.w.saveGame());assert.equal(h.data.get('gachaFactorySave'),'original sentinel');assert.equal(h.data.get('gachaFactorySave.dev'),fixture);}finally{h.close();}
});
}
{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');
try{const h=open();try{
 const w=h.w;w.worldEnsureRect({minX:16,maxX:24,minY:0,maxY:8});
 const first=w.worldIndex();assert.equal(w.worldIndex(),first,'unchanged scenery must reuse spatial index');
 check('Stage3: spatial index stable between identical queries',true);
}finally{h.close();}}catch(e){check('Stage3: spatial index stable between identical queries',false,e.stack);}
}
{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');
try{const h=open(true,{'gachaFactorySave':JSON.stringify(require('./fixtures/save_v1_midgame.json'))});try{
 const w=h.w,p=w.getState().world.player,step=.25;
 const key=(x,y)=>x+','+y,queue=[[Math.round(p.x/step),Math.round(p.y/step)]],seen=new Set([key(...queue[0])]);let found=false;
 for(let i=0;i<queue.length&&!found;i++){
  const [gx,gy]=queue[i],x=gx*step,y=gy*step;
  if(x>=16){found=true;break;}
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const nx=gx+dx,ny=gy+dy,k=key(nx,ny);if(seen.has(k)||nx<-40||nx>65||Math.abs(ny)>36)continue;
   const next=w.worldStepFoot(x,y,dx,dy,step);
   if(Math.abs(next.x-nx*step)<1e-7&&Math.abs(next.y-ny*step)<1e-7){seen.add(k);queue.push([nx,ny]);}
  }
 }
 assert.ok(found,'real movement must connect saved village spawn to the outer clearing');
 check('Stage3: midgame village to generated clearing reachable through real movement',true);
 const rect={minX:14,maxX:24,minY:-8,maxY:8};w.worldEnsureRect(rect);
 for(const [x,y] of [[16,0],[20,4],[24,-4]])assert.equal(JSON.stringify(w.worldObstacles(x,y,2)),JSON.stringify(w.worldObstaclesScan(x,y,2)));
 check('Stage3: generated obstacle index retains scan results and ordering',true);
}finally{h.close();}}catch(e){check('Stage3: village route and generated index',false,e.stack);}
}
{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');
const test=(name,fn)=>{try{fn();check('Stage3 review: '+name,true);}catch(e){check('Stage3 review: '+name,false,e.stack);}};
for(const style of ['', 'v2'])test('negative quadrant pixels opaque and stitched '+style,()=>{
 const h=open(true,{},style);try{const w=h.w,m=w.tdBuildTileMap(false,w.getState().world.base,w.villageGroundLayout());
 for(const [i,j] of [[0,128],[128,0],[0,0]]){
  const whole=w.worldPaintTileMap(m,{i0:i,i1:i+64,j0:j,j1:j+32}),joined=Buffer.alloc(whole.data.length);
  for(let x=0;x<2;x++){const p=w.worldPaintTileMap(m,{i0:i+x*32,i1:i+(x+1)*32,j0:j,j1:j+32});
   for(let row=0;row<p.height;row++)Buffer.from(p.data.buffer,row*p.width*4,p.width*4).copy(joined,(row*whole.width+x*p.width)*4);}
  assert.equal(Buffer.compare(Buffer.from(whole.data),joined),0);
  for(let k=3;k<whole.data.length;k+=4)assert.equal(whole.data[k],255);
 }
 }finally{h.close();}
});
test('small paint never asks for whole-map types',()=>{
 const h=open();try{const w=h.w,m=w.tdBuildTileMap(false,w.getState().world.base,w.villageGroundLayout());
 const view={cols:m.cols,rows:m.rows,originX:m.originX,originY:m.originY,village:m.village,tunnelOpen:m.tunnelOpen,typeAt:m.typeAt};
 Object.defineProperty(view,'types',{enumerable:true,get(){throw Error('whole map accessed');}});
 w.worldPaintTileMap(view,{i0:192,i1:196,j0:128,j1:132});
 }finally{h.close();}
});
test('teleport from entrance preserves valid return save',()=>{
 const h=open();try{const w=h.w;Object.assign(w.getState().world.player,{x:10.5,y:0});assert.ok(w.worldTestTeleport());assert.ok(w.saveGame());assert.ok(w.worldTestTeleport());assert.equal(w.getState().world.player.x,10.5);}finally{h.close();}
});
}
{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');
const test=(name,fn)=>{try{fn();check('Review H1: '+name,true);}catch(e){check('Review H1: '+name,false,e.stack);}};
test('generated vein materialization keeps village ground and cached chunks',()=>{
 const h=open();try{const w=h.w,c=w.getState().world;w.tdEnsureGround();const td=w.getTD(),map=td.groundMap,chunks=td.chunks,key=w.villageRoadKey(),roads=w.villageRoads(),tufts=w.tdOpenLandTufts();
 w.worldEnsureRect({minX:24,maxX:31,minY:24,maxY:31});w.tdEnsureGround();
 assert.equal(w.villageRoadKey(),key);assert.equal(w.villageRoads(),roads);assert.equal(td.groundMap,map);assert.equal(td.chunks,chunks);assert.equal(w.tdOpenLandTufts(),tufts);
 }finally{h.close();}
});
}
{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');
for(const direction of ['east','south','north']){
 const payload=JSON.parse(JSON.stringify(require('./fixtures/save_v1_midgame.json')));
 Object.assign(payload.run.world,{seed:7,size:256,generatorVersion:1,chunkEditsVersion:1,chunkEdits:{}});
 const h=open(true,{'gachaFactorySave.worldgen256.v1':JSON.stringify(payload)});
 try{const w=h.w,c=w.getState().world;
 w.worldEnsureRect({minX:-32,maxX:31,minY:-32,maxY:31});
 const m=c.mines.find(m=>m.id.startsWith('gen:')&&(direction==='east'?m.x>=19&&Math.abs(m.y)<8:direction==='south'?m.y>=19&&Math.abs(m.x)<8:m.y<=-19&&Math.abs(m.x)<8));assert.ok(m);
 for(const mine of c.mines)mine.developmentState='unsecured';w.discoverMine(m.id);m.developmentState='secured';
 w.getState().characters=[{...payload.run.characters[0],resource:m.resource}];c.player={x:2,y:2,facing:'down',pose:'idle'};w.tdWorkerSimReset();
 let prev=null,maxStep=0;
 for(let i=0;i<2400;i++){w.tdWorkerSimStep(100,i*100);const s=w.tdWorkerStates()[0];if(prev)maxStep=Math.max(maxStep,Math.hypot(s.x-prev.x,s.y-prev.y));prev=s;if(s.mode==='work')break;}
 const s=w.getTD().workerSim.byId[w.getState().characters[0].id];
 assert.equal(s.snaps,0);assert.ok(maxStep<=.181,'no discontinuous relocation');assert.equal(s.mode,'work');
 check('Review H2: '+direction+' worker reaches generated vein with snaps=0',true);
 }catch(e){check('Review H2: '+direction+' worker reaches generated vein with snaps=0',false,e.stack);}finally{h.close();}
}
}
{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');
try{const h=open();try{const w=h.w;w.tdEnsureGround();const td=w.getTD(),m=td.groundMap;
 const plain={cols:m.cols,rows:m.rows,originX:m.originX,originY:m.originY,tunnelOpen:m.tunnelOpen,village:m.village,chunkTypes:m.chunkTypes,chunk:m.chunk,typeAt:m.typeAt};
 Object.defineProperty(plain,'types',{get(){throw Error('whole tile array read');}});td.groundMap=plain;
 w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},putImageData(){},createImageData:(a,b)=>({data:new Uint8ClampedArray(a*b*4)}),drawImage(){}});
 assert.equal(typeof w.tdUpdateMinimapChunks,'function');td.miniBase=w.document.createElement('canvas');td.miniBase.width=td.miniBase.height=256;td.miniPainted=new Set();
 const before=w.worldRuntime().data.size;w.tdUpdateMinimapChunks(1);assert.equal(w.worldRuntime().data.size,before);assert.ok(td.miniPainted.size<=1);
 check('Review M3: minimap consumes cached chunks without whole-world allocation',true);
 }finally{h.close();}}catch(e){check('Review M3: minimap consumes cached chunks without whole-world allocation',false,e.stack);}
}
{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');const h=open();
try{const w=h.w,c=w.getState().world;w.worldEnsureRect({minX:16,maxX:24,minY:0,maxY:8});const m=c.mines.find(m=>m.id.startsWith('gen:'));assert.ok(m);
 c.hiddenMineIds.includes=()=>{throw Error('linear hidden lookup');};assert.equal(w.isMineDiscovered(m),false);
 let calls=0;const near=w.worldMinesNear;w.worldMinesNear=(...a)=>{calls++;return near(...a);};w.tickExploration();assert.ok(calls>0);
 check('Review M4: discovery uses a hidden set and spatial query',true);
}catch(e){check('Review M4: discovery uses a hidden set and spatial query',false,e.stack);}finally{h.close();}
}
{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');
const payload=JSON.parse(JSON.stringify(require('./fixtures/save_v1_midgame.json')));Object.assign(payload.run.world,{seed:7,size:256,generatorVersion:2,chunkEditsVersion:1,chunkEdits:{}});
const h=open(true,{'gachaFactorySave.worldgen256.v1':JSON.stringify(payload)});
try{const w=h.w;assert.equal(w.isBlocked(),false);w.worldEnsureRect({minX:-12,maxX:-8,minY:14,maxY:18});const m=w.mineById('gen:v2:mine:-5:7');assert.ok(m);
 const job=w.worldNavStart({x:16,y:0},{x:m.x+.42,y:m.y+.08});for(let i=0;i<1000&&!job.done;i++)w.worldNavAdvance(job,256);assert.ok(job.path,'seed7 vein has an accessible route');
 w.discoverMine(m.id);w.secureMine(m.id);assert.ok(w.saveGame());const b=open(true,Object.fromEntries(h.data));try{assert.equal(b.w.getState().world.generatorVersion,2);assert.equal(b.w.mineById(m.id).developmentState,'secured');}finally{b.close();}
 check('Review M5: v2 seed7 isolated v1 vein becomes reachable and retains edits',true);
}catch(e){check('Review M5: v2 seed7 isolated v1 vein becomes reachable and retains edits',false,e.stack);}finally{h.close();}
}
{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');
for(const version of [1,2]){const p=JSON.parse(JSON.stringify(require('./fixtures/save_v1_midgame.json')));Object.assign(p.run.world,{seed:7,size:256,generatorVersion:version,chunkEditsVersion:1,chunkEdits:{}});
 const h=open(true,{'gachaFactorySave.worldgen256.v1':JSON.stringify(p)});
 try{assert.equal(h.w.getState().world.generatorVersion,version);assert.ok(h.w.saveGame());const b=open(true,Object.fromEntries(h.data));try{assert.equal(b.w.getState().world.generatorVersion,version);assert.equal(b.w.getState().gold,h.w.getState().gold);}finally{b.close();}check('Review compatibility: generator v'+version+' saves never silently migrate',true);}catch(e){check('Review compatibility: generator v'+version+' saves never silently migrate',false,e.stack);}finally{h.close();}
}
}
{
const {open}=require('./stage3-harness.cjs'),assert=require('node:assert/strict');const h=open();
try{const w=h.w,td=w.getTD(),p={x:20,y:4,mineId:'test',dir:'left'},s={x:20,y:4,goalKey:'20,4',route:[],delay:0,mode:'walk',dir:'right'};
 w.worldWorkerStep(s,p,100);assert.equal(s.mode,'work');assert.equal(s.dir,'left');
 check('Review navigation: arrival faces the assigned vein',true);
}catch(e){check('Review navigation: arrival faces the assigned vein',false,e.stack);}finally{h.close();}
const b=open();try{const w=b.w,td=w.getTD();td.navBudget=256;td.navDeadline=0;w.worldNavStart=()=>{throw Error('expired frame started another search');};
 for(let i=0;i<20;i++)w.worldWorkerStep({x:0,y:0,route:[],delay:0},{x:20,y:4,dir:'left'},100);
 check('Review navigation: all workers share the elapsed-time budget',true);
}catch(e){check('Review navigation: all workers share the elapsed-time budget',false,e.stack);}finally{b.close();}
}
