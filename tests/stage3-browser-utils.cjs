const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
async function start(root=path.resolve(__dirname,'..')){
 const server=http.createServer((req,res)=>{let p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(p===root)p=path.join(root,'index.html');if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const b=fs.readFileSync(p);res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(b);}catch(_){res.writeHead(404).end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const executablePath=process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
 return {browser,url:'http://127.0.0.1:'+server.address().port,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
module.exports={start};
