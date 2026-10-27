// ---------------------------------------------------------------------------
// Task 105: the game's own pixel art. Every sprite is a list of pixel
// rectangles [x, y, w, h, colour] painted by the functions below (no image
// files, no borrowed art), so it is testable without a canvas and travels in
// the single-HTML build. tdSpriteImage() bakes a sprite into a small canvas
// once; the renderer scales it by an integer zoom with smoothing off.
// ---------------------------------------------------------------------------
const TD_RES_COLORS = {
  iron: ['#b8704f', '#e09a72'], coal: ['#2c3034', '#4d545a'], mana: ['#8a5cd6', '#c4a2ff'], crystal: ['#4fc4dc', '#bff3ff'],
  rareMetal: ['#b9c3cc', '#f1f5f8'], relic: ['#c9a24a', '#f2d68c'], cosmicShard: ['#e06fa8', '#ffc0df'], plasma: ['#ff4fcf', '#ffd0f4'],
};

// Collects rectangles; mirrored horizontally when asked.
function tdPainter(w, h){
  const rects = [];
  const P = (x, y, rw, rh, c) => { if(rw > 0 && rh > 0) rects.push([x, y, rw, rh, c]); };
  P.disc = (cx, cy, r, c) => { for(let y = -r; y <= r; y++){ const hw = Math.floor(Math.sqrt(r * r - y * y + r * 0.6)); P(cx - hw, cy + y, hw * 2 + 1, 1, c); } };
  P.done = (mirror) => ({ w, h, rects: mirror ? rects.map(([x, y, rw, rh, c]) => [w - x - rw, y, rw, rh, c]) : rects });
  return P;
}

// --- the player: the blue-haired northern miner (the approved character sheet,
// 2026-10-18). Cobalt hair, a soft gender-neutral face, a brown winter parka
// with a cream fur collar and hem, teal pattern trim, a small backpack with a
// bedroll, grey trousers and ochre fur-cuffed boots; a little lantern hangs at
// the hip (the light the game's headlamp glow comes from). 16 x 22 like the
// sprite it replaces, feet at the bottom centre, so the size against the tiles
// and every collision and light offset stay the same. Left is the mirror of right.
const TD_PLAYER_COLORS = {
  hair: '#3d5c9e', hairDark: '#2a4176', hairLight: '#6487cc',
  skin: '#f3d2b4', skinShade: '#dfb293', eye: '#4a3326', eyeLight: '#8a5c40', blush: '#eaa598', mouth: '#d99a86',
  parka: '#a8774a', parkaDark: '#7c5333', parkaLight: '#c4935e', fur: '#f2e4ca', furShade: '#d6c1a0',
  trim: '#4d8ca3', leather: '#6b4128', buckle: '#d8a84a', glove: '#5a3a26',
  pants: '#6c7076', pantsDark: '#55595e', boot: '#bf8a4c', bootDark: '#8c5f30',
  pack: '#8a5a36', packDark: '#6b4128', roll: '#8d9096', rollDark: '#6f7277',
  lamp: '#fff3b0', lampFrame: '#4a3626',
};
function tdPlayerSprite(dir, frame){
  const C = TD_PLAYER_COLORS;
  const P = tdPainter(16, 22);
  const b = (frame === 1 || frame === 3) ? 1 : 0;       // the body sinks a pixel on each step
  const s = frame === 1 ? 1 : frame === 3 ? -1 : 0;     // which leg swings forward
  const side = dir === 'left' || dir === 'right';
  P(3, 20, 10, 2, 'rgba(0,0,0,0.25)'); // shadow
  // a boot with its fur cuff: x, top row, and how many rows of leg show above it
  const boot = (x, y, w) => { P(x, y, w, 1, C.furShade); P(x, y + 1, w, 2, C.boot); P(x, y + 2, w, 1, C.bootDark); };
  if(side){
    // legs scissor: the near leg forward on one step, back on the other (drawn facing right)
    // the back foot lifts a pixel as it swings; both stand on the same ground line as the front view
    const back = s === 0 ? 0 : 1;
    P(6 - s, 16, 2, 2 - back, C.pantsDark); boot(5 - s, 18 - back, 3);
    P(8 + s, 16, 2, 2, C.pants); boot(8 + s, 18, 3);
  } else {
    // front and back: the stepping foot lifts a pixel
    const l = Math.max(0, s), r = Math.max(0, -s);
    P(5, 16, 2, 1, C.pants); boot(4, 18 - l, 3);
    P(9, 16, 2, 1, C.pants); boot(9, 18 - r, 3);
    P(5, 17 - l, 2, 1, C.pantsDark); P(9, 17 - r, 2, 1, C.pantsDark);
  }
  if(dir === 'down'){
    // parka body with a diagonal strap, a belt and the teal pattern above the fur hem
    P(4, 10 + b, 8, 5, C.parka); P(4, 10 + b, 1, 5, C.parkaDark); P(11, 10 + b, 1, 5, C.parkaDark);
    for(let k = 0; k < 3; k++) P(5 + k, 11 + b + k, 1, 1, C.leather);
    P(4, 13 + b, 8, 1, C.leather); P(7, 13 + b, 2, 1, C.buckle);
    P(5, 14 + b, 1, 1, C.trim); P(7, 14 + b, 2, 1, C.trim); P(10, 14 + b, 1, 1, C.trim);
    P(3, 15 + b, 10, 1, C.fur); P(4, 15 + b, 1, 1, C.furShade); P(8, 15 + b, 1, 1, C.furShade); P(11, 15 + b, 1, 1, C.furShade);
    // sleeves swing opposite to the legs; gloves; the lantern in the right hand (viewer's left)
    const la = Math.max(0, -s), ra = Math.max(0, s);
    P(2, 10 + b + la, 2, 4, C.parkaLight); P(2, 10 + b + la, 1, 4, C.parkaDark); P(2, 14 + b + la, 2, 1, C.glove);
    P(12, 10 + b + ra, 2, 4, C.parkaLight); P(13, 10 + b + ra, 1, 4, C.parkaDark); P(12, 14 + b + ra, 2, 1, C.glove);
    P(2, 15 + b + la, 2, 1, C.lampFrame); P(2, 16 + b + la, 2, 2, C.lamp); P(2, 18 + b + la, 2, 1, C.lampFrame);
    // the big fur collar round the chin
    P(3, 9 + b, 10, 2, C.fur); P(2, 10 + b, 1, 1, C.fur); P(13, 10 + b, 1, 1, C.fur); P(4, 10 + b, 8, 1, C.furShade);
    // face: soft round cheeks, brown eyes with a light, a little blush
    P(4, 4 + b, 8, 5, C.skin); P(5, 8 + b, 6, 1, C.skinShade);
    P(5, 6 + b, 1, 2, C.eye); P(10, 6 + b, 1, 2, C.eye); P(5, 6 + b, 1, 1, C.eyeLight); P(10, 6 + b, 1, 1, C.eyeLight);
    P(4, 8 + b, 1, 1, C.blush); P(11, 8 + b, 1, 1, C.blush); P(7, 8 + b, 2, 1, C.mouth);
    // cobalt hair: a messy crown, spiky bangs and side locks to the collar
    P(4, 1 + b, 8, 1, C.hair); P(3, 2 + b, 10, 2, C.hair); P(5, 0 + b, 1, 1, C.hair); P(8, 0 + b, 2, 1, C.hair); P(11, 1 + b, 1, 1, C.hairDark);
    P(4, 4 + b, 8, 1, C.hair); P(4, 5 + b, 1, 1, C.hair); P(6, 5 + b, 2, 1, C.hair); P(9, 5 + b, 1, 1, C.hair); P(11, 5 + b, 1, 1, C.hair);
    P(3, 4 + b, 1, 5, C.hair); P(12, 4 + b, 1, 5, C.hair); P(3, 7 + b, 1, 2, C.hairDark); P(12, 7 + b, 1, 2, C.hairDark);
    P(5, 2 + b, 3, 1, C.hairLight); P(9, 1 + b, 1, 1, C.hairLight); P(4, 3 + b, 1, 1, C.hairDark); P(10, 3 + b, 2, 1, C.hairDark);
  } else if(dir === 'up'){
    // from behind: the backpack with its bedroll fills the back of the parka
    P(4, 10 + b, 8, 5, C.parka); P(3, 15 + b, 10, 1, C.fur); P(5, 15 + b, 1, 1, C.furShade); P(10, 15 + b, 1, 1, C.furShade);
    const la = Math.max(0, s), ra = Math.max(0, -s);
    P(2, 10 + b + la, 2, 4, C.parkaLight); P(2, 10 + b + la, 1, 4, C.parkaDark); P(2, 14 + b + la, 2, 1, C.glove);
    P(12, 10 + b + ra, 2, 4, C.parkaLight); P(13, 10 + b + ra, 1, 4, C.parkaDark); P(12, 14 + b + ra, 2, 1, C.glove);
    P(4, 11 + b, 8, 5, C.pack); P(4, 15 + b, 8, 1, C.packDark); P(5, 12 + b, 2, 2, C.packDark); P(9, 12 + b, 2, 2, C.packDark); P(7, 11 + b, 2, 4, C.leather);
    P(3, 9 + b, 10, 2, C.fur); P(4, 10 + b, 8, 1, C.furShade);
    P(4, 10 + b, 8, 2, C.roll); P(4, 11 + b, 8, 1, C.rollDark); P(6, 10 + b, 1, 2, C.leather); P(9, 10 + b, 1, 2, C.leather);
    // the back of the head: all hair, a few spikes and a darker nape
    P(4, 1 + b, 8, 1, C.hair); P(3, 2 + b, 10, 7, C.hair); P(5, 0 + b, 1, 1, C.hair); P(8, 0 + b, 2, 1, C.hair);
    P(4, 8 + b, 8, 1, C.hairDark); P(3, 6 + b, 1, 3, C.hairDark); P(12, 6 + b, 1, 3, C.hairDark);
    P(5, 2 + b, 3, 1, C.hairLight); P(9, 3 + b, 2, 1, C.hairLight); P(6, 5 + b, 1, 2, C.hairDark); P(9, 6 + b, 1, 2, C.hairDark);
  } else {
    // facing right: the backpack and bedroll behind, the parka, one arm swinging with the lantern
    P(2, 10 + b, 4, 6, C.pack); P(2, 10 + b, 1, 6, C.packDark); P(2, 15 + b, 4, 1, C.packDark); P(3, 12 + b, 2, 2, C.packDark);
    P(2, 8 + b, 4, 2, C.roll); P(2, 9 + b, 4, 1, C.rollDark);
    P(5, 10 + b, 7, 5, C.parka); P(11, 10 + b, 1, 5, C.parkaDark); P(5, 13 + b, 7, 1, C.leather); P(10, 13 + b, 1, 1, C.buckle);
    P(7, 14 + b, 1, 1, C.trim); P(9, 14 + b, 1, 1, C.trim);
    P(4, 15 + b, 9, 1, C.fur); P(6, 15 + b, 1, 1, C.furShade); P(10, 15 + b, 1, 1, C.furShade);
    P(5, 10 + b, 1, 4, C.leather); // the pack strap over the shoulder
    // the lantern hangs from the belt at the front of the hip, above the legs
    P(11, 12 + b, 2, 1, C.lampFrame); P(11, 13 + b, 2, 2, C.lamp); P(11, 15 + b, 2, 1, C.lampFrame);
    // the near arm swings forward and back
    const ax = 8 + s;
    P(ax, 10 + b, 2, 4, C.parkaLight); P(ax, 13 + b, 2, 1, C.parkaDark); P(ax, 14 + b, 2, 1, C.glove);
    // the fur collar
    P(4, 9 + b, 8, 2, C.fur); P(5, 10 + b, 6, 1, C.furShade);
    // face in profile: cheek, one eye, a hint of nose
    P(7, 4 + b, 5, 5, C.skin); P(8, 8 + b, 4, 1, C.skinShade); P(12, 6 + b, 1, 2, C.skin);
    P(10, 6 + b, 1, 2, C.eye); P(10, 6 + b, 1, 1, C.eyeLight); P(10, 8 + b, 1, 1, C.blush);
    // hair: crown, bangs over the brow, the back of the head and a lock by the ear
    P(4, 1 + b, 8, 1, C.hair); P(3, 2 + b, 10, 2, C.hair); P(6, 0 + b, 1, 1, C.hair); P(9, 0 + b, 2, 1, C.hair);
    P(3, 4 + b, 5, 5, C.hair); P(8, 4 + b, 5, 1, C.hair); P(9, 5 + b, 1, 1, C.hair); P(11, 5 + b, 2, 1, C.hair);
    P(3, 7 + b, 2, 2, C.hairDark); P(7, 5 + b, 1, 3, C.hairDark); P(12, 2 + b, 1, 2, C.hairDark);
    P(5, 2 + b, 3, 1, C.hairLight); P(4, 4 + b, 2, 1, C.hairLight);
  }
  return P.done(dir === 'left');
}

