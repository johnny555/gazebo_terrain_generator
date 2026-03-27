/**
 * Convert canvas pixel position to world ENU coordinates (meters).
 *
 * The terrain image covers size_x (east-west) by size_y (north-south) meters.
 * The terrain model is placed at (pose_x, pose_y, pose_z) relative to the world origin.
 */
export function pixelToWorld(px, py, terrainInfo, imageWidth, imageHeight) {
  // Normalize to [0, 1]
  const normX = px / imageWidth;
  const normY = py / imageHeight;

  // Meters relative to terrain center
  // Image: left=west, right=east, top=north, bottom=south
  const terrainX = (normX - 0.5) * terrainInfo.size_x;
  const terrainY = (0.5 - normY) * terrainInfo.size_y;

  // World coords (terrain center is offset from world origin by pose_x, pose_y)
  const worldX = terrainX + terrainInfo.pose_x;
  const worldY = terrainY + terrainInfo.pose_y;

  return { x: worldX, y: worldY };
}

/**
 * Convert world ENU coordinates to canvas pixel position.
 */
export function worldToPixel(worldX, worldY, terrainInfo, imageWidth, imageHeight) {
  const terrainX = worldX - terrainInfo.pose_x;
  const terrainY = worldY - terrainInfo.pose_y;

  const normX = terrainX / terrainInfo.size_x + 0.5;
  const normY = 0.5 - terrainY / terrainInfo.size_y;

  return {
    px: normX * imageWidth,
    py: normY * imageHeight,
  };
}
