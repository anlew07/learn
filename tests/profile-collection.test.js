import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { EASTER_EGGS, CROSSWORLD_SECRETS } from "../src/systems/easter-eggs.js";
import { mergeProfileSecrets, summarizeProfileSecrets } from "../src/systems/profile-collection.js";

describe("permanent cosmetic discoveries", () => {
  it("supports legacy profiles and hides titles that are not found", () => {
    const profile = { runCount: 4, shards: 15 };
    const before = JSON.stringify(profile);
    const archive = summarizeProfileSecrets(profile);
    expect(archive).toMatchObject({ found: 0, total: 5, complete: false });
    expect(archive.entries.every((entry) => entry.title === "？？？")).toBe(true);
    expect(JSON.stringify(profile)).toBe(before);
    expect(mergeProfileSecrets(profile, null)).toMatchObject({
      runCount: 4, shards: 15, secretArchive: [],
    });
  });

  it("collects unique discoveries across runs while leaving the run untouched", () => {
    const first = Engine.fresh("archive-a", 1, false);
    Engine.byId(first, "lingzai").flags.easterEggs = [EASTER_EGGS.lingzai.id];
    const snapshot = JSON.stringify(first);
    const one = mergeProfileSecrets({ runCount: 0, shards: 0 }, first);
    expect(one.secretArchive).toEqual([EASTER_EGGS.lingzai.id]);
    expect(JSON.stringify(first)).toBe(snapshot);
    const second = Engine.fresh("archive-b", 3, false);
    Engine.byId(second, "zombie").flags.easterEggs = [EASTER_EGGS.zombie.id];
    const two = mergeProfileSecrets(one, second);
    expect(two.secretArchive).toEqual([EASTER_EGGS.lingzai.id, EASTER_EGGS.zombie.id]);
    expect(mergeProfileSecrets(two, second)).toEqual(two);
    expect(one.secretArchive).toHaveLength(1);
  });

  it("ignores unknown IDs and awards the purely cosmetic title after all five", () => {
    const run = Engine.fresh("archive-all", 3, false);
    for (const world of run.worlds) world.flags.easterEggs = [EASTER_EGGS[world.id].id];
    run.crossworldSecrets = CROSSWORLD_SECRETS.map((entry) => entry.id);
    const profile = mergeProfileSecrets({
      runCount: 2, shards: 9, secretArchive: ["unknown/old", EASTER_EGGS.lingzai.id],
    }, run);
    expect(profile).toMatchObject({ runCount: 2, shards: 9 });
    expect(profile.secretArchive).toHaveLength(5);
    expect(profile.secretArchive).not.toContain("unknown/old");
    const summary = summarizeProfileSecrets(profile);
    expect(summary).toMatchObject({ found: 5, total: 5, complete: true });
    expect(run.ap).toBe(2);
    expect(run.soul).toBe(8);
    expect(summarizeProfileSecrets(JSON.parse(JSON.stringify(profile)))).toEqual(summary);
  });
});