// --- a vein in the ground: a boulder with ore. 24 x 20, base at the bottom centre.
function tdOreSprite(resource, kind){
  const P = tdPainter(24, 20);
  const undiscovered = kind === 'undiscovered';
  const rock = undiscovered ? ['#6a6660', '#55514c', '#827d76'] : ['#7b766f', '#5e5a55', '#9a948c'];
  P(3, 17, 18, 3, 'rgba(0,0,0,0.25)');
  P.disc(12, 11, 8, rock[0]);
  P(5, 14, 14, 4, rock[1]); P(7, 17, 10, 1, rock[1]);
  P(7, 5, 6, 2, rock[2]); P(6, 7, 3, 2, rock[2]);
  if(undiscovered){
    P(14, 8, 4, 2, '#5f7d4e'); P(15, 7, 2, 1, '#6f8f5c'); // moss
    P(9, 10, 3, 1, rock[1]); P(13, 13, 3, 1, rock[1]);
  } else {
    const [c, hi] = TD_RES_COLORS[resource] || ['#aaa', '#fff'];
    [[8, 9], [13, 7], [15, 11], [10, 13], [6, 11]].forEach(([x, y], k) => { P(x, y, 2, 2, c); if(k % 2 === 0) P(x, y, 1, 1, hi); });
    P(12, 10, 3, 2, c); P(12, 10, 1, 1, hi);
  }
  if(kind === 'secured'){
    P(19, 6, 1, 12, '#8a6440'); P(20, 6, 4, 3, '#3fc9b0'); P(20, 9, 2, 1, '#2f9c88'); // a staked flag
  }
  return P.done(false);
}

// --- building parts shared by the cabin, the craft huts and the village facilities.
// Doors are sized to the player (21 px, hair to boots): the cabin's about 1x, the
// huts' and facilities' about 0.75x, the house's 1.2x (Task 119). Warm glass and
// forge colours are the ones the v2 finish keeps bright (style.js TD_FINISH_GLOW).
const TD_BUILDING = {
  doorFrame: '#4a3626', door: '#6a4a30', doorDark: '#553a26', doorLight: '#7f5a3a', strap: '#4b4440', handle: '#e2b23c',
  step: '#b4aaa0', stepTop: '#cfc6bc', glass: '#f3d27a', glassTop: '#f7e2a0', forge: '#f0a050', forgeHot: '#ffe08a',
};
// A sloped roof of shingle courses: `rows` rows from `y`, the ridge `w` wide at `x0`,
// widening by `spread` px a side to the eaves. Each course: a lit top row, a mid row
// with staggered tab joints, a dark lower edge.
function tdRoof(P, x0, y, w, rows, spread, light, mid, dark){
  for(let k = 0; k < rows; k++){
    const o = Math.floor(k * spread / Math.max(1, rows - 1)), x = x0 - o, rw = w + 2 * o, c = k % 3;
    P(x, y + k, rw, 1, c === 0 ? light : c === 1 ? mid : dark);
    if(c === 1) for(let tx = x + 2 + (Math.floor(k / 3) % 2) * 3; tx < x + rw - 1; tx += 6) P(tx, y + k, 1, 1, dark);
  }
}
// Horizontal boards: seams every 3 rows, staggered board ends.
function tdPlanks(P, x, y, w, h, base, seam){
  P(x, y, w, h, base);
  for(let r = 0; r * 3 < h; r++){
    if(r * 3 + 2 < h) P(x, y + r * 3 + 2, w, 1, seam);
    for(let bx = x + 4 + (r % 2) * 7; bx < x + w - 1; bx += 14) P(bx, y + r * 3, 1, Math.min(2, h - r * 3), seam);
  }
}
// Stone courses: mortar behind, blocks two rows high in a running bond, lit along their top.
function tdStones(P, x, y, w, h, mortar, stone, light){
  P(x, y, w, h, mortar);
  for(let r = 0; r * 3 < h; r++){
    const rows = Math.min(2, h - r * 3);
    for(let bx = x - (r % 2) * 3; bx < x + w; bx += 6){
      const x0 = Math.max(x, bx), x1 = Math.min(x + w, bx + 5);
      P(x0, y + r * 3, x1 - x0, rows, stone); P(x0, y + r * 3, x1 - x0, 1, light);
    }
  }
}
// A plank door in its frame; `arch` rounds the top corners. (x, y) the frame's top left.
function tdDoor(P, x, y, w, h, arch){
  const B = TD_BUILDING;
  for(let r = 0; r < h; r++){ const inset = arch ? (r === 0 ? 2 : r === 1 ? 1 : 0) : 0; P(x + inset, y + r, w - 2 * inset, 1, B.doorFrame); }
  for(let r = 1; r < h; r++){ const inset = arch ? (r === 1 ? 2 : r === 2 ? 1 : 0) : 0; P(x + 1 + inset, y + r, w - 2 - 2 * inset, 1, B.door); }
  P(x + 1, y + 2, 1, h - 2, B.doorLight);
  for(let px = x + 3; px < x + w - 2; px += 3) P(px, y + 2, 1, h - 2, B.doorDark);
}
// A window: frame, warm glass lit at the top, an optional mullion cross and a sill.
function tdWindow(P, x, y, w, h, cross, sill){
  const B = TD_BUILDING;
  P(x, y, w, h, '#5a3b28'); P(x + 1, y + 1, w - 2, h - 2, B.glass); P(x + 1, y + 1, w - 2, 1, B.glassTop);
  if(cross){ P(x + Math.floor(w / 2), y + 1, 1, h - 2, '#5a3b28'); P(x + 1, y + Math.floor(h / 2), w - 2, 1, '#5a3b28'); }
  if(sill) P(x - 1, y + h, w + 2, 1, sill);
}

