// G1 캐릭터 시안 (게임 코드 아님). 게임의 tdPlayerSprite(js/topdown/sprites.js, develop 26cee0b)를 복사해
// 다리·팔·걷기 프레임만 고친 안입니다. 머리·얼굴·파카·색(코발트 머리 #3d5c9e 등)·크기 16x22·발 기준선은 그대로입니다.
// 이 파일은 비교 화면과 시험용 브라우저에서만 불러옵니다.
//
// 바뀐 점 (현재 → 시안)
//   측면: 두 다리가 붙어 있음(간격 0) → 뒤 다리를 1px 떨어뜨리고 한 단계 어둡게. 보폭 ±1 → ±2,
//         뒤로 간 발은 뒤꿈치를 들어 올림. 팔은 같은 쪽 다리와 함께 흔들림 → 반대로 흔들림(자연스러운 보행), 범위 2 → 3px
//   정면·후면: 디딤발 1px 들림 → 2px 들림(무릎을 굽힌 모양), 팔 한쪽만 1px 내려감 → 한쪽 위, 한쪽 아래(차이 2px)
//   팔과 몸 경계: 소매 안쪽에 1px 그늘(앞·뒤), 측면 팔 뒤 가장자리에 1px 그늘
const TD_G1_FAR = { cuff: '#b9a37f', boot: '#9a6c3a', sole: '#6e4a24', pants: '#4a4d52' }; // 먼 쪽 다리: 한 단계 어둡게

