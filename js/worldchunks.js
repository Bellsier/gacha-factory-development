// Test-world runtime. Data cache is independent of TD's disposable canvases.
const WORLDGEN_TEST_KEY = typeof location !== 'undefined' && /\.github\.io$/i.test(location.hostname) && /^\/gacha-factory-development(\/|$)/i.test(location.pathname) ? 'gachaFactorySave.dev.worldgen256.v1' : 'gachaFactorySave.worldgen256.v1';
const WORLDGEN_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('worldgen') === '256';
let worldLoadingContext = null;
let worldChunkRuntime = null;
function worldTestMode(){ return WORLDGEN_MODE; }
function worldContext(raw){
  if(!WORLDGEN_MODE) return null;
  const fields=['seed','size','generatorVersion','chunkEditsVersion','chunkEdits'];
  if(!fields.some(k=>Object.prototype.hasOwnProperty.call(raw||{},k))) return null;
  if(!fields.every(k=>Object.prototype.hasOwnProperty.call(raw,k)) || raw.size!==256 || raw.chunkEditsVersion!==1) throw new Error('Unsupported test world');
  chunkValidate(raw,0,0);
  if(raw.testReturnPosition !== undefined){
    const p=raw.testReturnPosition;
    if(!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || ((Math.abs(p.x)>10 || Math.abs(p.y)>10) && !worldConnector(p.x,p.y)))throw new Error('Invalid return position');
  }
  // A saved generated entity belongs in edits, never the legacy mine array.
  if(Array.isArray(raw.mines) && raw.mines.some(m=>m && typeof m.id==='string' && m.id.startsWith('gen:v1:mine:')))throw new Error('Generated mine ID collision');
  const edits=raw.chunkEdits;
  if(!edits || typeof edits!=='object' || Array.isArray(edits) || Object.keys(edits).length>64)throw new Error('Invalid chunk edits');
  for(const [key,entry] of Object.entries(edits)){
    const pair=key.split(',').map(Number),[cx,cy]=pair;
    if(pair.length!==2 || !pair.every(v=>Number.isInteger(v)&&v>=-4&&v<=3) || key!==cx+','+cy)throw new Error('Invalid chunk key');
    if(!entry || Object.keys(entry).some(k=>k!=='mines') || !entry.mines || Array.isArray(entry.mines) || typeof entry.mines!=='object' || Object.keys(entry.mines).length>16)throw new Error('Invalid edits');
    for(const [id,e] of Object.entries(entry.mines)){
      const m=/^gen:v1:mine:(-?\d+):(-?\d+)$/.exec(id);
      const candidate=m&&chunkMineCandidate(raw,Number(m[1]),Number(m[2]));
      if(!candidate || candidate.id!==id || Math.floor(candidate.x/8)!==cx || Math.floor(candidate.y/8)!==cy)throw new Error('Invalid mine id');
      if(!e || Object.keys(e).some(k=>!['discovered','developmentState'].includes(k)) || typeof e.discovered!=='boolean' || !['unsecured','secured'].includes(e.developmentState) || e.developmentState==='secured'&&!e.discovered)throw new Error('Invalid mine edit');
    }
  }
  return {seed:raw.seed,size:256,generatorVersion:1,chunkEditsVersion:1,chunkEdits:JSON.parse(JSON.stringify(edits))};
}
function currentWorldContext(){
  if(!WORLDGEN_MODE)return null;
  if(worldLoadingContext)return worldLoadingContext;
  try{return state.world.size===256 ? state.world:null;}catch(_){return null;}
}
function worldBounds(context=currentWorldContext()){
  return context ? {minX:-31.75,maxX:31.75,minY:-31.75,maxY:31.75} : {minX:-10,maxX:10,minY:-10,maxY:10};
}
function worldTestInitialize(world){
  if(!WORLDGEN_MODE)return;
  if(world.size!==256){
    const seed=crypto.getRandomValues(new Uint32Array(1))[0];
    Object.assign(world,{seed,size:256,generatorVersion:1,chunkEditsVersion:1,chunkEdits:{}});
  }
}
function worldRuntime(world=state.world){
  if(!worldChunkRuntime || worldChunkRuntime.world!==world){
    worldChunkRuntime={world,data:new Map(),mines:new Map(),props:[],revision:0,stats:{generated:0,totalMs:0,maxMs:0}};
  }
  return worldChunkRuntime;
}
function worldChunk(context,cx,cy){
  if(cx < -4 || cx > 3 || cy < -4 || cy > 3)return null;
  const rt=worldRuntime(context),key=cx+','+cy;
  if(rt.data.has(key))return rt.data.get(key);
  const start=performance.now(),chunk=generateWorldChunk(context,cx,cy),ms=performance.now()-start;
  rt.data.set(key,chunk);rt.stats.generated++;rt.stats.totalMs+=ms;rt.stats.maxMs=Math.max(ms,rt.stats.maxMs);
  return chunk;
}
function serializeRunForSave(run){
  if(!WORLDGEN_MODE || run.world.size!==256)return run;
  const rt=worldRuntime(run.world),world={...run.world};
  world.mines=world.mines.filter(m=>rt.mines.get(m.id)!==m);
  world.hiddenMineIds=world.hiddenMineIds.filter(id=>!rt.mines.has(id));
  worldContext(world);
  return {...run,world};
}
// Trial-only connector occupies the old outer border, never the playable village.
function worldConnector(x,y){ return x>=10 && x<14.25 && y>=-.5 && y<.5; }
function worldOutsideLegacy(x,y){ return x < -12 || x >= 12 || y < -12 || y >= 12; }
function worldGeneratedWalkable(context,x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  for(const dx of [-0.09,0.09])for(const dy of [-0.06,0.06]){
    if(sampleGeneratedTile(context,Math.floor((x+dx)*4),Math.floor((y+dy)*4))!==0)return false;
  }
  return true;
}
function materializeChunkEntities(context,chunk){
  if(!chunk)return;
  const rt=worldRuntime(context);if(!rt.materialized)rt.materialized=new Set();
  const key=chunk.cx+','+chunk.cy;if(rt.materialized.has(key))return;
  for(const candidate of chunk.mines){
    if(context.mines.some(m=>m.id===candidate.id)&&!rt.mines.has(candidate.id))throw new Error('Generated mine ID collision');
    const e=context.chunkEdits[key]?.mines[candidate.id];
    const mine={...candidate,grade:worldGenResourceGrade(candidate.resource),developmentState:e?.developmentState||'unsecured'};
    rt.mines.set(mine.id,mine);context.mines.push(mine);
    if(!e?.discovered)context.hiddenMineIds.push(mine.id);
  }
  for(const p of chunk.props){
    const b=SCENERY_BLOCK_BOXES[p.kind];
    rt.props.push({...p,box:b?{minX:p.x+b.minX,maxX:p.x+b.maxX,minY:p.y+b.minY,maxY:p.y+b.maxY}:null});
  }
  const generated=context.mines.filter(m=>rt.mines.get(m.id)===m).sort((a,b)=>a.y-b.y||a.x-b.x);
  context.mines=context.mines.filter(m=>rt.mines.get(m.id)!==m).concat(generated);
  rt.props.sort((a,b)=>a.y-b.y||a.x-b.x);rt.materialized.add(key);rt.revision++;
}
function worldEnsureRect(r){
  const c=currentWorldContext();if(!c || worldLoadingContext)return;
  for(let cy=Math.max(-4,Math.floor(r.minY/8));cy<=Math.min(3,Math.floor(r.maxY/8));cy++)
    for(let cx=Math.max(-4,Math.floor(r.minX/8));cx<=Math.min(3,Math.floor(r.maxX/8));cx++)materializeChunkEntities(c,worldChunk(c,cx,cy));
}
function worldRestoreEdits(){
  const c=currentWorldContext();if(!c)return;
  for(const key of Object.keys(c.chunkEdits)){const [x,y]=key.split(',').map(Number);materializeChunkEntities(c,worldChunk(c,x,y));}
  const p=c.player;worldEnsureRect({minX:p.x-2,maxX:p.x+2,minY:p.y-2,maxY:p.y+2});
}
function recordGeneratedMineEdit(id){
  const c=currentWorldContext();if(!c)return;
  const m=worldRuntime(c).mines.get(id);if(!m)return;
  const key=Math.floor(m.x/8)+','+Math.floor(m.y/8);
  if(!c.chunkEdits[key])c.chunkEdits[key]={mines:{}};
  c.chunkEdits[key].mines[id]={discovered:!c.hiddenMineIds.includes(id),developmentState:m.developmentState};
}
function worldGeneratedScenery(){
  const c=currentWorldContext(),rt=worldRuntime(c);
  const legacy=terrainTunnelOpen()?worldSceneryLegacy():(rt.emptyScenery||(rt.emptyScenery={props:[],solid:[],grid:{}}));
  const key=rt.revision+'|'+terrainTunnelOpen()+'|'+c.mines.length+'|'+c.workshops.map(w=>w.id+':'+w.x+':'+w.y).join(';');
  if(rt.scenery?.key===key && rt.scenery.legacy===legacy)return rt.scenery;
  const props=legacy.props.concat(rt.props.filter(p=>!c.workshops.some(w=>Math.hypot(w.x-p.x,w.y-p.y)<0.8)));
  const grid={};for(const p of props)if(p.box){const k=Math.floor(p.x)+','+Math.floor(p.y);(grid[k]||(grid[k]=[])).push(p);}
  return rt.scenery={key,legacy,props,solid:props.filter(p=>p.box),grid};
}
function worldTestTeleport(){
  const c=currentWorldContext();if(!WORLDGEN_MODE || !c || saveBlocked)return false;
  const p=c.player;
  if(worldOutsideLegacy(p.x,p.y)){
    if(!c.testReturnPosition)return false;
    Object.assign(p,c.testReturnPosition,{pose:'idle'});delete c.testReturnPosition;
  }else{
    c.testReturnPosition={x:p.x,y:p.y};worldEnsureRect({minX:14,maxX:18,minY:-2,maxY:2});Object.assign(p,{x:16,y:0,pose:'idle'});
  }
  clearPlayerHeld();return true;
}
function worldTestControls(){
  if(!WORLDGEN_MODE)return;
  const panel=document.createElement('div');panel.id='worldgen-test-controls';
  panel.style.cssText='position:fixed;top:4px;left:4px;z-index:10000;padding:6px;background:#172b24;color:#fff;font:12px sans-serif;border-radius:6px';
  const label=document.createElement('span');label.textContent='256×256 시험 월드 · 별도 저장 ';panel.append(label);
  const button=document.createElement('button');button.id='worldgen-teleport';button.textContent='외곽 / 마을 왕복';button.disabled=saveBlocked;
  button.addEventListener('click',()=>worldTestTeleport());panel.append(button);
  const backup=document.createElement('button');backup.textContent='시험 저장 내보내기';backup.id='worldgen-export';
  backup.addEventListener('click',()=>{
    let raw;try{raw=localStorage.getItem(WORLDGEN_TEST_KEY);}catch(_){return;}
    if(!raw)return;
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='worldgen256-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });panel.append(backup);
  if(saveBlocked){const reason=document.createElement('span');reason.textContent=' 불러오기 실패: 저장 중지';panel.append(reason);}
  document.body.append(panel);
}
