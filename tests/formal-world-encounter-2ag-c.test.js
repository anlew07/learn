import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import {
  createSortie,
  stepSortie,
  chooseSortieSkill,
  castSortieSkill,
  DURATION_TICKS,
} from "../src/systems/sortie-sim.js";
import {
  replaySortieProgress,
  replaySortieTrace,
} from "../src/systems/sortie-trace.js";
import { getAutonomousEncounterDecision } from "../src/systems/encounter-controller.js";
import { assertRestorableSnapshot } from "../src/services/persistence.js";

function readyRun() {
  const run = Engine.fresh("2ag-preview-fight", 1, true);
  Engine.byId(run, "lingzai").strategy = "clear";
  return run;
}

function finishWithAi(battle, actions) {
  let guard = 0;
  while (battle.outcome === "running" && guard < DURATION_TICKS + 2) {
    const decision = getAutonomousEncounterDecision(battle);
    if (decision.skillId) {
      const result = chooseSortieSkill(battle, decision.skillId);
      if (!result.ok) throw new Error(result.error);
      actions.push(["skill", decision.skillId]);
    } else {
      stepSortie(battle, decision.input);
      actions.push(["tick", decision.input.x, decision.input.y]);
    }
    guard++;
  }
  return battle;
}

describe("2AG-C formal world encounter transaction", () => {
  it("starts only when the real next Lingzai action is fight", () => {
    const notFight = Engine.fresh("2ag-c-not-fight", 1, true);
    const before = JSON.stringify(notFight);
    expect(Engine.previewNextAction(notFight, "lingzai").actionId).not.toBe("fight");
    expect(Engine.beginEncounter(notFight, "lingzai").ok).toBe(false);
    expect(JSON.stringify(notFight)).toBe(before);

    const run = readyRun();
    const preview = Engine.previewNextAction(run, "lingzai");
    expect(preview).toMatchObject({ ok: true, actionId: "fight", status: "running" });
    const started = Engine.beginEncounter(run, "lingzai");
    expect(started.ok).toBe(true);
    expect(run.day).toBe(1);
    expect(run.paused).toBe(true);
    expect(run.pendingEncounter).toMatchObject({
      worldId: "lingzai",
      day: 1,
      controller: "choice",
      actions: [],
    });
  });

  it("keeps formal encounters on automatic skill release", () => {
    const run = readyRun("2ag-c-auto-skill-release");
    expect(Engine.beginEncounter(run, "lingzai").ok).toBe(true);
    expect(Engine.setEncounterMode(run, "player").ok).toBe(true);
    const pending = run.pendingEncounter;
    const battle = createSortie(
      pending.seed,
      pending.danger,
      pending.forgeLevel,
      pending.missionId,
    );

    expect(battle.skillReleaseMode).toBe("auto");
    battle.skillChoicePending = true;
    expect(chooseSortieSkill(battle, "rune").ok).toBe(true);
    const shield = battle.runeShield;
    const nextTick = battle.runeNextTick;
    expect(shield).toBe(1);
    expect(castSortieSkill(battle)).toMatchObject({
      ok: false,
      error: "当前战技采用自动释放",
    });
    expect(battle.runeShield).toBe(shield);
    expect(battle.runeNextTick).toBe(nextTick);
  });

  it("does not interrupt an active event or a pending build choice", () => {
    for (const blocker of ["event", "build"]) {
      const run = readyRun("2ag-c-block-" + blocker);
      const world = Engine.byId(run, "lingzai");
      if (blocker === "event") {
        world.pendingEvent = {
          id: "clue", type: "clue", title: "线索",
          state: "active", expiresDay: run.day + 3,
        };
      } else {
        world.build.pending = {
          id: "build", options: ["blades", "arc"], due: run.day + 1,
        };
      }
      const before = JSON.stringify(run);
      expect(Engine.beginEncounter(run, "lingzai").ok).toBe(false);
      expect(JSON.stringify(run)).toBe(before);
    }
  });

  it("restores an incomplete trace, including the skill-choice pause", () => {
    const run = readyRun("2ag-c-progress-restore");
    expect(Engine.beginEncounter(run, "lingzai").ok).toBe(true);
    expect(Engine.setEncounterMode(run, "player").ok).toBe(true);
    const pending = run.pendingEncounter;
    const battle = createSortie(
      pending.seed, pending.danger, pending.forgeLevel, pending.missionId,
    );
    const actions = [];
    for (let tick = 0; tick < 1500; tick++) {
      stepSortie(battle, { x: 0.25, y: -0.1 });
      actions.push(["tick", 0.25, -0.1]);
    }
    expect(battle.skillChoicePending).toBe(true);
    pending.actions = actions;

    const restored = replaySortieProgress(
      pending.seed, pending.danger, pending.actions,
      pending.forgeLevel, pending.missionId,
    );
    expect(restored.ok).toBe(true);
    expect(restored.battle.tick).toBe(1500);
    expect(restored.battle.skillChoicePending).toBe(true);
    expect(restored.battle.hero).toEqual(battle.hero);
    expect(replaySortieTrace(
      pending.seed, pending.danger, pending.actions,
      pending.forgeLevel, pending.missionId,
    ).ok).toBe(false);

    expect(() => assertRestorableSnapshot({ run, profile: null }, Engine.VERSION)).not.toThrow();
    const malformed = JSON.parse(JSON.stringify(run));
    malformed.pendingEncounter.actions[0] = ["tick", 2, 0];
    expect(() => assertRestorableSnapshot({
      run: malformed, profile: null,
    }, Engine.VERSION)).toThrow();
  });

  it("hands the same live battle from the player to AI and settles one world day once", () => {
    const run = readyRun();
    expect(Engine.beginEncounter(run, "lingzai").ok).toBe(true);
    expect(Engine.setEncounterMode(run, "player").ok).toBe(true);
    const pending = run.pendingEncounter;
    const battle = createSortie(
      pending.seed, pending.danger, pending.forgeLevel, pending.missionId,
    );
    const identity = battle;
    const actions = [];
    for (let tick = 0; tick < 120; tick++) {
      stepSortie(battle, { x: 0.35, y: 0 });
      actions.push(["tick", 0.35, 0]);
    }
    pending.actions = actions;
    const handoffTick = battle.tick;
    const handoffPosition = { ...battle.hero };

    expect(Engine.handoffEncounterToAI(run)).toMatchObject({ ok: true, controller: "ai" });
    expect(run.encounterPreference).toBe("player");
    expect(run.paused).toBe(true);
    expect(battle).toBe(identity);

    finishWithAi(battle, pending.actions);
    expect(battle.tick).toBeGreaterThan(handoffTick);
    expect(battle.hero).not.toEqual(handoffPosition);
    expect(battle.outcome).toBe("won");

    const beforeSettle = JSON.stringify(run);
    const settled = Engine.settleEncounter(run, { sortieId: pending.id });
    expect(settled.ok).toBe(true);
    expect(settled.run.day).toBe(2);
    expect(settled.run.pendingEncounter).toBeNull();
    expect(settled.run.paused).toBe(true);
    expect(settled.run.lastEncounter).toMatchObject({
      id: pending.id,
      day: 1,
      nextDay: 2,
      battle: { outcome: "won" },
    });
    const lingzai = Engine.byId(settled.run, "lingzai");
    expect(lingzai.lastDecision).toMatchObject({ day: 1, actionId: "fight" });
    expect(lingzai.metrics.actions.fight).toBe(1);
    expect(lingzai.metrics.actions.sortie).toBeUndefined();
    expect(settled.receipt.worlds.find((world) => world.id === "lingzai").actionId).toBe("fight");
    expect(settled.run.worlds.some((world) => world.lastDecision?.day === 1)).toBe(true);

    const afterSettle = JSON.stringify(settled.run);
    const replayed = Engine.settleEncounter(settled.run, { sortieId: pending.id });
    expect(replayed).toMatchObject({ ok: true, replayed: true });
    expect(JSON.stringify(replayed.run)).toBe(afterSettle);
    expect(settled.run.day).toBe(2);
    expect(JSON.stringify(run)).toBe(beforeSettle);
  });

  it("rejects a forged or stale trace without mutating the official run", () => {
    const run = readyRun();
    expect(Engine.beginEncounter(run, "lingzai").ok).toBe(true);
    expect(Engine.setEncounterMode(run, "player").ok).toBe(true);
    run.pendingEncounter.actions = [["tick", 2, 0]];
    const before = JSON.stringify(run);
    const result = Engine.settleEncounter(run, { sortieId: run.pendingEncounter.id });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
  });
});

