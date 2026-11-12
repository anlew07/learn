/**
 * Read-only explanation of the existing finale gate.
 * No rewards, state mutations or random draws occur here.
 *
 * The authoritative eligibility still comes from Engine.canFinal().
 * This view model receives its values from the same engine helpers.
 */
export function summarizeFinale(state, world, details) {
  const { definition, bossLevel, effectiveLevel, canFinish } = details;
  const flags = world.flags || {};
  const resourceShortfall = Math.max(0, definition.finalCost - world.resource);
  const checks = [
    {
      id: "progress",
      label: "拯救准备",
      ready: world.p >= 100,
      detail: `${world.p}/100`,
    },
    {
      id: "story",
      label: "关键主线",
      ready: Boolean(flags.p65 && flags.p100),
      detail: flags.p65 && flags.p100 ? "核心已定位" : "尚未完成全部主线标记",
    },
    {
      id: "base-level",
      label: "基础等级",
      ready: world.level >= 3,
      detail: `Lv${world.level}/Lv3`,
    },
    {
      id: "materials",
      label: definition.resourceName,
      ready: resourceShortfall === 0,
      detail:
        resourceShortfall === 0
          ? `${world.resource}/${definition.finalCost}，已备齐`
          : `${world.resource}/${definition.finalCost}，尚缺${resourceShortfall}`,
    },
    {
      id: "retreat",
      label: "闭关状态",
      ready: !world.retreat,
      detail: world.retreat
        ? `还需${world.retreat.remaining}天；闭关中无法完成终局`
        : "可以参与终局",
    },
  ];

  if (definition.boss) {
    checks.push({
      id: "combat",
      label: "终战有效战力",
      ready: effectiveLevel >= bossLevel,
      detail:
        `Lv${effectiveLevel}/Lv${bossLevel}` +
        (world.injuryUntil >= state.day ? "（受伤−1）" : "") +
        (effectiveLevel < bossLevel ? "；可成长、压制或尝试合法借力" : ""),
    });
  }

  return {
    ready: Boolean(canFinish),
    daysLeft: Math.max(0, world.deadline - state.day),
    resourceShortfall,
    checks,
  };
}
