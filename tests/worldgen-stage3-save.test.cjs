const {test}=require('node:test'),assert=require('node:assert/strict');
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
 const a=open();assert.equal(a.w.getState().world.generatorVersion,1);a.w.saveGame();
 const raw=a.data.get(key),seed=a.w.getState().world.seed;a.close();
 const b=open(true,{[key]:raw});assert.equal(b.w.getState().world.seed,seed);b.close();
 for(const patch of [{generatorVersion:2},{seed:-1},{size:2048},{chunkEditsVersion:2},{chunkEdits:{'99,0':{mines:{}}}}]){
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
