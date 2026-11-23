/**
 * A visual *recap* of an already-settled formal-world battle.
 * Numbers come exclusively from lastCombat.spectacle; nothing here hits,
 * moves or rewards an authoritative combat entity.
 */
function tile(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, width | 0, height | 0);
}

export function paintRecentEncounter(ctx, encounter, frame = 0) {
  if (!encounter?.waves?.length) return;
  const waveIndex = Math.floor(frame / 30) % encounter.waves.length;
  const wave = encounter.waves[waveIndex];
  const enemyCount = Math.min(4, Math.ceil(wave.encountered / 4));
  const flash = wave.defeated > 0 && frame % 30 >= 13 && frame % 30 <= 19;

  // A few readable silhouettes suggest the genuine three-wave encounter.
  // They are not a second enemy spawn schedule and do not claim 1:1 counts.
  for (let index = 0; index < enemyCount; index++) {
    const x = 216 + index * 19 + (frame % 30 < 13 ? 5 : 0);
    const y = 126 + (index % 2) * 21;
    tile(ctx, "#21323a", x - 2, y + 16, 19, 4);
    tile(ctx, "#403f4d", x, y + 3, 14, 13);
    tile(ctx, "#86616a", x + 2, y, 10, 5);
    tile(ctx, "#f3bd89", x + 9, y + 7, 3, 2);
    if (flash && index < Math.ceil(enemyCount * wave.defeated / wave.encountered)) {
      tile(ctx, "#f6de9b", x - 4, y - 5, 4, 16);
      tile(ctx, "#fff0c2", x - 8, y + 1, 13, 4);
    }
  }

  // The flying blade is cosmetic. Attack intensity is gated by real defeats.
  if (wave.defeated > 0) {
    const stride = (frame % 30) / 30;
    const x = 179 + Math.floor(stride * 35);
    const y = 147 - Math.floor(Math.sin(stride * Math.PI) * 14);
    tile(ctx, "#def8e2", x, y, 13, 3);
    tile(ctx, "#8bd6bb", x - 5, y + 1, 7, 2);
    tile(ctx, "#fff4b2", x + 12, y - 1, 3, 5);
  }
}
