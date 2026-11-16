import { describe, expect, it } from "vitest";
import { buildStrategyProfiles, STRATEGY_IDS } from "../scripts/strategy-matrix-core.mjs";

describe("per-world strategy profile matrix", () => {
  it("enumerates all nine two-world combinations in stable order", () => {
    const profiles = buildStrategyProfiles(["lingzai", "zombie"]);

    expect(profiles).toHaveLength(9);
    expect(profiles[0]).toEqual({
      id: "lingzai-growth__zombie-growth",
      strategies: { lingzai: "growth", zombie: "growth" },
    });
    expect(profiles.at(-1)).toEqual({
      id: "lingzai-rescue__zombie-rescue",
      strategies: { lingzai: "rescue", zombie: "rescue" },
    });
    expect(new Set(profiles.map((profile) => profile.id)).size).toBe(9);
  });

  it("enumerates all twenty-seven three-world combinations", () => {
    const profiles = buildStrategyProfiles(["lingzai", "zombie", "beast"]);

    expect(profiles).toHaveLength(27);
    expect(profiles[0].strategies).toEqual({
      lingzai: "growth",
      zombie: "growth",
      beast: "growth",
    });
    expect(profiles.at(-1).strategies).toEqual({
      lingzai: "rescue",
      zombie: "rescue",
      beast: "rescue",
    });
  });

  it("uses the configured strategy IDs", () => {
    expect(STRATEGY_IDS).toEqual(["growth", "clear", "rescue"]);
  });

  it("rejects unknown or duplicate world and strategy IDs", () => {
    expect(() => buildStrategyProfiles([])).toThrow();
    expect(() => buildStrategyProfiles(["lingzai", "lingzai"])).toThrow();
    expect(() => buildStrategyProfiles(["unknown"])).toThrow();
    expect(() => buildStrategyProfiles(["lingzai"], ["growth", "unknown"])).toThrow();
    expect(() => buildStrategyProfiles(["lingzai"], ["growth", "growth"])).toThrow();
  });
});
