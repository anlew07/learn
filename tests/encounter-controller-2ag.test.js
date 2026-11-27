import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { createSortie, DURATION_TICKS, stepSortie, chooseSortieSkill, castSortieSkill } from "../src/systems/sortie-sim.js";
import { replaySortieTrace } from "../src/systems/sortie-trace.js";
import {
  chooseAutonomousEncounterSkill,
  getAutonomousEncounterDecision,
  getAutonomousEncounterInput,
  shouldAutonomousCastEncounterSkill,
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

function runAutopilotTrace(seed, danger, skillReleaseMode) {
  const battle = createSortie(seed, danger, 0, "safe", { skillReleaseMode });
  const actions = [];
  let guard = 0;
  while (battle.outcome === "running" && guard < DURATION_TICKS + 2) {
    const decision = getAutonomousEncounterDecision(battle);
    if (decision.skillId) {
      chooseSortieSkill(battle, decision.skillId);
      actions.push(["skill", decision.skillId]);
    } else {
      if (decision.castSkill) {
        const cast = castSortieSkill(battle);
        if (cast.ok) actions.push(["cast", battle.skillId]);
      }
      const input = decision.input;
      stepSortie(battle, input);
      actions.push(["tick", input.x, input.y]);
    }
    guard++;
  }
  return { battle, actions };
}

function battleSummary(battle) {
  return {
    outcome: battle.outcome,
    tick: battle.tick,
    hp: battle.hero.hp,
    defeated: battle.defeated,
    hurt: battle.hurt,
    collectedShards: battle.collectedShards,
    thunderHits: battle.thunderHits,
    shieldBlocks: battle.shieldBlocks,
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

  it("previews a real Lingzai fight without mutating the official RunState", () => {
    const run = Engine.fresh("2ag-preview-fight", 1, true);
    Engine.byId(run, "lingzai").strategy = "clear";
    const before = JSON.stringify(run);

    const preview = Engine.previewNextAction(run, "lingzai");

    expect(preview).toMatchObject({
      ok: true,
      worldId: "lingzai",
      day: 1,
      actionId: "fight",
    });
    expect(JSON.stringify(run)).toBe(before);

    const result = Engine.step(run);
    expect(result.ok).toBe(true);
    expect(Engine.byId(run, "lingzai").lastDecision).toMatchObject({
      day: preview.day,
      actionId: preview.actionId,
    });
  });

  it("matches the next Engine.step action for all active worlds across fixed seeds", () => {
    for (let index = 0; index < 40; index++) {
      const run = Engine.fresh("2ag-action-preview-" + index, 1, true, "", 2);
      for (let dayIndex = 0; dayIndex < 2; dayIndex++) {
        const day = run.day;
        const before = JSON.stringify(run);
        const previews = run.worlds.map((world) =>
          Engine.previewNextAction(run, world.id),
        );
        expect(JSON.stringify(run)).toBe(before);
        expect(previews.every((preview) => preview.ok)).toBe(true);

        expect(Engine.step(run).ok).toBe(true);
        for (const preview of previews) {
          const actual = Engine.byId(run, preview.worldId).lastDecision;
          expect(actual).toMatchObject({
            day,
            actionId: preview.actionId,
          });
        }
      }
    }
  });

  it("rejects invalid preview targets without touching the run", () => {
    const run = Engine.fresh("2ag-preview-invalid", 1, true);
    const before = JSON.stringify(run);
    expect(Engine.previewNextAction(run, "missing-world").ok).toBe(false);
    expect(Engine.previewNextAction(null, "lingzai").ok).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
  });


  it("keeps automatic skill activation as the backward-compatible default", () => {
    const battle = createSortie("2ag-auto-skill-default");
    battle.skillChoicePending = true;
    expect(chooseSortieSkill(battle, "rune").ok).toBe(true);
    expect(battle.skillReleaseMode).toBe("auto");
    expect(battle.runeShield).toBe(1);
  });

  it("rejects manual cast commands in automatic mode without changing the selected skill", () => {
    const battle = createSortie("2ag-auto-cast-rejected");
    battle.skillChoicePending = true;
    expect(chooseSortieSkill(battle, "rune").ok).toBe(true);
    const shield = battle.runeShield;
    const nextTick = battle.runeNextTick;

    expect(castSortieSkill(battle)).toMatchObject({
      ok: false,
      error: "当前战技采用自动释放",
    });
    expect(battle.runeShield).toBe(shield);
    expect(battle.runeNextTick).toBe(nextTick);
  });

  it("manual thunder waits for a deliberate cast and does not spend cooldown without a target", () => {
    const battle = createSortie("2ag-manual-thunder", 0, 0, "safe", {
      skillReleaseMode: "manual",
    });
    battle.skillChoicePending = true;
    expect(chooseSortieSkill(battle, "thunder").ok).toBe(true);
    expect(battle.thunderHits).toBe(0);

    const emptyCast = castSortieSkill(battle);
    expect(emptyCast.ok).toBe(false);
    expect(battle.thunderNextTick).toBe(0);

    battle.enemies.push({ id: 1, kind: "wolf", x: 250, y: 224, hp: 2 });
    battle.nextShotTick = 10000;
    battle.hero.invulnerable = 10000;
    for (let tick = 0; tick < 240; tick++) stepSortie(battle, { x: 0, y: 0 });
    expect(battle.thunderHits).toBe(0);

    const cast = castSortieSkill(battle);
    expect(cast).toMatchObject({ ok: true, skillId: "thunder", targets: 1 });
    expect(battle.thunderHits).toBe(1);
    expect(battle.enemies[0].hp).toBe(1);
    expect(castSortieSkill(battle).ok).toBe(false);
    expect(battle.thunderNextTick).toBeGreaterThan(battle.tick);
  });

  it("manual rune is held until the player casts it and blocks only one real hit", () => {
    const battle = createSortie("2ag-manual-rune", 0, 0, "safe", {
      skillReleaseMode: "manual",
    });
    battle.skillChoicePending = true;
    expect(chooseSortieSkill(battle, "rune").ok).toBe(true);
    expect(battle.runeShield).toBe(0);

    expect(castSortieSkill(battle)).toMatchObject({ ok: true, skillId: "rune" });
    expect(battle.runeShield).toBe(1);
    battle.enemies.push({ id: 1, kind: "wolf", x: battle.hero.x, y: battle.hero.y, hp: 2 });
    stepSortie(battle, { x: 0, y: 0 });
    expect(battle.shieldBlocks).toBe(1);
    expect(battle.runeShield).toBe(0);
    expect(battle.hero.hp).toBe(8);
    expect(castSortieSkill(battle)).toMatchObject({ ok: false });
  });

  it("AI times manual casts against real targets and incoming danger", () => {
    const thunder = createSortie("2ag-ai-thunder", 0, 0, "safe", {
      skillReleaseMode: "manual",
    });
    thunder.skillId = "thunder";
    thunder.enemies.push({ id: 1, kind: "wolf", x: 250, y: 224, hp: 2 });
    expect(shouldAutonomousCastEncounterSkill(thunder)).toBe(false);
    thunder.enemies[0].x = 220;
    expect(shouldAutonomousCastEncounterSkill(thunder)).toBe(true);

    const rune = createSortie("2ag-ai-rune", 0, 0, "safe", {
      skillReleaseMode: "manual",
    });
    rune.skillId = "rune";
    rune.hostileShots.push({ x: 160, y: 180, vx: 0, vy: 2, ttl: 60 });
    expect(shouldAutonomousCastEncounterSkill(rune)).toBe(true);
  });

  it("replays manual and automatic skill timing for 40 fixed seeds without drift", () => {
    const totals = {
      auto: { defeated: 0, hurt: 0, thunderHits: 0, shieldBlocks: 0 },
      manual: { defeated: 0, hurt: 0, thunderHits: 0, shieldBlocks: 0, casts: 0 },
    };

    for (let index = 0; index < 40; index++) {
      const seed = "2ag-skill-release-" + index;
      const danger = [0, 45, 80][index % 3];
      for (const mode of ["auto", "manual"]) {
        const first = runAutopilotTrace(seed, danger, mode);
        const second = runAutopilotTrace(seed, danger, mode);
        expect(second.actions).toEqual(first.actions);
        expect(battleSummary(second.battle)).toEqual(battleSummary(first.battle));

        const replay = replaySortieTrace(
          seed,
          danger,
          first.actions,
          0,
          "safe",
          mode,
        );
        expect(replay.ok).toBe(true);
        expect(battleSummary(replay.battle)).toEqual(battleSummary(first.battle));

        const total = totals[mode];
        const summary = battleSummary(first.battle);
        total.defeated += summary.defeated;
        total.hurt += summary.hurt;
        total.thunderHits += summary.thunderHits;
        total.shieldBlocks += summary.shieldBlocks;
        if (mode === "manual") {
          total.casts += first.actions.filter((action) => action[0] === "cast").length;
        }
      }
    }

    // This verifies that the manual mode is genuinely exercised; it does not
    // assume it is stronger than auto mode before the balance results are read.
    expect(totals.manual.casts).toBeGreaterThan(0);
    expect(totals.manual.thunderHits + totals.manual.shieldBlocks).toBeGreaterThan(0);
  });

  it("replays the same autonomous decisions for 40 fixed seeds", () => {
    for (let index = 0; index < 40; index++) {
      const seed = "2ag-fixed-" + index;
      const danger = [0, 45, 80][index % 3];
      expect(runAutopilot(seed, danger)).toEqual(runAutopilot(seed, danger));
    }
  });
});
