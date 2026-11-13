import { COMBOS } from "../config/game-data.js";

/**
 * Deterministic attacks for the survivors wave theatre.
 * One equipped attack is featured per wave. Visual styles and bounded extra
 * enemy clears come from the actual build, never from random presentation.
 */
export const ATTACK_PATTERNS = Object.freeze({
  thunder: Object.freeze({ style: "chain", label: "驭雷连锁", icon: "⚡" }),
  sword: Object.freeze({ style: "pierce", label: "飞剑回旋", icon: "✧" }),
  blades: Object.freeze({ style: "fan", label: "碎晶回旋", icon: "✦" }),
  arc: Object.freeze({ style: "chain", label: "电弧弹射", icon: "ϟ" }),
  claws: Object.freeze({ style: "flurry", label: "裂爪连击", icon: "╳" }),
  roar: Object.freeze({ style: "shockwave", label: "震地冲击", icon: "◎" }),
});
const BASIC_ATTACK = Object.freeze({ style: "basic", label: "基础攻击", icon: "✦" });

export function featuredWaveAttack(worldId, build, powers, wave) {
  const attackSlots = (build?.attack || []).filter(
    (slot) => Number(slot.lv) >= 1 && powers[worldId]?.some((power) => power.id === slot.id && power.slot === "attack"),
  );
  if (!attackSlots.length) return { ...BASIC_ATTACK, bonus: 0 };
  const slot = attackSlots[(wave - 1) % attackSlots.length];
  const pattern = ATTACK_PATTERNS[slot.id];
  if (!pattern) return { ...BASIC_ATTACK, bonus: 0 };
  const level = Math.max(1, Math.min(2, Number(slot.lv) || 1));
  const bonusByStyle = {
    chain: level + (wave >= 2 ? 1 : 0),
    pierce: level + (wave === 3 ? 2 : 0),
    fan: level + (wave === 1 ? 2 : 0),
    flurry: level + (wave <= 2 ? 1 : 0),
    shockwave: level + (wave === 3 ? 2 : 0),
  };
  return { id: slot.id, ...pattern, bonus: Math.min(4, bonusByStyle[pattern.style] || 0) };
}

/**
 * An ultimate requires the real evolved weapon/support pair. Never trust an
 * obsolete evolved flag alone. The effect is a combat clear bonus, not loot.
 */
export const EVOLUTION_ULTIMATES = Object.freeze({
  lingzai: Object.freeze({
    id: "storm",
    label: "雷阵万剑",
    icon: "⚡",
    pattern: "storm",
    bonus: Object.freeze([4, 6, 8]),
  }),
  zombie: Object.freeze({
    id: "barrage",
    label: "钢雨防线覆盖",
    icon: "✷",
    pattern: "barrage",
    bonus: Object.freeze([7, 6, 5]),
  }),
  beast: Object.freeze({
    id: "hunt",
    label: "兽域协同守护",
    icon: "╳",
    pattern: "hunt",
    bonus: Object.freeze([3, 6, 9]),
  }),
});

export function evolvedWaveUltimate(worldId, build, wave) {
  const combo = COMBOS[worldId];
  const ultimate = EVOLUTION_ULTIMATES[worldId];
  if (!combo || !ultimate || !build?.evolved || !Number.isInteger(wave) || wave < 1 || wave > 3) {
    return null;
  }
  // Validate actual equipment slots, not just the evolved marker or item IDs.
  const attackReady = (build.attack || []).some(
    (slot) => slot.id === combo[0] && Number(slot.lv) >= 1,
  );
  const supportReady = (build.support || []).some(
    (slot) => slot.id === combo[1] && Number(slot.lv) >= 1,
  );
  if (!attackReady || !supportReady) return null;
  return {
    id: ultimate.id,
    label: ultimate.label,
    icon: ultimate.icon,
    style: ultimate.pattern,
    bonus: ultimate.bonus[wave - 1],
    ultimate: true,
  };
}
