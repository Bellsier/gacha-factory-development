const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
function open(mode=true,entries={}){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const dom=new JSDOM(html,{url:'https://example.test/'+(mode?'?worldgen=256':''),runScripts:'outside-only'}),w=dom.window;
 const data=new Map(Object.entries(entries));
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}});
 w.setInterval=()=>0;w.clearInterval=()=>{};w.requestAnimationFrame=()=>0;w.alert=()=>{};w.confirm=()=>true;
 w.HTMLCanvasElement.prototype.getContext=()=>null;
 const files=[...html.matchAll(/<script src="([^\"]+)"/g)].map(m=>m[1]);
 w.eval(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\n;window.getState=()=>state;window.getTD=()=>TD;window.isBlocked=()=>saveBlocked;');
 return {w,data,close:()=>dom.window.close()};
}
module.exports={open};
