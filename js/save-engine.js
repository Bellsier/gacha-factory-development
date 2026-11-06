// S2 persistence: no game globals, no localStorage access. Every mutation resolves
// only after IDBTransaction.complete; request success alone is never a save.
class SaveEngine {
  static error(code) { return Object.assign(new Error(code), {code}); }
  static id() { return crypto.randomUUID(); }
  static async open(namespace) {
    if(!globalThis.indexedDB) throw SaveEngine.error('UNAVAILABLE');
    const db = await new Promise((resolve,reject) => {
      const r=indexedDB.open(namespace+'.s2',1);
      r.onupgradeneeded=()=>{ for(const n of ['villages','autos','manual','migrations']) r.result.createObjectStore(n,{keyPath:'id'}); };
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
      r.onblocked=()=>reject(SaveEngine.error('DB_BLOCKED'));
    });
    const engine=new SaveEngine(db);
    db.onversionchange=()=>db.close();return engine;
  }
  constructor(db) { this.db=db;this.owner=SaveEngine.id(); }
  close() { this.db.close(); }
  async tx(names,write,work) {
    const tx=this.db.transaction(names,write?'readwrite':'readonly');
    const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||SaveEngine.error('ABORTED'));tx.onerror=()=>{};});
    // Attach rejection handling immediately, including when a request rejects first.
    done.catch(()=>{});
    const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const api={get:(n,k)=>req(tx.objectStore(n).get(k)),all:n=>req(tx.objectStore(n).getAll()),put:(n,v)=>req(tx.objectStore(n).put(v)),add:(n,v)=>req(tx.objectStore(n).add(v)),del:(n,k)=>req(tx.objectStore(n).delete(k))};
    try { const value=await work(api);await done;return value; }
    catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
  }
  payload(p) {
    if(!p||p.saveVersion!==1||!Number.isFinite(p.savedAt)||!p.run||typeof p.run!=='object'||Array.isArray(p.run)||!p.permanent||typeof p.permanent!=='object'||Array.isArray(p.permanent)) throw SaveEngine.error('INVALID_SAVE');
    return structuredClone(p);
  }
  snapshot(p,id,name) { return {format:1,id:SaveEngine.id(),villageId:id,name,savedAt:p.savedAt,payload:this.payload(p)}; }
  valid(row) {
    if(!row||!Number.isSafeInteger(row.revision)||row.revision<1||row.snapshot?.format!==1) throw SaveEngine.error('INVALID_SAVE');
    this.payload(row.snapshot.payload);return row;
  }
  async guard(t,s) {
    if(!s) return null;
    const v=await t.get('villages',s.id);if(!v)throw SaveEngine.error('MISSING');
    if(v.owner!==this.owner||v.epoch!==s.epoch)throw SaveEngine.error('OWNERSHIP');
    if(v.revision!==s.revision)throw SaveEngine.error('CONFLICT');
    this.session(v,await t.get('autos',v.id));return v;
  }
  session(v,a) { this.valid(a);if(a.id!==v.id||a.snapshot.villageId!==v.id||a.revision!==v.revision)throw SaveEngine.error('INVALID_SAVE');return {id:v.id,epoch:v.epoch,revision:v.revision,name:v.name,owner:v.owner,presence:v.presence||null,snapshot:a.snapshot}; }
  async release(t,v) { if(v){v.owner=null;v.epoch++;await t.put('villages',v);} }
  async insert(t,p,name,source,owned=true) {
    const id=SaveEngine.id(),snapshot=this.snapshot(p,id,name);
    const v={id,name,createdAt:Date.now(),savedAt:p.savedAt,revision:1,epoch:owned?1:0,owner:owned?this.owner:null,presence:owned?this.presenceProtocol||null:null,source:source||null};
    // add, never put: an ID collision must not overwrite an existing village.
    await t.add('villages',v);const a={id,revision:1,snapshot};await t.add('autos',a);return this.session(v,a);
  }
  async recent(t,id){await t.put('migrations',{id:'s2:recent',kind:'preference',villageId:id,playedAt:Date.now()});}
  async create(p,name,current=null) {
    this.payload(p);return this.tx(['villages','autos','migrations'],true,async t=>{
      const old=await this.guard(t,current);const s=await this.insert(t,p,name);await this.release(t,old);await this.recent(t,s.id);return s;
    });
  }
  async read(id) {return this.tx(['villages','autos'],false,async t=>{const v=await t.get('villages',id);if(!v)throw SaveEngine.error('MISSING');return this.session(v,await t.get('autos',id));});}
  async list() {return this.tx(['villages','manual','migrations'],false,async t=>{const villages=await t.all('villages'),recent=await t.get('migrations','s2:recent');return {villages,manual:await t.all('manual'),recent:villages.some(v=>v.id===recent?.villageId)?recent.villageId:null};});}
  async claim(id,takeover=false,current=null,expected=null,recoveryOwner=null) {
    return this.tx(['villages','autos','migrations'],true,async t=>{
      const old=await this.guard(t,current),v=await t.get('villages',id);
      if(!v)throw SaveEngine.error('MISSING');
      const recovered=recoveryOwner&&v.owner===recoveryOwner&&v.epoch===expected?.epoch&&v.presence==='web-lock-v1';
      if(recoveryOwner&&!recovered)throw SaveEngine.error('CONFLICT');
      if(v.owner&&v.owner!==this.owner&&!takeover&&!recovered)throw SaveEngine.error('OWNED');
      const a=await t.get('autos',id);this.session(v,a);
      if(expected&&(a.revision!==expected.revision||a.snapshot.id!==expected.snapshot.id))throw SaveEngine.error('CONFLICT');
      if(old&&old.id!==id)await this.release(t,old);
      v.owner=this.owner;v.presence=this.presenceProtocol||null;v.epoch++;await t.put('villages',v);await this.recent(t,v.id);return this.session(v,a);
    });
  }
  async authority(s) {return this.tx(['villages'],false,async t=>{const v=await t.get('villages',s.id);return !!v&&v.owner===this.owner&&v.epoch===s.epoch;});}
  async save(s,p) {
    this.payload(p);return this.tx(['villages','autos'],true,async t=>{
      const v=await this.guard(t,s);v.revision++;v.savedAt=p.savedAt;
      const a={id:v.id,revision:v.revision,snapshot:this.snapshot(p,v.id,v.name)};
      await t.put('autos',a);await t.put('villages',v);return this.session(v,a);
    });
  }
  slot(n){if(!Number.isInteger(n)||n<1||n>5)throw SaveEngine.error('SLOT');}
  async manual(s,p,n,expected) {
    this.slot(n);this.payload(p);return this.tx(['villages','autos','manual'],true,async t=>{
      const v=await this.guard(t,s);if(!v)throw SaveEngine.error('OWNERSHIP');
      const old=await t.get('manual',n);if((old?.revision||0)!==expected)throw SaveEngine.error('CONFLICT');
      if(old?.snapshot)this.valid(old);
      const row={id:n,revision:expected+1,snapshot:this.snapshot(p,v.id,v.name)};await t.put('manual',row);return row;
    });
  }
  async restore(current,n,expected,snapshotId) {
    this.slot(n);return this.tx(['villages','autos','manual','migrations'],true,async t=>{
      const old=await this.guard(t,current),row=await t.get('manual',n);this.valid(row);
      if(row.revision!==expected||row.snapshot.id!==snapshotId)throw SaveEngine.error('CONFLICT');
      const p=this.payload(row.snapshot.payload);p.savedAt=Date.now();
      const s=await this.insert(t,p,row.snapshot.name+' · 복원 사본',{villageId:row.snapshot.villageId,snapshotId,slot:n});
      await this.release(t,old);await this.recent(t,s.id);return s;
    });
  }
  async removeVillage(id,revision,epoch) {
    return this.tx(['villages','autos'],true,async t=>{
      const v=await t.get('villages',id);if(!v)throw SaveEngine.error('MISSING');
      if(v.revision!==revision||v.epoch!==epoch)throw SaveEngine.error('CONFLICT');
      if(v.owner&&v.owner!==this.owner)throw SaveEngine.error('OWNED');
      await t.del('autos',id);await t.del('villages',id);
    });
  }
  async removeManual(n,revision,snapshotId) {
    this.slot(n);return this.tx(['manual'],true,async t=>{
      const row=await t.get('manual',n);this.valid(row);
      if(row.revision!==revision||row.snapshot.id!==snapshotId)throw SaveEngine.error('CONFLICT');await t.put('manual',{id:n,revision:row.revision+1,snapshot:null});
    });
  }
  async history(key) { return this.tx(['migrations'],false,async t=>(await t.all('migrations')).filter(m=>m.key===key)); }
  async migrate(key,raw,p,unchanged=()=>true) {
    this.payload(p);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
    return this.tx(['migrations','villages','autos'],true,async t=>{
      if(!unchanged())throw SaveEngine.error('LEGACY_CHANGED');
      const id=key+':'+hash,prev=await t.get('migrations',id);
      if(prev){if(prev.raw!==raw)throw SaveEngine.error('HASH_COLLISION');return {id:prev.villageId,deleted:!(await t.get('villages',prev.villageId))};}
      const s=await this.insert(t,p,'이전한 마을',null,false);
      await t.add('migrations',{id,key,raw,villageId:s.id,migratedAt:Date.now()});return {id:s.id,deleted:false};
    });
  }
}
