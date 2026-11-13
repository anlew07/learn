/**
 * Autonomous world action selection.
 *
 * Keep score calculation and explanatory text independent from state mutation,
 * UI rendering and the seeded random-number implementation.
 */
export const ACTION_LABELS = Object.freeze({
  growth: "成长",
  gather: "采集",
  fight: "排险",
  explore: "探索",
  rescue: "拯救准备",
  repair: "修复防线",
  suppress: "压制兽王",
  retreat: "闭关",
});

function explanation(world, actionId, { reserve, threatActive, bossLevel }) {
  if (actionId === "repair") return "安全区风险较高，优先投入零件修复防线";
  if (actionId === "suppress") return "后期兽王战力高于当前分身，优先执行常规压制准备";
  if (actionId === "growth") {
    if (world.p >= 100 && world.level < 3) return "终局要求实际等级至少Lv3，需要继续成长";
    if (world.p >= 100 && world.level < bossLevel) return "终局战力还差一阶，先提升实际等级";
    return "当前偏好积累成长经验，为后续危险行动提升实力";
  }
  if (actionId === "gather") {
    if (world.resource < reserve) return "现有资源不足最终准备储备，优先搜集必要材料";
    return "补充资源储备，以备终局消耗和紧急支援";
  }
  if (actionId === "fight") {
    if (threatActive && world.level >= 2 && world.threat?.progress < 2)
      return "活跃巢群持续增加危机压力，先清理外围威胁";
    if (world.d > 75) return "危机压力较高，尝试排险敌群减缓恶化";
    return "排险偏好较高，在可承担的敌群中积累战斗经历";
  }
  if (actionId === "explore") return "尚未定位灾变源，调查能推进主线的关键线索";
  if (actionId === "rescue") return "已经定位核心，优先把拯救准备推进到最终阶段";
  return "保持自主发展";
}

/**
 * @param {object} world read-only world snapshot
 * @param {object} context reserve, bossLevel, threatActive, nextRandom
 * @returns {{actionId:string, reason:string, alternatives:string[]}}
 */
export function selectAutonomousAction(world, context) {
  const { reserve, bossLevel, threatActive, nextRandom } = context;
  const threatUrgencyScore = context.threatUrgencyScore ?? 3.5;
  const combatReady = context.combatReady ?? world.level >= 2;
  const strategy = world.strategy;

  // Rescue can still spend two real daily actions to neutralize a persistent
  // beast nest when the Lv3 defender can finish its elite encounter.
  // Unlike unconditional relief, the route trades two progress/training days
  // for the existing boss reward and removal of ongoing nest pressure.
  const beastNestThreshold = context.beastRescueNestPriorityDoom ?? 101;
  if (
    world.id === "beast" &&
    strategy === "rescue" &&
    world.level >= 3 &&
    world.p >= 65 &&
    world.d >= beastNestThreshold &&
    threatActive &&
    combatReady &&
    (world.threat?.progress ?? 2) < 2
  ) {
    return {
      actionId: "fight",
      reason: "危机较高且具备应对精英的实力，用两次主要行动解除长期巢穴威胁",
      alternatives: ["rescue", "growth"],
    };
  }

  if (
    world.id === "zombie" &&
    !world.repairUsed &&
    (world.d >= 85 && world.resource >= 6 ||
      world.d >= 55 &&
      world.resource >= reserve + 6 &&
      strategy !== "growth")
  ) {
    return {
      actionId: "repair",
      reason: explanation(world, "repair", context),
      alternatives: [],
    };
  }

  if (
    world.id === "beast" &&
    world.level >= 4 &&
    world.p >= 65 &&
    world.suppression < 2 &&
    bossLevel > world.level
  ) {
    return {
      actionId: "suppress",
      reason: explanation(world, "suppress", context),
      alternatives: [],
    };
  }

  const ranked = [
    { id: "growth", score: (strategy === "growth" ? 8 : 2) + (world.level < 3 ? 3 : 0) + (world.p >= 100 && world.level < 4 ? 8 : 0) },
    { id: "gather", score: (strategy === "growth" ? 2 : 1) + (world.resource < reserve ? 7 : 0) + (world.resource < 4 ? 3 : 0) },
    { id: "fight", score: (strategy === "clear" ? 8 : 2) + (threatActive ? 5 : 0) + (world.d > 75 ? 3 : 0) },
    { id: "explore", score: (strategy === "rescue" ? 7 : 2) + (world.p < 65 ? 4 : 0) },
    { id: "rescue", score: (strategy === "rescue" ? 8 : 2) + (world.p >= 65 && world.p < 100 ? 9 : 0) },
  ].filter((candidate) => {
    if (candidate.id === "explore") return world.p < 65;
    if (candidate.id === "rescue") return world.p >= 65 && world.p < 100;
    if (candidate.id === "growth" && world.level === 4 && world.p >= 100) return false;
    return true;
  });

  // Original alpha applied these bonuses twice. Consolidate their values
  // without changing tuned outcomes or the number/order of RNG draws.
  if (world.level >= 3 && world.p < 65) {
    for (const item of ranked) {
      if (item.id === "explore") item.score += 24;
      if (item.id === "growth") item.score -= 16;
    }
  }
  if (world.level >= 3 && world.p >= 65 && world.p < 100) {
    for (const item of ranked) {
      if (item.id === "rescue") item.score += 18;
      if (item.id === "growth") item.score -= 14;
    }
  }
  if (world.level >= 4) {
    for (const item of ranked) {
      if (item.id === "growth") item.score -= 24;
    }
  }
  if (world.p >= 100) {
    for (const item of ranked) {
      if (item.id === "growth" && world.level < bossLevel) item.score += 24;
      if (item.id === "growth" && world.level < 3) item.score += 18;
      if (item.id === "gather" && world.resource < reserve) item.score += 16;
    }
  }

  // Persistent nodes are real deadlines, not optional combat-flavor.
  // Every strategy may spend a main action clearing a nest when prepared;
  // clearance does NOT add a second daily action or another reward.
  if (threatActive && combatReady && world.threat?.progress < 2) {
    const combat = ranked.find((item) => item.id === "fight");
    if (combat) combat.score += threatUrgencyScore;
  }

  if (!ranked.length) {
    return { actionId: "gather", reason: explanation(world, "gather", context), alternatives: [] };
  }

  for (const item of ranked) item.score += (nextRandom() - 0.5) * 2;
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return {
    actionId: ranked[0].id,
    reason: explanation(world, ranked[0].id, context),
    alternatives: ranked.slice(1, 3).map((item) => item.id),
  };
}
