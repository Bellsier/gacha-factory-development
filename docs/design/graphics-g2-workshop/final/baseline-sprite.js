// Frozen pre-G2 workshop from ab0ad8c; comparison/test fixture only.
function tdBaseSpriteBeforeG2(){
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
