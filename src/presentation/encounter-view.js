/**
 * The formal simulator owns the fight, its rewards and the saved result.
 * This projection only permits an immediate, read-only scene replay.
 * It never steps combat, replays reward commands or consumes world RNG.
 */
export function getRecentEncounter(world, currentDay) {
  const previousDay = currentDay - 1;
  const battle = world?.lastCombat;
  if (
    world?.status !== "running" ||
    !Number.isInteger(currentDay) ||
    !Number.isInteger(battle?.day) ||
    battle.day !== previousDay ||
    world.lastDecision?.day !== previousDay ||
    world.lastDecision?.actionId !== "fight"
  ) return null;

  const source = battle.spectacle;
  if (!source || !Number.isFinite(source.encountered) ||
    !Number.isFinite(source.defeated) ||
    source.encountered <= 0 || source.defeated < 0 ||
    source.defeated > source.encountered) return null;

  const waves = Array.isArray(source.waves) ? source.waves
    .filter((wave) => Number.isFinite(wave?.encountered) &&
      Number.isFinite(wave?.defeated) &&
      wave.encountered > 0 && wave.defeated >= 0 &&
      wave.defeated <= wave.encountered)
    .slice(0, 3)
    .map((wave) => ({
      encountered: wave.encountered,
      defeated: wave.defeated,
    })) : [];

  return {
    day: battle.day,
    encountered: source.encountered,
    defeated: source.defeated,
    waves,
    grade: typeof source.grade === "string" ? source.grade : "",
  };
}
