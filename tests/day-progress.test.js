import { describe, expect, it } from "vitest";
import { DAY_DURATION_MS, readDayProgress } from "../src/presentation/day-progress.js";

describe("simulation day progress", () => {
  it("uses actual time needed for a day at all supported speeds", () => {
    expect(DAY_DURATION_MS).toEqual({ 1: 20_000, 2: 10_000, 4: 5_000 });
    for (const speed of [1, 2, 4]) {
      const length = DAY_DURATION_MS[speed];
      expect(readDayProgress(length / 2, speed)).toMatchObject({
        percent: 50,
        phase: "day",
        label: "白昼",
        durationMs: length,
      });
      expect(readDayProgress(length * 0.9, speed)).toMatchObject({
        percent: 90,
        phase: "night",
        label: "夜晚",
      });
    }
  });

  it("shows distinct morning, daylight, dusk and night phases", () => {
    expect(readDayProgress(0).phase).toBe("morning");
    expect(readDayProgress(5_000).phase).toBe("day");
    expect(readDayProgress(14_000).phase).toBe("dusk");
    expect(readDayProgress(19_000).phase).toBe("night");
  });

  it("clamps invalid and excessive elapsed time and falls back to normal tempo", () => {
    expect(readDayProgress(-100).percent).toBe(0);
    expect(readDayProgress(NaN).percent).toBe(0);
    expect(readDayProgress(Infinity).percent).toBe(0);
    expect(readDayProgress(100_000).percent).toBe(100);
    expect(readDayProgress(5_000, 0).durationMs).toBe(20_000);
  });

  it("is strictly read-only", () => {
    const clock = { elapsed: 8_000, speed: 2 };
    const before = JSON.stringify(clock);
    expect(readDayProgress(clock.elapsed, clock.speed).percent).toBe(80);
    expect(JSON.stringify(clock)).toBe(before);
  });
});
