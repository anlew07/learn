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

describe("equippable cosmetic archive titles", () => {
  it("only permits genuinely unlocked titles and leaves the profile intact on rejection", async () => {
    const { equipArchiveTitle, availableArchiveTitles, selectedArchiveTitle } = await import("../src/systems/profile-collection.js");
    const original = { runCount: 2, shards: 7, secretArchive: [] };
    const before = JSON.stringify(original);
    const blocked = equipArchiveTitle(original, "title/tea-coffee");
    expect(blocked.ok).toBe(false);
    expect(blocked.profile).toBe(original);
    expect(JSON.stringify(original)).toBe(before);
    expect(availableArchiveTitles(original).every((item) => !item.available)).toBe(true);
    const earned = { ...original, secretArchive: ["crossworld/tea-and-coffee"] };
    const result = equipArchiveTitle(earned, "title/tea-coffee");
    expect(result.ok).toBe(true);
    expect(selectedArchiveTitle(result.profile)).toBe("跨界茶咖联络员");
    expect(JSON.stringify(earned)).not.toContain("selectedTitle");
    expect(selectedArchiveTitle(JSON.parse(JSON.stringify(result.profile)))).toBe("跨界茶咖联络员");
    const cleared = equipArchiveTitle(result.profile, "");
    expect(selectedArchiveTitle(cleared.profile)).toBe("");
  });

  it("keeps the full-collection title locked until all five distinct discoveries", async () => {
    const { equipArchiveTitle, availableArchiveTitles, selectedArchiveTitle } = await import("../src/systems/profile-collection.js");
    const complete = { runCount: 3, shards: 25, secretArchive: [
      ...Object.values(EASTER_EGGS).map((item) => item.id),
      ...CROSSWORLD_SECRETS.map((item) => item.id),
    ] };
    const partial = { ...complete, secretArchive: complete.secretArchive.slice(0, -1) };
    expect(equipArchiveTitle(partial, "title/holiday-chair").ok).toBe(false);
    const dressed = equipArchiveTitle(complete, "title/holiday-chair");
    expect(dressed.ok).toBe(true);
    expect(selectedArchiveTitle(dressed.profile)).toBe("三界假期协调员");
    expect(availableArchiveTitles(complete)).toHaveLength(3);
    expect(equipArchiveTitle(complete, "title/invalid").ok).toBe(false);
    expect(dressed.profile.runCount).toBe(3);
    expect(dressed.profile.shards).toBe(25);
  });
});
