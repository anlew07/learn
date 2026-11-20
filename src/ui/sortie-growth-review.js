import { SORTIE } from "../config/sortie-data.js";

/**
 * Present only the real 6-stone payment and actual combat receipts.
 * Never infer ROI, survival improvements, or a causal kill advantage from two
 * potentially different missions, player routes, or skill choices.
 */
export function previewSortieGrowthReview(archive) {
  const forge = archive?.run?.sortieCamp?.buildReceipt;
  if (!forge || archive.run.sortieCamp.forgeLevel !== SORTIE.forge.maxLevel) {
    return null;
  }

  const earlier = forge.beforeStats;
  const prior = archive.lastReceipt;
  const confirmed = Boolean(prior?.battle &&
    prior.day >= forge.day &&
    prior.battle.weaponDamage === forge.weaponDamage);
  const beforeDamage = earlier?.weaponDamage ?? SORTIE.weapon.damage;
  const payment = "建造时灵石 " + forge.beforeStones + " → " +
    forge.afterStones + "（真实投入 " + forge.cost + " 石），灵刃 " +
    beforeDamage + " → " + forge.weaponDamage + " 伤害";

  if (!confirmed) {
    return {
      phase: "prepared",
      title: "成长待实战 · 剑台已修复",
      payment,
      outcome: "下一场出击才会从战斗回执验证 " + forge.weaponDamage +
        " 伤害；投入成本不能从界面预报中自动回本。",
    };
  }

  const battle = prior.battle;
  return {
    phase: "verified",
    title: "成长已实战验证 · 灵刃 " + battle.weaponDamage + " 伤害",
    payment,
    outcome: "第 " + prior.day + " 日真实战果：击退 " + battle.defeated +
      "，本场灵石 +" + battle.stones +
      "；建造前一场击退 " + (earlier?.defeated ?? "未知") +
      "。两场敌情和走位可能不同，单场灵石不是回本证明。",
  };
}
