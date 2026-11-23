/**
 * A visual *recap* of an already-settled formal-world battle.
 * Numbers come exclusively from lastCombat.spectacle; nothing here hits,
 * moves or rewards an authoritative combat entity.
 */
function tile(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, width | 0, height | 0);
}

export function paintRecentEncounter(ctx, encounter, frame = 0, drawFoe = null) {
  if (!encounter?.waves?.length) return;
  const waveIndex = Math.floor(frame / 30) % encounter.waves.length;
  const wave = encounter.waves[waveIndex];
  const enemyCount = Math.min(2, Math.max(1, Math.ceil(wave.encountered / 12)));
  const flash = wave.defeated > 0 && frame % 30 >= 13 && frame % 30 <= 19;

  // Reuse recognizable sprites from the existing three-world pixel stage.
  // A maximum of two silhouettes suggests a real wave; it never claims that
  // each pictured sprite represents one enemy actually defeated.
  const hitCount = Math.ceil(enemyCount * wave.defeated / wave.encountered);
  for (let index = 0; index < enemyCount; index++) {
    const hit = flash && index < hitCount;
    const recoil = hit
      ? Math.round(Math.sin(((frame % 30) - 13) / 6 * Math.PI) * 7)
      : 0;
    const x = 215 + index * 50 + (frame % 30 < 13 ? 4 : 0) + recoil;
    const y = 119 + (index % 2) * 12;
    tile(ctx, "#21323a", x + 4, y + 44, 33, 4);
    if (drawFoe) {
      drawFoe(x, y, 42, 46);
    } else {
      tile(ctx, "#654c54", x + 5, y + 10, 31, 34);
      tile(ctx, "#c98d79", x + 10, y + 7, 22, 9);
      tile(ctx, "#f4d09c", x + 29, y + 21, 4, 3);
    }
    if (hit) {
      // Only the silhouettes covered by the authoritative defeat ratio recoil.
      tile(ctx, "#f6de9b", x - 4, y + 4, 5, 29);
      tile(ctx, "#fff0c2", x - 10, y + 16, 18, 5);
      tile(ctx, "#fff0c2", x + 9, y + 10, 24, 3);
      tile(ctx, "#f6de9b", x + 7, y + 14, 3, 11);
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
