/**
 * Pure fusion eligibility used by both the combat engine and action previews.
 * No payment, random draws or mutation of world/provider data.
 */
export function evaluateFusion(state, target, context, providers) {
  const unavailable = (reason, extra = {}) => ({
    available: false,
    reason,
    apCost: 0,
    soulCost: 0,
    donorIds: [],
    ...extra,
  });
  if (!state?.active || !target || target.status !== "running") {
    return unavailable("目标世界已结束");
  }
  if (state.runNumber < 2) return unavailable("第二局才解锁二人之力");

  const hasBoss = target.pendingEvent?.state === "active" && target.pendingEvent.type === "boss";
  const hasFinal =
    context.definition.boss &&
    target.p >= 100 &&
    target.level >= 3 &&
    target.resource >= context.definition.finalCost &&
    target.flags.p65 &&
    target.flags.p100;
  if (!hasBoss && !hasFinal) return unavailable("当前没有可融合的重大战斗");
  if (hasFinal && context.canFinish) return unavailable("当前分身已经可以独立获胜");

  const requirement = hasBoss ? 3 : context.bossRequirement;
  const gap = requirement - context.effectiveLevel;
  if (gap <= 0) return unavailable("无需借力即可获胜");
  if (gap > 2) return unavailable("即使三人之力也不足以获胜");

  const count = gap === 1 ? 1 : 2;
  const cost = {
    kind: count === 2 ? "三人之力" : "二人之力",
    bonusLevel: count,
    apCost: count,
    soulCost: count,
  };
  if (count === 2 && (state.runNumber < 3 || state.worlds.length < 3)) {
    return unavailable("需要三世界模式的三人之力", cost);
  }

  if (Array.isArray(providers) && providers.length && new Set(providers).size !== providers.length) {
    return unavailable("不能重复选择同一个供力分身", cost);
  }

  let pool = state.worlds.filter(
    (world) =>
      world.id !== target.id &&
      world.status === "running" &&
      world.level >= 2 &&
      !world.retreat,
  );
  if (Array.isArray(providers) && providers.length) {
    pool = providers
      .map((id) => state.worlds.find((world) => world.id === id))
      .filter(
        (world) =>
          world &&
          world.id !== target.id &&
          world.status === "running" &&
          world.level >= 2 &&
          !world.retreat,
      );
  }
  if (pool.length < count) return unavailable("没有足够的可借力分身（闭关中不可借出）", cost);
  if (context.freeAP < count || state.soul <= count) {
    return unavailable("行动点或灵魂强度不足", cost);
  }
  if (state.day < state.fusionNext) return unavailable("灵魂融合正在冷却", cost);

  return {
    available: true,
    reason: "",
    ...cost,
    donorIds: pool.slice(0, count).map((world) => world.id),
    battle: hasBoss ? "boss" : "finale",
  };
}
