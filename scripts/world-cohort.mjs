/**
 * Balance scripts measure the first three world instances, not the whole
 * expedition. A rescued world is replaced and the campaign may continue
 * indefinitely; this bounded cohort keeps paired-seed experiments comparable.
 */
export const OPENING_WORLD_LIMIT = 3;

function worldInstanceNumber(world) {
  return Number.isInteger(world?.worldNumber) ? world.worldNumber : null;
}

export function collectOpeningWorlds(state, cohort = new Set()) {
  for (const world of state?.worlds ?? []) {
    const number = worldInstanceNumber(world);
    if (number !== null && number >= 1 && number <= OPENING_WORLD_LIMIT) {
      cohort.add(number);
    }
  }
  return cohort;
}

export function getOpeningWorlds(state, cohort) {
  return (state?.worlds ?? []).filter((world) => cohort.has(worldInstanceNumber(world)));
}

export function isOpeningWorldCohortComplete(state, cohort) {
  const worlds = getOpeningWorlds(state, cohort);
  if (!state?.active) return true;
  return (
    cohort.size === OPENING_WORLD_LIMIT &&
    worlds.length === OPENING_WORLD_LIMIT &&
    worlds.every((world) => world.status !== "running")
  );
}

export function openingWorldEndDay(worlds) {
  return Math.max(0, ...worlds.map((world) => Number(world.endDay) || 0));
}
