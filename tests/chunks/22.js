// G2 approved workshop: pure-art contracts, independent of a canvas/browser.
(function test_g2_approved_workshop_contracts() {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const root = path.resolve(__dirname, '..'), c = vm.createContext({window:{location:{search:''}}});
  ['js/topdown/sprites.js','js/topdown/style.js','docs/design/graphics-g2-workshop/final/baseline-sprite.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c));
  const result = vm.runInContext(`(() => {
    const before=tdRaster(tdBaseSpriteBeforeG2()), sp=tdBaseSprite(), after=tdRaster(sp);
    const same=(x,y,w,h)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)if(JSON.stringify(before.px[j*64+i])!==JSON.stringify(after.px[j*64+i]))return false;return true;};
    const lum=(x,y)=>{const p=after.px[y*64+x];return p?0.2126*p[0]+0.7152*p[1]+0.0722*p[2]:0;};
    const warm=(x,y)=>{const p=after.px[y*64+x];return p&&p[0]>240&&p[1]>170&&p[2]<200;};
    return {size:sp.w===64&&sp.h===58,bounds:sp.rects.every(([x,y,w,h])=>x>=0&&y>=0&&x+w<=64&&y+h<=58),
      door:same(25,32,14,20)&&same(23,52,18,2),windows:same(12,33,9,8)&&same(44,33,9,8),shadow:same(0,54,64,4),
      anvil:lum(10,44)>lum(13,45)+25&&lum(18,44)>lum(13,45)+25,
      metal:lum(44,44)>lum(44,49)+25&&lum(51,44)>lum(51,49)+25,
      lamp:[9,10].every(x=>[35,36].every(y=>warm(x,y))),
      classic:tdStyleName()==='classic',v2:(TD_STYLE_CACHE.name='v2',tdStyleFinish(sp,'building').w===64&&tdStyleFinish(sp,'building').h===58)};
  })()`,c);
  for(const [name,ok] of Object.entries(result))check('G2 final: '+name,ok);
})();
