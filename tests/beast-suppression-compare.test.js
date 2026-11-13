import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/config/balance.js";
import { compareBeastSuppression } from "../scripts/beast-suppression-compare.mjs";

describe("paired-seed beast suppression balance", () => {
  it("replays the same outcomes and restores the live tuning", () => {
    const original = { ...BALANCE.actions };
    const first = compareBeastSuppression(30);
    const replay = compareBeastSuppression(30);
    expect(replay).toEqual(first);
    expect(BALANCE.actions).toEqual(original);
    expect(first.rows.every((row) => row.incomplete === 0)).toBe(true);
    expect(first.comparisons.every((row) => row.otherWorldRatesUnchanged)).toBe(true);
    expect(first.comparisons.every((row) => row.deltaBeastSaveRate >= 0)).toBe(true);
    console.info("Beast paired 30-seed A/B", JSON.stringify(first.comparisons));
  });
});