// --- the workshop (공방): the miners' cabin, 64 x 58; the door is at the bottom centre
// (ground row 54). Red shingle roof with the pickaxe-and-gem sign in its gable, plank
// walls on a stone footing, a door the player's height, an ore crate and a pickaxe.
// The windows stay where their lights are (render: base x -0.24 / +0.26, y -0.3).
function tdBaseSprite(){
  const P = tdPainter(64, 58), B = TD_BUILDING;
  P(4, 54, 56, 4, 'rgba(0,0,0,0.22)');
  // walls: boards over a stone footing, corner posts and the beam under the eaves
  tdPlanks(P, 6, 27, 52, 23, '#b08a5a', '#97734a');
  tdStones(P, 6, 50, 52, 4, '#6c645b', '#9a9086', '#b4aaa0');
  P(6, 27, 2, 23, '#8a6440'); P(6, 27, 1, 23, '#a07a50'); P(56, 27, 2, 23, '#8a6440'); P(57, 27, 1, 23, '#6f5034');
  P(6, 27, 52, 2, '#8a6440'); P(6, 29, 52, 1, '#6f5034');
  // roof, the eaves' edge and the shade under it
  tdRoof(P, 11, 5, 42, 21, 8, '#b05a46', '#9a4a3a', '#7a3a2e');
  P(2, 25, 60, 2, '#6a3026'); P(8, 30, 48, 1, 'rgba(60,30,20,0.18)');
  // the gable sign: a pickaxe and a gem
  P(24, 12, 16, 8, '#5a3b28'); P(25, 13, 14, 6, '#c9a26a'); P(25, 13, 14, 1, '#e0bf86');
  P(27, 14, 6, 1, '#5d5d63'); P(27, 15, 1, 1, '#5d5d63'); P(32, 15, 1, 1, '#5d5d63'); P(30, 15, 1, 3, '#7a5236');
  P(35, 15, 2, 2, '#4fc4dc'); P(35, 15, 1, 1, '#bff3ff');
  // chimney: bricks, a lit side and a cap
  P(44, 1, 7, 11, '#7a6a5e'); P(44, 1, 2, 11, '#958576'); for(let y = 3; y < 12; y += 3) P(44, y, 7, 1, '#5f544b');
  P(43, 0, 9, 2, '#a59585');
  // windows with their sills
  tdWindow(P, 11, 32, 11, 11, true, '#a07a50'); tdWindow(P, 43, 32, 11, 11, true, '#a07a50');
  // the door, its iron straps and handle, the step
  tdDoor(P, 25, 32, 14, 20, false);
  P(26, 37, 12, 1, B.strap); P(26, 46, 12, 1, B.strap); P(35, 41, 2, 2, B.handle);
  P(23, 52, 18, 2, B.step); P(23, 52, 18, 1, B.stepTop);
  // a pickaxe leaning by the door and a crate of ore by the wall
  P(19, 40, 6, 1, '#77777e'); P(19, 41, 1, 1, '#5d5d63'); P(24, 41, 1, 1, '#5d5d63'); P(22, 41, 1, 12, '#8a6440');
  P(49, 46, 8, 8, '#9a7446'); P(49, 46, 8, 1, '#b8915c'); P(49, 50, 8, 1, '#7a5a36'); P(52, 46, 1, 8, '#7a5a36');
  P(50, 45, 2, 1, '#b8704f'); P(53, 44, 2, 2, '#2c3034'); P(55, 45, 1, 1, '#e09a72');
  return P.done(false);
}

// --- a craft workshop (제작소) by tier 1-3 (Task 79 look tiers), 44 x 40, ground row 37.
// The same walls and door (so the same collision box), growing with the tier:
//   1 a plank smithy: brown shingles, a stone stack, one forge window, an anvil on a stump, logs
//   2 half stone walls, moss-green roof, a taller brick chimney, a second window, a lantern,
//     iron straps on the door, a crate of ingots
//   3 stone masonry, a slate-plum roof with a gold ridge and emblem, a forge fire in the
//     chimney, an arched door and window, a banner, a glowing ingot on the anvil
// The roof rises a little each tier (ridge row 6 / 4 / 2). The forge window stays where its
// light is (render: w.x - 0.17, w.y - 0.2).
const TD_WORKSHOP_TIERS = {
  1: { ridge: 6, roof: ['#8a7048', '#6e5a3a', '#58482e'], eave: '#4a3b26' },
  2: { ridge: 4, roof: ['#6e8446', '#5a6e3a', '#48592e'], eave: '#3a4826' },
  3: { ridge: 2, roof: ['#7a6e8e', '#5e5470', '#4a4258'], eave: '#3a3346' },
};
function tdWorkshopSprite(tier){
  const P = tdPainter(44, 40), t = Math.max(1, Math.min(3, tier || 1)), T = TD_WORKSHOP_TIERS[t], B = TD_BUILDING;
  P(3, 37, 38, 3, 'rgba(0,0,0,0.22)');
  // walls
  if(t === 1){ tdPlanks(P, 5, 20, 34, 15, '#9a7446', '#7f5e38'); tdStones(P, 5, 35, 34, 2, '#5e5850', '#77706a', '#8a847c'); }
  else if(t === 2){ tdPlanks(P, 5, 20, 34, 10, '#a07a50', '#86643f'); tdStones(P, 5, 30, 34, 7, '#6a6560', '#8a8580', '#a39e98'); }
  else tdStones(P, 5, 20, 34, 17, '#6e6a65', '#8f8a84', '#a8a39c');
  if(t < 3){ P(5, 20, 2, 17, '#7a5a36'); P(37, 20, 2, 17, '#7a5a36'); P(5, 20, 34, 1, '#7a5a36'); }
  else { [20, 26, 32].forEach(y => { P(5, y, 3, 2, '#b4afa8'); P(36, y + 3, 3, 2, '#b4afa8'); }); } // corner quoins
  // roof (a little taller each tier), the eaves' edge
  const rows = 19 - T.ridge, spread = 7 + (t - 1);
  tdRoof(P, 9 + (t - 1), T.ridge, 26 - 2 * (t - 1), rows, spread, T.roof[0], T.roof[1], T.roof[2]);
  P(2, 18, 40, 2, T.eave);
  // chimney
  if(t === 1){ P(30, 3, 4, 9, '#6a625a'); P(30, 3, 1, 9, '#857c72'); P(29, 2, 6, 1, '#857c72'); }
  else if(t === 2){ P(30, 1, 5, 11, '#8a4a3a'); P(30, 1, 1, 11, '#a85e48'); for(let y = 3; y < 12; y += 3) P(30, y, 5, 1, '#6a3a2e'); P(29, 0, 7, 1, '#5e5850'); }
  else { P(29, 1, 7, 10, '#77706a'); P(29, 1, 2, 10, '#8f8a84'); for(let y = 4; y < 11; y += 3) P(29, y, 7, 1, '#5e5850'); P(29, 1, 7, 1, '#4a4440'); P(30, 0, 5, 1, '#f07a30'); P(31, 0, 3, 1, '#ffe08a'); }
  // the forge window (left), the door
  P(8, 23, 7, 6, '#3a2a1e'); P(9, 24, 5, 4, B.forge); P(10, 25, 3, 2, B.forgeHot);
  if(t === 3) tdDoor(P, 17, 19, 10, 17, true); // the arch rises into the eaves' edge
  else tdDoor(P, 17, 20, 10, 16, false);
  P(15, 36, 14, 1, B.stepTop);
  P(24, 28, 1, 2, B.handle);
  if(t >= 2){ P(18, 24, 8, 1, B.strap); P(18, 31, 8, 1, B.strap); }
  // tier 1: logs and an anvil on a stump
  if(t === 1){
    P(5, 33, 7, 4, '#7a5a36'); [[6, 34], [9, 34], [7, 36]].forEach(([x, y]) => P(x, y, 1, 1, '#b8915c'));
  }
  // tier 2: a second window, a lantern by the door, a crate of ingots
  if(t === 2){
    tdWindow(P, 31, 23, 6, 6, false, '#7a5a36');
    P(28, 23, 2, 1, '#3a2a1e'); P(28, 24, 2, 2, '#ffd27a'); P(28, 26, 2, 1, '#3a2a1e');
    P(5, 33, 7, 4, '#8a6440'); P(5, 33, 7, 1, '#a07a50'); P(6, 32, 2, 1, '#b9c3cc'); P(9, 32, 2, 1, '#b9c3cc');
  }
  // tier 3: an arched window, the gable emblem, a banner, a crate of gems
  if(t === 3){
    P(31, 22, 6, 7, '#5a3b28'); P(32, 23, 4, 5, B.glass); P(33, 22, 2, 1, '#5a3b28'); P(32, 23, 4, 1, B.glassTop); P(30, 29, 8, 1, '#a8a39c');
    P(11, T.ridge, 22, 1, '#e2b23c');
    P(19, 9, 6, 5, '#e2b23c'); P(20, 10, 4, 3, '#5a3b28'); P(20, 10, 3, 1, '#d6dde3'); P(21, 11, 1, 2, '#a07a50');
    P(40, 3, 1, 16, '#5a3b28'); P(41, 3, 3, 4, '#e2b23c'); P(41, 7, 2, 1, '#c9a24a');
    P(5, 33, 7, 4, '#8a6440'); P(5, 33, 7, 1, '#a07a50'); P(6, 32, 2, 1, '#7fd7ec'); P(9, 32, 2, 1, '#c4a2ff');
  }
  // the anvil on its stump (every tier; tier 3 has a glowing ingot on it)
  P(32, 33, 4, 4, '#7a5a36'); P(30, 31, 8, 2, '#4d4d52'); P(30, 31, 8, 1, '#6d6d73'); P(29, 31, 1, 1, '#4d4d52');
  if(t === 3) P(32, 30, 3, 1, '#f0a040');
  return P.done(false);
}

