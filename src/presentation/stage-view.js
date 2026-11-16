/**
 * Read-only summary for the compact mobile game stage.
 * Never advances the simulation, consumes RNG, or mutates RunState.
 */
export function getStageView(run, selectedWorldId) {
  const worlds = Array.isArray(run?.worlds) ? run.worlds : [];
  const selected = worlds.find((world) => world.id === selectedWorldId) || worlds[0];
  if (!selected) return null;
  const number = (value) => Number.isFinite(value) ? value : 0;
  const percent = (value) => Math.max(0, Math.min(100, number(value)));
  const status = selected.status === "saved" ? "救援完成" :
    selected.status === "failed" ? "救援未完成" : "正在求生";
  return {
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
    hasCombat: Boolean(selected.lastCombat),
    threatActive: selected.threat?.status === "active",
    threatProgress: number(selected.threat?.progress),
    worlds: worlds.map((world) => ({
      id: world.id,
      title: world.name || world.id,
      status: world.status,
      danger: percent(world.d),
      event: world.pendingEvent?.state === "active",
    })),
  };
}
