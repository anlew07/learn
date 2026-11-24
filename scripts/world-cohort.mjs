/**
 * Balance scripts measure the first three world instances, not the whole
 * expedition. A rescued world is replaced and the campaign may continue
 * indefinitely; this bounded cohort keeps paired-seed experiments comparable.
 */
export const OPENING_WORLD_LIMIT = 3;
// Three sequential 76-day worlds need at most 228 days in the first run.
export const OPENING_WORLD_MAX_DAYS = 300;

function worldInstanceNumber(world) {
  return Number.isInteger(world?.worldNumber) ? world.worldNumber : null;
}

export function collectOpeningWorlds(state, cohort) {
  const result = cohort ?? { worldNumbers: new Set(), terminalWorlds: new Map() };
  for (const world of state?.worlds ?? []) {
    const number = worldInstanceNumber(world);
    if (number === null || number < 1 || number > OPENING_WORLD_LIMIT) continue;
    result.worldNumbers.add(number);
    if (world.status !== "running") result.terminalWorlds.set(number, world);
  }
  return result;
}

export function getOpeningWorlds(state, cohort) {
  const worlds = new Map();
  for (const world of state?.worlds ?? []) {
    const number = worldInstanceNumber(world);
    if (cohort.worldNumbers.has(number)) worlds.set(number, world);
  }
  for (const [number, world] of cohort.terminalWorlds) worlds.set(number, world);
  return [...worlds.values()].sort((a, b) => a.worldNumber - b.worldNumber);
}

export function isOpeningWorldCohortComplete(state, cohort) {
  collectOpeningWorlds(state, cohort);
  if (!state?.active) return true;
  return (
    cohort.worldNumbers.size === OPENING_WORLD_LIMIT &&
    cohort.terminalWorlds.size === OPENING_WORLD_LIMIT
  );
}

export function openingWorldEndDay(worlds) {
  return Math.max(0, ...worlds.map((world) => Number(world.endDay) || 0));
}
