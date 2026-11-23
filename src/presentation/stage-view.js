import { getRecentEncounter } from "./encounter-view.js";

const clampPercent = (value) =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

/**
 * Pure visual vocabulary for a world. These are only presentation tiers:
 * they do not invent buildings, enemies, rewards, or a second simulation.
 */
export function getWorldSceneState(world, day = 1) {
  if (!world) return null;
  const danger = clampPercent(world.d);
  const rescue = clampPercent(world.p);
  const status = world.status;
  const phase =
    status === "saved"
      ? "restored"
      : status === "failed"
        ? "lost"
        : danger >= 75
          ? "critical"
          : danger >= 40
            ? "warning"
            : "stable";
  const progressTier = rescue >= 100 ? 3 : rescue >= 65 ? 2 : rescue >= 30 ? 1 : 0;
  const supplyTier = world.resource >= 12 ? 2 : world.resource >= 6 ? 1 : 0;
  const growthTier = world.level >= 4 ? 2 : world.level >= 2 ? 1 : 0;
  const actionId = world.lastDecision?.day >= day - 1 ? world.lastDecision.actionId : "";
  const action = String(world.action || "");
  const activity =
    actionId === "growth" || /吸纳|修炼|训练|感悟|闭关/.test(action)
      ? "training"
      : actionId === "gather" || /寻找|搜刮|搜集|采集/.test(action)
        ? "gathering"
        : actionId === "fight" || /排险|清理|巡护|战斗/.test(action)
          ? "defending"
          : actionId === "rescue" || /准备|救援|封印/.test(action)
            ? "rescuing"
            : actionId === "explore" || /调查|追踪|追查/.test(action)
              ? "exploring"
              : "observing";
  const encounter = getRecentEncounter(world, day);
  const recentCombat =
    Number.isFinite(world.lastCombat?.day) &&
    world.lastCombat.day >= day - 2 &&
    world.lastCombat.day <= day;
  const activeThreat = Boolean(world.threat && world.threat.status !== "cleared");
  const hasEvent = world.pendingEvent?.state === "active";
  const hasBuild = Boolean(world.build?.pending);
  const summary =
    phase === "restored"
      ? "救援成功 · 局势恢复"
      : phase === "lost"
        ? "救援未完成 · 世界失守"
        : hasEvent
          ? "重大事件 · 等待决策"
          : hasBuild
            ? "战技机会 · 可以选择"
            : world.tacticalAssist?.kind === "focus"
              ? "战术待命 · 下次排险生效"
            : encounter
              ? "上日交战 · 击退 " + encounter.defeated + "/" + encounter.encountered
            : phase === "critical"
              ? "高危 · 请关注局势"
          : phase === "warning"
            ? "危机上升 · 留意事件"
            : progressTier >= 2
              ? "准备推进 · 继续守护"
              : "局势平稳 · 分身行动中";
  return {
    phase,
    progressTier,
    supplyTier,
    growthTier,
    activity,
    recentCombat,
    encounter,
    activeThreat,
    hasEvent,
    hasBuild,
    rescue,
    danger,
    summary,
  };
}

/**
 * Read-only summary for the compact mobile game stage.
 * Never advances the simulation, consumes RNG, or mutates RunState.
 */
export function getStageView(run, selectedWorldId) {
  const worlds = Array.isArray(run?.worlds) ? run.worlds : [];
  const selected = worlds.find((world) => world.id === selectedWorldId) || worlds[0];
  if (!selected) return null;
  const pendingWorlds = worlds.filter((world) =>
    world.status === "running" &&
    (world.pendingEvent?.state === "active" || world.build?.pending),
  );
  const number = (value) => Number.isFinite(value) ? value : 0;
  const percent = clampPercent;
  const status = selected.status === "saved" ? "救援完成" :
    selected.status === "failed" ? "救援未完成" : "正在求生";
  return {
    scene: getWorldSceneState(selected, number(run.day)),
    encounter: getRecentEncounter(selected, number(run.day)),
    tacticArmed: selected.tacticalAssist?.kind === "focus" && selected.status === "running",
    tacticResult: selected.lastCombat?.day === number(run.day) - 1 ?
      selected.lastCombat?.tactic ?? null : null,
    worldId: selected.id,
    title: selected.name || selected.id,
    status,
    statusCode: selected.status,
    day: Math.max(1, number(run.day)),
    saved: worlds.filter((world) => world.status === "saved").length,
    total: worlds.length,
    ap: Math.max(0, number(run.ap) - number(run.apReserved)),
    soul: number(run.soul),
    rescue: percent(selected.p),
    danger: percent(selected.d),
    resource: number(selected.resource),
    deadline: Math.max(0, number(selected.deadline) - number(run.day)),
    level: number(selected.level),
    action: typeof selected.action === "string" ? selected.action : "观察世界",
    strategy: selected.strategy || "growth",
    paused: Boolean(run.paused),
    active: Boolean(run.active),
    hasEvent: selected.pendingEvent?.state === "active",
    hasBuild: Boolean(selected.build?.pending),
    pendingCount: pendingWorlds.reduce((count, world) =>
      count + Number(world.pendingEvent?.state === "active") + Number(Boolean(world.build?.pending)), 0),
    pendingWorldIds: pendingWorlds.map((world) => world.id),
    hasCombat: Boolean(selected.lastCombat),
    threatActive: Boolean(selected.threat && selected.threat.status !== "cleared"),
    threatProgress: number(selected.threat?.progress),
    worlds: worlds.map((world) => ({
      id: world.id,
      title: world.name || world.id,
      status: world.status,
      danger: percent(world.d),
      event: world.pendingEvent?.state === "active",
      build: Boolean(world.build?.pending),
    })),
  };
}