// --- scenery on the land beyond (Task 89 kinds) and a few small pieces.
function tdPropSprite(kind){
  let P;
  const tree = (w, h, r, cx, cy, dark, mid, light) => { P = tdPainter(w, h); P(cx - 6, h - 3, 12, 3, 'rgba(0,0,0,0.25)'); P(cx - 2, cy + r - 2, 4, h - (cy + r - 2) - 1, '#5a4030');
    P.disc(cx, cy, r, dark); P.disc(cx - 1, cy - 1, r - 2, mid); P.disc(cx - 3, cy - 3, Math.max(2, r - 6), light); };
  switch(kind){
    case 'bigTree': tree(32, 42, 13, 16, 15, '#2f5634', '#3f6e44', '#5a8e57'); break;
    case 'sparseTree': tree(24, 34, 9, 12, 12, '#3a5d36', '#4f7a46', '#6a9655'); break;
    case 'grass': P = tdPainter(12, 8); P(1, 5, 2, 3, '#5b8a4a'); P(4, 3, 2, 5, '#6b9b55'); P(7, 4, 2, 4, '#5b8a4a'); P(9, 6, 2, 2, '#6b9b55'); break;
    case 'rock': P = tdPainter(16, 12); P(2, 10, 12, 2, 'rgba(0,0,0,0.22)'); P.disc(8, 6, 5, '#77726b'); P(4, 3, 4, 2, '#948e86'); P(5, 9, 7, 1, '#5e5a55'); break;
    case 'clearing': P = tdPainter(34, 16); for(let y = 0; y < 16; y++){ const hw = Math.floor(16 * Math.sqrt(1 - Math.pow((y - 7.5) / 8, 2))); P(17 - hw, y, hw * 2, 1, 'rgba(160,190,110,0.35)'); } P(10, 6, 1, 1, '#e8d38a'); P(22, 9, 1, 1, '#d98aa0'); break;
    case 'exposedVein': case 'undevelopedVein': case 'rareVein': {
      const c = kind === 'rareVein' ? ['#e06fa8', '#ffc0df'] : kind === 'undevelopedVein' ? ['#c3ccd4', '#f1f5f8'] : ['#b8704f', '#e09a72'];
      P = tdPainter(16, 12); P(2, 10, 12, 2, 'rgba(0,0,0,0.2)'); P.disc(8, 6, 5, '#6e6a64'); P(5, 5, 2, 2, c[0]); P(9, 4, 2, 2, c[0]); P(8, 7, 2, 1, c[1]); P(5, 5, 1, 1, c[1]); break; }
    case 'crystal': P = tdPainter(14, 18); P(2, 15, 10, 3, 'rgba(0,0,0,0.25)'); P(5, 3, 4, 13, '#7fd7ec'); P(6, 1, 2, 2, '#bff3ff'); P(2, 8, 3, 8, '#5fc0d8'); P(9, 6, 3, 10, '#6ccbe0'); P(6, 4, 1, 10, '#e8fbff'); break;
    case 'oldShaftEntrance': P = tdPainter(30, 26); P(2, 6, 26, 20, '#5e5a55'); P(6, 10, 18, 16, '#1e1a17'); P(4, 6, 3, 20, '#7a5a36'); P(23, 6, 3, 20, '#7a5a36'); P(3, 5, 24, 3, '#8a6440'); break;
    case 'timberSupport': P = tdPainter(16, 22); P(2, 20, 12, 2, 'rgba(0,0,0,0.2)'); P(2, 4, 3, 17, '#7a5a36'); P(11, 4, 3, 17, '#7a5a36'); P(1, 2, 14, 3, '#8a6440'); break;
    case 'mineCart': P = tdPainter(20, 16); P(2, 14, 16, 2, 'rgba(0,0,0,0.22)'); P(2, 4, 16, 8, '#6a625a'); P(3, 5, 14, 3, '#3a3632'); P(4, 4, 3, 2, '#b8704f'); P(9, 3, 3, 2, '#2c3034'); P(4, 11, 4, 4, '#2b2b2b'); P(12, 11, 4, 4, '#2b2b2b'); break;
    case 'diggingMarks': P = tdPainter(16, 10); P(2, 3, 5, 2, '#6e5a42'); P(8, 6, 6, 2, '#6e5a42'); P(5, 7, 2, 1, '#8a7356'); break;
    case 'villageBoard': // Task 118: the plaza's notice board
      P = tdPainter(20, 24); P(3, 22, 14, 2, 'rgba(0,0,0,0.22)'); P(4, 10, 2, 13, '#5a3b28'); P(14, 10, 2, 13, '#5a3b28');
      P(1, 2, 18, 11, '#7a5236'); P(2, 3, 16, 9, '#c9a26a'); P(1, 1, 18, 2, '#5a3b28');
      P(4, 5, 5, 3, '#f0e6cc'); P(11, 4, 5, 4, '#e8dcc0'); P(5, 6, 3, 1, '#7a6a52'); P(12, 5, 3, 1, '#7a6a52'); P(12, 7, 2, 1, '#7a6a52'); P(6, 9, 8, 1, '#a07a50'); break;
    case 'lamp': P = tdPainter(8, 22); P(3, 6, 2, 16, '#4a3626'); P(1, 2, 6, 5, '#3a2a1e'); P(2, 3, 4, 3, '#ffd27a'); P(1, 20, 6, 2, 'rgba(0,0,0,0.25)'); break;
    default: P = tdPainter(8, 8); P(2, 2, 4, 4, '#888'); // unknown kind: a pebble
  }
  return P.done(false);
}

