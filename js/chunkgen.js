// Generator v1. Pure absolute-coordinate data; no game state or render cache.
function chunkMix(v){
  v = Math.imul(v ^ (v >>> 16), 0x7feb352d);
  v = Math.imul(v ^ (v >>> 15), 0x846ca68b);
  return (v ^ (v >>> 16)) >>> 0;
}
function chunkHash(seed, tx, ty, channel){
  let h = chunkMix(seed ^ 0x9e3779b9);
  h = chunkMix(h ^ tx); h = chunkMix(h ^ ty);
  return chunkMix(h ^ channel);
}
function chunkValidate(context, x, y){
  if(!context || ![1,2].includes(context.generatorVersion) || !Number.isInteger(context.seed) || context.seed < 0 || context.seed > 0xffffffff) throw new Error('Unsupported generator context');
  if(!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > 1048575 || Math.abs(y) > 1048575) throw new Error('Invalid generation coordinate');
}
function chunkMod(n, d){ return ((n % d) + d) % d; }
function chunkLegacyTile(tx, ty){ return tx >= -48 && tx < 48 && ty >= -48 && ty < 48; }
function chunkNoise(seed, tx, ty){
  const gx = Math.floor(tx / 16), gy = Math.floor(ty / 16);
  const smooth = n => Math.round((n / 16) ** 2 * (3 - 2 * n / 16) * 65536);
  const wx = smooth(chunkMod(tx, 16)), wy = smooth(chunkMod(ty, 16));
  const lerp = (a,b,w) => Math.floor((a * (65536 - w) + b * w) / 65536);
  const at = (x,y) => chunkHash(seed,x,y,1) >>> 16;
  return lerp(lerp(at(gx,gy),at(gx+1,gy),wx),lerp(at(gx,gy+1),at(gx+1,gy+1),wx),wy);
}
function chunkMineCandidate(context, gx, gy){
  const tx = gx * 8 + 4, ty = gy * 8 + 4;
  if(Math.max(Math.abs(tx),Math.abs(ty)) < 60 || Math.abs(tx) > 120 || Math.abs(ty) > 120) return null;
  if(Math.hypot(tx - 64,ty) < 12 || chunkHash(context.seed,gx,gy,2) >= 0x40000000) return null;
  return { id:'gen:v'+context.generatorVersion+':mine:'+gx+':'+gy, x:tx/4, y:ty/4, resource:chunkHash(context.seed,gx,gy,3) < 0x80000000 ? 'iron':'coal', grade:1, miningPower:1, developmentState:'unsecured' };
}
function chunkClearTile(context, tx, ty){
  const mx=chunkMod(tx,32), my=chunkMod(ty,32);
  if(mx===15 || mx===16 || my===15 || my===16) return true;
  // Spawn clearing and its connection to the nearest horizontal grid path.
  if(tx>=56 && tx<=72 && ty>=-8 && ty<=16) return true;
  // A vein has a clear approach and a two-tile corridor to its chunk's grid.
  const gx=Math.floor(tx/8), gy=Math.floor(ty/8);
  // Only this 8-tile column can be within two tiles of its centre.
  const x=gx;
  for(let y=gy-2;y<=gy+2;y++){
    const m=chunkMineCandidate(context,x,y); if(!m)continue;
    const ax=x*8+4, ay=y*8+4;
    let line=Math.floor(ay/32)*32+16;
    // v2: a vein alongside the protected forest connects outward, never into
    // the impassable inner ring. v1 paths remain byte-for-byte unchanged.
    if(context.generatorVersion===2 && Math.abs(ax)<56 && Math.abs(line)<56)line=ay>0?80:-80;
    if(Math.abs(tx-ax)<=2 && Math.abs(ty-ay)<=2) return true;
    if(tx>=ax-1 && tx<=ax && ty>=Math.min(ay,line)-1 && ty<=Math.max(ay,line)) return true;
  }
  return false;
}
function sampleGeneratedTile(context, tx, ty){
  chunkValidate(context,tx,ty);
  const d=Math.max(Math.abs(tx+0.5),Math.abs(ty+0.5));
  if(tx < -127 || tx >= 127 || ty < -127 || ty >= 127 || d<56) return 4;
  if(chunkClearTile(context,tx,ty)) return 0;
  return chunkNoise(context.seed,tx,ty)>=51117 ? 2:0;
}
function generateWorldChunk(context, cx, cy){
  chunkValidate(context,cx,cy);
  const tiles=new Uint8Array(1024), mines=[], props=[];
  for(let j=0;j<32;j++)for(let i=0;i<32;i++)tiles[j*32+i]=sampleGeneratedTile(context,cx*32+i,cy*32+j);
  for(let gy=cy*4;gy<cy*4+4;gy++)for(let gx=cx*4;gx<cx*4+4;gx++){
    const m=chunkMineCandidate(context,gx,gy); if(m)mines.push(m);
  }
  for(let gy=cy*16;gy<cy*16+16;gy++)for(let gx=cx*16;gx<cx*16+16;gx++){
    const tx=gx*2+1,ty=gy*2+1, h=chunkHash(context.seed,gx,gy,4);
    if(h>=0x20000000 || sampleGeneratedTile(context,tx,ty)!==0 || chunkClearTile(context,tx,ty))continue;
    // Stable thinning with a one-cell halo prevents overlapping silhouettes.
    let keep=true;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const nh=chunkHash(context.seed,gx+dx,gy+dy,4);
      if(nh<h || (nh===h && (dy<0 || dy===0&&dx<0)))keep=false;
    }
    if(!keep)continue;
    const kind=['grass','rock','sparseTree'][chunkHash(context.seed,gx,gy,5)%3];
    props.push({id:'gen:v'+context.generatorVersion+':prop:'+gx+':'+gy,kind,x:(tx+0.5)/4,y:(ty+0.5)/4,zone:'deepForest',size:0.8+(chunkHash(context.seed,gx,gy,6)>>>16)/65535*0.2,name:null});
  }
  return {cx,cy,tiles,mines,props};
}
