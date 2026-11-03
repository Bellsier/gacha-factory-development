/* Review-only. No boot hooks, state/storage access, or production replacements.
 * Start from each style's own house, preserving the v2 hand-shaped texture. */
const G3House = Object.freeze({
  variants: ['existing', 'A', 'B', 'C'],
  sprite(variant, v2 = false) {
    if (!this.variants.includes(variant)) throw new Error('Unknown G3 house variant');
    const original = v2 ? tdHouseSpriteV2() : tdHouseSprite();
    if (variant === 'existing') return original;
    const r = tdRaster(original), old = r.px.map(p => p && p.slice());
    const mix = (x, y, c, t) => { const k=y*84+x; if(r.px[k]) r.px[k]=[...tdMix(r.px[k],tdParseColor(c),t).slice(0,3),r.px[k][3]]; };
    const rect = (x,y,w,h,c) => { for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)r.px[yy*84+xx]=tdParseColor(c); };
    // Low-frequency directional planes keep the original shingle/board texture.
    for(let y=8;y<35;y++) for(let x=4;x<80;x++) {
      const p=r.px[y*84+x]; if(!p || x>=57&&x<=67&&y<17) continue;
      if(x<39) mix(x,y,'#b5c58a',variant==='C'?.15:.09);
      if(x>53) mix(x,y,'#324b37',variant==='C'?.23:.13);
    }
    for(let y=41;y<65;y++)for(let x=12;x<72;x++) {
      if(x>65)mix(x,y,'#79583e',.16);
      else if(x<30)mix(x,y,'#f3dfb6',.08);
    }
    rect(12,40,19,1,'#9f7b51'); rect(53,40,19,1,'#8e6b47');
    rect(10,64,20,1,'#c3a075'); rect(54,64,18,1,'#b18c63');
    if(variant==='B') {
      // Small domestic porch furnishings; the approach remains open.
      rect(13,63,13,2,'#c69866');rect(14,65,2,4,'#775238');rect(23,65,2,4,'#775238');
      rect(15,62,9,1,'#e0ba83');
      [[28,64],[61,63]].forEach(([x,y])=>{
        rect(x,y,5,5,'#a06443');rect(x-1,y,7,1,'#d39764');rect(x+1,y+1,1,3,'#c88857');
        rect(x+2,y-4,1,4,'#4d7340');rect(x,y-3,3,2,'#698c4d');rect(x+3,y-2,2,2,'#527940');
      });
      // Warm lintel and window-box edges reflect existing interior light.
      rect(34,42,16,1,'#d5ae75');rect(14,58,13,1,'#b88c5a');rect(58,58,13,1,'#b88c5a');
    }
    if(variant==='C') {
      // G2's copper/wood/stone vocabulary, expressed as a modest residence.
      rect(58,5,8,1,'#aa805d');rect(58,12,8,1,'#986b4c');
      rect(11,43,1,17,'#c29a65');rect(73,43,1,17,'#866342');
      rect(12,61,17,2,'#a78053');rect(55,61,17,2,'#98734c');
      rect(14,61,13,1,'#c39a63');rect(57,61,13,1,'#b58d59');
      rect(68,63,4,5,'#6b7378');rect(68,63,4,1,'#a0a2a0');rect(69,65,1,1,'#b7ad8b');
    }
    // Literal protected pixels: door/frame, step, windows, lantern, shadow.
    [[34,43,16,25],[31,68,22,2],[15,45,11,11],[59,45,11,11],[54,46,6,7],[0,70,84,3]].forEach(([x,y,w,h])=>{
      for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)r.px[yy*84+xx]=old[yy*84+xx];
    });
    return tdUnraster(r);
  }
});
