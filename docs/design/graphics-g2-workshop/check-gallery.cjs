'use strict';
const {chromium}=require('playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const http=require('node:http');
const server=http.createServer((req,res)=>{const name=path.basename(new URL(req.url,'http://localhost').pathname); const file=name.endsWith('.png')||name.endsWith('.json')?path.join(__dirname,'screenshots',name):path.join(__dirname,name);fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':name.endsWith('.html')?'text/html':name.endsWith('.png')?'image/png':'text/plain'});res.end(e?'Not found':data);});});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const b=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
  const results=[];
  try {for(const width of [1280,390]){
    const page=await b.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new Error('Gallery must not access storage');}});});
    await page.goto(`http://127.0.0.1:${server.address().port}/G2-workshop-compare.html`);
    for(const style of ['classic','v2']) for(const device of ['pc','mobile']) for(const light of (device==='pc'?['day','dusk']:['day'])){
      await page.selectOption('#style',style);await page.selectOption('#device',device);await page.selectOption('#light',light);
      await page.locator('#scenes').scrollIntoViewIfNeeded();
      await page.evaluate(async()=>{for(const img of document.images){img.loading='eager';await img.decode();}});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
      assert.equal(await page.locator('#scenes img').count(),4);
      results.push({width,style,device,light,imagesLoaded:true,overflow:false});
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  fs.writeFileSync(path.join(__dirname,'screenshots/gallery-verification.json'),JSON.stringify(results,null,2)+'\n');
  console.log(`${results.length} gallery cases passed, storage getters throw on access`);
  }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
