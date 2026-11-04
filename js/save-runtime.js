// S2 adapter: browser startup only. Trial worlds keep their existing isolated
// localStorage path. Standalone codec consumers can still invoke legacy boot().
const S2Runtime = {
  started:false,engine:null,session:null,generation:0,transitioning:false,menuOpen:false,tail:Promise.resolve(),message:'저장 준비 중',lastTime:null,displayName:'선택한 마을 없음',legacyRaw:null,
  clearInput(){clearPlayerHeld();tickClockLast=null;tickClockOwed=0;document.getElementById('tdStick')?.dispatchEvent(new Event('pointercancel'));},
  canPlay(){return !!this.session&&!this.transitioning&&!this.menuOpen;},
  payload(run=state,perm=permanent){return {saveVersion:CURRENT_SAVE_VERSION,savedAt:Date.now(),run:JSON.parse(JSON.stringify(serializeRunForSave(run))),permanent:JSON.parse(JSON.stringify(perm))};},
  decode(payload){
    if(!isPlainObject(payload)||!Number.isFinite(payload.saveVersion)||payload.saveVersion<0||payload.saveVersion>CURRENT_SAVE_VERSION||!isPlainObject(payload.run))throw SaveEngine.error('INVALID_SAVE');
    if(payload.run.world?.size===256)throw SaveEngine.error('TRIAL_SAVE');
    const copy=migrateSave(JSON.parse(JSON.stringify(payload)));
    try{worldLoadingContext=worldContext(copy.run.world);if(worldLoadingContext)throw SaveEngine.error('TRIAL_SAVE');return {run:sanitizeRunState(copy.run),permanent:sanitizePermanent(copy.permanent)};}
    finally{worldLoadingContext=null;}
  },
  fresh(){return this.payload(freshRunState(),JSON.parse(this.initialPermanent));},
  enqueue(fn){const job=this.tail.then(fn);this.tail=job.catch(()=>{});return job;},
  fail(error){
    const labels={CANCELED:'이어하기를 취소했습니다.',OWNERSHIP:'다른 탭이 저장 권한을 가져갔습니다. 최신 저장으로 권한을 회복해 주세요.',OWNED:'다른 탭 또는 이전 세션이 소유 중입니다. 권한 인계를 선택해 주세요.',CONFLICT:'저장이 변경됐습니다. 목록을 새로 확인해 주세요.',INVALID_SAVE:'손상되었거나 지원하지 않는 저장입니다. 원본은 유지됩니다.',MISSING:'마을이 삭제됐습니다. 다른 마을을 선택해 주세요.',LEGACY_CHANGED:'기존 저장이 변경됐습니다. 다시 확인해 주세요.',UNAVAILABLE:'브라우저 저장소를 사용할 수 없습니다. 기존 저장은 유지됩니다.'};
    this.message=labels[error.code]||'저장 실패: 저장 공간 또는 브라우저 권한을 확인해 주세요. 이전 저장은 유지됩니다.';
    if(['OWNERSHIP','MISSING'].includes(error.code)){this.session=null;this.generation++;this.menuOpen=true;this.clearInput();}
    this.status();return false;
  },
  status(){
    const status=document.getElementById('s2Status');
    const time=this.lastTime!==null?new Date(this.lastTime).toLocaleString('ko-KR'):'아직 저장 없음';
    if(status)status.textContent='현재: '+this.displayName+' · 마지막 자동 저장: '+time+' · '+this.message;
    if(this.root){this.root.querySelector('[data-s2-message]').textContent=this.message;this.root.querySelector('[data-s2-current]').textContent='현재: '+this.displayName+' · 마지막 자동 저장: '+time;this.root.hidden=!this.menuOpen;}
    setSaveStatus(this.session?'자동 저장 '+time:'저장 대기 · '+this.message);
  },
  apply(s){
    if(this.root?.contains(document.activeElement))document.activeElement.blur();
    this.clearInput();
    const loaded=this.decode(s.snapshot.payload);
    state=loaded.run;permanent=loaded.permanent;
    this.session=s;this.generation++;this.lastTime=s.snapshot.savedAt;this.displayName=s.name;
    if(typeof villageEnsureSites==='function')villageEnsureSites();
    if(typeof VILLAGE_HOME_SCENE!=='undefined'){VILLAGE_HOME_SCENE.inside=false;VILLAGE_HOME_SCENE.pose='idle';}
    villageObstacleCache=null;villageRoadCache=null;WORLD_INDEX.built=null;
    if(typeof TD!=='undefined'){TD.groundKey=null;TD.tracker={};if(typeof tdWorkerSimReset==='function')tdWorkerSimReset();}
    tickClockLast=null;tickClockOwed=0;renderAll();
    this.message='저장됨';this.menuOpen=false;this.status();
    this.notify();
  },
  async flush(){if(this.session){const saved=await this.engine.save(this.session,this.payload());this.session=saved;this.lastTime=saved.snapshot.savedAt;this.message='자동 저장됨';this.status();}},
  autosave(){
    if(!this.started||!this.session||this.transitioning)return Promise.resolve(false);
    const generation=this.generation,payload=this.payload(),id=this.session.id;
    return this.enqueue(async()=>{
      if(generation!==this.generation||this.session?.id!==id)return false;
      try{const saved=await this.engine.save(this.session,payload);this.session=saved;this.lastTime=saved.snapshot.savedAt;this.message='자동 저장됨';this.status();return true;}
      catch(e){this.fail(e);return false;}
    });
  },
  transition(work){
    if(this.transitioning||!this.engine)return Promise.resolve(false);
    const generation=this.generation,source=this.session?.id||null;
    this.transitioning=true;this.clearInput();this.status();
    return this.enqueue(async()=>{
      try{if(generation!==this.generation||source!==(this.session?.id||null))throw SaveEngine.error('OWNERSHIP');await this.flush();const next=await work(this.session);if(next)this.apply(next);return true;}
      catch(e){this.fail(e);return false;}
      finally{this.transitioning=false;this.status();if(this.menuOpen)await this.renderMenu();}
    });
  },
  newVillage(name){return this.transition(current=>this.engine.create(this.fresh(),name||'새 마을',current));},
  async startPresence(){
    if(!navigator.locks)return;
    // Owner liveness is a document-lifetime lock, never a heartbeat timeout.
    await new Promise((resolve,reject)=>{
      this.presenceTask=navigator.locks.request(SAVE_BASE_KEY+'.s2.owner.'+this.engine.owner,async()=>{
        this.engine.presenceProtocol='web-lock-v1';resolve();
        await new Promise(release=>{this.releasePresence=release;});
      }).catch(reject);
    });
  },
  resume(id,takeover=false){return this.transition(async current=>{
    const candidate=await this.engine.read(id);this.decode(candidate.snapshot.payload);
    const claim=(force=false,recover=null)=>this.engine.claim(id,force,current,candidate,recover);
    if(takeover||!candidate.owner||candidate.owner===this.engine.owner)return claim(takeover);
    const confirmLive=()=>{
      if(!confirm('다른 탭이 사용 중이거나 권한 상태를 확인할 수 없습니다. 저장 권한을 인계하고 마지막 저장부터 이어 할까요? 저장되지 않은 진행은 가져오지 않습니다.'))throw SaveEngine.error('CANCELED');
      return claim(true);
    };
    if(candidate.presence==='web-lock-v1'&&navigator.locks){
      // Hold this old-owner lock through the fenced IDB claim (no check/use gap).
      return navigator.locks.request(SAVE_BASE_KEY+'.s2.owner.'+candidate.owner,{ifAvailable:true},lock=>lock?claim(false,candidate.owner):confirmLive());
    }
    return confirmLive();
  });},
  restore(row){return this.transition(async current=>{this.decode(row.snapshot.payload);return this.engine.restore(current,row.id,row.revision,row.snapshot.id);});},
  manual(slot,expected){
    if(!this.session||this.transitioning)return Promise.resolve(false);
    const gen=this.generation,payload=this.payload();
    return this.enqueue(async()=>{
      if(gen!==this.generation||!this.session)return false;
      try{await this.engine.manual(this.session,payload,slot,expected);this.message='수동 슬롯 '+slot+' 저장됨';this.notify();return true;}
      catch(e){return this.fail(e);}finally{this.status();if(this.menuOpen)await this.renderMenu();}
    });
  },
  async removeVillage(row){
    if(this.transitioning)return false;this.transitioning=true;this.clearInput();
    return this.enqueue(async()=>{
      try{
        // Deletion is explicit: do not autosave and change the confirmed revision first.
        await this.engine.removeVillage(row.id,row.revision,row.epoch);
        if(this.session?.id===row.id){this.session=null;this.generation++;this.displayName='선택한 마을 없음';this.lastTime=null;this.menuOpen=true;}
        this.message='마을과 자동 저장 삭제됨 · 수동 저장은 유지됨';this.notify();return true;
      }catch(e){return this.fail(e);}finally{this.transitioning=false;this.status();await this.renderMenu();}
    });
  },
  async removeManual(row){return this.enqueue(async()=>{try{await this.engine.removeManual(row.id,row.revision,row.snapshot.id);this.message='수동 슬롯 삭제됨 · 자동 저장은 유지됨';this.notify();}catch(e){this.fail(e);}this.status();await this.renderMenu();});},
  notify(){this.channel?.postMessage('changed');},
  async checkAuthority(){
    if(!this.session||this.transitioning)return;
    const s=this.session;
    try{if(!await this.engine.authority(s)&&this.session===s){this.fail(SaveEngine.error('OWNERSHIP'));await this.renderMenu();}}catch(e){this.fail(e);}
  },
  async importLegacy(){
    const raw=localStorage.getItem(SAVE_BASE_KEY);if(raw===null)return null;
    let original,decoded;
    try{original=JSON.parse(raw);decoded=this.decode(original);}catch(error){throw error.code?error:SaveEngine.error('INVALID_SAVE');}
    const payload=this.payload(decoded.run,decoded.permanent);payload.savedAt=Number.isFinite(original.savedAt)?original.savedAt:Date.now();
    const migrated=await this.engine.migrate(SAVE_BASE_KEY,raw,payload,()=>localStorage.getItem(SAVE_BASE_KEY)===raw);
    this.legacyRaw=raw;return migrated;
  },
  async start(){
    this.started=true;this.initialPermanent=JSON.stringify(permanent);this.mount();this.menuOpen=true;this.status();
    try{
      this.engine=await SaveEngine.open(SAVE_BASE_KEY);await this.startPresence();
      const history=await this.engine.history(SAVE_BASE_KEY),raw=localStorage.getItem(SAVE_BASE_KEY);
      let migrated=null;
      if(raw!==null&&!history.length)migrated=await this.importLegacy();
      else if(raw!==null&&!history.some(h=>h.raw===raw)){this.legacyRaw=raw;this.message='구버전에서 변경된 저장 발견 · 별도 마을로 가져올 수 있습니다.';}
      const list=await this.engine.list();
      if(migrated&&!migrated.deleted){const saved=await this.engine.read(migrated.id);this.decode(saved.snapshot.payload);this.apply(await this.engine.claim(migrated.id,false,null,saved));}
      else if(!list.villages.length&&!history.length&&raw===null){this.apply(await this.engine.create(this.fresh(),'첫 마을'));}
      else {this.message=this.message==='저장 준비 중'?'마을을 선택해 주세요. 이전 세션은 권한 회복으로 이어 할 수 있습니다.':this.message;await this.renderMenu();}
    }catch(e){this.fail(e);await this.renderMenu();}
    // Loading/verification precedes timers. All simulation paths consult canPlay().
    tickTimer=setInterval(()=>{if(this.canPlay())tickClockInterval();},TICK_MS);
    ticketTimer=setInterval(()=>{if(this.canPlay())ticketTrickle();},BALANCE.gacha.TICKET_TRICKLE_MS);
    autoSaveTimer=setInterval(()=>this.autosave(),10000);
    this.authorityTimer=setInterval(()=>this.checkAuthority(),2000);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.autosave();else this.checkAuthority();tickClockLast=null;});
    window.addEventListener('pagehide',()=>this.autosave());
    if(typeof BroadcastChannel!=='undefined'){this.channel=new BroadcastChannel(SAVE_BASE_KEY+'.s2');this.channel.onmessage=()=>{this.checkAuthority();if(this.menuOpen)this.renderMenu();};}
    this.status();
  },
  mount(){
    const button=document.createElement('button');button.id='s2Open';button.type='button';button.textContent='저장 · 마을';button.onclick=()=>{this.menuOpen=true;this.clearInput();this.renderMenu();this.status();this.root.querySelector('[data-s2-close]').focus();};document.body.appendChild(button);
    const status=document.createElement('div');status.id='s2Status';status.setAttribute('role','status');document.body.appendChild(status);
    const root=document.createElement('section');root.id='s2Menu';root.tabIndex=-1;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','저장과 마을 관리');root.innerHTML='<div class="s2-paper"><h2>저장과 마을</h2><p data-s2-current></p><p data-s2-message role="status"></p><button type="button" data-s2-recent disabled>최근 마을 이어하기</button><p data-s2-recent-label></p><button type="button" data-s2-close>플레이로 돌아가기</button><label>새 마을 이름 <input data-s2-name maxlength="40" value="새 마을"></label><button type="button" data-s2-new>새 마을 만들기</button><p>다른 마을과 수동 저장은 유지됩니다.</p><button type="button" data-s2-import>기존 저장을 별도 마을로 가져오기</button><details data-s2-auto-section open><summary><h3>자동 저장 · 마을별 1개</h3></summary><div data-s2-autos></div></details><details data-s2-manual-section open><summary><h3>수동 저장 · 전체 공용 5개</h3></summary><div data-s2-manuals></div></details></div>';document.body.appendChild(root);this.root=root;
    if(typeof matchMedia==='function'&&matchMedia('(max-width:600px)').matches)root.querySelector('[data-s2-manual-section]').open=false;
    root.querySelector('[data-s2-recent]').onclick=()=>{if(this.recentId)this.resume(this.recentId);};
    root.querySelector('[data-s2-close]').onclick=()=>{if(this.session){this.menuOpen=false;this.status();button.focus();}};
    root.querySelector('[data-s2-new]').onclick=()=>this.newVillage(root.querySelector('[data-s2-name]').value.trim()||'새 마을');
    root.querySelector('[data-s2-import]').onclick=()=>{
      if(this.transitioning||!this.engine||!confirm('기존 원문을 유지하고 별도 마을로 가져옵니다. 계속할까요?'))return;
      this.transition(async current=>{const item=await this.importLegacy();if(!item||item.deleted)throw SaveEngine.error('MISSING');const data=await this.engine.read(item.id);this.decode(data.snapshot.payload);return this.engine.claim(item.id,false,current,data);});
    };
    // Capture gates cover game keyboard/touch actions during modal/loading/ownership loss.
    for(const type of ['keydown','keyup','click','pointerdown','pointermove','pointerup'])document.addEventListener(type,e=>{
      if(this.canPlay())return;
      if(root.contains(e.target)||button.contains(e.target)){
        if(e.type==='keydown'&&e.key==='Escape'&&this.session){this.menuOpen=false;this.status();button.focus();e.preventDefault();}
        if(e.type==='keydown'&&e.key==='Tab'){
          const elements=[...root.querySelectorAll('button:not(:disabled),input,summary')].filter(x=>!x.hidden&&x.getClientRects().length),first=elements[0],last=elements.at(-1);
          if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
        }
        // Prevent letter shortcuts in the game from handling dialog keys.
        if(type==='keydown'||type==='keyup')e.stopImmediatePropagation();return;
      }
      e.preventDefault();e.stopImmediatePropagation();
    },true);
    
  },
  async renderMenu(){
    if(!this.root)return;this.status();
    const close=this.root.querySelector('[data-s2-close]');close.disabled=!this.session||this.transitioning;
    this.root.querySelector('[data-s2-new]').disabled=!this.engine||this.transitioning;
    this.root.querySelector('[data-s2-import]').disabled=!this.engine||this.transitioning;
    if(!this.engine){if(this.menuOpen)this.root.focus();return;}
    try{
      const data=await this.engine.list();this.recentId=data.recent;
      const recent=data.villages.find(v=>v.id===data.recent);
      this.root.querySelector('[data-s2-recent]').disabled=!recent||this.transitioning;
      this.root.querySelector('[data-s2-recent-label]').textContent=recent?'최근 플레이: '+recent.name:'최근 마을 없음';
      const stamp=n=>new Date(n).toLocaleString('ko-KR');
      const add=(host,text,buttons)=>{const row=document.createElement('div');row.className='s2-row';const label=document.createElement('p');label.textContent=text;row.appendChild(label);for(const [name,fn,disabled]of buttons){const b=document.createElement('button');b.type='button';b.textContent=name;b.disabled=!!disabled||this.transitioning;b.onclick=fn;row.appendChild(b);}host.appendChild(row);};
      const autos=this.root.querySelector('[data-s2-autos]');autos.textContent='';
      for(const v of data.villages){add(autos,(v.id===this.session?.id?'현재 플레이 · ':'')+(v.id===data.recent?'최근 마을 · ':'')+v.name+' · 자동 저장 '+stamp(v.savedAt)+(v.source?' · 복원 사본':''),[
        ['이어하기',()=>this.resume(v.id)],
        ['마을 삭제',()=>{if(confirm(v.name+'의 자동 저장을 삭제합니다. 저장하지 않은 진행은 사라지며 수동 저장은 유지됩니다.'))this.removeVillage(v);}]
      ]);}
      const manuals=this.root.querySelector('[data-s2-manuals]');manuals.textContent='';
      for(let n=1;n<=5;n++){const stored=data.manual.find(r=>r.id===n),row=stored?.snapshot?stored:null;add(manuals,'수동 슬롯 '+n+(row?' · '+row.snapshot.name+' · '+stamp(row.snapshot.savedAt):' · 비어 있음'),[
        [row?'이 슬롯 덮어쓰기':'여기에 저장',()=>{if(!row||confirm('슬롯 '+n+'의 '+row.snapshot.name+' ('+stamp(row.snapshot.savedAt)+')을 현재 마을 '+this.displayName+'으로 덮어쓸까요?'))this.manual(n,stored?.revision||0);},!this.session],
        ...(row?[
          ['사본으로 이어하기',()=>{if(confirm('새 마을 사본을 만듭니다. 원본 수동 저장과 기존 마을의 자동 저장은 유지됩니다.'))this.restore(row);} ],
          ['수동 저장 삭제',()=>{if(confirm('수동 슬롯 '+n+'을 비웁니다. 마을 자동 저장은 유지됩니다.'))this.removeManual(row);}]
        ]:[])
      ]);}
    }catch(e){this.fail(e);}
    if(this.menuOpen&&(!this.root.contains(document.activeElement)||document.activeElement.disabled))(this.root.querySelector('button:not(:disabled),input')||this.root).focus();
  }
};
