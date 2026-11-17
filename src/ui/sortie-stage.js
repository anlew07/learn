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
    const image = getSprite(enemy.kind);
    if (image.complete && image.naturalWidth) {
      if (enemy.kind === "shade") ctx.globalAlpha = 0.83;
      ctx.drawImage(image, Math.floor(enemy.x - 17), Math.floor(enemy.y - 19), 34, 38);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = enemy.kind === "wolf" ? "#c28d74" : "#9ba8c5";
      ctx.fillRect(Math.floor(enemy.x - 8), Math.floor(enemy.y - 8), 16, 16);
    }
    if (enemy.hp < SORTIE.enemies[enemy.kind].hp) {
      ctx.fillStyle = "#f0cf7a";
      ctx.fillRect(Math.floor(enemy.x - 7), Math.floor(enemy.y - 16),
        14 * enemy.hp / SORTIE.enemies[enemy.kind].hp, 2);
    }
  }
  for (const shot of battle.shots) {
    ctx.fillStyle = "#9deed3";
    ctx.fillRect(Math.round(shot.x) - 3, Math.round(shot.y) - 3, 6, 6);
    ctx.fillStyle = "#fff4cc";
    ctx.fillRect(Math.round(shot.x) - 1, Math.round(shot.y) - 1, 2, 2);
  }
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