// --- Task 114/115/117: the village facilities, by restoration stage.
//   stage 0 ruin (broken walls, rubble, weeds), 1 cleared (foundation and scaffolding), 2 open.
//   The appraiser (감정소) is 44 x 40, the museum (박물관) 60 x 48; the door is at the bottom centre.
//   `exhibits` (museum only) lights that many of its six display niches (one per two relics on show).
//   Task 121: `specimens` (museum only, raw resource keys) stand as small crystals along its front.
//   Task 122: `hall` (museum only) 1 hangs banners and sets flower pots by the door, 2 adds gold trim and lamps.
function tdVillageSprite(key, stage, exhibits, specimens, hall){
  const museum = key === 'museum';
  const W = museum ? 60 : 44, H = museum ? 48 : 40, P = tdPainter(W, H);
  const cx = W / 2, groundY = H - 3;
  const stone = museum ? '#a9a39a' : '#9a7446', stoneDark = museum ? '#7f7a72' : '#7a5a36', stoneLight = museum ? '#c6c0b6' : '#b8915c';
  P(2, H - 3, W - 4, 3, 'rgba(0,0,0,0.22)'); // shadow
  const fw = museum ? 50 : 36, fx = Math.round(cx - fw / 2);
  if(stage <= 0){
    // ruin: a broken wall stump, fallen stones and a beam, weeds
    P(fx, groundY - 8, fw, 8, '#6e6458'); P(fx, groundY - 8, fw, 1, '#8a8072');
    [[0, 14], [6, 9], [fw - 10, 12], [fw - 4, 7]].forEach(([dx, h]) => { P(fx + dx, groundY - 8 - h, 4, h, stoneDark); P(fx + dx, groundY - 8 - h, 4, 1, stoneLight); });
    P(fx + 10, groundY - 6, 12, 2, '#5a3b28'); P(fx + 11, groundY - 7, 10, 1, '#7a5a36'); // a fallen beam
    [[4, -3], [16, -2], [24, -4], [fw - 14, -2]].forEach(([dx, dy]) => { P(fx + dx, groundY + dy, 3, 2, stone); P(fx + dx, groundY + dy, 3, 1, stoneLight); });
    [[2, -1], [13, 0], [fw - 6, -1], [20, -9]].forEach(([dx, dy]) => { P(fx + dx, groundY + dy - 2, 1, 3, '#5b8a4a'); P(fx + dx + 1, groundY + dy - 3, 1, 3, '#6b9b55'); });
    // Distinct silhouettes at the earliest restoration stage: keep the
    // original rubble footprint, but leave recognizable traces of each trade.
    if(museum){
      // Fallen stone columns and a broken pediment mark a former public hall.
      P(fx + 3, groundY - 23, 4, 14, '#c6c0b6');
      P(fx + 3, groundY - 23, 4, 2, '#e6e1d8');
      P(fx + fw - 9, groundY - 20, 4, 11, '#a9a39a');
      P(fx + fw - 10, groundY - 20, 6, 2, '#c6c0b6');
      P(fx + 14, groundY - 14, 19, 3, '#a9a39a');
      P(fx + 17, groundY - 17, 13, 3, '#c6c0b6');
      P(fx + 20, groundY - 20, 7, 3, '#7f7a72');
      P(fx + 18, groundY - 4, 5, 2, '#3a2a1e'); // abandoned display niche
    }else{
      // A cracked blue lens sign identifies the former appraiser's cottage.
      P(fx + fw - 11, groundY - 19, 2, 10, '#7a5a36');
      P(fx + fw - 13, groundY - 22, 10, 6, '#e8dcc0');
      P(fx + fw - 12, groundY - 21, 8, 4, '#a9a39a');
      P.disc(fx + fw - 9, groundY - 19, 2, '#3f7aa8');
      P(fx + fw - 8, groundY - 18, 1, 1, '#bfe3ff');
      P(fx + fw - 7, groundY - 17, 2, 2, '#5a3b28');
      P(fx + 4, groundY - 12, 7, 2, '#2f5f86'); // fallen roof tile
    }
    return P.done(false);
  }
  const G = groundY, B = TD_BUILDING, mid = Math.round(cx);
  if(stage === 1){
    // cleared: each building site already shows what it is becoming
    if(!museum){
      // the appraiser: a timber frame of the cottage, the roof truss, half the plaster panels
      // up, a stack of its blue roof tiles and a crate with the display window's glass
      P(fx, G - 4, fw, 4, '#8a8072'); P(fx, G - 4, fw, 1, '#a39a8c'); for(let x = fx + 5; x < fx + fw; x += 7) P(x, G - 3, 1, 3, '#77706a');
      P(fx + 3, G - 12, mid - fx - 4, 8, '#e8dcc0'); P(fx + 3, G - 12, mid - fx - 4, 1, '#f0e6cc');
      [fx + 1, mid - 1, fx + fw - 3].forEach(x => P(x, G - 20, 2, 16, '#8a6440'));
      P(fx + 1, G - 21, fw - 2, 2, '#a07a50');
      for(let k = 0; k <= 9; k++){ const x = Math.round(fx + 2 + k * (mid - fx - 3) / 9); P(x, G - 22 - k, 2, 1, '#8a6440'); P(2 * mid - x - 2, G - 22 - k, 2, 1, '#8a6440'); }
      P(mid - 1, G - 31, 2, 9, '#8a6440');
      for(let k = 0; k < 7; k++) P(mid + 2 + k, G - 19 + k * 2, 1, 2, '#7a5a36'); // a brace across the open bay
      [['#5a90bf', 0], ['#3f7aa8', 1], ['#2f5f86', 2], ['#3f7aa8', 3], ['#2f5f86', 4]].forEach(([c, r]) => P(fx + fw - 11, G - 5 + r, 9, 1, c)); // roof tiles
      P(fx + 1, G - 8, 6, 6, '#7a5a36'); P(fx + 2, G - 7, 4, 4, '#bfe3ff'); P(fx + 2, G - 7, 1, 1, '#ffffff'); // glass in its crate
      P(mid - 5, G - 35, 10, 3, '#e2b23c'); P(mid - 4, G - 34, 8, 1, '#3a2a1e'); // a little sign
      return P.done(false);
    }
    // the museum: the stepped base is laid, two columns stand and two are half raised, a
    // scaffold with a ladder holds a piece of the pediment, cut stone and a covered crate of exhibits wait
    P(fx, G - 2, fw, 2, stone); P(fx, G - 2, fw, 1, stoneLight); P(fx + 3, G - 4, fw - 6, 2, stone); P(fx + 3, G - 4, fw - 6, 1, stoneLight);
    [fx + 3, fx + fw - 6].forEach(x => { P(x, G - 26, 3, 22, '#e6e1d8'); P(x + 2, G - 26, 1, 22, stoneLight); P(x - 1, G - 27, 5, 2, stoneLight); });
    [fx + 12, fx + fw - 15].forEach(x => { P(x, G - 14, 3, 10, '#e6e1d8'); P(x + 2, G - 14, 1, 10, stoneLight); P(x, G - 14, 2, 1, stoneDark); });
    [mid - 9, mid + 7].forEach(x => P(x, G - 26, 2, 22, '#8a6440'));
    P(mid - 10, G - 27, 20, 2, '#a07a50'); P(mid - 10, G - 16, 20, 2, '#a07a50'); P(mid - 10, G - 27, 20, 1, '#b8915c'); P(mid - 10, G - 16, 20, 1, '#b8915c');
    for(let k = 0; k < 5; k++) P(mid - 7 + k * 3, G - 25 + k * 2, 1, 2, '#7a5a36'); // a brace
    P(mid - 4, G - 15, 1, 11, '#7a5a36'); P(mid - 1, G - 15, 1, 11, '#7a5a36'); for(let y = G - 13; y < G - 4; y += 3) P(mid - 4, y, 4, 1, '#7a5a36'); // a ladder
    for(let k = 0; k < 3; k++) P(mid - 2 - k * 2, G - 31 + k, 5 + k * 4, 1, stoneLight); P(mid - 7, G - 28, 14, 1, stone); // the pediment piece on the scaffold
    P(fx + fw - 12, G - 8, 6, 4, stone); P(fx + fw - 12, G - 8, 6, 1, stoneLight); P(fx + fw - 9, G - 11, 5, 3, stoneLight);
    P(fx + 5, G - 8, 7, 4, '#8a6440'); P(fx + 5, G - 9, 7, 2, '#b0524a'); P(fx + 5, G - 9, 7, 1, '#c86a5e');
    P(mid - 5, G - 24, 10, 3, '#e2b23c'); P(mid - 4, G - 23, 8, 1, '#3a2a1e'); // the little sign under the scaffold's top plank
    return P.done(false);
  }
  if(!museum){
    // the appraiser: a half-timbered cottage under a blue roof, a display window of gems under
    // a striped awning (on the left, where its light is), the lens board, a door with a round
    // window, a potted plant and the step
    P(fx, G - 18, fw, 16, '#e8dcc0'); tdStones(P, fx, G - 2, fw, 2, '#77706a', '#9a9086', '#b4aaa0');
    P(fx, G - 18, 2, 16, '#7a5a36'); P(fx + fw - 2, G - 18, 2, 16, '#7a5a36'); P(fx, G - 18, fw, 1, '#7a5a36'); P(fx + 15, G - 17, 1, 15, '#7a5a36');
    tdRoof(P, fx + 3, G - 31, fw - 6, 11, 5, '#5a90bf', '#3f7aa8', '#2f5f86');
    P(fx - 2, G - 20, fw + 4, 2, '#2a557a');
    P(fx + 2, G - 15, 11, 9, '#5a3b28'); P(fx + 3, G - 14, 9, 7, B.glass); P(fx + 3, G - 14, 9, 1, B.glassTop);
    P(fx + 3, G - 9, 9, 1, '#7a5a36'); P(fx + 4, G - 11, 2, 2, '#c4a2ff'); P(fx + 7, G - 11, 2, 2, '#4fc4dc'); P(fx + 10, G - 11, 1, 2, '#c9a24a');
    P(fx + 1, G - 6, 13, 1, '#a07a50');
    for(let x = fx + 1; x < fx + 14; x++){ const c = Math.floor((x - fx - 1) / 2) % 2 ? '#f0e6cc' : '#3f7aa8'; P(x, G - 17, 1, 1, c); if((x - fx) % 2) P(x, G - 16, 1, 1, c); }
    tdDoor(P, mid - 4, G - 17, 8, 16, false); P(mid - 1, G - 14, 2, 2, '#ffd27a'); P(mid + 1, G - 9, 1, 2, B.handle);
    P(mid + 5, G - 15, 10, 9, '#5a3b28'); P(mid + 6, G - 14, 8, 7, '#e8dcc0');
    P.disc(mid + 9, G - 12, 3, '#c9a24a'); P.disc(mid + 9, G - 12, 2, '#3f7aa8'); P(mid + 8, G - 13, 1, 1, '#bfe3ff'); // the lens: a gold rim, blue glass
    P(mid + 11, G - 9, 2, 1, '#5a3b28'); P(mid + 12, G - 8, 2, 1, '#5a3b28'); // its handle
    P(fx + fw - 6, G - 4, 3, 3, '#b8704f'); P(fx + fw - 6, G - 6, 3, 2, '#4f8246'); P(fx + fw - 5, G - 7, 1, 1, '#e06f8a');
    P(mid - 6, G - 1, 12, 1, B.stepTop);
    return P.done(false);
  }
  // the museum: a stone hall on two steps, four columns with capitals, an entablature with
  // dentils, the pediment with its name board, a tall double door and six display niches,
  // two each side of the door and one in each outer bay (none over the door)
  P(fx - 1, G - 2, fw + 2, 2, '#8f897f'); P(fx - 1, G - 2, fw + 2, 1, '#b4aea4'); P(fx + 1, G - 4, fw - 2, 2, stone); P(fx + 1, G - 4, fw - 2, 1, stoneLight);
  P(fx, G - 24, fw, 20, stone); for(let y = G - 20; y < G - 4; y += 4) P(fx, y, fw, 1, 'rgba(0,0,0,0.08)');
  for(let k = 0; k < 9; k++){ const o = Math.floor(k * 25 / 8); P(mid - o, G - 35 + k, 2 * o, 1, k === 8 ? stoneDark : stoneLight); if(k >= 3 && k < 8) P(mid - o + 3, G - 35 + k, 2 * o - 6, 1, '#b8b2a8'); }
  P(fx - 1, G - 26, fw + 2, 2, stoneDark); for(let x = fx; x < fx + fw; x += 3) P(x, G - 24, 2, 1, stoneLight);
  [fx + 2, fx + 10, fx + fw - 12, fx + fw - 4].forEach(x => { P(x, G - 23, 2, 19, '#e6e1d8'); P(x + 2, G - 23, 1, 19, stoneDark); P(x - 1, G - 23, 4, 1, stoneLight); P(x - 1, G - 5, 4, 1, stoneLight); });
  P(mid - 6, G - 21, 12, 1, stoneLight); tdDoor(P, mid - 5, G - 20, 10, 16, false);
  P(mid - 4, G - 19, 8, 2, B.glass); P(mid, G - 17, 1, 13, B.doorDark); P(mid - 2, G - 11, 1, 2, B.handle); P(mid + 1, G - 11, 1, 2, B.handle);
  const lit = Math.max(0, Math.min(6, exhibits || 0));
  [fx + 6, fx + 13, fx + 17, fx + fw - 20, fx + fw - 16, fx + fw - 8].forEach((nx, k) => {
    const ny = G - 17;
    P(nx, ny, 3, 6, '#3a2a1e'); P(nx, ny + 1, 3, 4, k < lit ? '#ffd27a' : '#55504a');
    if(k < lit) P(nx + 1, ny + 2, 1, 2, ['#c98a4a', '#9ab8c8', '#d8c070', '#b07ac8', '#7fd7ec', '#e6e1d8'][k]);
  });
  P(mid - 7, G - 32, 14, 4, '#e2b23c'); P(mid - 6, G - 31, 12, 2, '#5a3b28'); // the name board
  // Task 122: the decorated hall
  if((hall || 0) >= 1){
    [fx + 2, fx + fw - 4].forEach(x => { P(x - 1, G - 21, 4, 9, '#b0524a'); P(x - 1, G - 21, 4, 1, '#e2b23c'); P(x, G - 13, 2, 2, '#b0524a'); });
    [mid - 8, mid + 6].forEach(x => { P(x, G - 4, 3, 3, '#b8704f'); P(x, G - 6, 3, 2, '#4f8246'); P(x + 1, G - 7, 1, 1, '#e06f8a'); });
  }
  if((hall || 0) >= 2){
    for(let k = 0; k < 9; k++){ const o = Math.floor(k * 25 / 8); P(mid - o, G - 35 + k, 1, 1, '#e2b23c'); P(mid + o - 1, G - 35 + k, 1, 1, '#e2b23c'); }
    P(fx - 1, G - 26, fw + 2, 1, '#f2d68c');
    [fx + 6, fx + fw - 8].forEach(x => { P(x, G - 24, 3, 3, '#3a2a1e'); P(x + 1, G - 23, 1, 1, '#ffd27a'); });
  }
  // Task 121: donated mineral and gem samples on little stands between the columns
  (specimens || []).slice(0, 6).forEach((k, i) => {
    const sx = [fx + 5, fx + 8, fx + 14, fx + fw - 17, fx + fw - 9, fx + fw - 6][i], c = TD_RES_COLORS[k] || ['#ccc', '#fff'];
    P(sx - 1, groundY - 4, 4, 1, stoneDark); P(sx, groundY - 7, 2, 3, c[0]); P(sx, groundY - 7, 1, 1, c[1]);
  });
  return P.done(false);
}

