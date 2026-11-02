/* G2 review-only art. No boot hook, state access, storage or production override.
 * Uses the existing painter vocabulary; door, sill and two light anchors retained.
 */
const G2Workshop = Object.freeze({
  variants: ['current', 'A', 'B', 'C'],
  sprite(variant) {
    if (variant === 'current') return tdBaseSprite();
    if (!['A', 'B', 'C'].includes(variant)) throw new Error('Unknown G2 variant');
    const P = tdPainter(64, 58), B = TD_BUILDING;
    // Keep the original outline, chimney, door, windows and ground shadow.
    const original = tdBaseSprite();
    original.rects.forEach(r => P(...r));
    // Warm side-plane and worn boards; the structural envelope is unchanged.
    P(54, 30, 2, 15, '#866342'); P(8, 30, 1, 19, '#c29a65');
    P(9, 31, 14, 1, '#c7a16f'); P(40, 31, 15, 1, '#b58d59');
    P(9, 48, 10, 1, '#98714b'); P(40, 48, 8, 1, '#98714b');
    // Roof: a restrained top-left highlight and stepped right-side shade.
    P(12, 5, 31, 1, '#ca795b'); P(11, 6, 30, 1, '#bd6b50');
    P(8, 14, 13, 1, '#bf6d52'); P(6, 20, 16, 1, '#b9634b');
    P(49, 14, 7, 1, '#854333'); P(48, 21, 11, 1, '#854333');
    P(3, 25, 57, 1, '#a4523d');
    // Window sills and lintel highlights do not displace the glowing glass.
    P(10, 43, 13, 1, '#d0a66e'); P(42, 43, 13, 1, '#c59b63');
    P(25, 31, 14, 1, '#d0a66e');
    if (variant === 'A') {
      // One small tool shelf and a repaired crate; familiar cabin silhouette.
      P(10, 46, 9, 2, '#684b34'); P(10, 46, 9, 1, '#c29a65');
      P(12, 44, 1, 2, '#805434'); P(11, 44, 4, 1, '#8f979c');
      P(16, 45, 2, 1, '#b8704f'); P(50, 47, 6, 1, '#c39a63');
      P(50, 51, 1, 2, '#6b7378'); P(55, 51, 1, 2, '#6b7378');
    } else {
      // Replace only lower side-wall furnishings; never paint over the door.
      P(8, 44, 15, 6, '#a78053'); P(40, 44, 16, 6, '#98734c');
      P(8, 50, 15, 4, '#827569'); P(40, 50, 18, 4, '#827569');
      // Heavy timber workbench: illuminated top, dark apron, two grounded legs.
      P(8, 47, 14, 2, '#634832'); P(8, 47, 14, 1, '#d0a16a');
      P(9, 49, 2, 5, '#765237'); P(19, 49, 2, 5, '#60432f');
      P(10, 50, 9, 1, '#98734c');
      if (variant === 'B') {
        // Compact anvil and hammer, with a warm pendant under the left eave.
        P(11, 44, 7, 1, '#a0a2a0'); P(12, 45, 4, 1, '#6b7378'); P(13, 46, 3, 1, '#4a5156');
        P(19, 43, 1, 4, '#855635'); P(18, 43, 4, 1, '#8f979c');
        P(9, 30, 1, 6, '#60432f'); P(8, 35, 3, 3, '#6a4c32'); P(9, 36, 1, 1, '#fff3b0');
        // Two metal straps on the existing chimney, no oversized new machinery.
        P(44, 3, 7, 1, '#aa7350'); P(44, 9, 7, 1, '#9b6547');
        P(44, 2, 1, 9, '#c39566');
        // Stock cubby with cut boards and two muted metal ingots.
        P(42, 46, 14, 8, '#654a34'); P(43, 47, 12, 1, '#c39a63');
        P(43, 49, 12, 1, '#aa8052'); P(43, 52, 12, 1, '#987044');
        P(44, 44, 4, 2, '#8f979c'); P(49, 45, 5, 1, '#b17b55');
        P(41, 45, 1, 9, '#ad8055'); P(55, 46, 1, 8, '#86613e');
      } else {
        // A hand-held relic on a bench, with a small non-neon restoration unit.
        P(12, 43, 5, 4, '#6c746d'); P(13, 43, 3, 1, '#c7bd91');
        P(14, 44, 1, 2, '#7da99b'); P(18, 46, 3, 1, '#ad8055');
        P(42, 45, 13, 9, '#5c605b'); P(43, 45, 10, 1, '#a7a590');
        P(43, 46, 10, 6, '#858778'); P(43, 52, 11, 2, '#605a4b');
        P(45, 47, 4, 3, '#554d3e'); P(46, 48, 2, 1, '#d9b774');
        P(51, 47, 1, 1, '#7da99b'); P(51, 50, 2, 1, '#544d42');
        // Short copper return pipe follows the side wall within the old envelope.
        P(55, 30, 2, 17, '#79543e'); P(55, 30, 1, 17, '#b9895d');
        P(52, 30, 4, 2, '#b9895d'); P(54, 46, 3, 2, '#9c704e');
        P(54, 34, 4, 1, '#6b7378'); P(54, 41, 4, 1, '#6b7378');
      }
    }
    // Original door and step are shared literally, including straps and handle.
    tdDoor(P, 25, 32, 14, 20, false);
    P(26, 37, 12, 1, B.strap); P(26, 46, 12, 1, B.strap); P(35, 41, 2, 2, B.handle);
    P(23, 52, 18, 2, B.step); P(23, 52, 18, 1, B.stepTop);
    return P.done(false);
  }
});
