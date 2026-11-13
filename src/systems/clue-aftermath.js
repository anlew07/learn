/** Predictable, bounded aftermath for a cautious clue investigation. */
export const CLUE_SAFETY = Object.freeze({
  duration: 4,
  naturalDoomReduction: 0.2,
});

export function startCautiousInvestigation(world, day) {
  world.clueSafety = {
    start: day + 1,
    until: day + CLUE_SAFETY.duration,
    perDay: CLUE_SAFETY.naturalDoomReduction,
    resolved: false,
  };
}

export function cautiousMitigation(world, day) {
  const effect = world?.clueSafety;
  if (!effect || world.status !== "running" || day < effect.start || day > effect.until) {
    return 0;
  }
  return effect.perDay;
}

/** Returns a one-time narrative outcome, without charging or changing stats. */
export function settleCautiousAftermath(world, day) {
  const effect = world?.clueSafety;
  if (!effect || effect.resolved || day < effect.until || world.status !== "running") {
    return null;
  }
  effect.resolved = true;
  return "此前谨慎保存的灾难情报已完成四日防护部署。余波渐息，分身继续独立行动。";
}

export function cautiousAftermathSummary(world, day) {
  if (!cautiousMitigation(world, day)) return "";
  return "谨慎调查防护 · 每日自然D−0.2 · 剩余"+(world.clueSafety.until-day+1)+"日";
}
