/**
 * Deterministic attacks for the survivors wave theatre.
 * One equipped attack is featured per wave. Visual styles and bounded extra
 * enemy clears come from the actual build, never from random presentation.
 */
export const ATTACK_PATTERNS = Object.freeze({
  thunder: Object.freeze({ style: "chain", label: "驭雷连锁", icon: "⚡" }),
  sword: Object.freeze({ style: "pierce", label: "飞剑贯穿", icon: "✧" }),
  blades: Object.freeze({ style: "fan", label: "碎刃扇射", icon: "✦" }),
  arc: Object.freeze({ style: "chain", label: "电弧弹射", icon: "ϟ" }),
  claws: Object.freeze({ style: "flurry", label: "裂爪连击", icon: "╳" }),
  roar: Object.freeze({ style: "shockwave", label: "震地冲击", icon: "◎" }),
});
const BASIC_ATTACK = Object.freeze({ style: "basic", label: "基础攻击", icon: "✦" });

export function featuredWaveAttack(worldId, build, powers, wave) {
  const attackSlots = (build?.attack || []).filter(
    (slot) => powers[worldId]?.some((power) => power.id === slot.id && power.slot === "attack"),
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
