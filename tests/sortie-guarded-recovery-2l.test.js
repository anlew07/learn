import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { SORTIE } from "../src/config/sortie-data.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";
import {
  createSortie, chooseSortieSkill, retreatSortie, stepSortie,
  DURATION_TICKS,
} from "../src/systems/sortie-sim.js";
import { replaySortieTrace, sortieIdentity } from "../src/systems/sortie-trace.js";
import {
  createSortieArchive, prepareSortieArchive, settleSortieArchive,
} from "../src/systems/sortie-session.js";
import {
  assertRecoveryMatrix, playRecoveryRun, runRecoveryMatrix,
} from "../scripts/sortie-guarded-recovery-2l.mjs";

const snapshot = (item) => JSON.parse(JSON.stringify(item));

describe("2L-A guarded recovery physical objective", () => {
  it("defaults existing archives to safe and rejects invalid mission IDs", () => {
    const safe = createSortie("legacy");
    expect(safe.mission.id).toBe("safe");
    expect(safe.mission.status).toBe("inactive");
    expect(() => createSortie("wrong", 0, 0, "unlocked")).toThrow();
    expect(replaySortieTrace("valid", 0, [["retreat"]], 0, "fake").ok).toBe(false);
  });

  it("spawns a visible timed recovery site and real guardians only on approach", () => {
    const battle = createSortie("site", 0, 0, "salvage");
    const safe = createSortie("site");
    battle.hero.invulnerable = 2000; // Test harness only, not a reward mechanic.
    safe.hero.invulnerable = 2000;
    for (let tick = 0; tick < SORTIE.mission.appearsAtSeconds * SORTIE.ticksPerSecond; tick++) {
      stepSortie(battle);
      stepSortie(safe);
    }
    expect(battle.mission.status).toBe("available");
    expect(battle.mission.x).toBe(SORTIE.mission.x);
    expect(battle.mission.y).toBe(SORTIE.mission.y);
    expect(safe.mission.status).toBe("inactive");
    expect(battle.mission.guardCount).toBe(0);
    while (Math.hypot(battle.mission.x - battle.hero.x,
      battle.mission.y - battle.hero.y) > battle.mission.collectRadius - 7) {
      const dx = battle.mission.x - battle.hero.x;
      const dy = battle.mission.y - battle.hero.y;
      const length = Math.hypot(dx, dy);
      stepSortie(battle, { x: dx / length, y: dy / length });
    }
    expect(battle.mission.guardTriggeredTick).toBeGreaterThan(0);
    expect(battle.mission.guardCount).toBe(2);
    expect(battle.enemies.some((enemy) => enemy.missionGuard)).toBe(true);
    for (let i = 0; i < battle.mission.requiredTicks; i++) stepSortie(battle);
    expect(battle.mission.status).toBe("completed");
    expect(battle.mission.completedTick).toBeGreaterThan(battle.mission.appearsAtTick);
    expect(battle.hurt).toBe(0);
  });

  it("retreat never earns mission stones and normal 28px pickup stays unchanged", () => {
    const battle = createSortie("retreat", 40, 0, "salvage");
    expect(SORTIE.rewards.pickupRadius).toBe(28);
    expect(SORTIE.skills.choiceSeconds).toBe(25);
    expect(SORTIE.skills.runeRechargeSeconds).toBe(25);
    battle.mission.status = "completed"; // Malicious preview does not bypass win gate.
    expect(retreatSortie(battle).ok).toBe(true);
    const reward = previewSortieRewards(battle);
    expect(reward.objectiveStones).toBe(0);
    expect(reward.baseStones).toBe(0);
    expect(reward.stones).toBe(0);
  });

  it("keeps the 25-second skill pause frozen even with a live salvage mission", () => {
    const battle = createSortie("pause", 0, 0, "salvage");
    battle.hero.invulnerable = DURATION_TICKS + 10;
    for (let i = 0; i < 1500; i++) stepSortie(battle);
    expect(battle.skillChoicePending).toBe(true);
    const before = snapshot(battle);
    stepSortie(battle, { x: 1, y: 1 });
    expect(battle).toEqual(before);
    expect(chooseSortieSkill(battle, "rune").ok).toBe(true);
    stepSortie(battle);
    expect(battle.tick).toBe(1501);
  });
});

describe("2L-A authority and settlement", () => {
  it("validates the stored day-scoped camp choice rather than a caller-supplied reward", () => {
    const original = createSortieArchive("auth");
    const prepared = prepareSortieArchive(original);
    const saved = snapshot(prepared.archive);
    expect(Engine.settleSortie(prepared.archive.run, {
      sortieId: prepared.sortieId,
      missionId: "salvage",
      actions: [["retreat"]],
      objectiveStones: 999,
    }).ok).toBe(false);
    const legitimate = settleSortieArchive(prepared.archive, [["retreat"]]);
    expect(legitimate.ok).toBe(true);
    expect(legitimate.receipt.objectiveStones).toBe(0);
    expect(legitimate.receipt.missionId).toBe("safe");
    expect(prepared.archive).toEqual(saved);

    const forged = createSortieArchive("bad-selection");
    for (const selection of [
      { missionId: "unknown", day: 1, operationId: "id" },
      { missionId: "salvage", day: 99, operationId: "id" },
      { missionId: "salvage", day: 1, operationId: "../../oops!" },
    ]) {
      const archive = snapshot(forged);
      archive.run.sortieCamp.missionSelection = selection;
      const next = prepareSortieArchive(archive);
      expect(Engine.settleSortie(next.archive.run, {
        sortieId: sortieIdentity(next.archive.run), actions: [["retreat"]],
      }).ok).toBe(false);
    }
  });

  it("uses true Engine replay for two consecutive sorties and preserves the zombie world", () => {
    const first = createSortieArchive("2l-auth-two-runs");
    const otherBefore = snapshot(Engine.byId(first.run, "zombie"));
    const a = playRecoveryRun(first, "rune", "target", "salvage");
    expect(a.receipt.battle.objectiveStones).toBe(
      a.stats.won && a.stats.completed ? SORTIE.mission.rewardStones : 0);
    expect(a.receipt.worlds).toHaveLength(2);
    expect(a.receipt.worlds[1].resourceDelta).toBe(0);
    expect(Engine.byId(first.run, "zombie")).toEqual(otherBefore);
    const b = playRecoveryRun(a.archive, "rune", "kite", "safe");
    expect(b.archive.run.day).toBe(3);
    expect(b.receipt.battle.objectiveStones).toBe(0);
    expect(Object.keys(b.archive.run.sortieLedger)).toHaveLength(2);
    const replay = Engine.settleSortie(b.archive.run, {
      sortieId: b.receipt.sortieId, actions: b.actions,
    });
    expect(replay.ok).toBe(true);
    expect(replay.replayed).toBe(true);
    expect(replay.run).toEqual(b.archive.run);
  });

  it("checks 40 paired seeds × 3 dangers × 2 skills × 4 routes across two authoritative sorties", () => {
    const report = runRecoveryMatrix(40);
    expect(assertRecoveryMatrix(report)).toBe(true);
    expect(report.totalPairs).toBe(960);
    expect(report.totalBattles).toBe(3840);
    expect(report.groups).toHaveLength(48);
    expect(report.pairs.every((pair) => pair.safe.length === 2 &&
      pair.salvage.length === 2)).toBe(true);
    console.info("2L-A 40-seed physical risk/reward groups:",
      JSON.stringify(report.groups));
  }, 300000);
});
