import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { previewResourceAid } from "../src/systems/aid-contract.js";

describe("resource aid is a truthful, side-effect-free intervention", () => {
  it("shows actual capped gains and prevents P100/D0 no-op payments", () => {
    const run = Engine.fresh("aid-cap", 1, false);
    const to = Engine.byId(run, "zombie");
    const before = JSON.stringify(run);
    to.p = 97;
    let preview = Engine.previewAid(run, "lingzai", "zombie", "p");
    expect(preview.available).toBe(true);
    expect(preview.actualDelta).toBe(3);
    expect(preview.resourceCost).toBe(4);
    const result = Engine.aid(run, "lingzai", "zombie", "p");
    expect(result.ok).toBe(true);
    expect(to.p).toBe(100);
    expect(run.ap).toBe(1);
    expect(run.soul).toBe(7);
    const ap = run.ap, soul = run.soul;
    preview = Engine.previewAid(run, "lingzai", "zombie", "p");
    expect(preview.available).toBe(false);
    expect(preview.reason).toContain("P100");
    expect(Engine.aid(run, "lingzai", "zombie", "p").ok).toBe(false);
    expect(run.ap).toBe(ap);
    expect(run.soul).toBe(soul);
    expect(JSON.stringify(run)).not.toBe(before);
  });

  it("does not charge for reducing an already zero doom bar", () => {
    const run = Engine.fresh("aid-zero", 1, false);
    const before = JSON.stringify(run);
    const preview = Engine.previewAid(run, "lingzai", "zombie", "d");
    expect(preview.available).toBe(false);
    expect(preview.actualDelta).toBe(0);
    expect(preview.reason).toContain("为0");
    expect(Engine.aid(run, "lingzai", "zombie", "d").ok).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
  });

  it("shares one target cooldown between P aid and D aid", () => {
    const run = Engine.fresh("aid-shared", 1, false);
    const to = Engine.byId(run, "zombie");
    to.d = 11;
    expect(Engine.aid(run, "lingzai", "zombie", "p").ok).toBe(true);
    run.ap = 4;
    Engine.byId(run, "lingzai").resource = 14;
    const frozen = JSON.stringify(run);
    const blocked = Engine.previewAid(run, "lingzai", "zombie", "d");
    expect(blocked.available).toBe(false);
    expect(blocked.nextEligibleDay).toBe(10);
    expect(Engine.aid(run, "lingzai", "zombie", "d").ok).toBe(false);
    expect(JSON.stringify(run)).toBe(frozen);
    run.day = 10;
    const preview = Engine.previewAid(run, "lingzai", "zombie", "d");
    expect(preview.available).toBe(true);
    expect(preview.actualDelta).toBe(11);
    expect(Engine.aid(run, "lingzai", "zombie", "d").ok).toBe(true);
    expect(to.d).toBe(0);
  });

  it("warns of donor finale material loss without incorrectly prohibiting it", () => {
    const run = Engine.fresh("aid-reserve", 1, false);
    const from = Engine.byId(run, "lingzai");
    from.resource = 12;
    const preview = Engine.previewAid(run, "lingzai", "zombie", "p");
    expect(preview.jeopardizesSourceFinale).toBe(true);
    expect(preview.sourceFinalCost).toBe(10);
    expect(preview.sourceAfter).toBe(8);
    expect(preview.available).toBe(true);
    expect(JSON.stringify(preview)).toContain("targetDaysLeft");
  });

  it("recognizes reserved AP and source/target validity", () => {
    const run = Engine.fresh("aid-reserved", 1, false);
    run.apReserved = 2;
    const before = JSON.stringify(run);
    expect(Engine.previewAid(run, "lingzai", "zombie", "p").reason).toContain("行动点");
    expect(Engine.aid(run, "lingzai", "zombie", "p").ok).toBe(false);
    expect(Engine.previewAid(run, "lingzai", "lingzai", "p").available).toBe(false);
    expect(Engine.previewAid(run, "missing", "zombie", "p").available).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
  });

  it("is equivalent to the exported pure contract and never samples RNG", () => {
    const run = Engine.fresh("aid-pure", 3, true);
    Engine.byId(run, "beast").d = 5.5;
    const before = JSON.stringify(run);
    const a = Engine.previewAid(run, "zombie", "beast", "d");
    const b = previewResourceAid(run, "zombie", "beast", "d");
    expect(a).toEqual(b);
    expect(a.actualDelta).toBe(5.5);
    expect(JSON.stringify(run)).toBe(before);
  });
});
