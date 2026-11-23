import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import {
  equipLegacy,
  normalizeLegacyProfile,
  previewLegacyProgress,
  resetLegacy,
  unlockLegacy,
} from "../src/systems/legacy-progression.js";

describe("2AB permanent legacy progression", () => {
  it("migrates an old profile without changing its completed runs or shards", () => {
    const old = { runCount: 2, shards: 13, secretArchive: ["world/old"] };
    const migrated = normalizeLegacyProfile(old);
    expect(migrated).toMatchObject({
      runCount: 2,
      shards: 13,
      legacyUnlocks: [],
      activeLegacyId: "",
      secretArchive: ["world/old"],
    });
    expect(old).not.toHaveProperty("legacyUnlocks");
  });

  it("unlocks doctrines once, spends the exact shard cost, and gates later routes by completed expeditions", () => {
    const initial = { runCount: 0, shards: 20 };
    const first = unlockLegacy(initial, "supply");
    expect(first.ok).toBe(true);
    expect(first.profile.shards).toBe(16);
    expect(first.profile.legacyUnlocks).toEqual(["supply"]);
    expect(unlockLegacy(first.profile, "supply").ok).toBe(false);
    expect(unlockLegacy(initial, "soul").reason).toContain("第 1 次远征");
    expect(unlockLegacy(initial, "command").reason).toContain("第 2 次远征");

    const second = unlockLegacy({ ...first.profile, runCount: 1 }, "soul");
    expect(second.ok).toBe(true);
    expect(second.profile.shards).toBe(10);
    const third = unlockLegacy({ ...second.profile, runCount: 2 }, "command");
    expect(third.ok).toBe(true);
    expect(third.profile.shards).toBe(2);
    expect(previewLegacyProgress(third.profile)).toMatchObject({
      unlockedCount: 3,
      activeId: "",
    });
  });

  it("rejects insufficient currency and unknown IDs without mutating the source profile", () => {
    const profile = { runCount: 2, shards: 3 };
    const before = JSON.stringify(profile);
    expect(unlockLegacy(profile, "supply").ok).toBe(false);
    expect(unlockLegacy(profile, "missing").ok).toBe(false);
    expect(JSON.stringify(profile)).toBe(before);
  });

  it("equips one unlocked doctrine and freely resets only the equipped choice", () => {
    const purchased = {
      runCount: 2,
      shards: 2,
      legacyUnlocks: ["supply", "soul", "command"],
      activeLegacyId: "supply",
    };
    const equipped = equipLegacy(purchased, "command");
    expect(equipped.ok).toBe(true);
    expect(equipped.profile.activeLegacyId).toBe("command");
    expect(equipped.profile.legacyUnlocks).toEqual(purchased.legacyUnlocks);
    const reset = resetLegacy(equipped.profile);
    expect(reset.ok).toBe(true);
    expect(reset.profile).toMatchObject({
      shards: 2,
      legacyUnlocks: ["supply", "soul", "command"],
      activeLegacyId: "",
    });
    expect(resetLegacy(reset.profile).ok).toBe(false);
    expect(equipLegacy(purchased, "unknown").ok).toBe(false);
  });

  it("applies exactly one doctrine at the next new run and leaves RNG streams deterministic", () => {
    const baseline = Engine.fresh("2ab-start", 3, true);
    const supply = Engine.fresh("2ab-start", 3, true, "supply");
    const soul = Engine.fresh("2ab-start", 3, true, "soul");
    const command = Engine.fresh("2ab-start", 3, true, "command");
    expect(baseline.worlds.map((world) => world.resource)).toEqual([4, 4, 4]);
    expect(supply.worlds.map((world) => world.resource)).toEqual([5, 5, 5]);
    expect(soul.worlds.map((world) => world.resource)).toEqual([4, 4, 4]);
    expect(soul.soul).toBe(9);
    expect(soul.ap).toBe(2);
    expect(command.soul).toBe(8);
    expect(command.ap).toBe(3);
    expect(command.apMax).toBe(4);
    expect(command.worlds).toHaveLength(3);
    expect(command.legacyId).toBe("command");
    expect(Engine.fresh("2ab-start", 3, true, "unknown").ap).toBe(2);
    expect(Engine.fresh("2ab-start", 3, true, "command")).toEqual(
      Engine.fresh("2ab-start", 3, true, "command"),
    );
    expect(baseline.worlds.map((world) => world.rng)).toEqual(
      command.worlds.map((world) => world.rng),
    );
  });
});