function tdPlayerSpriteG1(dir, frame){
  const C = TD_PLAYER_COLORS;
  const P = tdPainter(16, 22);
  const b = (frame === 1 || frame === 3) ? 1 : 0;       // 걸음마다 몸이 1px 내려감(현재와 같음)
  const s = frame === 1 ? 1 : frame === 3 ? -1 : 0;     // 어느 다리가 앞인지(현재와 같음)
  const side = dir === 'left' || dir === 'right';
  P(3, 20, 10, 2, 'rgba(0,0,0,0.25)'); // 그림자(현재와 같음)
  const boot = (x, y, w) => { P(x, y, w, 1, C.furShade); P(x, y + 1, w, 2, C.boot); P(x, y + 2, w, 1, C.bootDark); };
  const farBoot = (x, y, w) => { P(x, y, w, 1, TD_G1_FAR.cuff); P(x, y + 1, w, 2, TD_G1_FAR.boot); P(x, y + 2, w, 1, TD_G1_FAR.sole); };
  if(side){
    // 오른쪽을 보고 그림(왼쪽은 좌우 반전). 먼 다리를 먼저, 가까운 다리를 위에 그림.
    if(s === 0){
      P(5, 16, 2, 2, TD_G1_FAR.pants); farBoot(5, 18, 3);           // 먼 다리: x5-6 (x7 비움)
      P(8, 16, 2, 2, C.pants); boot(8, 18, 3);                       // 가까운 다리: x8-9
    } else if(s === 1){
      // 가까운 다리 앞으로, 먼 다리 뒤로(뒤꿈치 듦)
      P(4, 16, 2, 1, TD_G1_FAR.pants); P(3, 17, 2, 1, TD_G1_FAR.pants); farBoot(2, 17, 3);
      P(9, 16, 2, 1, C.pants); P(10, 17, 2, 1, C.pants); boot(10, 18, 3);
    } else {
      // 먼 다리 앞으로, 가까운 다리 뒤로(뒤꿈치 듦)
      P(9, 16, 2, 1, TD_G1_FAR.pants); P(10, 17, 2, 1, TD_G1_FAR.pants); farBoot(10, 18, 3);
      P(5, 16, 2, 1, C.pants); P(4, 17, 2, 1, C.pants); boot(3, 17, 3);
    }
  } else {
    // 정면: 디딤발이 2px 들림(무릎을 굽혀 다리가 짧아 보임).
    // 후면: 배낭·옷자락에 가리지 않게 1px 들고 1px 안쪽으로(발을 앞으로 내딛는 모양)
    const lift = dir === 'up' ? 1 : 2, tuck = dir === 'up' ? 1 : 0;
    const l = s === 1 ? lift : 0, r = s === -1 ? lift : 0;
    if(l){ P(5 + tuck, 16, 2, 3 - l, C.pantsDark); boot(4 + tuck, 18 - l, 3); } else { P(5, 16, 2, 1, C.pants); P(5, 17, 2, 1, C.pantsDark); boot(4, 18, 3); }
    if(r){ P(9 - tuck, 16, 2, 3 - r, C.pantsDark); boot(9 - tuck, 18 - r, 3); } else { P(9, 16, 2, 1, C.pants); P(9, 17, 2, 1, C.pantsDark); boot(9, 18, 3); }
  }
  // 팔: 앞·뒤 모습은 한쪽 위·한쪽 아래(차이 2px), 소매 안쪽 1px 그늘
  const arms = (la, ra, lantern) => {
    P(2, 10 + b + la, 2, 4, C.parkaLight); P(2, 10 + b + la, 1, 4, C.parkaDark); P(3, 11 + b + la, 1, 2, C.parka); P(2, 14 + b + la, 2, 1, C.glove);
    P(12, 10 + b + ra, 2, 4, C.parkaLight); P(13, 10 + b + ra, 1, 4, C.parkaDark); P(12, 11 + b + ra, 1, 2, C.parka); P(12, 14 + b + ra, 2, 1, C.glove);
    if(lantern){ P(2, 15 + b + la, 2, 1, C.lampFrame); P(2, 16 + b + la, 2, 2, C.lamp); P(2, 18 + b + la, 2, 1, C.lampFrame); }
  };
  if(dir === 'down'){
    P(4, 10 + b, 8, 5, C.parka); P(4, 10 + b, 1, 5, C.parkaDark); P(11, 10 + b, 1, 5, C.parkaDark);
    for(let k = 0; k < 3; k++) P(5 + k, 11 + b + k, 1, 1, C.leather);
    P(4, 13 + b, 8, 1, C.leather); P(7, 13 + b, 2, 1, C.buckle);
    P(5, 14 + b, 1, 1, C.trim); P(7, 14 + b, 2, 1, C.trim); P(10, 14 + b, 1, 1, C.trim);
    P(3, 15 + b, 10, 1, C.fur); P(4, 15 + b, 1, 1, C.furShade); P(8, 15 + b, 1, 1, C.furShade); P(11, 15 + b, 1, 1, C.furShade);
    arms(s === 0 ? 0 : -s, s === 0 ? 0 : s, true); // 다리와 반대로 흔듦
    P(3, 9 + b, 10, 2, C.fur); P(2, 10 + b, 1, 1, C.fur); P(13, 10 + b, 1, 1, C.fur); P(4, 10 + b, 8, 1, C.furShade);
    P(4, 4 + b, 8, 5, C.skin); P(5, 8 + b, 6, 1, C.skinShade);
    P(5, 6 + b, 1, 2, C.eye); P(10, 6 + b, 1, 2, C.eye); P(5, 6 + b, 1, 1, C.eyeLight); P(10, 6 + b, 1, 1, C.eyeLight);
    P(4, 8 + b, 1, 1, C.blush); P(11, 8 + b, 1, 1, C.blush); P(7, 8 + b, 2, 1, C.mouth);
    P(4, 1 + b, 8, 1, C.hair); P(3, 2 + b, 10, 2, C.hair); P(5, 0 + b, 1, 1, C.hair); P(8, 0 + b, 2, 1, C.hair); P(11, 1 + b, 1, 1, C.hairDark);
    P(4, 4 + b, 8, 1, C.hair); P(4, 5 + b, 1, 1, C.hair); P(6, 5 + b, 2, 1, C.hair); P(9, 5 + b, 1, 1, C.hair); P(11, 5 + b, 1, 1, C.hair);
    P(3, 4 + b, 1, 5, C.hair); P(12, 4 + b, 1, 5, C.hair); P(3, 7 + b, 1, 2, C.hairDark); P(12, 7 + b, 1, 2, C.hairDark);
    P(5, 2 + b, 3, 1, C.hairLight); P(9, 1 + b, 1, 1, C.hairLight); P(4, 3 + b, 1, 1, C.hairDark); P(10, 3 + b, 2, 1, C.hairDark);
  } else if(dir === 'up'){
    P(4, 10 + b, 8, 5, C.parka); P(3, 15 + b, 10, 1, C.fur); P(5, 15 + b, 1, 1, C.furShade); P(10, 15 + b, 1, 1, C.furShade);
    arms(s === 0 ? 0 : s, s === 0 ? 0 : -s, false);
    P(4, 11 + b, 8, 5, C.pack); P(4, 15 + b, 8, 1, C.packDark); P(5, 12 + b, 2, 2, C.packDark); P(9, 12 + b, 2, 2, C.packDark); P(7, 11 + b, 2, 4, C.leather);
    P(3, 9 + b, 10, 2, C.fur); P(4, 10 + b, 8, 1, C.furShade);
    P(4, 10 + b, 8, 2, C.roll); P(4, 11 + b, 8, 1, C.rollDark); P(6, 10 + b, 1, 2, C.leather); P(9, 10 + b, 1, 2, C.leather);
    P(4, 1 + b, 8, 1, C.hair); P(3, 2 + b, 10, 7, C.hair); P(5, 0 + b, 1, 1, C.hair); P(8, 0 + b, 2, 1, C.hair);
    P(4, 8 + b, 8, 1, C.hairDark); P(3, 6 + b, 1, 3, C.hairDark); P(12, 6 + b, 1, 3, C.hairDark);
    P(5, 2 + b, 3, 1, C.hairLight); P(9, 3 + b, 2, 1, C.hairLight); P(6, 5 + b, 1, 2, C.hairDark); P(9, 6 + b, 1, 2, C.hairDark);
  } else {
    P(2, 10 + b, 4, 6, C.pack); P(2, 10 + b, 1, 6, C.packDark); P(2, 15 + b, 4, 1, C.packDark); P(3, 12 + b, 2, 2, C.packDark);
    P(2, 8 + b, 4, 2, C.roll); P(2, 9 + b, 4, 1, C.rollDark);
    P(5, 10 + b, 7, 5, C.parka); P(11, 10 + b, 1, 5, C.parkaDark); P(5, 13 + b, 7, 1, C.leather); P(10, 13 + b, 1, 1, C.buckle);
    P(7, 14 + b, 1, 1, C.trim); P(9, 14 + b, 1, 1, C.trim);
    P(4, 15 + b, 9, 1, C.fur); P(6, 15 + b, 1, 1, C.furShade); P(10, 15 + b, 1, 1, C.furShade);
    P(5, 10 + b, 1, 4, C.leather);
    P(11, 12 + b, 2, 1, C.lampFrame); P(11, 13 + b, 2, 2, C.lamp); P(11, 15 + b, 2, 1, C.lampFrame);
    // 가까운 팔: 가까운 다리와 반대로(다리 앞 → 팔 뒤), 범위 x6~x9, 뒤 가장자리 1px 그늘
    const ax = s === 1 ? 6 : s === -1 ? 9 : 8;
    P(ax, 10 + b, 2, 4, C.parkaLight); P(ax, 10 + b, 1, 4, C.parkaDark); P(ax, 13 + b, 2, 1, C.parkaDark); P(ax, 14 + b, 2, 1, C.glove);
    P(4, 9 + b, 8, 2, C.fur); P(5, 10 + b, 6, 1, C.furShade);
    P(7, 4 + b, 5, 5, C.skin); P(8, 8 + b, 4, 1, C.skinShade); P(12, 6 + b, 1, 2, C.skin);
    P(10, 6 + b, 1, 2, C.eye); P(10, 6 + b, 1, 1, C.eyeLight); P(10, 8 + b, 1, 1, C.blush);
    P(4, 1 + b, 8, 1, C.hair); P(3, 2 + b, 10, 2, C.hair); P(6, 0 + b, 1, 1, C.hair); P(9, 0 + b, 2, 1, C.hair);
    P(3, 4 + b, 5, 5, C.hair); P(8, 4 + b, 5, 1, C.hair); P(9, 5 + b, 1, 1, C.hair); P(11, 5 + b, 2, 1, C.hair);
    P(3, 7 + b, 2, 2, C.hairDark); P(7, 5 + b, 1, 3, C.hairDark); P(12, 2 + b, 1, 2, C.hairDark);
    P(5, 2 + b, 3, 1, C.hairLight); P(4, 4 + b, 2, 1, C.hairLight);
  }
  return P.done(dir === 'left');
}

