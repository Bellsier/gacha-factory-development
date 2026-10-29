// Coordinate adapter only: leave the shared tile painter and palettes unchanged.
// Original textures are anchored at (-12,-12), including on negative chunks.
function worldPaintTileMap(map, area){
  if(!currentWorldContext()) return tdPaintTileMap(map, area);
  const di=Math.round((map.originX+12)*TOPDOWN.TILES_PER_UNIT);
  const dj=Math.round((map.originY+12)*TOPDOWN.TILES_PER_UNIT);
  const a=area||{i0:0,j0:0,i1:map.cols,j1:map.rows};
  const view={village:map.village,tunnelOpen:map.tunnelOpen,originX:-12,originY:-12,
    minI:di,minJ:dj,cols:map.cols+di,rows:map.rows+dj,
    worldPaintTypeAt:(i,j)=>tdTileType(map,i-di,j-dj)};
  return tdPaintTileMap(view,{i0:a.i0+di,j0:a.j0+dj,i1:a.i1+di,j1:a.j1+dj});
}