// --- Task 119: the player's house (outside), door at the bottom centre.
// Sized to the player (H = 21 px, hair to boots): the door frame 25 px (~1.2H),
// the walls 66 px wide (~3.1H; 76 with the eaves), the ridge 63 px above the
// ground (3H; the chimney 67). Walls, roof and door are laid out on their own,
// not one picture scaled up.
function tdHouseSprite(){
  const P = tdPainter(84, 73), G = 70; // G: the ground row (the door step's foot)
  P(5, G, 74, 3, 'rgba(0,0,0,0.22)');
  // walls: warm boards over a stone footing, a timber frame
  P(9, 36, 66, G - 36, '#e8d6b0');
  for(let y = 40; y < G - 5; y += 4) P(9, y, 66, 1, '#dcc79e'); // board seams
  P(9, G - 5, 66, 5, '#9a9086'); P(9, G - 5, 66, 1, '#b4aaa0');
  for(let x = 13; x < 72; x += 9) P(x, G - 3, 1, 1, '#857b72'); // footing stones
  P(9, 36, 3, G - 41, '#8a6440'); P(72, 36, 3, G - 41, '#8a6440'); // corner posts
  P(9, 37, 66, 2, '#8a6440'); P(9, 39, 66, 1, '#6f5034');           // the beam under the eaves
  P(31, 39, 2, G - 44, '#8a6440'); P(51, 39, 2, G - 44, '#8a6440'); // posts either side of the door
  // roof: green shingle rows widening to the eaves, staggered tabs, a ridge cap
  for(let y = 8; y <= 34; y++){
    const o = Math.round((y - 8) * 16 / 26), x0 = 20 - o, w = 44 + 2 * o, band = Math.floor((y - 8) / 3);
    P(x0, y, w, 1, band % 2 ? '#4a7c43' : '#4f8246');
    if((y - 8) % 3 === 2){
      P(x0, y, w, 1, '#3f6b3a');
      for(let x = x0 + (band % 2 ? 3 : 6); x < x0 + w - 1; x += 6) P(x, y - 2, 1, 2, '#447540');
    }
  }
  P(20, 7, 44, 1, '#6a9e5f'); P(22, 6, 40, 1, '#3f6b3a'); P(20, 8, 44, 1, 'rgba(255,255,255,0.18)');
  P(3, 35, 78, 2, '#35592f'); P(4, 37, 76, 1, '#2c4a28');   // the eaves' edge
  P(12, 39, 60, 1, 'rgba(60,40,20,0.18)');                   // shade under the eaves
  P(58, 3, 8, 13, '#7a6a5e'); P(57, 2, 10, 2, '#958576'); P(60, 7, 3, 1, '#6a5b50'); P(59, 11, 4, 1, '#6a5b50'); // chimney
  // door: a frame, two planks, a little window, a handle, the step
  P(34, 43, 16, G - 45, '#5a3b28');
  P(36, 45, 12, G - 47, '#8a5a36'); P(41, 45, 1, G - 47, '#74492c'); P(36, 56, 12, 1, '#74492c');
  P(38, 48, 8, 4, '#3a2a1e'); P(39, 49, 6, 2, '#f3d27a');
  P(45, 58, 2, 2, '#e2b23c');
  P(31, G - 2, 22, 2, '#b4aaa0'); P(31, G - 2, 22, 1, '#cfc6bc');
  // a lantern beside the door
  P(55, 47, 4, 1, '#3a2a1e'); P(55, 48, 4, 4, '#3a2a1e'); P(56, 49, 2, 2, '#ffd27a');
  // windows with flower boxes, one each side
  [[15, 45], [59, 45]].forEach(([x, y]) => {
    P(x, y, 11, 11, '#5a3b28'); P(x + 1, y + 1, 9, 9, '#f3d27a'); P(x + 1, y + 1, 9, 2, '#f7e2a0');
    P(x + 5, y + 1, 1, 9, '#5a3b28'); P(x + 1, y + 5, 9, 1, '#5a3b28');
    P(x - 1, y + 12, 13, 3, '#8a6440'); P(x - 1, y + 12, 13, 1, '#a07a50');
    [[0, '#e06f8a'], [3, '#f0d060'], [6, '#e06f8a'], [9, '#f7c0cf']].forEach(([dx, c]) => { P(x + dx, y + 10, 2, 2, c); P(x + dx + 1, y + 11, 1, 1, '#4f8246'); });
  });
  return P.done(false);
}

