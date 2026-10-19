const {test}=require('node:test'),assert=require('node:assert/strict');const {open}=require('./stage3-harness.cjs');
test('256 tiles, independent data/render caches and preserved legacy terrain',()=>{
 const a=open(false);a.w.saveGame();const raw=a.data.get('gachaFactorySave');
 const b=open(true,{'gachaFactorySave':raw});const map=b.w.tdBuildTileMap(false,b.w.getState().world.base,b.w.villageGroundLayout());
 assert.equal(map.cols,256);assert.equal(map.rows,256);
 for(let ty=-48;ty<48;ty++)for(let tx=-48;tx<48;tx++){
  const x=(tx+.5)/4,y=(ty+.5)/4;
  assert.equal(b.w.tdTileAt(x,y,false,b.w.getState().world.base,b.w.villageGroundLayout()),a.w.tdTileAt(x,y,false,a.w.getState().world.base,a.w.villageGroundLayout()));
  assert.equal(b.w.isWorldPointWalkable(x,y),a.w.isWorldPointWalkable(x,y));
 }
 const chunk=b.w.worldChunk(b.w.getState().world,2,0);b.w.tdEnsureGround();b.w.getTD().chunks.clear();assert.equal(b.w.worldChunk(b.w.getState().world,2,0),chunk);
 a.close();b.close();
});
test('legacy boundary ring is solid with no overlapping generated props or mines; outer grid traversable',()=>{
 const a=open(),w=a.w;assert.equal(typeof w.worldEnsureRect,'function');w.worldEnsureRect({minX:-32,maxX:32,minY:-32,maxY:32});
 for(const m of w.getState().world.mines.filter(m=>m.id.startsWith('gen:')))assert.ok(Math.max(Math.abs(m.x),Math.abs(m.y))>=15);
 for(let p=-13.875;p<14;p+=.25){assert.equal(w.playerCanStand(p,13.875),false);assert.equal(w.playerCanStand(13.875,p),false);}
 for(let y=-28;y<28;y+=.125)assert.equal(w.playerCanStand(20,y),true);
 assert.equal(w.playerCanStand(32,0),false);a.close();
});
for(const style of ['', 'v2'])test('protected village pixels stay identical after changing map origin '+style,()=>{
 const a=open(false,{},style);a.w.saveGame();const b=open(true,{'gachaFactorySave':a.data.get('gachaFactorySave')},style);
 function paint(h){const m=h.w.tdBuildTileMap(false,h.w.getState().world.base,h.w.villageGroundLayout());const i=Math.round(-m.originX*4),j=Math.round(-m.originY*4);return h.w.tdPaintTileMap(m,{i0:i,i1:i+8,j0:j,j1:j+8}).data;}
 assert.equal(Buffer.compare(Buffer.from(paint(a)),Buffer.from(paint(b))),0);a.close();b.close();
});
for(const style of ['', 'v2'])test('four adjacent chunk canvases exactly match one regional paint '+style,()=>{
 const h=open(true,{},style),w=h.w,m=w.tdBuildTileMap(false,w.getState().world.base,w.villageGroundLayout());
 const area={i0:192,i1:256,j0:128,j1:192},whole=w.tdPaintTileMap(m,area),joined=Buffer.alloc(whole.data.length);
 for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
  const p=w.tdPaintTileMap(m,{i0:192+dx*32,i1:224+dx*32,j0:128+dy*32,j1:160+dy*32});
  for(let row=0;row<p.height;row++)Buffer.from(p.data.buffer,row*p.width*4,p.width*4).copy(joined,((dy*p.height+row)*whole.width+dx*p.width)*4);
 }
 assert.equal(Buffer.compare(Buffer.from(whole.data),joined),0);h.close();
});
