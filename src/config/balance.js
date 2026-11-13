/**
 * Centralized tuning candidates. Values here are experimental and should only
 * be changed after a seeded balance-report comparison.
 * No timing, random generators, rendering or storage dependencies belong here.
 */
export const BALANCE = {
  doom: {
    midPhaseDay: 35,
    latePhaseDay: 70,
    earlyDailyPressure: 1.3,
    middleDailyPressure: 1.65,
    lateDailyPressure: 2.1,
    runMultipliers: [1.28, 1.4, 1.33],
  },
  actions: {
    trainingExperience: 3,
    gatheringResources: 3,
    explorationProgress: 3.3,
    preparationProgress: 4,
    combatExperience: 1.95,
    maxStageCombatExperience: 0.8,
    combatResources: 1,
    combatDoomReduction: 0.35,
    threatUrgencyScore: 3.5,
    beastSuppressionDoomRelief: 2.5,
    beastSuppressionThreatMitigation: 0.1,
    beastRescueNestPriorityDoom: 65,
  },
};

export function dailyDoomPressure(day, runNumber) {
  const { doom } = BALANCE;
  const stageRate =
    day >= doom.latePhaseDay
      ? doom.lateDailyPressure
      : day >= doom.midPhaseDay
        ? doom.middleDailyPressure
        : doom.earlyDailyPressure;
  const multiplier =
    doom.runMultipliers[Math.min(Math.max(runNumber, 1), doom.runMultipliers.length) - 1];
  return stageRate * multiplier;
}