// --- Task 119: inside the player's house. The room picture (floor, walls,
// windows, rug, the door gap) is one sprite; furniture stands in it as its own
// sprites, sorted with the player. Sizes follow VILLAGE.HOME (64 px a unit).
function tdHomeRoomSprite(){
  const H = VILLAGE.HOME, U = TD_UNIT_PX, side = H.SIDE_PX, back = H.BACK_PX, bottom = H.BOTTOM_PX;
  const fw = Math.round(H.ROOM.w * U), fh = Math.round(H.ROOM.h * U), W = fw + side * 2, Ht = back + fh + bottom;
  const P = tdPainter(W, Ht);
  // floor: planks in rows, the ends staggered
  for(let y = 0; y < fh; y += 8){
    const row = y / 8;
    P(side, back + y, fw, 8, ['#a87a4e', '#a07248', '#ae8054'][row % 3]);
    P(side, back + y + 7, fw, 1, '#7e5636');
    for(let x = (row % 2) * 23 + 9; x < fw; x += 46) P(side + x, back + y, 1, 7, '#86603e');
  }
  // the back wall: plaster over wood panelling, two windows and a framed map
  P(side, 0, fw, back, '#e6d6b4'); P(side, back - 16, fw, 16, '#8a6440'); P(side, back - 16, fw, 2, '#a07a50'); P(side, back - 2, fw, 2, '#5a3b28');
  [[Math.round(fw * 0.22), 9], [Math.round(fw * 0.62), 9]].forEach(([x, y]) => {
    P(side + x, y, 26, 20, '#5a3b28'); P(side + x + 2, y + 2, 22, 16, '#bfe0ec'); P(side + x + 12, y + 2, 2, 16, '#5a3b28'); P(side + x + 2, y + 9, 22, 2, '#5a3b28');
    P(side + x + 3, y + 3, 4, 3, '#eef8fb'); P(side + x - 2, y + 20, 30, 3, '#7a5236');
  });
  P(side + Math.round(fw * 0.45), 12, 16, 12, '#7a5236'); P(side + Math.round(fw * 0.45) + 1, 13, 14, 10, '#e8dcc0'); P(side + Math.round(fw * 0.45) + 3, 16, 6, 1, '#a07a50'); P(side + Math.round(fw * 0.45) + 5, 19, 7, 1, '#4f8246');
  // side walls and the bottom wall with the door gap
  P(0, 0, side, Ht, '#5a3b28'); P(W - side, 0, side, Ht, '#5a3b28'); P(side - 2, 0, 2, Ht, '#3a2a1e'); P(W - side, 0, 2, Ht, '#3a2a1e');
  const doorX = side + Math.round(H.DOOR.x * U), gap = Math.round(H.DOOR.half * U);
  P(0, back + fh, W, bottom, '#5a3b28'); P(0, back + fh, W, 2, '#3a2a1e');
  P(doorX - gap, back + fh, gap * 2, bottom, '#a07248'); P(doorX - gap + 3, back + fh - 6, gap * 2 - 6, 8, '#7a5236'); // the door mat
  P(doorX - gap - 3, back + fh - 2, 3, bottom + 2, '#3a2a1e'); P(doorX + gap, back + fh - 2, 3, bottom + 2, '#3a2a1e');
  // the rug
  const rx = side + Math.round(H.RUG.x * U), ry = back + Math.round(H.RUG.y * U), rw = Math.round(H.RUG.w * U / 2), rh = Math.round(H.RUG.h * U / 2);
  for(let y = -rh; y <= rh; y++){ const hw = Math.floor(rw * Math.sqrt(1 - (y * y) / (rh * rh + 0.01))); P(rx - hw, ry + y, hw * 2, 1, Math.abs(y) > rh - 3 || hw < 4 ? '#e2b23c' : '#b0524a'); }
  for(let y = -rh + 5; y <= rh - 5; y += 4){ const hw = Math.floor((rw - 8) * Math.sqrt(1 - (y * y) / (rh * rh))); P(rx - hw, ry + y, hw * 2, 1, '#9a443e'); }
  return P.done(false);
}

// Furniture by key, anchored at the bottom centre of its foot.
function tdFurnitureSprite(key){
  let P;
  switch(key){
    case 'bed':
      P = tdPainter(52, 72); P(2, 68, 48, 4, 'rgba(0,0,0,0.2)');
      P(2, 0, 48, 10, '#7a5236'); P(2, 0, 48, 2, '#9a6a40'); P(2, 8, 48, 62, '#6a4630'); // headboard, frame
      P(5, 10, 42, 56, '#f0ece0'); P(9, 13, 34, 11, '#ffffff'); P(9, 22, 34, 2, '#dcd6c8'); // mattress, pillow
      P(5, 28, 42, 38, '#4f7aa8'); P(5, 28, 42, 3, '#6a96c4'); for(let y = 34; y < 66; y += 6) P(5, y, 42, 1, '#43699a'); // blanket
      break;
    case 'shelf':
      P = tdPainter(64, 58); P(2, 55, 60, 3, 'rgba(0,0,0,0.2)');
      P(2, 0, 60, 56, '#7a5236'); P(5, 3, 54, 50, '#5a3b28');
      [6, 22, 38].forEach((y, r) => { P(5, y + 13, 54, 3, '#8a6440');
        for(let x = 7, k = 0; x < 56; x += 5 + (k % 3), k++) P(x, y + 2 + (k % 2), 4, 11 - (k % 2), ['#b0524a', '#4f7aa8', '#e2b23c', '#4f8246', '#c9a26a', '#8a5cd6'][(k + r * 2) % 6]); });
      break;
    case 'table':
      P = tdPainter(48, 38); P(4, 35, 40, 3, 'rgba(0,0,0,0.2)');
      P(6, 22, 3, 14, '#5a3b28'); P(39, 22, 3, 14, '#5a3b28');
      P(2, 8, 44, 16, '#9a6a40'); P(2, 8, 44, 2, '#b8885a'); P(2, 22, 44, 2, '#6a4630');
      P(10, 3, 6, 7, '#e8e4dc'); P(11, 4, 4, 2, '#7a5236'); // a cup
      P(28, 2, 9, 8, '#e8dcc0'); P(29, 4, 7, 1, '#a07a50'); P(29, 6, 5, 1, '#a07a50'); // a notebook
      break;
    case 'stool':
      P = tdPainter(16, 16); P(2, 14, 12, 2, 'rgba(0,0,0,0.2)'); P(3, 3, 10, 5, '#9a6a40'); P(3, 3, 10, 1, '#b8885a'); P(4, 8, 2, 7, '#5a3b28'); P(10, 8, 2, 7, '#5a3b28');
      break;
    case 'stove':
      P = tdPainter(36, 50); P(2, 47, 32, 3, 'rgba(0,0,0,0.25)');
      P(14, 0, 8, 18, '#4a4e58'); P(14, 0, 2, 18, '#5e636e'); // pipe
      P(3, 16, 30, 32, '#4a4e58'); P(3, 16, 30, 3, '#6e747c'); P(3, 45, 30, 3, '#3a3e46');
      P(9, 26, 18, 13, '#2a2c32'); P(11, 28, 14, 9, '#f07a30'); P(13, 31, 10, 6, '#f0a040'); P(16, 33, 4, 3, '#ffe08a'); // the fire
      P(6, 20, 3, 3, '#e2b23c'); P(27, 20, 3, 3, '#e2b23c');
      break;
    case 'chest':
      P = tdPainter(38, 30); P(2, 27, 34, 3, 'rgba(0,0,0,0.22)');
      P(3, 6, 32, 22, '#8a5a36'); P(3, 6, 32, 7, '#9a6a40'); P(3, 12, 32, 2, '#5a3b28');
      P(8, 6, 3, 22, '#77706a'); P(27, 6, 3, 22, '#77706a'); P(17, 12, 4, 5, '#e2b23c');
      break;
    case 'plant':
      P = tdPainter(16, 24); P(3, 21, 10, 3, 'rgba(0,0,0,0.2)'); P(4, 14, 8, 8, '#b8704f'); P(4, 14, 8, 2, '#d08a62');
      P.disc(8, 8, 5, '#3f6e44'); P(5, 4, 3, 3, '#5a8e57'); P(9, 6, 3, 3, '#5a8e57');
      break;
    default: P = tdPainter(8, 8); P(2, 2, 4, 4, '#888');
  }
  return P.done(false);
}

