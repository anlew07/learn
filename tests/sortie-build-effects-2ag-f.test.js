import { describe, expect, it } from "vitest";
import {
  createSortie,
  stepSortie,
  chooseSortieSkill,
  castSortieSkill,
} from "../src/systems/sortie-sim.js";
import { replaySortieTrace } from "../src/systems/sortie-trace.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";

function prepareChoice(battle, skillId) {
  battle.skillChoicePending = true;
  const result = chooseSortieSkill(battle, skillId);
  if (!result.ok) throw new Error(result.error);
}

function nearbyTargets(battle) {
  battle.nextSpawn = battle.schedule.length;
  battle.enemies = Array.from({ length: 4 }, (_, index) => ({
    id: 100 + index,
    kind: "wolf",
    x: 250 + index * 10,
    y: 224,
    hp: 9,
  }));
}

describe("2AG-F world build effects in real-time combat", () => {
  it("keeps old callers on an empty build and validates bounded ranks", () => {
    expect(createSortie("legacy-default").combatBuild).toEqual({
      thunderLevel: 0,
      runeLevel: 0,
    });
    expect(createSortie("build-ranks", 0, 0, "safe", {
      combatBuild: { thunderLevel: 2, runeLevel: 1 },
    }).combatBuild).toEqual({ thunderLevel: 2, runeLevel: 1 });
    expect(() => createSortie("bad-build", 0, 0, "safe", {
      combatBuild: { thunderLevel: 3, runeLevel: 0 },
    })).toThrow();
    expect(() => createSortie("bad-build", 0, 0, "safe", {
      combatBuild: { thunderLevel: 0, runeLevel: -1 },
    })).toThrow();
    expect(() => createSortie("bad-build", 0, 0, "safe", {
      combatBuild: { thunderLevel: 1, runeLevel: 0, freeDamage: 99 },
    })).toThrow();
  });

  it("adds one additional thunder target per attack-build rank, capped at three", () => {
    const hitsFor = (rank) => {
      const battle = createSortie("thunder-build", 0, 0, "safe", {
        combatBuild: { thunderLevel: rank, runeLevel: 0 },
      });
      prepareChoice(battle, "thunder");
      nearbyTargets(battle);
      battle.tick = battle.thunderNextTick - 1;
      stepSortie(battle);
      return battle.thunderHits;
    };

    expect(hitsFor(0)).toBe(1);
    expect(hitsFor(1)).toBe(2);
    expect(hitsFor(2)).toBe(3);
  });

  it("applies the same extra target count to manually released thunder", () => {
    const battle = createSortie("manual-thunder-build", 0, 0, "safe", {
      skillReleaseMode: "manual",
      combatBuild: { thunderLevel: 1, runeLevel: 0 },
    });
    prepareChoice(battle, "thunder");
    nearbyTargets(battle);

    const cast = castSortieSkill(battle);
    expect(cast).toMatchObject({ ok: true, skillId: "thunder", targets: 2 });
    expect(battle.thunderHits).toBe(2);
  });

  it("increases rune charge capacity without granting free initial shields", () => {
    const battle = createSortie("rune-build", 0, 0, "safe", {
      combatBuild: { thunderLevel: 0, runeLevel: 2 },
    });
    prepareChoice(battle, "rune");
    expect(battle.runeShield).toBe(1);

    nearbyTargets(battle);
    battle.enemies = [];
    battle.hero.invulnerable = 5000;
    battle.runeShield = 2;
    battle.tick = battle.runeNextTick - 1;
    stepSortie(battle);
    expect(battle.runeShield).toBe(3);

    battle.runeShield = 3;
    battle.tick = battle.runeNextTick - 1;
    stepSortie(battle);
    expect(battle.runeShield).toBe(3);
  });

  it("allows manual rune to store charges up to the build capacity", () => {
    const battle = createSortie("manual-rune-build", 0, 0, "safe", {
      skillReleaseMode: "manual",
      combatBuild: { thunderLevel: 0, runeLevel: 1 },
    });
    prepareChoice(battle, "rune");
    expect(castSortieSkill(battle)).toMatchObject({ ok: true, shield: 1 });
    battle.tick = battle.runeNextTick;
    expect(castSortieSkill(battle)).toMatchObject({ ok: true, shield: 2 });
    expect(castSortieSkill(battle)).toMatchObject({
      ok: false,
      error: "护盾储备已满",
    });
  });

  it("replays and records the exact combat build without changing reward rules", () => {
    const combatBuild = { thunderLevel: 1, runeLevel: 2 };
    const replay = replaySortieTrace(
      "combat-build-replay",
      0,
      [["retreat"]],
      0,
      "safe",
      "auto",
      1,
      combatBuild,
    );
    expect(replay.ok).toBe(true);
    expect(replay.battle.combatBuild).toEqual(combatBuild);
    expect(previewSortieRewards(replay.battle)).toMatchObject({
      combatBuild,
      stones: 0,
      experience: 0,
      progress: 0,
    });
    expect(replaySortieTrace(
      "combat-build-invalid",
      0,
      [["retreat"]],
      0,
      "safe",
      "auto",
      1,
      { thunderLevel: 3, runeLevel: 0 },
    ).ok).toBe(false);
  });
});