// v2 시안: 게임의 tdPlayerSpriteV2와 같은 마무리 과정을 시안 그림에 적용(값도 같음)
function tdPlayerSpriteG1V2(dir, frame){
  const C = TD_PLAYER_COLORS, r = tdRaster(tdPlayerSpriteG1(dir, frame));
  const clean = [C.eye, C.eyeLight, C.lamp, C.blush, C.mouth].map(c => tdParseColor(c).slice(0, 3).join());
  for(let k = 0; k < r.px.length; k++) if(r.px[k] && r.px[k][3] < 1) r.px[k] = null;
  tdStylize(r, { keep: p => clean.includes(p.slice(0, 3).join()), roundRows: [0, 9], outline: 0.58, light: 0.22, shade: 0.14 });
  for(let x = 0; x < r.w; x++){
    let y = 0; while(y < 6 && !r.px[y * r.w + x]) y++;
    const k = (y + 1) * r.w + x, p = r.px[k];
    if(y < 6 && p && p[2] - p[0] > 60) r.px[k] = tdMix(p, [154, 184, 239], 0.32);
  }
  const shadow = [[20, 4, 11, 0.3], [21, 3, 12, 0.2], [21, 4, 11, 0.26]];
  shadow.forEach(([y, x0, x1, a]) => { for(let x = x0; x <= x1; x++){ const k = y * r.w + x; if(!r.px[k] || r.px[k][3] < 1) r.px[k] = [30, 26, 34, a]; } });
  return tdUnraster(r);
}
