/**
 * Run-local simulation telemetry. Optional on old alpha saves.
 *
 * This module only counts already-settled game actions, so it cannot grant
 * rewards or create a second combat transaction.
 */
function round2(value) {
  return Math.round(value * 100) / 100;
}

export function getWorldMetrics(world) {
  if (!world.metrics) {
    world.metrics = {
      actions: {},
      waveCombats: 0,
      extraXp: 0,
      extraResources: 0,
      extraDoomReduction: 0,
      manualBuilds: 0,
      automaticBuilds: 0,
      evolutions: 0,
    };
  }
  return world.metrics;
}

export function recordWorldAction(world, actionId) {
  const metrics = getWorldMetrics(world);
  metrics.actions[actionId] = (metrics.actions[actionId] || 0) + 1;
}

export function recordWaveOutcome(world, bonus) {
  const metrics = getWorldMetrics(world);
  metrics.waveCombats++;
  metrics.extraXp = round2(metrics.extraXp + bonus.xp);
  metrics.extraResources = round2(metrics.extraResources + bonus.resource);
  metrics.extraDoomReduction = round2(metrics.extraDoomReduction + bonus.doomReduced);
}

export function recordBuildChoice(world, automatic, evolvedNow) {
  const metrics = getWorldMetrics(world);
  if (automatic) metrics.automaticBuilds++;
  else metrics.manualBuilds++;
  if (evolvedNow) metrics.evolutions++;
}
