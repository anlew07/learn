import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { BALANCE } from "../src/config/balance.js";
import { selectAutonomousAction } from "../src/systems/action-policy.js";
import { compareRescueNestPriority } from "../scripts/strategy-depth-compare.mjs";

function candidate(overrides = {}, threshold = 65) {
  const world = {
    id: "beast",
    strategy: "rescue",
    level: 3,
    p: 100,
    d: 80,
    resource: 8,
    suppression: 0,
    threat: { status: "active", progress: 0 },
    ...overrides,
  };
  return selectAutonomousAction(world, {
    reserve: 18,
    bossLevel: 5,
    threatActive: true,
    combatReady: true,
    beastRescueNestPriorityDoom: threshold,
    nextRandom: () => 0.5,
  });
}

describe("rescue-first beast threat opportunity cost", () => {
  it("takes an elite-clear route only with real readiness and urgency", () => {
    expect(candidate().actionId).toBe("fight");
    expect(candidate({ level: 2 }).actionId).not.toBe("fight");
    expect(candidate({ d: 64 }).actionId).not.toBe("fight");
    expect(candidate({ p: 64 }).actionId).not.toBe("fight");
    expect(candidate({ threat: { status: "awaiting_alpha", progress: 2 } }).actionId)
      .not.toBe("fight");
    expect(candidate({ strategy: "growth" }).actionId).not.toBe("fight");
    expect(candidate({ strategy: "clear" }).actionId).not.toBe("growth");
    expect(candidate({}, 101).actionId).not.toBe("fight");
  });

  it("spends two daily actions, never farms elite reward twice or skips finale gates", () => {
    const state = Engine.fresh("costly-beast-rescue-fight", 3, true);
    const beast = Engine.byId(state, "beast");
    state.day = 40;
    beast.level = 3;
    beast.xp = 42;
    beast.p = 100;
    beast.flags.p30 = true;
    beast.flags.p65 = true;
    beast.flags.p100 = true;
    beast.d = 76;
    beast.resource = 0;
    beast.strategy = "rescue";
    beast.threat = { id: "nest", status: "active", progress: 0, retryDay: 1 };

    expect(Engine.step(state).ok).toBe(true);
    expect(beast.metrics.actions.fight).toBe(1);
    expect(beast.threat.progress).toBe(1);
    expect(beast.resource).toBeGreaterThanOrEqual(1);

    expect(Engine.step(state).ok).toBe(true);
    expect(beast.metrics.actions.fight).toBe(2);
    expect(beast.threat.progress).toBe(2);
    expect(beast.resource).toBeGreaterThanOrEqual(2);
    expect(Engine.canFinal(state, beast, 0)).toBe(false);

    for (let i = 0; i < 5 && beast.status === "running"; i++) Engine.step(state);
    expect(beast.flags.bossDefeated).toBe(true);
    expect(beast.threat.status).toBe("cleared");
    expect(beast.resource).toBeGreaterThanOrEqual(5);
    expect(beast.metrics.actions.fight).toBe(2);
    expect(Engine.canFinal(state, beast, 0)).toBe(false);
    expect(Engine.step(state).ok).toBe(true);
    expect(beast.threat.status).toBe("cleared");
  });

  it("maintains deterministic same-seed A/B and never changes the first two runs", () => {
    const original = BALANCE.actions.beastRescueNestPriorityDoom;
    const first = compareRescueNestPriority(100);
    expect(BALANCE.actions.beastRescueNestPriorityDoom).toBe(original);
    const repeated = compareRescueNestPriority(10);
    const same = compareRescueNestPriority(10);
    expect(same).toEqual(repeated);
    expect(first.rows.every((row) => row.incomplete === 0)).toBe(true);
    expect(
      first.differences
        .filter((entry) => entry.runNumber < 3)
        .every((entry) => Object.values(entry.worldDeltas).every((delta) => delta === 0)),
    ).toBe(true);
    console.info(
      "SECOND_PHASE_SEEDED_BASELINE",
      JSON.stringify(
        first.rows
          .filter((row) => row.mode === "baseline")
          .map((row) => ({
            run: row.runNumber,
            strategy: row.strategy,
            all: row.allSavedRate,
            worlds: row.worlds,
          })),
      ),
    );
    console.info("SECOND_PHASE_SEEDED_DELTAS", JSON.stringify(first.differences));
    console.info(
      "SECOND_PHASE_RESCUE_DETAIL",
      JSON.stringify(first.rows.filter((row) => row.runNumber === 3 && row.strategy === "rescue")),
    );
  });
});
