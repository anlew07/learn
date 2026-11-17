import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  createSortie,
  stepSortie,
  advanceSortie,
  chooseSortieSkill,
  DURATION_TICKS,
} from "../src/systems/sortie-sim.js";

describe("isolated Lingzai battle", () => {
  it("starts with 24 enemies on schedule and no official world or rewards", () => {
    const b = createSortie("first");
    expect(b.hero.hp).toBe(8);
    expect(b.tick).toBe(0);
    expect(b.schedule).toHaveLength(24);
    expect(b).not.toHaveProperty("worlds");
    expect(b).not.toHaveProperty("resource");
  });

  it("normalizes diagonal movement, clamps edges and freezes on termination", () => {
    const a = createSortie("movement");
    const b = createSortie("movement");
    stepSortie(a, { x: 1, y: 0 });
    stepSortie(b, { x: 1, y: 1 });
    expect(Math.hypot(b.hero.x - 160, b.hero.y - 224)).toBeCloseTo(a.hero.x - 160, 5);
    for (let n = 0; n < 1000; n++) stepSortie(a, { x: 1, y: 0 });
    expect(a.hero.x).toBeLessThanOrEqual(SORTIE.width - SORTIE.player.radius);
    a.outcome = "lost";
    const old = a.tick;
    stepSortie(a);
    expect(a.tick).toBe(old);
  });

  it("has two kinds and increasing danger tiers", () => {
    const b = createSortie("schedule");
    expect(new Set(b.schedule.map((event) => event.kind))).toEqual(new Set(["wolf", "shade"]));
    expect(createSortie("d40", 45).schedule).toHaveLength(26);
    expect(createSortie("d75", 80).schedule).toHaveLength(28);
  });

  it("fires and damages a real nearby target", () => {
    const b = createSortie("shot");
    b.enemies.push({ id: 101, kind: "wolf", x: 184, y: 224, hp: 2 });
    stepSortie(b);
    expect(b.fired).toBe(1);
    for (let n = 0; n < 50; n++) stepSortie(b);
    expect(b.fired).toBeGreaterThanOrEqual(2);
    expect(b.defeated).toBe(1);
  });

  it("deals contact damage once per invulnerability period", () => {
    const b = createSortie("hurt");
    b.enemies.push({ id: 101, kind: "wolf", x: 160, y: 224, hp: 999 });
    stepSortie(b);
    expect(b.hero.hp).toBe(7);
    for (let n = 0; n < 30; n++) stepSortie(b);
    expect(b.hero.hp).toBe(7);
    for (let n = 0; n < 500; n++) stepSortie(b);
    expect(b.outcome).toBe("lost");
    expect(b.hero.hp).toBe(0);
  });

  it("wins exactly at 75 seconds when life is left", () => {
    const b = createSortie("survival");
    b.hero.invulnerable = DURATION_TICKS + 1;
    for (let n = 0; n < DURATION_TICKS; n++) {
      if (b.skillChoicePending) chooseSortieSkill(b, "rune");
      stepSortie(b);
    }
    expect(b.outcome).toBe("won");
    expect(b.tick).toBe(DURATION_TICKS);
    expect(b.nextSpawn).toBe(24);
  });

  it("makes dodging meaningful against aimed shade projectiles", () => {
    const still = createSortie("test-1");
    const dodging = createSortie("test-1");
    for (let n = 0; n < DURATION_TICKS; n++) {
      if (still.skillChoicePending) chooseSortieSkill(still, "thunder");
      if (dodging.skillChoicePending) chooseSortieSkill(dodging, "thunder");
      stepSortie(still);
      stepSortie(dodging, { x: Math.cos(n / 70), y: Math.sin(n / 70) });
    }
    expect(still.outcome).toBe("lost");
    expect(dodging.outcome).toBe("won");
    expect(still.hero.hp).toBe(0);
    expect(dodging.hero.hp).toBeGreaterThan(0);
  });

  it("replays identical input and seed deterministically", () => {
    const run = () => {
      const b = createSortie("repeat");
      for (let n = 0; n < 1200; n++) stepSortie(b, { x: 0.8, y: -0.4 });
      return b;
    };
    expect(run()).toEqual(run());
  });

  it("has identical results at 30/60/120 Hz", () => {
    const run = (hz) => {
      const b = createSortie("refresh");
      for (let n = 0; n < hz * 60; n++) {
        if (b.skillChoicePending) chooseSortieSkill(b, "thunder");
        advanceSortie(b, { x: 0, y: 0 }, 1000 / hz);
      }
      return { ...b, remainderMs: Math.round(b.remainderMs * 1e6) / 1e6 };
    };
    expect(run(30)).toEqual(run(60));
    expect(run(60)).toEqual(run(120));
  });
});
