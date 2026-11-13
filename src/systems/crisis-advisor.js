/**
 * Read-only crisis triage. Uses existing engine rule previews for every
 * suggested manual option; no speculative "days saved" or automatic actions.
 */
export function assessCrises(state, rules) {
  if (!state?.active) return [];
  const entries = [];

  for (const world of state.worlds) {
    if (world.status !== "running") continue;
    const remaining = Math.max(0, world.deadline - state.day);
    const info = rules.info(state, world);
    const event = rules.event(state, world);
    const notes = [];
    let priority = 0;
    const effect = world.followupEffect;
    if (world.flags?.followupOutcome === "commit") {
      if (effect && state.day >= effect.start && state.day <= effect.until) {
        const days = effect.until - state.day + 1;
        notes.push(
          effect.kind === "natural"
            ? `已布设古阵：未来${days}个有效日的自然毁灭增长每天最多降低${effect.perDay}`
            : `已启用干扰信标：剩余${days}个有效日可抵消活跃尸群额外D+${effect.perDay}/日`,
        );
      } else if (world.id === "beast" && world.suppression >= 2) {
        notes.push("围猎准备已完成：兽王需求按二阶段压制规则计算");
      }
    }

    if (world.d >= 90) {
      priority = Math.max(priority, 105);
      notes.push(`毁灭压力已达D${world.d}，接近100崩溃线`);
    } else if (world.d >= 75) {
      priority = Math.max(priority, 84);
      notes.push(`毁灭压力D${world.d}，需要关注`);
    }
    if (remaining <= 3) {
      priority = Math.max(priority, 100);
      notes.push(`距离世界期限仅剩${remaining}天`);
    } else if (remaining <= 8) {
      priority = Math.max(priority, 79);
      notes.push(`世界期限还剩${remaining}天`);
    }

    if (event) {
      const daysToResolve = Math.max(0, event.expiry - state.day);
      priority = Math.max(priority, daysToResolve <= 1 ? 115 : 90);
      notes.push(`重大事件「${event.title}」第${event.expiry}日自动处理`);
    }

    if (world.p >= 90 && !info.canFinish) {
      priority = Math.max(priority, 70);
      const missing = info.finale?.checks?.filter((check) => !check.ready) || [];
      notes.push(
        missing.length
          ? `终局尚缺：${missing.map((check) => check.label).join("、")}`
          : "终局尚有未满足的条件",
      );
    }

    if (!priority) continue;

    const actions = [];
    const blockers = [];
    if (event) {
      const safeChoice = event.options.find((option) => option.id === "safe") ||
        event.options.find((option) => option.id === "retreat");
      actions.push({
        kind: "event",
        worldId: world.id,
        label: "查看重大事件",
        detail: safeChoice
          ? `${safeChoice.label}：${safeChoice.summary}；不操作：${event.defaultOutcome}`
          : event.defaultOutcome,
      });
    }

    const nonCombatReady = (info.finale?.checks || [])
      .filter((check) => check.id !== "combat")
      .every((check) => check.ready);
    if (!info.canFinish && world.id !== "lingzai" && nonCombatReady) {
      const fusion = rules.fusion(state, world.id);
      if (fusion.available) {
        actions.push({
          kind: "fusion",
          worldId: world.id,
          label: "查看灵魂借力",
          detail: `${fusion.kind}：${fusion.apCost}AP / ${fusion.soulCost}灵魂，仅提高本次有效战力；供力者未来3日减产`,
        });
      } else {
        blockers.push(`当前借力不可用：${fusion.reason}`);
      }
    }

    const finale = info.finale;
    const materialMissing = finale?.checks?.find((check) => check.id === "materials" && !check.ready);
    if (world.p >= 90 && materialMissing) {
      blockers.push(`${materialMissing.label}${materialMissing.detail}；跨世界援助不会转移材料`);
    }
    if (world.p >= 90 && world.level < 3) {
      blockers.push(`基础等级Lv${world.level}/Lv3；借力不能跳过此要求`);
    }

    const mode = world.d >= 75 ? "d" : remaining <= 8 && world.p < 100 ? "p" : null;
    if (mode) {
      const offers = state.worlds
        .filter((donor) => donor.id !== world.id && donor.status === "running")
        .map((donor) => ({
          donor,
          preview: rules.aid(state, donor.id, world.id, mode),
        }));
      const eligible = offers
        .filter((offer) => offer.preview.available)
        .sort((a, b) =>
          Number(a.preview.jeopardizesSourceFinale) -
            Number(b.preview.jeopardizesSourceFinale) ||
          (b.preview.sourceAfter - b.preview.sourceFinalCost) -
            (a.preview.sourceAfter - a.preview.sourceFinalCost) ||
          a.donor.id.localeCompare(b.donor.id),
        );
      if (eligible.length) {
        const best = eligible[0];
        const change = mode === "d" ? "D−" : "P+";
        actions.push({
          kind: "aid",
          worldId: world.id,
          sourceId: best.donor.id,
          mode,
          label: "比较援助方案",
          detail:
            `${best.donor.name}→${world.name}：实际${change}${best.preview.actualDelta}；消耗来源4资源、1AP、1灵魂` +
            (best.preview.jeopardizesSourceFinale ? "；可能使来源终局材料不足" : ""),
        });
      } else if (offers.length) {
        blockers.push(`本次${mode === "d" ? "减灾" : "进度"}援助不可用：${offers[0].preview.reason}`);
      } else {
        blockers.push("没有其他仍在运行的世界可以提供资源");
      }
    }

    entries.push({
      worldId: world.id,
      worldName: world.name,
      priority,
      day: state.day,
      doom: world.d,
      remainingDays: remaining,
      notes,
      actions,
      blockers,
    });
  }

  return entries
    .sort((a, b) => b.priority - a.priority || a.worldId.localeCompare(b.worldId))
    .slice(0, 3);
}
