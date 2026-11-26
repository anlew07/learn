import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  chooseSortieSkill,
  createSortie,
  retreatSortie,
  stepSortie,
} from "../src/systems/sortie-sim.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";
import { replaySortieTrace } from "../src/systems/sortie-trace.js";
import { previewExtractionDecisionRewards } from "../scripts/encounter-extraction-decision-2ag-g.mjs";

function rewardBattle(outcome, status = "completed", collectedShards = 6) {
  return {
    outcome,
    tick: 1200,
    collectedShards,
    defeated: 6,
    hurt: 1,
    hero: { hp: 5 },
    maxHp: 8,
    combatLevel: 1,
    thunderHits: 0,
    shieldBlocks: 0,
    weaponDamage: 1,
    drops: [],
    mission: {
      id: "salvage",
      status,
      completedTick: status === "completed" ? 660 : null,
      guardCount: 2,
      guardDamage: 0,
    },
  };
}

function inputFor(battle) {
  const dx = battle.mission.x - battle.hero.x;
  const dy = battle.mission.y - battle.hero.y;
  const range = Math.hypot(dx, dy);
  if (range <= battle.mission.collectRadius * 0.5) return { x: 0, y: 0 };
  return { x: dx / range, y: dy / range };
}

describe("2AG-G recovery objective extraction decision", () => {
  it("banks the completed objective bonus on voluntary extraction in the candidate policy", () => {
    const battle = rewardBattle("retreated");
    const baseline = previewSortieRewards(battle);
    const candidate = previewExtractionDecisionRewards(battle);

    expect(baseline.objectiveStones).toBe(0);
    expect(baseline.stones).toBe(2);
    expect(candidate.candidateObjectiveStones).toBe(SORTIE.mission.rewardStones);
    expect(candidate.candidateStones).toBe(4);
    expect(candidate.candidateDeltaStones).toBe(2);
  });

  it("does not bank the objective bonus after death, even if the objective was completed", () => {
    const candidate = previewExtractionDecisionRewards(rewardBattle("lost"));
    expect(candidate.candidateObjectiveStones).toBe(0);
    expect(candidate.candidateDeltaStones).toBe(0);
  });

  it("keeps the existing victory reward unchanged", () => {
    const baseline = previewSortieRewards(rewardBattle("won"));
    const candidate = previewExtractionDecisionRewards(rewardBattle("won"));
    expect(baseline.objectiveStones).toBe(SORTIE.mission.rewardStones);
    expect(candidate.candidateObjectiveStones).toBe(baseline.objectiveStones);
    expect(candidate.candidateDeltaStones).toBe(0);
  });

  it("does not grant a completed-objective bonus for an incomplete or safe objective", () => {
    const incomplete = previewExtractionDecisionRewards(
      rewardBattle("retreated", "available"),
    );
    expect(incomplete.candidateObjectiveStones).toBe(0);

    const safe = rewardBattle("retreated");
    safe.mission.id = "safe";
    expect(previewExtractionDecisionRewards(safe).candidateObjectiveStones).toBe(0);
  });

  it("replays a real early extraction immediately after completing the recovery site", () => {
    const seed = "2AG-F-1";
    const danger = 45;
    const battle = createSortie(seed, danger, 0, "salvage");
    const actions = [];

    while (battle.outcome === "running" && battle.mission.status !== "completed") {
      if (battle.skillChoicePending) {
        chooseSortieSkill(battle, "rune");
        actions.push(["skill", "rune"]);
        continue;
      }
      const input = inputFor(battle);
      stepSortie(battle, input);
      actions.push(["tick", input.x, input.y]);
    }

    expect(battle.mission.status).toBe("completed");
    expect(battle.outcome).toBe("running");
    expect(retreatSortie(battle).ok).toBe(true);
    actions.push(["retreat"]);

    const replay = replaySortieTrace(seed, danger, actions, 0, "salvage", "auto", 1);
    expect(replay.ok).toBe(true);
    expect(replay.battle.outcome).toBe("retreated");
    expect(replay.battle.mission.status).toBe("completed");
    expect(previewSortieRewards(replay.battle).objectiveStones).toBe(0);
    expect(previewExtractionDecisionRewards(replay.battle).candidateObjectiveStones).toBe(
      SORTIE.mission.rewardStones,
    );
  });
});
