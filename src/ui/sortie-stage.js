import { SORTIE } from "../config/sortie-data.js";
import cultivator from "../assets/original/clone-cultivator.svg";
import riftBeast from "../assets/original/rift-beast.svg";
import hornedHunter from "../assets/original/horned-hunter.svg";

const spritePaths = { hero: cultivator, wolf: riftBeast, shade: hornedHunter };
const sprites = new Map();
function getSprite(name) {
  if (!sprites.has(name)) {
    const image = new Image();
    image.src = spritePaths[name];
    sprites.set(name, image);
  }
  return sprites.get(name);
}

/** Rendering must not update battle rules or consume RNG. */
export function drawSortie(canvas, battle) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !battle) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1d302b";
  ctx.fillRect(0, 0, SORTIE.width, SORTIE.height);
  for (let y = 0; y < SORTIE.height; y += 16) {
    for (let x = 0; x < SORTIE.width; x += 16) {
      const tile = ((x * 13 + y * 7) ^ (y * 11)) % 7;
      ctx.fillStyle = tile < 2 ? "#29413a" : tile === 2 ? "#344940" : "#20372f";
      ctx.fillRect(x + 1, y + 1, 14, 14);
      if (tile === 2) {
        ctx.fillStyle = "#63745d";
        ctx.fillRect(x + 5, y + 8, 5, 2);
      }
    }
  }
  ctx.strokeStyle = "#8d9168";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, SORTIE.width - 4, SORTIE.height - 4);
  for (let y = 24; y < SORTIE.height; y += 96) {
    ctx.fillStyle = "#82967d";
    ctx.fillRect(6, y, 10, 8);
    ctx.fillRect(SORTIE.width - 16, y + 34, 10, 8);
  }
  for (const enemy of battle.enemies) {
    const markerColor = enemy.kind === "wolf" ? "#e3a27c" : "#b9c9ec";
    ctx.fillStyle = "rgba(7, 16, 12, 0.58)";
    ctx.beginPath();
    ctx.ellipse(enemy.x, enemy.y + 13, enemy.kind === "wolf" ? 13 : 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(enemy.x, enemy.y + 13, enemy.kind === "wolf" ? 13 : 11, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    const image = getSprite(enemy.kind);
    if (image.complete && image.naturalWidth) {
      if (enemy.kind === "shade") ctx.globalAlpha = 0.83;
      ctx.drawImage(image, Math.floor(enemy.x - 17), Math.floor(enemy.y - 19), 34, 38);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = enemy.kind === "wolf" ? "#c28d74" : "#9ba8c5";
      ctx.fillRect(Math.floor(enemy.x - 8), Math.floor(enemy.y - 8), 16, 16);
      ctx.strokeStyle = "#101b16";
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.floor(enemy.x - 8), Math.floor(enemy.y - 8), 16, 16);
    }
    const maxHp = SORTIE.enemies[enemy.kind].hp;
    const healthRatio = Math.max(0, Math.min(1, enemy.hp / maxHp));
    ctx.fillStyle = "#111b16";
    ctx.fillRect(Math.floor(enemy.x - 11), Math.floor(enemy.y - 24), 22, 4);
    ctx.fillStyle = markerColor;
    ctx.fillRect(Math.floor(enemy.x - 10), Math.floor(enemy.y - 23), 20 * healthRatio, 2);
  }
  for (const shot of battle.shots) {
    ctx.fillStyle = "#9deed3";
    ctx.fillRect(Math.round(shot.x) - 3, Math.round(shot.y) - 3, 6, 6);
    ctx.fillStyle = "#fff4cc";
    ctx.fillRect(Math.round(shot.x) - 1, Math.round(shot.y) - 1, 2, 2);
  }
  for (const drop of battle.drops) {
    const x = Math.round(drop.x), y = Math.round(drop.y);
    ctx.fillStyle = "rgba(8, 16, 12, 0.55)";
    ctx.fillRect(x - 3, y + 4, 6, 2);
    ctx.fillStyle = "#e2b852";
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.strokeStyle = "#704e25";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = "#fff5bc";
    ctx.fillRect(x - 2, y - 5, 4, 5);
  }
  if (battle.flashUntil > battle.tick) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#e7f6b4";
    for (const target of battle.flashTargets) {
      ctx.beginPath();
      ctx.moveTo(Math.round(battle.hero.x), Math.round(battle.hero.y));
      ctx.lineTo(Math.round(target.x), Math.round(target.y));
      ctx.stroke();
    }
  }
  for (const shot of battle.hostileShots) {
    ctx.fillStyle = "#927aba";
    ctx.fillRect(Math.round(shot.x) - 4, Math.round(shot.y) - 4, 8, 8);
    ctx.fillStyle = "#e7cafa";
    ctx.fillRect(Math.round(shot.x) - 2, Math.round(shot.y) - 2, 4, 4);
  }
  if (battle.runeShield > 0) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#a6f2d2";
    ctx.beginPath();
    ctx.arc(battle.hero.x, battle.hero.y, 17, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(7, 16, 12, 0.62)";
  ctx.beginPath();
  ctx.ellipse(battle.hero.x, battle.hero.y + 18, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f5d77c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(battle.hero.x, battle.hero.y + 1, 14, 19, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#fff0a8";
  ctx.beginPath();
  ctx.moveTo(battle.hero.x, battle.hero.y - 32);
  ctx.lineTo(battle.hero.x - 4, battle.hero.y - 26);
  ctx.lineTo(battle.hero.x + 4, battle.hero.y - 26);
  ctx.closePath();
  ctx.fill();
  const hero = getSprite("hero");
  if (battle.hero.invulnerable === 0 || battle.tick % 8 < 4) {
    if (hero.complete && hero.naturalWidth) {
      ctx.drawImage(hero, Math.floor(battle.hero.x - 18), Math.floor(battle.hero.y - 26), 36, 48);
    } else {
      ctx.fillStyle = "#d4e0bc";
      ctx.fillRect(Math.floor(battle.hero.x - 8), Math.floor(battle.hero.y - 11), 16, 22);
    }
  }
}
