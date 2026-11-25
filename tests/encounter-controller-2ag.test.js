import { describe, expect, it } from "vitest";
import { createSortie, DURATION_TICKS, stepSortie, chooseSortieSkill } from "../src/systems/sortie-sim.js";
import {
  chooseAutonomousEncounterSkill,
  getAutonomousEncounterDecision,
  getAutonomousEncounterInput,
} from "../src/systems/encounter-controller.js";

function battleState(overrides = {}) {
  return {
    hero: { x: 160, y: 224, hp: 8 },
    enemies: [],
    hostileShots: [],
    drops: [],
    skillChoicePending: false,
    ...overrides,
  };
}

function runAutopilot(seed, danger) {
  const battle = createSortie(seed, danger);
  let guard = 0;
  while (battle.outcome === "running" && guard < DURATION_TICKS + 2) {
    const decision = getAutonomousEncounterDecision(battle);
    if (decision.skillId) chooseSortieSkill(battle, decision.skillId);
    else stepSortie(battle, decision.input);
    guard++;
  }
  return {
    outcome: battle.outcome,
    tick: battle.tick,
    hp: battle.hero.hp,
    defeated: battle.defeated,
    hurt: battle.hurt,
    collectedShards: battle.collectedShards,
    x: battle.hero.x,
    y: battle.hero.y,
  };
}

describe("2AG shared encounter controller", () => {
  it("does not move when there is no threat, projectile or nearby drop", () => {
    expect(getAutonomousEncounterInput(battleState())).toEqual({ x: 0, y: 0 });
  });

  it("approaches a distant target while keeping automatic attacks in range", () => {
    const input = getAutonomousEncounterInput(battleState({
      enemies: [{ id: 101, kind: "wolf", x: 280, y: 224, hp: 2 }],
    }));
    expect(input.x).toBeGreaterThan(0);
    expect(input.y).toBe(0);
  });

  it("backs away from a nearby enemy instead of standing in contact range", () => {
    const input = getAutonomousEncounterInput(battleState({
      enemies: [{ id: 101, kind: "wolf", x: 170, y: 224, hp: 2 }],
    }));
    expect(input.x).toBeLessThan(0);
  });

  it("evades a projectile on a direct collision course", () => {
    const input = getAutonomousEncounterInput(battleState({
      hero: { x: 100, y: 100, hp: 8 },
      hostileShots: [{ x: 100, y: 40, vx: 0, vy: 2, ttl: 90 }],
    }));
    expect(Math.hypot(input.x, input.y)).toBeGreaterThan(0);
    // A perpendicular step is valid when the projectile's future impact is exact.
    expect(input.x * 0 + input.y * 2).toBeCloseTo(0, 5);
  });

  it("moves away from arena edges and collects fragments when the route is clear", () => {
    const edge = getAutonomousEncounterInput(battleState({
      hero: { x: 12, y: 224, hp: 8 },
    }));
    const loot = getAutonomousEncounterInput(battleState({
      drops: [{ id: 7, x: 210, y: 224 }],
    }));
    expect(edge.x).toBeGreaterThan(0);
    expect(loot.x).toBeGreaterThan(0);
  });

  it("is deterministic and never mutates the encounter state", () => {
    const battle = battleState({
      enemies: [
        { id: 9, kind: "wolf", x: 192, y: 228, hp: 2 },
        { id: 3, kind: "shade", x: 80, y: 120, hp: 1 },
      ],
      hostileShots: [{ x: 100, y: 80, vx: 1, vy: 1, ttl: 60 }],
      drops: [{ id: 2, x: 220, y: 200 }],
    });
    const before = JSON.stringify(battle);
    const first = getAutonomousEncounterInput(battle);
    const second = getAutonomousEncounterInput(battle);
    expect(first).toEqual(second);
    expect(JSON.stringify(battle)).toBe(before);
    expect(Math.abs(first.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(first.y)).toBeLessThanOrEqual(1);
  });

  it("chooses defense for a damaged or surrounded clone and offense for a safe one", () => {
    expect(chooseAutonomousEncounterSkill({
      ...battleState({ hero: { x: 160, y: 224, hp: 2 } }),
      skillChoicePending: true,
    })).toBe("rune");
    expect(chooseAutonomousEncounterSkill({
      ...battleState({
        enemies: [
          { id: 1, kind: "wolf", x: 190, y: 224, hp: 2 },
          { id: 2, kind: "wolf", x: 160, y: 190, hp: 2 },
        ],
      }),
      skillChoicePending: true,
    })).toBe("rune");
    expect(chooseAutonomousEncounterSkill({
      ...battleState(),
      skillChoicePending: true,
    })).toBe("thunder");
  });

  it("allows player and AI input to take turns on the same live battle object", () => {
    const battle = createSortie("2ag-handoff");
    battle.hero.invulnerable = 10000;
    const identity = battle;
    for (let tick = 0; tick < 1400; tick++) {
      const decision = getAutonomousEncounterDecision(battle);
      if (decision.skillId) chooseSortieSkill(battle, decision.skillId);
      else stepSortie(battle, decision.input);
    }
    const beforeManual = battle.tick;
    for (let tick = 0; tick < 90; tick++) {
      if (battle.skillChoicePending) chooseSortieSkill(battle, "rune");
      else stepSortie(battle, { x: 0, y: 1 });
    }
    const beforeAutopilot = battle.tick;
    for (let tick = 0; tick < 90; tick++) {
      const decision = getAutonomousEncounterDecision(battle);
      if (decision.skillId) chooseSortieSkill(battle, decision.skillId);
      else stepSortie(battle, decision.input);
    }
    expect(battle).toBe(identity);
    expect(beforeManual).toBe(1400);
    expect(beforeAutopilot).toBeGreaterThan(beforeManual);
    expect(battle.tick).toBeGreaterThan(beforeAutopilot);
    expect(battle.seed).toBe("2ag-handoff");
  });

  it("replays the same autonomous decisions for 40 fixed seeds", () => {
    for (let index = 0; index < 40; index++) {
      const seed = "2ag-fixed-" + index;
      const danger = [0, 45, 80][index % 3];
      expect(runAutopilot(seed, danger)).toEqual(runAutopilot(seed, danger));
    }
  });
});
