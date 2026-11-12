/**
 * Deterministic bonuses and battle summary for the optional survivor-wave
 * experiment. Nothing here can raise actual level, override a boss check or
 * grant a second battle reward.
 */
export const WAVE_STAGES = Object.freeze({
  lingzai: ["妖影逼近", "飞剑与符阵迎击", "肃清残余妖气"],
  zombie: ["感染者逼近", "防线迎击尸群", "肃清残余感染体"],
  beast: ["异兽群迁徙", "猎人反击", "追踪溃散兽群"],
});

export function computeWaveBonuses(worldId, build, powers) {
  const totals = { clear: 0, loot: 0, defense: 0 };
  const equipped = [...build.attack, ...build.support];

  for (const slot of equipped) {
    const power = powers[worldId].find((p) => p.id === slot.id);
    if (power) totals[power.kind] += slot.lv;
  }
  const baseClear = totals.clear + Number(build.evolved);
  let experience = Math.min(0.5, baseClear * 0.25);
  let resources = Math.min(0.25, totals.loot * 0.125);
  let doomReduction = Math.min(0.15, totals.defense * 0.05 + baseClear * 0.03);

  // A successful 2-part evolution must have an observable advantage even
  // when base bonuses have already hit their caps.
  if (build.evolved) {
    if (worldId === "lingzai") experience += 0.25;
    if (worldId === "zombie") doomReduction += 0.1;
    if (worldId === "beast") resources += 0.25;
  }
  return {
    xp: Math.min(0.75, experience),
    resource: Math.min(0.5, resources),
    doomReduction: Math.min(0.25, doomReduction),
    skills: equipped
      .map((slot) => powers[worldId].find((p) => p.id === slot.id)?.name)
      .filter(Boolean),
    evolution: build.evolved ? build.evolutionName : "",
    stages: WAVE_STAGES[worldId],
  };
}
