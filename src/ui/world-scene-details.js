/**
 * Cosmetic world-state overlays for the existing 320x208 Canvas scene.
 * No engine calls, RNG, rewards, state writes or invented construction.
 * Every marker has an exact RunState-derived tier in stage-view.js.
 */
function block(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, width | 0, height | 0);
}

function shine(ctx, x, y, color) {
  block(ctx, color, x + 2, y, 2, 9);
  block(ctx, color, x, y + 3, 6, 2);
  block(ctx, "#f9ecca", x + 2, y + 3, 2, 2);
}

function supplyPacks(ctx, tier) {
  // Supply bundles stand for resources already owned; not built structures.
  const crates = tier === 2 ? 4 : tier === 1 ? 2 : 0;
  for (let index = 0; index < crates; index++) {
    const x = 11 + index * 12;
    const y = index % 2 ? 174 : 181;
    block(ctx, "#352b28", x - 1, y + 1, 12, 11);
    block(ctx, "#a87b52", x, y, 10, 9);
    block(ctx, "#d4aa70", x + 1, y + 1, 8, 2);
    block(ctx, "#584435", x + 4, y + 2, 2, 7);
    block(ctx, "#e4cc93", x + 1, y + 4, 8, 1);
  }
}

function progressMarkers(ctx, stage, frame) {
  // No completed-city art is shown until actual status === "saved".
  if (stage >= 1) {
    block(ctx, "#333c43", 180, 128, 15, 4);
    block(ctx, "#667a75", 183, 115, 9, 14);
    block(ctx, "#b5b7a7", 185, 113, 5, 3);
    block(ctx, "#263a42", 186, 119, 3, 6);
  }
  if (stage >= 2) {
    block(ctx, "#354f53", 188, 103, 3, 13);
    block(ctx, "#7cc5b2", 188, 103, 3, 9);
    block(ctx, "#c9efcb", 189, 105, 1, 5);
    block(ctx, "#283842", 180, 111, 3, 6);
    block(ctx, "#9fe1c6", 179, 111, 3, 3);
  }
  if (stage >= 3) {
    // P100 is only "preparations complete", not world victory.
    for (let i = 0; i < 5; i++) {
      const x = 222 + i * 11;
      block(ctx, "#8fd7bf", x, 64 - i % 2, 5, 2);
      block(ctx, "#dcefc3", x + 1, 63 - i % 2, 2, 1);
    }
    if (frame % 36 < 18) shine(ctx, 238, 84, "#b3e2cb");
  }
}

function warning(ctx, severe, frame) {
  const mist = severe ? "#824b64" : "#5b5969";
  // Cracks in terrain and rift haze correspond to actual crisis pressure.
  for (let i = 0; i < (severe ? 7 : 3); i++) {
    const x = 204 + i * 15;
    const y = 160 + (i % 3) * 9;
    block(ctx, "#2a323b", x, y, 10, 2);
    block(ctx, mist, x + 4, y - 4, 2, 5);
    block(ctx, severe ? "#b66c71" : "#827178", x + 5, y - 1, 5, 1);
  }
  const pulse = severe && frame % 32 < 16;
  const strips = severe ? 6 : 3;
  for (let i = 0; i < strips; i++) {
    block(ctx, pulse ? "#b96b8c" : mist, 242 + i * 5, 86 + i % 3 * 7, 4, 3);
    block(ctx, "#383748", 244 + i * 5, 89 + i % 3 * 7, 2, 4);
  }
  if (severe) {
    block(ctx, "#b97b75", 255, 119, 3, 16);
    shine(ctx, 279, 129, "#cb7a8e");
  }
}

function rescued(ctx) {
  // Sealed rift, relief signal and repaired safe route.
  block(ctx, "#416557", 236, 83, 29, 47);
  block(ctx, "#659c75", 240, 90, 22, 30);
  block(ctx, "#a6db9e", 247, 96, 8, 18);
  block(ctx, "#f0e3a3", 250, 96, 2, 18);
  block(ctx, "#c4f3b8", 243, 104, 16, 3);
  block(ctx, "#f4e1a5", 248, 100, 4, 4);
  // Decorative relief banner, not a new facility.
  block(ctx, "#bcb398", 167, 104, 3, 43);
  block(ctx, "#d5d7a2", 170, 104, 24, 15);
  block(ctx, "#5d9c76", 172, 107, 20, 10);
  block(ctx, "#c5e8b0", 178, 110, 8, 4);
  for (const [x, y] of [[201, 143], [223, 160], [305, 185], [113, 191]]) {
    block(ctx, "#3b6d52", x, y, 3, 5);
    block(ctx, "#d5ce87", x + 1, y - 2, 2, 2);
  }
}

function lost(ctx) {
  block(ctx, "rgba(20, 24, 34, .52)", 0, 0, 320, 208);
  block(ctx, "#6b4348", 250, 89, 3, 32);
  block(ctx, "#bb6a68", 249, 98, 2, 15);
  block(ctx, "#403440", 16, 111, 48, 7);
  block(ctx, "#564649", 42, 119, 13, 25);
}

function dailyActivity(ctx, activity, frame) {
  const blink = frame % 36 < 18;
  if (activity === "training") {
    if (blink) shine(ctx, 159, 129, "#8edac7");
  } else if (activity === "gathering") {
    block(ctx, "#e6ba79", 77, 167, 3, 5);
    if (blink) shine(ctx, 66, 162, "#edc78a");
  } else if (activity === "defending") {
    block(ctx, "#d7b79a", 172, 138, 12, 2);
    if (blink) shine(ctx, 176, 131, "#efc17a");
  } else if (activity === "rescuing") {
    if (blink) shine(ctx, 236, 112, "#a7e4ca");
  } else if (activity === "exploring") {
    block(ctx, "#dfc787", 200, 137, 4, 9);
    block(ctx, "#6a5741", 201, 139, 2, 5);
  }
}

export function paintWorldSceneDetails(ctx, view, frame = 0) {
  const stage = view?.scene;
  if (!stage) return;
  supplyPacks(ctx, stage.supplyTier);
  progressMarkers(ctx, stage.progressTier, frame);
  if (stage.phase === "warning" || stage.phase === "critical") {
    warning(ctx, stage.phase === "critical", frame);
  } else if (stage.phase === "restored") {
    rescued(ctx);
  } else if (stage.phase === "lost") {
    lost(ctx);
  }
  if (stage.phase !== "lost" && stage.phase !== "restored") {
    dailyActivity(ctx, stage.activity, frame);
  }
}
