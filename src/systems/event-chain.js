/**
 * Optional two-part story paths. A successful risky clue unlocks one follow-up
 * at the P65 milestone; standard mainlines never depend on these events.
 *
 * Event previews are pure. Effects are settled once by the engine only.
 */
export const FOLLOWUPS = Object.freeze({
  lingzai: Object.freeze({
    trigger: "ancientSeal",
    title: "古阵回路 · 阵纹护持",
    summary: "古碑拓本可以接入真实灵脉，但需要灵石和灵魂行动点。",
    paidLabel: "刻印护灵古阵",
    paidSummary: "消耗1AP和3灵石；立即D−3，并使未来7个游戏日的自然毁灭增长每天下降0.4。",
    paidOutcome: "古阵刻印完成：D−3；未来7个游戏日自然毁灭增长每天减少0.4。",
  }),
  zombie: Object.freeze({
    trigger: "weakness",
    title: "失联广播 · 母巢扰流",
    summary: "既已掌握母巢弱点，可用零件干扰附近尸群的异常增殖。",
    paidLabel: "布设干扰信标",
    paidSummary: "消耗1AP和3废土零件；立即D−4，未来7个游戏日免除活跃尸群带来的额外D+0.3/日。",
    paidOutcome: "干扰信标就绪：D−4；未来7个游戏日可抵消活跃尸群的额外毁灭压力。",
  }),
  beast: Object.freeze({
    trigger: "beastTrail",
    title: "巨兽足迹 · 围猎路线",
    summary: "已掌握兽王路径，可以投入结晶完成第二阶段压制，而不是继续盲目追踪。",
    paidLabel: "设置兽王伏击阵地",
    paidSummary: "消耗1AP和3进化结晶；压制准备至少升至2阶段，立即D−2。狂化兽王战力需求可因此降低。",
    paidOutcome: "伏击阵地完成：压制准备达到第二阶段，D−2；兽王战力需求按原规则重新计算。",
  }),
});

export function canQueueFollowup(world) {
  const config = FOLLOWUPS[world?.id];
  const flags = world?.flags;
  return Boolean(
    config &&
      world.status === "running" &&
      flags?.sideResolved &&
      flags?.p65 &&
      flags[config.trigger] &&
      !flags.followupQueued &&
      !flags.followupResolved,
  );
}

function option(id, label, summary, available = true, unavailableReason = "") {
  return { id, label, summary, available, unavailableReason };
}

export function previewFollowup(state, world) {
  const event = world?.pendingEvent;
  const config = FOLLOWUPS[world?.id];
  if (
    !state?.active ||
    world?.status !== "running" ||
    event?.state !== "active" ||
    event.type !== "followup" ||
    !config
  ) {
    return null;
  }
  const freeAP = state.ap - state.apReserved;
  const enoughResources = world.resource >= 3;
  const alreadySuppressed = world.id === "beast" && world.suppression >= 2;
  const available = freeAP >= 1 && enoughResources && !alreadySuppressed;
  const reason = alreadySuppressed
    ? "兽王已达到第二阶段压制，无需重复投入材料。"
    : freeAP < 1
      ? "需要1个未被闭关预留的行动点。"
      : !enoughResources
        ? "还需要3份本世界材料。"
        : "";

  return {
    id: event.id,
    type: event.type,
    title: event.title,
    expiry: event.expiresDay,
    summary: config.summary,
    defaultOutcome: "到期不操作：自动整理旧线索，拯救准备P+2（受P100上限限制），不消耗AP和材料。",
    options: [
      option("safe", "保留研究记录", "免费，拯救准备实际增加至多P+2。"),
      option("commit", config.paidLabel, config.paidSummary, available, reason),
      option("decline", "放弃后续机缘", "不获得后续收益，不再重复触发此事件。"),
    ],
  };
}

export function settleFollowup(state, world, choice, helpers) {
  const config = FOLLOWUPS[world.id];
  if (choice === "safe") {
    helpers.addProgress(state, world, 2);
    helpers.log(state, world.id, config.title + "：保存研究结果，拯救准备至多+2。", "minor");
  } else if (choice === "commit") {
    state.ap -= 1;
    world.resource = Math.round((world.resource - 3) * 100) / 100;
    if (world.id === "lingzai") {
      helpers.addD(world, -3);
      world.followupEffect = {
        kind: "natural",
        start: state.day + 1,
        until: state.day + 7,
        perDay: 0.4,
      };
    } else if (world.id === "zombie") {
      helpers.addD(world, -4);
      world.followupEffect = {
        kind: "threat",
        start: state.day + 1,
        until: state.day + 7,
        perDay: 0.3,
      };
    } else {
      world.suppression = Math.max(2, world.suppression);
      helpers.addD(world, -2);
    }
    helpers.log(state, world.id, config.paidOutcome, "major");
  } else if (choice === "decline") {
    helpers.log(state, world.id, config.title + "：主动放弃后续机缘。", "minor");
  } else {
    return { ok: false, error: "未知后续机缘选项" };
  }
  world.flags.followupResolved = true;
  world.flags.followupOutcome = choice;
  world.pendingEvent = null;
  return { ok: true };
}

export function followupMitigation(world, day, kind) {
  const effect = world.followupEffect;
  if (
    !effect ||
    effect.kind !== kind ||
    day < effect.start ||
    day > effect.until
  ) {
    return 0;
  }
  return effect.perDay;
}

/** A read-only epilogue: the player's earlier clue and follow-up choices remain visible. */
export function followupEpilogue(world) {
  const flags = world?.flags || {};
  const config = FOLLOWUPS[world?.id];
  if (!config || !flags[config.trigger]) return "";
  if (!flags.followupResolved) return "曾深入调查灾难线索，但未完成后续行动。";
  if (flags.followupOutcome === "safe") return "此前保留的调查记录成为重建世界的第一份档案。";
  if (flags.followupOutcome === "decline") return "此前主动放弃了线索的后续机缘，最终仍凭常规准备走到了这里。";
  if (flags.followupOutcome !== "commit") return "";
  const endings = {
    lingzai: "曾刻下的古阵回路与灵脉核心共鸣，为新世界留下护灵阵纹。",
    zombie: "先前布设的母巢干扰信标成为净化行动的关键记录。",
    beast: "根据巨兽足迹设置的伏击阵地，最终成为兽王围猎的决胜线索。",
  };
  return endings[world.id] || "";
}
