/**
 * Settled intervention history. Capture only authoritative before/after values.
 *
 * Deliberately no forecasts ("days saved"), RNG reads, asynchronous I/O,
 * gameplay mutations, or inferred event effects.
 */
const TITLES = Object.freeze({
  strategy: "调整长期策略",
  retreat: "开始闭关",
  exitRetreat: "强行出关",
  aid: "跨世界援助",
  fusion: "灵魂借力",
  event: "处理重大事件",
  build: "选择战技",
  echo: "使用世界回响",
});

function two(value) {
  return Math.round(value * 100) / 100;
}

function watchWorld(world) {
  return {
    id: world.id,
    name: world.name,
    p: world.p,
    d: world.d,
    resource: world.resource,
    xp: world.xp,
    status: world.status,
    strategy: world.strategy,
    retreat: Boolean(world.retreat),
    eventId: world.pendingEvent?.id || null,
    buildCount: world.build?.count || 0,
  };
}

export function captureIntervention(state) {
  return {
    ap: state.ap,
    soul: state.soul,
    aidNext: { ...state.aidNext },
    fusionNext: state.fusionNext,
    worlds: state.worlds.map(watchWorld),
    echoesUsed: state.echoes.filter((echo) => echo.used).length,
  };
}

export function summarizeIntervention(state, command, before) {
  const after = captureIntervention(state);
  const changes = after.worlds.flatMap((world) => {
    const previous = before.worlds.find((entry) => entry.id === world.id);
    if (!previous) return [];
    const effects = {
      p: two(world.p - previous.p),
      d: two(world.d - previous.d),
      resource: two(world.resource - previous.resource),
      xp: two(world.xp - previous.xp),
    };
    const changed =
      Object.values(effects).some((n) => n !== 0) ||
      previous.status !== world.status ||
      previous.strategy !== world.strategy ||
      previous.retreat !== world.retreat ||
      previous.eventId !== world.eventId ||
      previous.buildCount !== world.buildCount;
    if (!changed) return [];
    return [{
      id: world.id,
      name: world.name,
      effects,
      statusFrom: previous.status,
      statusTo: world.status,
      strategyFrom: previous.strategy,
      strategyTo: world.strategy,
      retreatFrom: previous.retreat,
      retreatTo: world.retreat,
      eventResolved: Boolean(previous.eventId && !world.eventId),
      buildAdded: world.buildCount - previous.buildCount,
    }];
  });
  const apSpent = two(before.ap - after.ap);
  const soulSpent = two(before.soul - after.soul);
  const echoUsed = after.echoesUsed > before.echoesUsed;
  if (!changes.length && !apSpent && !soulSpent && !echoUsed) return null;

  const nextAidDay = command.type === "aid"
    ? after.aidNext[command.args[1]] || null
    : null;
  const nextFusionDay = command.type === "fusion" ||
    command.type === "event" && command.args[1] === "fusion"
    ? after.fusionNext > before.fusionNext ? after.fusionNext : null
    : null;

  return {
    id: command.operationId,
    day: state.day,
    type: command.type,
    title: TITLES[command.type] || "玩家干预",
    apSpent,
    soulSpent,
    changes,
    nextAidDay,
    nextFusionDay,
    echoUsed,
  };
}

export function recordIntervention(state, command, before) {
  const entry = summarizeIntervention(state, command, before);
  if (!entry) return null;
  if (!Array.isArray(state.interventions)) state.interventions = [];
  state.interventions.push(entry);
  if (state.interventions.length > 24) state.interventions.splice(0, state.interventions.length - 24);
  return entry;
}