describe("2AG-D encounter transaction regression", () => {
  function threatRun() {
    const run = readyRun();
    const world = Engine.byId(run, "lingzai");
    world.level = 2;
    world.resource = 20;
    world.d = 20;
    world.threat = { id: "lingzai/threat/1", status: "active", progress: 1, retryDay: 1 };
    return run;
  }

  function finishEncounter(run, retreat = false) {
    expect(Engine.beginEncounter(run, "lingzai").ok).toBe(true);
    expect(Engine.setEncounterMode(run, "ai").ok).toBe(true);
    const pending = run.pendingEncounter;
    if (retreat) pending.actions.push(["retreat"]);
    else {
      const battle = createSortie(pending.seed, pending.danger, pending.forgeLevel, pending.missionId);
      finishWithAi(battle, pending.actions);
      expect(battle.outcome).toBe("won");
    }
    return Engine.settleEncounter(run, { sortieId: pending.id });
  }

  it("locks ordinary steps, commands and direct intervention APIs while pending", () => {
    const run = readyRun();
    expect(Engine.beginEncounter(run, "lingzai").ok).toBe(true);
    const before = JSON.stringify(run);
    expect(Engine.step(run).ok).toBe(false);
    expect(Engine.applyCommand(run, { operationId: "pending-command", type: "strategy", args: ["lingzai", "growth"] }).ok).toBe(false);
    expect(Engine.setStrategy(run, "lingzai", "growth").ok).toBe(false);
    expect(Engine.chooseBuild(run, "lingzai", "thunder").ok).toBe(false);
    expect(Engine.aid(run, "zombie", "lingzai", "resource").ok).toBe(false);
    expect(Engine.settleSortie(run, { sortieId: run.pendingEncounter.id, actions: [["retreat"]] }).ok).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
  });

  it("advances a persistent threat on real victory, but never on retreat", () => {
    const win = finishEncounter(threatRun());
    expect(win.ok).toBe(true);
    const world = Engine.byId(win.run, "lingzai");
    expect(world.threat.progress).toBe(2);
    expect(world.threat.status).toBe("awaiting_alpha");
    expect(world.queuedBoss).toBe(true);
    expect(world.metrics.actions.fight).toBe(1);
    expect(win.receipt.formalEncounter).toBe(true);
    expect(Engine.settleEncounter(win.run, { sortieId: win.receipt.sortieId }).replayed).toBe(true);

    const retreat = finishEncounter(threatRun(), true);
    expect(retreat.ok).toBe(true);
    const retreatWorld = Engine.byId(retreat.run, "lingzai");
    expect(retreatWorld.threat.progress).toBe(1);
    expect(retreatWorld.queuedBoss).toBeFalsy();
    expect(retreat.receipt.battle.outcome).toBe("retreated");
    expect(retreatWorld.metrics.actions.fight).toBe(1);
    expect(retreat.run.day).toBe(2);
  });

  it("does not allow the prototype settlement endpoint to claim formal authority", () => {
    const run = readyRun();
    expect(Engine.beginEncounter(run, "lingzai").ok).toBe(true);
    const id = run.pendingEncounter.id;
    const independent = readyRun();
    const before = JSON.stringify(independent);
    expect(Engine.settleSortie(independent, {
      sortieId: id, actions: [["retreat"]], formalEncounter: true,
    }).ok).toBe(false);
    expect(JSON.stringify(independent)).toBe(before);
    const legacy = Engine.settleSortie(independent, { sortieId: id, actions: [["retreat"]] });
    expect(legacy.ok).toBe(true);
    expect(Engine.settleEncounter(legacy.run, { sortieId: id }).ok).toBe(false);
    expect(Engine.settleSortie(legacy.run, { sortieId: id, actions: [["retreat"]] }).replayed).toBe(true);
  });

  it("honors an already purchased tactical order through the existing wave resolver", () => {
    const run = readyRun();
    expect(Engine.applyCommand(run, { operationId: "2ag-d-focus", type: "tactic", args: ["lingzai"] }).ok).toBe(true);
    const before = JSON.stringify(run);
    expect(Engine.beginEncounter(run, "lingzai").ok).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
    expect(Engine.step(run).ok).toBe(true);
    const world = Engine.byId(run, "lingzai");
    expect(world.tacticalAssist).toBeNull();
    expect(world.lastCombat.tactic.kind).toBe("focus");
    expect(world.metrics.actions.fight).toBe(1);
  });
});
