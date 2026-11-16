
import { paintWorldSceneDetails } from "./world-scene-details.js";
import heroUrl from "../assets/original/clone-cultivator.svg";
import foeUrl from "../assets/original/rift-beast.svg";
import allyUrl from "../assets/original/rescue-scout.svg";
import chestUrl from "../assets/original/supply-chest.svg";

const WIDTH = 320;
const HEIGHT = 208;
const sources = { hero: heroUrl, foe: foeUrl, ally: allyUrl, chest: chestUrl };
const images = new Map();
let animationId = 0;

function getImage(name, repaint) {
  if (typeof Image === "undefined") return null;
  if (!images.has(name)) {
    const image = new Image();
    images.set(name, image);
    image.onload = repaint;
    image.src = sources[name];
  }
  return images.get(name);
}

function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}
function points(ctx, color, coords) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(coords[0][0], coords[0][1]);
  for (const [x, y] of coords.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}
function noise(x, y, salt = 0) {
  let n = Math.imul(x + 103, 1789) ^ Math.imul(y + 73, 6181) ^ salt;
  n ^= n >>> 13;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function sprite(ctx, name, x, y, w = 16, h = 16, repaint = () => {}) {
  const image = getImage(name, repaint);
  if (image?.complete && image.naturalWidth) {
    ctx.drawImage(image, x | 0, y | 0, w, h);
  }
}
function stoneBrick(ctx, x, y, w = 16, h = 14) {
  // Original hand-authored stone textures: no asset packs and no RNG.
  const base = noise(x, y, 7) > .5 ? "#879090" : "#717f83";
  rect(ctx, "#29383f", x - 1, y - 1, w + 2, h + 2);
  rect(ctx, base, x, y, w, h);
  rect(ctx, "#b9bdad", x + 2, y + 2, Math.max(1, w - 6), 2);
  rect(ctx, "#586769", x + w - 4, y + 4, 3, h - 5);
  if (w >= 14) {
    rect(ctx, "#465760", x + Math.floor(w / 2), y + 6, 2, 5);
    rect(ctx, "#60716c", x + Math.floor(w / 2) - 2, y + 9, 5, 2);
  }
}
function sparkle(ctx, x, y, color) {
  rect(ctx, color, x, y, 2, 6);
  rect(ctx, color, x - 2, y + 2, 6, 2);
  rect(ctx, "#f7e6b0", x, y + 2, 2, 2);
}
function trees(ctx, palette) {
  for (let i = 0; i < 12; i++) {
    const x = i * 31 - 9 + Math.floor(noise(i, 12) * 9);
    const h = 18 + Math.floor(noise(i, 5) * 23);
    rect(ctx, palette.treeDark, x + 7, 65 - h, 3, h + 15);
    points(ctx, palette.treeDark, [[x - 4, 57], [x + 9, 7 - h / 3], [x + 22, 57]]);
    points(ctx, palette.treeLight, [[x, 52], [x + 9, 18 - h / 3], [x + 18, 52]]);
  }
}
function landscape(ctx, palette) {
  rect(ctx, palette.sky1, 0, 0, WIDTH, 102);
  rect(ctx, palette.sky2, 0, 49, WIDTH, 49);
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(noise(i, 8) * WIDTH);
    const y = 7 + Math.floor(noise(i, 9) * 42);
    if (noise(i, 10) > .54) rect(ctx, palette.star, x, y, 1, 1);
  }
  points(ctx, palette.hillFar, [[0, 74], [24, 48], [40, 58], [76, 22], [105, 64],
    [154, 36], [199, 68], [237, 36], [269, 55], [290, 39], [320, 68], [320, 107], [0, 107]]);
  points(ctx, palette.hillNear, [[0, 99], [20, 72], [35, 81], [68, 58], [100, 93],
    [132, 70], [160, 91], [197, 53], [235, 81], [265, 65], [320, 96], [320, 119], [0, 119]]);
  rect(ctx, palette.groundDark, 0, 105, WIDTH, 103);
  rect(ctx, palette.ground, 0, 121, WIDTH, 87);
  trees(ctx, palette);
}
function drawRuins(ctx, palette) {
  // Broken stone gate, hand-painted pixel masonry.
  rect(ctx, "#111a27", 215, 82, 66, 55);
  rect(ctx, palette.wallShade, 216, 77, 18, 59);
  rect(ctx, palette.wallShade, 267, 77, 18, 59);
  rect(ctx, palette.wallShade, 211, 68, 78, 13);
  for (let n = 0; n < 4; n++) {
    stoneBrick(ctx, 214, 73 + n * 14);
    stoneBrick(ctx, 267, 73 + n * 14);
  }
  for (let n = 0; n < 5; n++) stoneBrick(ctx, 208 + n * 16, 60);
  rect(ctx, "#273744", 236, 77, 29, 55);
  points(ctx, "#21445a", [[237, 125], [237, 91], [251, 79], [263, 91], [263, 125]]);
  rect(ctx, palette.rift, 249, 88, 3, 31);
  rect(ctx, "#c2ffe3", 250, 93, 1, 20);
  rect(ctx, palette.wallShade, 200, 134, 91, 6);
  for (let j = 0; j < 13; j++) {
    const x = 203 + j * 7;
    rect(ctx, noise(j, 2) > .5 ? "#83908a" : "#39464a", x, 134, 5, 2);
  }
  // Hanging moss breaks the perfectly rectangular silhouette.
  for (let j = 0; j < 10; j++) {
    const x = 213 + j * 8;
    const len = 4 + Math.floor(noise(j, 44) * 13);
    rect(ctx, "#3e694c", x, 76, 3, len);
    rect(ctx, "#729263", x + 1, 80, 1, Math.floor(len / 2));
  }
}
function ground(ctx, palette, repaint) {
  points(ctx, palette.path, [[89, 129], [175, 117], [222, 136], [198, 156],
    [303, 177], [320, 208], [43, 208], [83, 170], [19, 146]]);
  for (let y = 122; y < 204; y += 4) {
    for (let x = 0; x < WIDTH; x += 5) {
      const roll = noise(x, y);
      if (roll < .08) rect(ctx, "#b7a37d", x, y, 3, 1);
      else if (roll > .88) rect(ctx, "#394b36", x, y, 2, 2);
      else if (roll > .77) rect(ctx, "#7a8b5f", x, y, 1, 3);
    }
  }
  for (const [x, y] of [[22, 146], [46, 169], [182, 158], [305, 148], [174, 192], [265, 179]]) {
    rect(ctx, "#203b38", x, y, 12, 5);
    rect(ctx, "#728b87", x + 2, y - 4, 11, 5);
    rect(ctx, "#a2aca3", x + 4, y - 4, 4, 1);
  }
  // Visible, recognizable supply crate instead of a tiny generic icon.
  rect(ctx, "#3b3738", 20, 165, 20, 5);
  rect(ctx, "#846f53", 24, 159, 13, 8);
  rect(ctx, "#b9a27b", 25, 160, 11, 2);
  sprite(ctx, "chest", 39, 168, 33, 29, repaint);
}
function drawCamp(ctx, frame) {
  // Timber frame, canvas tent, torch and fire embers.
  rect(ctx, "#312529", 7, 115, 72, 38);
  points(ctx, "#a78362", [[7, 119], [25, 85], [62, 87], [78, 119]]);
  points(ctx, "#d7b789", [[13, 115], [31, 92], [57, 92], [73, 115]]);
  rect(ctx, "#79554d", 35, 116, 21, 33);
  rect(ctx, "#352a33", 39, 119, 14, 30);
  rect(ctx, "#e5c9a1", 18, 117, 6, 4);
  rect(ctx, "#72523a", 7, 145, 72, 4);
  rect(ctx, "#4e3f32", 15, 106, 3, 38);
  rect(ctx, "#4e3f32", 68, 106, 3, 38);
  const flicker = Math.floor(frame / 9) % 3;
  rect(ctx, "#342a26", 66, 154, 31, 7);
  rect(ctx, "#bb5c36", 73, 147 - flicker, 15, 12);
  rect(ctx, "#ed9d3e", 77, 140 + flicker, 10, 14);
  rect(ctx, "#fbe2a0", 80, 146 + flicker, 5, 10);
  rect(ctx, "#fff4d4", 82, 148 + flicker, 2, 5);
  rect(ctx, "#4b362b", 69, 157, 25, 3);
  rect(ctx, "#a16d4b", 10, 150, 31, 7);
  rect(ctx, "#523729", 10, 158, 31, 4);
  rect(ctx, "#e4c797", 16, 153, 4, 2);
  for (let j = 0; j < 5; j++) {
    rect(ctx, "#f9c46a", 80 + Math.floor(noise(j, 3) * 19) - 9,
      133 - ((frame + j * 21) % 38), 2, 2);
  }
}
function environment(ctx, view, frame, repaint) {
  const dark = view.danger >= 75;
  const palette = view.worldId === "zombie" ? {
    sky1: "#394958", sky2: "#536a6b", star: "#c1d6cf", hillFar: "#3b5555",
    hillNear: "#253d3f", groundDark: "#243935", ground: "#5e6f59",
    treeDark: "#1d3330", treeLight: "#2d4b40", path: "#6e715e",
    wallShade: "#5e6863", rift: "#d3a762",
  } : view.worldId === "beast" ? {
    sky1: "#554d6b", sky2: "#846171", star: "#eee1bb", hillFar: "#65556b",
    hillNear: "#454254", groundDark: "#34443b", ground: "#6f7954",
    treeDark: "#28352e", treeLight: "#4b6143", path: "#a68c68",
    wallShade: "#817b78", rift: "#efbb6e",
  } : {
    sky1: "#243659", sky2: "#6b6686", star: "#f3d3a1", hillFar: "#4e6682",
    hillNear: "#2e4c62", groundDark: "#24474a", ground: "#667a55",
    treeDark: "#1c3940", treeLight: "#31534e", path: "#9c9173",
    wallShade: "#727d7e", rift: "#66eacb",
  };
  landscape(ctx, palette);
  drawRuins(ctx, palette);
  ground(ctx, palette, repaint);
  drawCamp(ctx, frame);
  if (dark) {
    rect(ctx, "rgba(59,19,39,.2)", 0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(noise(i, 23) * WIDTH);
      sparkle(ctx, x, 60 + Math.floor(noise(i, 38) * 115), "#ec9081");
    }
  }
}
function characters(ctx, view, frame, repaint) {
  const scene = view.scene;
  if (scene?.phase === "lost") return;
  const bob = view.paused ? 0 : Math.floor(frame / 14) % 2;
  const activity = scene?.activity;
  const heroX =
    activity === "gathering" ? 64 : activity === "rescuing" ? 198 :
    activity === "exploring" ? 156 : activity === "defending" ? 148 : 123;
  const heroY = activity === "rescuing" ? 103 : activity === "gathering" ? 121 : 111;
  rect(ctx, "#1c3034", heroX + 5, heroY + 57, 40, 4);
  sprite(ctx, "hero", heroX, heroY - bob, 46, 62, repaint);
  // One readable character with actual sword and cloak replaces a stretched tiny sprite.
  if ((scene?.growthTier || 0) >= 1) sparkle(ctx, heroX + 38, heroY + 3, "#79e7c5");
  if ((scene?.growthTier || 0) >= 2) sparkle(ctx, heroX + 9, heroY - 5, "#e8c888");
  const allyX = scene?.phase === "restored" ? 105 : 91;
  rect(ctx, "#202d32", allyX + 3, 169, 26, 3);
  sprite(ctx, "ally", allyX, 127 + bob, 32, 45, repaint);
  if (scene?.phase !== "restored" && (scene?.activeThreat || view.danger > 45)) {
    rect(ctx, "#273139", 275, 177, 41, 4);
    sprite(ctx, "foe", 268, 125 + (frame % 31 > 15 ? 1 : 0), 48, 53, repaint);
    rect(ctx, "#492b37", 272, 120, 43, 5);
    rect(ctx, "#d28a7b", 274, 121, 39 * Math.min(1, view.danger / 100), 3);
  }
  if (scene?.hasEvent) sparkle(ctx, 263, 89 + bob, "#f5d392");
  if (scene?.recentCombat) sparkle(ctx, 176, 120 - bob, "#f3e29a");
  if (scene?.phase === "restored") sparkle(ctx, 170, 110, "#a2f7cc");
}
function overlay(ctx, view) {
  rect(ctx, "rgba(11,24,30,.88)", 0, 0, 91, 16);
  rect(ctx, "#afcfb9", 0, 14, 91, 2);
  ctx.fillStyle = "#f7eac8";
  ctx.font = "bold 9px monospace";
  ctx.fillText(view.worldId === "lingzai" ? "01 / 灵脉遗迹" :
    view.worldId === "zombie" ? "02 / 废土前哨" : "03 / 兽潮边界", 8, 11);
  if (view.paused) {
    rect(ctx, "#171f2d", 265, 0, 55, 16);
    ctx.fillStyle = "#e8d9bc";
    ctx.fillText("Ⅱ PAUSE", 272, 11);
  }
}

export function paintPixelStage(canvas, view, frame = 0) {
  if (!canvas || !view) return;
  if (canvas.width !== WIDTH) canvas.width = WIDTH;
  if (canvas.height !== HEIGHT) canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const repaint = () => {
    if (canvas.isConnected) paintPixelStage(canvas, view, frame);
  };
  environment(ctx, view, frame, repaint);
  paintWorldSceneDetails(ctx, view, frame);
  characters(ctx, view, frame, repaint);
  overlay(ctx, view);
}

export function startPixelStage(canvas, view) {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = 0;
  if (!canvas || !view) return;
  let frame = 0;
  paintPixelStage(canvas, view, frame);
  if (view.paused || !view.active || document.hidden ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let previous = 0;
  const loop = (time) => {
    if (!canvas.isConnected || document.hidden) {
      animationId = 0;
      return;
    }
    // Cap purely decorative canvas updates near 12 fps for mobile thermals.
    if (time - previous >= 80) {
      previous = time;
      frame = (frame + 1) % 300;
      paintPixelStage(canvas, view, frame);
    }
    animationId = requestAnimationFrame(loop);
  };
  animationId = requestAnimationFrame(loop);
}

export function stopPixelStage() {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = 0;
}
