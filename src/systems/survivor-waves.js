import { featuredWaveAttack, evolvedWaveUltimate } from "./attack-patterns.js";

/** Late-game wave traits use the existing combat and power rules. */
export const ELITE_WAVES = Object.freeze({
  horde: Object.freeze({ label: "密集敌潮", extraEnemies: 4, defense: 0, counters: ["fan", "chain", "storm", "barrage"] }),
  armored: Object.freeze({ label: "装甲精英", extraEnemies: 0, defense: 3, counters: ["pierce", "shockwave", "storm", "hunt"] }),
  swift: Object.freeze({ label: "迅捷兽群", extraEnemies: 2, defense: 2, counters: ["flurry", "chain", "hunt", "barrage"] }),
});

/** Shared UI/gameplay description; derived from the same enemy counter table. */
export function counteredEliteWaveLabels(attackStyle) {
  return Object.values(ELITE_WAVES)
    .filter((trait) => trait.counters.includes(attackStyle))
    .map((trait) => trait.label);
}

export function waveEnemyTrait(day, wave) {
  const trait = wave === 1 && day >= 14 ? "horde" :
    wave === 2 && day >= 21 ? "armored" :
    wave === 3 && day >= 28 ? "swift" : "";
  return trait ? { id: trait, ...ELITE_WAVES[trait] } : null;
}

/**
 * Three deterministic monster waves for the optional survivors experiment.
 * The number of enemies encountered and defeated comes from level, equipped
 * skills and build evolution; it is not random decoration.
 *
 * Never alters boss eligibility or the world's base automatic action.
 */
export function simulateSurvivorWaves(worldId, build, powers, { day, level, momentum = 0 }) {
  const equipped = [...(build.attack || []), ...(build.support || [])];
  const attack = equipped.reduce((total, slot) => {
    const power = powers[worldId]?.find((candidate) => candidate.id === slot.id);
    return total + (power?.slot === "attack" ? Math.min(2, slot.lv) : 0);
  }, 0);
  const support = equipped.reduce((total, slot) => {
    const power = powers[worldId]?.find((candidate) => candidate.id === slot.id);
    return total + (power?.slot === "support" ? Math.min(2, slot.lv) : 0);
  }, 0);
  const baseEnemies = Math.min(42, 7 + Math.floor(Math.max(1, day) / 7) * 2);
  const power = 8 + Math.max(0, level - 1) * 3 + attack * 4 +
    support + (build.evolved ? 6 : 0) + Math.min(3, momentum) * 2;
  let chain = 0;
  const waves = [1, 2, 3].map((wave) => {
    const trait = waveEnemyTrait(day, wave);
    const encountered = baseEnemies + (wave - 1) * 5 + (trait?.extraEnemies || 0);
    const attack = evolvedWaveUltimate(worldId, build, wave) ||
      featuredWaveAttack(worldId, build, powers, wave);
    const countered = Boolean(trait?.counters.includes(attack.style));
    // A matching attack offsets elite resistance, but cannot exceed the
    // actual encounter count or create any material/XP rewards.
    const traitPenalty = trait?.defense || 0;
    const counterBonus = countered ? 3 : 0;
    const defeated = Math.min(encountered, Math.max(0,
      power - (wave - 1) * 2 + attack.bonus - traitPenalty + counterBonus));
    chain = defeated === encountered ? chain + 1 : 0;
    return { wave, encountered, defeated, cleared: defeated === encountered,
      attack, trait: trait ? { id: trait.id, label: trait.label, countered } : null };
  });
  const encountered = waves.reduce((sum, wave) => sum + wave.encountered, 0);
  const defeated = waves.reduce((sum, wave) => sum + wave.defeated, 0);
  const fullClear = defeated === encountered;
  return {
    waves,
    encountered,
    defeated,
    fullClear,
    combo: chain,
    momentum: Math.min(3, momentum),
    grade: fullClear ? "清屏" : defeated / encountered >= 0.8 ? "压制" : "鏖战",
    burst: Boolean(build.evolved && fullClear),
  };
}

/** Every third full clear in a short streak unleashes a bounded frenzy pulse. */
export function nextSurvivorFrenzy(previous, day, fullClear) {
  const chained = Boolean(
    fullClear && previous && Number.isFinite(previous.lastDay) &&
    day > previous.lastDay && day - previous.lastDay <= 3,
  );
  const count = fullClear ? (chained ? previous.count || 0 : 0) + 1 : 0;
  const activated = count >= 3;
  return { lastDay: day, count: activated ? 0 : count, activated };
}

/** A frenzy may only raise the existing wave bonus to its original hard cap. */
export function applyFrenzyCaps(bonuses, active) {
  return {
    ...bonuses,
    xp: Math.min(0.75, bonuses.xp + (active ? 0.15 : 0)),
    resource: Math.min(0.5, bonuses.resource + (active ? 0.12 : 0)),
    doomReduction: Math.min(0.25, bonuses.doomReduction + (active ? 0.05 : 0)),
  };
}
