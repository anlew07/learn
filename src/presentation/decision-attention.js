/**
 * Read-only interrupt candidates for the mobile game UI.
 *
 * The engine remains authoritative for activation, expiry, payments and rewards.
 * Only a newly active major event or a newly offered build pauses the timer.
 * The keys are presentation identities, never persisted in the RunState.
 */
export function pendingDecisions(run) {
  if (!run?.active || !Array.isArray(run.worlds)) return [];
  const events = [];
  const builds = [];

  for (const world of run.worlds) {
    if (!world || world.status !== "running" || typeof world.id !== "string") continue;
    const event = world.pendingEvent;
    if (event?.state === "active") {
      events.push({
        kind: "event",
        worldId: world.id,
        key: `event:${world.id}:${event.id ?? `${event.type}:${event.expiresDay}`}`,
      });
    }
    const build = world.build?.pending;
    if (build) {
      builds.push({
        kind: "build",
        worldId: world.id,
        key: `build:${world.id}:${build.id ?? `${build.due}:${(build.options || []).join(",")}`}`,
      });
    }
  }

  // An urgent world event takes priority over an optional skill choice.
  return [...events, ...builds];
}

export function nextNewDecision(run, existingKeys = new Set()) {
  return pendingDecisions(run).find((decision) => !existingKeys.has(decision.key)) ?? null;
}
