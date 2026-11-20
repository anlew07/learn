import { SORTIE } from "../config/sortie-data.js";

/**
 * An honest milestone map over the isolated sortie archive. It creates no
 * resources, save fields or new combat effects. Progress comes only from
 * authoritative sortie receipts and the existing real forge payment.
 */
export const CIVILIZATION_NODES = Object.freeze([
  Object.freeze({
    id: "fire", branch: "起点", title: "文明火种",
    task: "建立双世界营地", reward: "已拥有灵灾出击与废土日行动", requires: [],
  }),
  Object.freeze({
    id: "survive", branch: "生存", title: "雾谷生还",
    task: "完成一次 75 秒生存出击", reward: "按真实结算获得胜利灵石与经验",
    requires: ["fire"], target: "start",
  }),
  Object.freeze({
    id: "gather", branch: "探索", title: "拾荒之路",
    task: "单场实际拾取至少 3 片碎片", reward: "现有规则：3 片兑换 1 灵石（总兑换最多 2 石）",
    requires: ["fire"], target: "start",
  }),
  Object.freeze({
    id: "salvage", branch: "探索", title: "险地回收",
    task: "到达回收点，抵御守卫并完成 75 秒出击",
    reward: "现有任务：达成后额外结算 2 灵石", requires: ["fire"], target: "salvage",
  }),
  Object.freeze({
    id: "worlds", branch: "文明", title: "双界纪事",
    task: "完成出击，使两个世界真实结算同一天", reward: "查看灵灾与废土当日的真实行动结果",
    requires: ["fire"], target: "start",
  }),
  Object.freeze({
    id: "forge", branch: "建设", title: "修复剑台",
    task: "首场出击结算后，投入 6 灵石修复护灵剑台",
    reward: "下场灵刃命中伤害由 1 变 2；不保证赚回成本",
    requires: ["worlds"], target: "forge",
  }),
  Object.freeze({
    id: "forge-trial", branch: "建设", title: "灵刃实战",
    task: "剑台建成后，再完成一场 75 秒胜利",
    reward: "从实际战斗回执确认灵刃伤害 2，不凭界面预报",
    requires: ["forge"], target: "start",
  }),
  Object.freeze({
    id: "rebuild", branch: "里程碑", title: "文明初芽",
    task: "完成险地回收、剑台实战与两场胜利",
    reward: "阶段记录节点；暂不赠送未验证的额外资源或技能",
    requires: ["salvage", "forge-trial", "worlds"],
  }),
]);

/** Reads already-verified records; does not validate or mutate archive. */
export function previewCivilizationProgress(archive) {
  const run = archive.run;
  const receipts = Object.values(run.sortieLedger ?? {})
    .map((entry) => entry.receipt)
    .filter((receipt) => receipt?.battle);
  const wins = receipts.filter((receipt) => receipt.battle.outcome === "won");
  const forgeReceipt = run.sortieCamp?.buildReceipt;
  const forgeBuilt = run.sortieCamp?.forgeLevel === SORTIE.forge.maxLevel &&
    Boolean(forgeReceipt);
  const done = {
    fire: true,
    survive: wins.length > 0,
    gather: receipts.some((receipt) =>
      receipt.battle.collectedShards >= SORTIE.rewards.shardsPerStone &&
      receipt.battle.shardStones > 0),
    salvage: wins.some((receipt) =>
      receipt.battle.missionId === "salvage" &&
      receipt.battle.objectiveStatus === "completed" &&
      receipt.battle.objectiveStones === SORTIE.mission.rewardStones),
    worlds: receipts.some((receipt) =>
      receipt.nextDay === receipt.day + 1 &&
      ["lingzai", "zombie"].every((id) =>
        receipt.worlds?.some((world) => world.id === id))),
    forge: forgeBuilt,
    "forge-trial": forgeBuilt && wins.some((receipt) =>
      receipt.day >= forgeReceipt.day &&
      receipt.battle.weaponDamage === SORTIE.weapon.damage + SORTIE.forge.damageBonus),
  };
  done.rebuild = done.salvage && done["forge-trial"] && done.worlds &&
    wins.length >= 2;

  const nodes = CIVILIZATION_NODES.map((node) => ({
    ...node,
    status: done[node.id] ? "complete" :
      node.requires.every((id) => done[id]) ? "ready" : "locked",
  }));
  const completed = nodes.filter((node) => node.status === "complete").length;
  const next = ["survive", "salvage", "forge", "forge-trial", "gather", "worlds", "rebuild"]
    .map((id) => nodes.find((node) => node.id === id))
    .find((node) => node.status === "ready") ??
    nodes.find((node) => node.status === "locked") ?? null;
  return { nodes, completed, total: nodes.length, next };
}
