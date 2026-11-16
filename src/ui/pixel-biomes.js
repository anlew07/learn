/**
 * Original hand-drawn 320px biomes. They replace the generic fantasy gate in
 * wasteland and beast worlds. Rendering only: no RNG, engine calls or storage.
 * Stage coordinates use whole pixels and never pretend a building was purchased.
 */
function tile(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}
function polygon(ctx, color, vertices) {
  ctx.fillStyle = color;
  ctx.beginPath();
  vertices.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fill();
}
function stone(ctx, x, y, color) {
  tile(ctx, "#202829", x - 1, y - 1, 10, 7);
  tile(ctx, color, x, y, 8, 5);
  tile(ctx, "#d4c099", x + 1, y + 1, 4, 1);
  tile(ctx, "#43504d", x + 5, y + 3, 3, 1);
}
function wastelandArchitecture(ctx, severe) {
  // Silhouette: collapsed concrete shelter, rusty watch platform, power line.
  tile(ctx, "#1a2a2b", 213, 77, 72, 63);
  tile(ctx, "#53615a", 219, 83, 60, 49);
  tile(ctx, "#758075", 219, 81, 45, 7);
  tile(ctx, "#b49d7a", 220, 82, 39, 2);
  tile(ctx, "#384644", 238, 91, 24, 41);
  tile(ctx, "#182c2d", 241, 94, 18, 38);
  tile(ctx, severe ? "#d29a72" : "#88af8d", 243, 98, 12, 4);
  tile(ctx, "#83948a", 264, 91, 11, 6);
  tile(ctx, "#283a3b", 267, 97, 8, 34);
  for (let i = 0; i < 4; i++) {
    const x = 216 + i * 18;
    tile(ctx, "#374747", x, 82 + (i % 2) * 2, 3, 51);
    tile(ctx, "#a69d87", x + 1, 88, 1, 30);
    tile(ctx, "#6f7770", 220 + i * 17, 130, 15, 4);
  }
  tile(ctx, "#b1805f", 209, 74, 74, 5);
  tile(ctx, "#654d43", 208, 79, 74, 3);
  tile(ctx, "#bfa581", 214, 72, 39, 2);
  tile(ctx, "#26383a", 277, 66, 4, 65);
  tile(ctx, "#d2b17e", 269, 67, 17, 4);
  tile(ctx, "#9a7962", 282, 75, 3, 18);
  tile(ctx, "#a9ac98", 234, 112, 7, 3);
  tile(ctx, "#a9ac98", 245, 113, 6, 2);
  // Hazard ribbon appears only at actual critical pressure.
  if (severe) {
    tile(ctx, "#dba079", 226, 110, 12, 3);
    tile(ctx, "#b86d61", 227, 111, 3, 2);
    tile(ctx, "#b86d61", 233, 111, 3, 2);
  }
}
function beastArchitecture(ctx, severe) {
  // Silhouette: timber barricade, torn lookout banner, stone mound.
  polygon(ctx, "#2b302b", [[204, 137], [217, 84], [250, 69], [281, 93], [294, 139]]);
  polygon(ctx, "#675e4c", [[213, 133], [224, 91], [249, 79], [275, 95], [285, 134]]);
  polygon(ctx, "#a88a65", [[220, 95], [247, 73], [278, 96], [272, 102], [247, 83], [224, 102]]);
  tile(ctx, "#26332f", 238, 99, 24, 36);
  tile(ctx, "#8d7659", 240, 100, 20, 5);
  tile(ctx, "#25332f", 244, 107, 15, 26);
  for (let i = 0; i < 9; i++) {
    const x = 203 + i * 10;
    const peak = i % 2 ? 101 : 92;
    polygon(ctx, "#352d29", [[x, 136], [x + 1, peak], [x + 5, peak - 6], [x + 8, peak], [x + 9, 136]]);
    tile(ctx, "#9a7b55", x + 2, peak + 3, 5, 29);
    tile(ctx, "#c09c6e", x + 3, peak + 5, 1, 22);
  }
  tile(ctx, "#4b3c35", 205, 125, 89, 6);
  tile(ctx, "#be9b68", 207, 126, 85, 2);
  tile(ctx, "#39372e", 270, 73, 3, 22);
  tile(ctx, severe ? "#b66c5b" : "#bbac7b", 273, 74, 13, 9);
  tile(ctx, "#edcd86", 276, 76, 6, 2);
  tile(ctx, "#9b5c4f", 278, 79, 3, 4);
}
export function paintWorldArchitecture(ctx, view) {
  const severe = view?.scene?.phase === "critical";
  if (view?.worldId === "zombie") wastelandArchitecture(ctx, severe);
  if (view?.worldId === "beast") beastArchitecture(ctx, severe);
}
export function paintWorldSkyDetails(ctx, view, topHeight) {
  if (topHeight < 18) return;
  const floor = topHeight - 1;
  if (view?.worldId === "zombie") {
    // Remote skyline and a snapped signal mast (non-interactive terrain).
    tile(ctx, "#283d3a", 0, floor - 26, 320, 26);
    for (const [x, w, h] of [[7, 25, 17], [37, 22, 31], [65, 32, 23], [107, 27, 38], [153, 35, 24], [194, 31, 15], [269, 38, 28]]) {
      tile(ctx, "#40554f", x, floor - h, w, h);
      for (let j = 4; j < w - 2; j += 9) tile(ctx, "#849185", x + j, floor - h + 5, 3, 3);
    }
    tile(ctx, "#253735", 41, floor - 49, 3, 48);
    tile(ctx, "#c09b6e", 37, floor - 50, 10, 3);
    tile(ctx, "#a28f77", 41, floor - 46, 32, 1);
    tile(ctx, "#9e8d71", 72, floor - 45, 3, 9);
  } else if (view?.worldId === "beast") {
    // Angular ridge silhouettes replace the mystic tower.
    polygon(ctx, "#363544", [[0, floor], [8, floor - 18], [20, floor - 29], [30, floor - 14],
      [52, floor - 47], [71, floor - 19], [87, floor - 38], [112, floor], [320, floor]]);
    polygon(ctx, "#5c5260", [[132, floor], [154, floor - 25], [167, floor - 40],
      [181, floor - 19], [207, floor - 36], [233, floor - 12],
      [273, floor - 43], [289, floor - 18], [320, floor]]);
    tile(ctx, "#b79e7a", 52, floor - 42, 5, 4);
    tile(ctx, "#d0b47f", 271, floor - 38, 4, 4);
  }
}
export function paintWorldForeground(ctx, view, frame = 0) {
  const world = view?.worldId;
  const active = view?.scene?.phase !== "lost";
  if (world === "lingzai") {
    // Small rune stones communicate a place, not a new gameplay resource.
    stone(ctx, 185, 171, "#84938a");
    stone(ctx, 198, 177, "#607e73");
    tile(ctx, "#a9dcc2", 190, 173, 2, 3);
    tile(ctx, "#dce7c0", 191, 174, 1, 1);
    if (active && view?.scene?.progressTier >= 2) {
      tile(ctx, "#83c7af", 185, 160 + (frame % 24 < 12 ? 0 : 1), 3, 5);
      tile(ctx, "#f0e1b5", 186, 162, 1, 1);
    }
  } else if (world === "zombie") {
    // Discarded machine fragments and field route markings.
    tile(ctx, "#2f3632", 190, 168, 14, 7);
    tile(ctx, "#738277", 192, 163, 12, 6);
    tile(ctx, "#b9a37a", 194, 164, 7, 2);
    tile(ctx, "#986d52", 183, 173, 12, 3);
    for (let i = 0; i < 3; i++) {
      tile(ctx, "#bf9d6c", 210 + i * 12, 181 + i * 3, 9, 2);
    }
  } else if (world === "beast") {
    // Claw tracks and stone cairns are world landmarks.
    stone(ctx, 180, 166, "#a28d6f");
    stone(ctx, 194, 171, "#8b765d");
    for (let i = 0; i < 3; i++) {
      const x = 211 + i * 11;
      tile(ctx, "#3d3b33", x, 181 + i * 2, 2, 8);
      tile(ctx, "#3d3b33", x + 4, 179 + i * 2, 2, 7);
      tile(ctx, "#3d3b33", x + 8, 182 + i * 2, 2, 5);
    }
  }
}
