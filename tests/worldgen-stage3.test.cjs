const {test}=require('node:test');
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
 assert.throws(()=>g.generateWorldChunk({seed:0,generatorVersion:2},0,0));
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
