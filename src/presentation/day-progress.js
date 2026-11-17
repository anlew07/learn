/**
 * A day is one engine step, not a continuously simulated 24-hour calendar.
 * Interpolate only the real foreground wait until that next step. The four
 * light phases are visual cues and never affect engine actions or rewards.
 */
export const DAY_DURATION_MS = Object.freeze({ 1: 20_000, 2: 10_000, 4: 5_000 });

const DAYLIGHT = Object.freeze([
  { until: 0.22, phase: "morning", label: "清晨" },
  { until: 0.57, phase: "day", label: "白昼" },
  { until: 0.82, phase: "dusk", label: "黄昏" },
  { until: 1.01, phase: "night", label: "夜晚" },
]);

export function readDayProgress(elapsedMs, speed = 1) {
  const durationMs = DAY_DURATION_MS[speed] ?? DAY_DURATION_MS[1];
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const ratio = Math.min(1, elapsed / durationMs);
  const daylight = DAYLIGHT.find((period) => ratio < period.until) ?? DAYLIGHT.at(-1);
  return {
    percent: Math.floor(ratio * 100),
    phase: daylight.phase,
    label: daylight.label,
    durationMs,
  };
}
