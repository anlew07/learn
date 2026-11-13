import { COMBOS } from "../config/game-data.js";

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

function equippedPowers(worldId, build, powers) {
  const available = powers[worldId] || [];
  return [...(build.attack || []), ...(build.support || [])]
    .map((slot) => {
      const power = available.find((candidate) => candidate.id === slot.id);
      if (!power) return null;
      const level = Math.max(0, Math.min(2, Math.floor(Number(slot.lv) || 0)));
      return level > 0 ? { ...slot, lv: level, power } : null;
    })
    .filter(Boolean);
}

function hasValidEvolution(worldId, build, equipped) {
  const combo = COMBOS[worldId];
  return Boolean(
    build.evolved &&
      combo &&
      combo.slice(0, 2).every((id) => equipped.some((slot) => slot.id === id)),
  );
}

/**
 * Resolve all survivor-wave effects as one aggregate reward transaction.
 *
 * The clear/loot/loss components are performance-sensitive: a build must
 * actually defeat enemies and counter elite waves to earn them. They are
 * never paid per enemy, and the existing per-fight caps remain authoritative.
 */
export function computeWaveBonuses(worldId, build, powers, spectacle = null) {
  const equipped = equippedPowers(worldId, build, powers);
  const totals = { clear: 0, loot: 0, defense: 0 };

  for (const slot of equipped) {
    if (Object.prototype.hasOwnProperty.call(totals, slot.power.kind)) {
      totals[slot.power.kind] += slot.lv;
    }
  }

  const evolved = hasValidEvolution(worldId, build, equipped);
  const baseClear = totals.clear + Number(evolved);
  const evolutionXp = evolved && worldId === "lingzai" ? 0.25 : 0;
  const evolutionResource = evolved && worldId === "beast" ? 0.25 : 0;
  const evolutionDefense = evolved && worldId === "zombie" ? 0.1 : 0;

  const baseExperience = Math.min(0.5, baseClear * 0.25) + evolutionXp;
  const baseResources = Math.min(0.25, totals.loot * 0.125) + evolutionResource;
  const baseDoomReduction =
    Math.min(0.15, totals.defense * 0.05 + baseClear * 0.03) + evolutionDefense;

  const clearRate =
    spectacle?.encountered > 0
      ? Math.max(0, Math.min(1, spectacle.defeated / spectacle.encountered))
      : 0;
  const counteredWaves = (spectacle?.waves || []).filter(
    (wave) => wave.trait?.countered,
  ).length;

  const requestedClearBonus = Math.min(0.15, totals.clear * 0.05 * clearRate);
  const requestedLossMitigation = Math.min(
    0.08,
    totals.defense * 0.02 * clearRate + counteredWaves * 0.015,
  );
  const requestedLootModifier = Math.min(0.1, totals.loot * 0.05 * clearRate);

  const xp = Math.min(0.75, baseExperience + requestedClearBonus);
  const resource = Math.min(0.5, baseResources + requestedLootModifier);
  const doomReduction = Math.min(0.25, baseDoomReduction + requestedLossMitigation);

  return {
    xp,
    resource,
    doomReduction,
    waveClearBonus: Math.max(0, xp - Math.min(0.75, baseExperience)),
    waveLossMitigation: Math.max(
      0,
      doomReduction - Math.min(0.25, baseDoomReduction),
    ),
    waveLootModifier: Math.max(
      0,
      resource - Math.min(0.5, baseResources),
    ),
    clearRate,
    counteredWaves,
    skills: equipped.map((slot) => slot.power.name),
    evolution: evolved ? build.evolutionName : "",
    stages: WAVE_STAGES[worldId] || [],
  };
}