// --- Task 120: garden decorations, anchored at the bottom centre of their foot.
function tdDecorSprite(key){
  let P;
  switch(key){
    case 'flowerPot':
      P = tdPainter(14, 18); P(2, 16, 10, 2, 'rgba(0,0,0,0.22)'); P(3, 10, 8, 7, '#b8704f'); P(3, 10, 8, 2, '#d08a62'); P(4, 16, 6, 1, '#8a5236');
      P(5, 5, 2, 6, '#4f8246'); P(8, 4, 2, 7, '#5a8e57'); P(3, 2, 4, 4, '#e06f8a'); P(4, 3, 2, 2, '#f7c0cf'); P(8, 1, 4, 4, '#f0d060'); P(9, 2, 2, 2, '#fff3b0');
      break;
    case 'bench':
      P = tdPainter(30, 20); P(2, 18, 26, 2, 'rgba(0,0,0,0.22)');
      P(3, 2, 24, 3, '#9a6a40'); P(3, 2, 24, 1, '#b8885a'); P(3, 6, 24, 2, '#8a5a36'); // the back
      P(2, 9, 26, 4, '#a87a4e'); P(2, 9, 26, 1, '#c49a6a'); P(2, 12, 26, 1, '#7a5236'); // the seat
      P(4, 13, 3, 6, '#5a3b28'); P(23, 13, 3, 6, '#5a3b28'); P(4, 4, 2, 9, '#6a4630'); P(24, 4, 2, 9, '#6a4630');
      break;
    case 'lantern':
      P = tdPainter(14, 26); P(2, 24, 10, 2, 'rgba(0,0,0,0.25)');
      P(4, 17, 6, 8, '#8f8a84'); P(3, 23, 8, 2, '#77706a'); // the post
      P(3, 9, 8, 8, '#9a958e'); P(5, 11, 4, 4, '#ffd27a'); P(6, 12, 2, 2, '#fff3b0'); // the light box
      P(1, 6, 12, 3, '#77706a'); P(2, 5, 10, 1, '#a9a39a'); P(5, 3, 4, 2, '#8f8a84'); // the cap
      break;
    case 'shrub':
      P = tdPainter(22, 20); P(3, 17, 16, 3, 'rgba(0,0,0,0.25)');
      P.disc(11, 10, 8, '#3f6e44'); P.disc(10, 9, 6, '#4f8246'); P.disc(8, 7, 3, '#6a9e5f'); P(14, 6, 2, 2, '#e06f8a'); P(6, 12, 2, 2, '#f0d060');
      break;
    // Task 122: the museum's reward decorations
    case 'oreStatue':
      P = tdPainter(18, 28); P(2, 26, 14, 2, 'rgba(0,0,0,0.25)'); P(2, 21, 14, 6, '#8f8a84'); P(2, 21, 14, 1, '#a9a39a');
      P(6, 9, 6, 12, '#b8704f'); P(5, 4, 8, 6, '#c98a62'); P(4, 3, 10, 3, '#e2b23c'); P(7, 4, 4, 1, '#fff3b0'); // a little miner in ore, a gold helmet
      P(12, 8, 2, 9, '#6a4630'); P(11, 7, 5, 2, '#9a958e'); P(7, 12, 1, 2, '#e09a72'); P(10, 15, 1, 2, '#e09a72');
      break;
    case 'crystalFountain':
      P = tdPainter(30, 26); P(2, 23, 26, 3, 'rgba(0,0,0,0.25)');
      P(2, 15, 26, 9, '#8f8a84'); P(2, 15, 26, 2, '#a9a39a'); P(4, 17, 22, 5, '#4f9ec4'); P(5, 18, 8, 1, '#bff3ff'); // the basin and its water
      P(12, 6, 6, 11, '#9a958e'); P(13, 2, 4, 6, '#7fd7ec'); P(14, 0, 2, 3, '#e8fbff'); P(10, 4, 2, 4, '#5fc0d8'); P(18, 5, 2, 3, '#5fc0d8'); // the crystal
      P(8, 12, 1, 4, '#bff3ff'); P(21, 11, 1, 5, '#bff3ff');
      break;
    case 'goldenPick':
      P = tdPainter(18, 30); P(2, 28, 14, 2, 'rgba(0,0,0,0.25)'); P(2, 22, 14, 7, '#77706a'); P(2, 22, 14, 1, '#958d85'); P(5, 24, 8, 2, '#e2b23c');
      P(8, 6, 2, 16, '#b58a26'); P(8, 6, 1, 16, '#f2d68c'); // the haft
      P(2, 3, 14, 3, '#e2b23c'); P(1, 4, 2, 3, '#b58a26'); P(15, 4, 2, 3, '#b58a26'); P(3, 3, 11, 1, '#fff3b0'); // the gold head
      break;
    default: P = tdPainter(8, 8); P(2, 2, 4, 4, '#888');
  }
  return P.done(false);
}

// --- Task 112: a torch the player sets down, 10 x 22, with a 3-frame flame.
function tdTorchSprite(frame){
  const P = tdPainter(10, 22);
  P(2, 20, 6, 2, 'rgba(0,0,0,0.25)');
  P(4, 8, 2, 13, '#6a4a30'); P(4, 8, 1, 13, '#7d5a3c'); // the stick
  P(3, 6, 4, 3, '#4a4e58'); P(3, 6, 4, 1, '#6e747c');   // the iron cup
  const flame = [
    [[4, 1, 2, 5, '#f07a30'], [3, 3, 4, 3, '#f0a040'], [4, 3, 2, 2, '#ffe08a']],
    [[4, 0, 2, 6, '#f07a30'], [3, 2, 4, 4, '#f0a040'], [4, 2, 2, 3, '#ffe08a']],
    [[5, 1, 2, 5, '#f07a30'], [3, 3, 4, 3, '#f0a040'], [5, 3, 1, 2, '#fff3b0']],
  ][frame % 3];
  flame.forEach(([x, y, w, h, c]) => P(x, y, w, h, c));
  return P.done(false);
}

// Bakes sprite rects into a canvas (null without a 2D canvas, e.g. in jsdom).
function tdSpriteImage(sprite){
  if(typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = sprite.w; c.height = sprite.h;
  const g = c.getContext && c.getContext('2d');
  if(!g) return null;
  sprite.rects.forEach(([x, y, w, h, col]) => { g.fillStyle = col; g.fillRect(x, y, w, h); });
  return c;
}

// All sprites the renderer needs, baked once.
function tdBuildSpriteSheet(){
  const sheet = { player: {}, ore: {}, workshop: {}, prop: {} };
  const v2 = typeof tdStyleV2 === 'function' && tdStyleV2(); // the style experiment (?style=v2)
  const R = typeof tdResFactor === 'function' ? tdResFactor() : 1; // the resolution experiment (?res=1.5 / 2, with v2)
  const atRes = (img) => { if(img) img.artRes = R; return img; };
  ['down', 'up', 'left', 'right'].forEach(d => { sheet.player[d] = [0, 1, 2, 3].map(f => R > 1 ? atRes(tdSpriteImage(R === 1.5 ? tdPlayerSprite15(d, f) : tdPlayerSpriteRes(d, f, R))) : tdSpriteImage(v2 ? tdPlayerSpriteV2(d, f) : tdPlayerSprite(d, f))); });
  // graphics pass 2: in v2 everything below gets the same finish as the player and the house (same sizes)
  const fin = typeof tdStyleFinish === 'function' ? tdStyleFinish : (sp) => sp;
  Object.keys(TD_RES_COLORS).forEach(r => { sheet.ore[r] = { unsecured: tdSpriteImage(fin(tdOreSprite(r, 'unsecured'), 'vein')), secured: tdSpriteImage(fin(tdOreSprite(r, 'secured'), 'vein')) }; });
  sheet.ore.undiscovered = tdSpriteImage(fin(tdOreSprite(null, 'undiscovered'), 'vein'));
  sheet.base = tdSpriteImage(fin(tdBaseSprite(), 'building'));
  sheet.house = R > 1 ? atRes(tdSpriteImage(tdHouseSpriteRes(R))) : tdSpriteImage(v2 ? tdHouseSpriteV2() : tdHouseSprite()); // Task 119
  sheet.torch = [0, 1, 2].map(f => tdSpriteImage(fin(tdTorchSprite(f), 'thin')));
  [1, 2, 3].forEach(t => { sheet.workshop[t] = tdSpriteImage(fin(tdWorkshopSprite(t), 'building')); });
  ['bigTree', 'sparseTree', 'grass', 'rock', 'clearing', 'exposedVein', 'undevelopedVein', 'rareVein', 'crystal', 'oldShaftEntrance', 'timberSupport', 'mineCart', 'diggingMarks', 'lamp', 'villageBoard']
    .forEach(k => { sheet.prop[k] = tdSpriteImage(fin(tdPropSprite(k), typeof tdFinishPropKind === 'function' ? tdFinishPropKind(k) : null)); });
  return sheet;
}
