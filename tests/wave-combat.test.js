import { describe, expect, it } from "vitest";
import { POWERS } from "../src/config/game-data.js";
import { computeWaveBonuses, WAVE_STAGES } from "../src/systems/wave-combat.js";

const build = (worldId, evolved = false) => ({
  attack: [ { id: { lingzai: "thunder", zombie: "blades", beast: "claws" }[worldId], lv: 2 }],
  support: [ { id: { lingzai: "rune", zombie: "armor", beast: "instinct" }[worldId], lv: 1 }],
  evolved, evolutionName: evolved ? "组合进化" : "",
});

describe("bounded wave combat and meaningful evolution", () => {
  for (const worldId of ["lingzai", "zombie", "beast"]) {
    it(`${worldId}: evolution improves one bounded effect`, () => {
      const before = computeWaveBonuses(worldId, build(worldId), POWERS);
      const after = computeWaveBonuses(worldId, build(worldId, true), POWERS);
      expect(after.xp >= before.xp).toBe(true);
      expect(after.resource >= before.resource).toBe(true);
      expect(after.doomReduction >= before.doomReduction).toBe(true);
      expect([after.xp > before.xp, after.resource > before.resource, after.doomReduction > before.doomReduction].some(Boolean)).toBe(true);
      expect(after.xp).toBeLessThanOrEqual(0.75);
      expect(after.resource).toBeLessThanOrEqual(0.5);
      expect(after.doomReduction).toBeLessThanOrEqual(0.25);
      expect(after.stages).toHaveLength(3);
      expect(after.evolution).toBe("组合进化");
    });
  }

  it("does not invent skills when no build is equipped", () => {
    const bonus = computeWaveBonuses("zombie", { attack: [], support: [], evolved: false }, POWERS);
    expect(bonus.xp).toBe(0);
    expect(bonus.resource).toBe(0);
    expect(bonus.doomReduction).toBe(0);
    expect(bonus.skills).toHaveLength(0);
    expect(WAVE_STAGES.zombie).toHaveLength(3);
  });
});

describe("escalating survivor wave encounter", () => {
  it("simulates repeatable enemy counts and real clear numbers without using RNG", async () => {
    const { simulateSurvivorWaves } = await import("../src/systems/survivor-waves.js");
    const empty = { attack: [], support: [], evolved: false };
    const first = simulateSurvivorWaves("lingzai", empty, POWERS, { day: 8, level: 1, momentum: 1 });
    expect(first.waves).toHaveLength(3);
    expect(first.encountered).toBe(first.waves.reduce((n, wave) => n + wave.encountered, 0));
    expect(first.defeated).toBe(first.waves.reduce((n, wave) => n + wave.defeated, 0));
    expect(first.defeated).toBeLessThan(first.encountered);
    expect(simulateSurvivorWaves("lingzai", empty, POWERS, { day: 8, level: 1, momentum: 1 })).toEqual(first);
    for (const wave of first.waves) {
      expect(wave.defeated).toBeLessThanOrEqual(wave.encountered);
    }
  });

  it("rewards investment with real three-wave clears and evolution burst", async () => {
    const { simulateSurvivorWaves } = await import("../src/systems/survivor-waves.js");
    const equipped = build("lingzai", true);
    const result = simulateSurvivorWaves("lingzai", equipped, POWERS, { day: 8, level: 4, momentum: 3 });
    expect(result.fullClear).toBe(true);
    expect(result.grade).toBe("清屏");
    expect(result.combo).toBe(3);
    expect(result.burst).toBe(true);
    expect(result.defeated).toBe(result.encountered);
    const later = simulateSurvivorWaves("lingzai", equipped, POWERS, { day: 70, level: 4, momentum: 3 });
    expect(later.encountered).toBeGreaterThan(result.encountered);
    expect(later.defeated).toBeLessThanOrEqual(later.encountered);
  });

  it("integrates with a real auto-fight and persists the streak data", async () => {
    const Engine = (await import("../src/engine.js")).default;
    const state = Engine.fresh("spectacle-run", 1, true);
    const world = Engine.byId(state, "lingzai");
    world.level = 3;
    world.p = 45;
    world.strategy = "clear";
    state.day = 15;
    Engine.step(state);
    if (world.lastCombat) {
      expect(world.lastCombat.spectacle.waves).toHaveLength(3);
      expect(world.lastCombat.spectacle.defeated).toBeGreaterThan(0);
      expect(world.waveMomentum.count).toBe(1);
      const restored = JSON.parse(JSON.stringify(state));
      expect(Engine.byId(restored, "lingzai").lastCombat).toEqual(world.lastCombat);
    }
  });
});

describe("survivor full-clear frenzy payoff", () => {
  it("activates once on every third timely full clear and resets on interruptions", async () => {
    const { nextSurvivorFrenzy } = await import("../src/systems/survivor-waves.js");
    const a = nextSurvivorFrenzy(null, 2, true);
    const b = nextSurvivorFrenzy(a, 4, true);
    const c = nextSurvivorFrenzy(b, 6, true);
    expect([a.activated, b.activated, c.activated]).toEqual([false, false, true]);
    expect(c.count).toBe(0);
    expect(nextSurvivorFrenzy(c, 7, true).count).toBe(1);
    expect(nextSurvivorFrenzy(b, 8, true).count).toBe(1);
    expect(nextSurvivorFrenzy(b, 5, false).count).toBe(0);
    expect(nextSurvivorFrenzy(b, 4, true).activated).toBe(false);
  });

  it("never crosses existing XP, material or doom reward caps", async () => {
    const { applyFrenzyCaps } = await import("../src/systems/survivor-waves.js");
    const base = { xp: 0.5, resource: 0.2, doomReduction: 0.1 };
    const boosted = applyFrenzyCaps(base, true);
    expect(boosted.xp).toBeGreaterThan(base.xp);
    expect(boosted.resource).toBeGreaterThan(base.resource);
    expect(boosted.doomReduction).toBeGreaterThan(base.doomReduction);
    const capped = applyFrenzyCaps({ xp: 0.75, resource: 0.5, doomReduction: 0.25 }, true);
    expect(capped).toEqual({ xp: 0.75, resource: 0.5, doomReduction: 0.25 });
    expect(applyFrenzyCaps(base, false)).toEqual(base);
  });
});

describe("frenzy feeds back into the survivor build loop", () => {
  it("first frenzy offers one legal skill choice, without instantly awarding a skill", async () => {
    const Engine = (await import("../src/engine.js")).default;
    const state = Engine.fresh("frenzy-awakening", 1, true);
    const world = Engine.byId(state, "zombie");
    state.day = 8;
    world.level = 4;
    world.p = 100;
    world.resource = 20;
    world.strategy = "clear";
    world.threat = { id: "nest", status: "active", progress: 0, retryDay: 1 };
    world.waveMomentum = { lastDay: 7, count: 2 };
    world.waveClearStreak = { lastDay: 7, count: 2 };
    world.build.attack = [{ id: "blades", lv: 2 }];
    world.build.support = [{ id: "armor", lv: 1 }];
    world.build.count = 2;
    world.build.evolved = true;
    world.build.evolutionName = "钢雨防线";

    expect(Engine.step(state).ok).toBe(true);
    expect(world.lastDecision.actionId).toBe("fight");
    expect(world.lastCombat.spectacle.frenzy).toBe(true);
    expect(world.build.pending?.options.length).toBeGreaterThan(0);
    expect(world.build.count).toBe(2);
    expect(world.build.triggers["首次狂热清屏"]).toBe(true);
    expect(state.logs.some((entry) => entry.text.includes("狂热爆发"))).toBe(true);
    const restored = JSON.parse(JSON.stringify(state));
    expect(Engine.byId(restored, "zombie").build.pending).toEqual(world.build.pending);
  });

  it("defers frenzy awakening when a different skill choice already occupies the slot", async () => {
    const Engine = (await import("../src/engine.js")).default;
    const state = Engine.fresh("frenzy-defer", 1, true);
    const world = Engine.byId(state, "zombie");
    state.day = 8;
    world.level = 4;
    world.p = 100;
    world.resource = 20;
    world.strategy = "clear";
    world.threat = { id: "nest", status: "active", progress: 0, retryDay: 1 };
    world.waveMomentum = { lastDay: 7, count: 2 };
    world.waveClearStreak = { lastDay: 7, count: 2 };
    world.build.attack = [{ id: "blades", lv: 2 }];
    world.build.support = [{ id: "armor", lv: 1 }];
    world.build.count = 1;
    world.build.evolved = true;
    world.build.evolutionName = "钢雨防线";
    world.build.pending = { id: "existing", options: ["arc"], due: 11 };
    expect(Engine.step(state).ok).toBe(true);
    expect(world.lastDecision.actionId).toBe("fight");
    expect(world.lastCombat.spectacle.frenzy).toBe(true);
    expect(world.flags.frenzyBuildWaiting).toBe(true);
    expect(world.build.pending.id).toBe("existing");
    expect(world.build.triggers["首次狂热清屏"]).toBeUndefined();
  });
});

describe("equipped survivor attack patterns", () => {
  it("has distinct deterministic attack behaviors for six weapons", async () => {
    const { featuredWaveAttack, ATTACK_PATTERNS } = await import("../src/systems/attack-patterns.js");
    const cases = [
      ["lingzai", "thunder", "chain"],
      ["lingzai", "sword", "pierce"],
      ["zombie", "blades", "fan"],
      ["zombie", "arc", "chain"],
      ["beast", "claws", "flurry"],
      ["beast", "roar", "shockwave"],
    ];
    for (const [worldId, id, style] of cases) {
      const equipped = { attack: [{ id, lv: 2 }], support: [], evolved: false };
      const first = featuredWaveAttack(worldId, equipped, POWERS, 1);
      const third = featuredWaveAttack(worldId, equipped, POWERS, 3);
      expect(first.style).toBe(style);
      expect(first.bonus).toBeGreaterThan(0);
      expect(third.bonus).toBeLessThanOrEqual(4);
      expect(ATTACK_PATTERNS[id].label).toBe(first.label);
      expect(featuredWaveAttack(worldId, equipped, POWERS, 1)).toEqual(first);
    }
    expect(featuredWaveAttack("zombie", { attack: [], support: [] }, POWERS, 1).bonus).toBe(0);
  });

  it("alternates equipped attack weapons across the three recorded waves", async () => {
    const { simulateSurvivorWaves } = await import("../src/systems/survivor-waves.js");
    const equipped = {
      attack: [{ id: "thunder", lv: 2 }, { id: "sword", lv: 2 }],
      support: [],
      evolved: false,
    };
    const result = simulateSurvivorWaves("lingzai", equipped, POWERS, {
      day: 45, level: 2, momentum: 1,
    });
    expect(result.waves.map((wave) => wave.attack.id)).toEqual(["thunder", "sword", "thunder"]);
    const noWeapons = simulateSurvivorWaves(
      "lingzai", { attack: [], support: [], evolved: false }, POWERS,
      { day: 45, level: 2, momentum: 1 },
    );
    expect(result.defeated).toBeGreaterThan(noWeapons.defeated);
    expect(result.waves.every((wave) => wave.defeated <= wave.encountered)).toBe(true);
    expect(JSON.parse(JSON.stringify(result)).waves[1].attack.style).toBe("pierce");
  });

  it("ignores invalid or support-only skills rather than fabricating attack damage", async () => {
    const { featuredWaveAttack } = await import("../src/systems/attack-patterns.js");
    const unsupported = { attack: [{ id: "armor", lv: 10 }, { id: "missing", lv: 2 }] };
    expect(featuredWaveAttack("zombie", unsupported, POWERS, 2)).toMatchObject({
      style: "basic", bonus: 0,
    });
  });
});

describe("evolved ultimate wave attacks", () => {
  it("unlocks a distinct three-wave ultimate only when its actual attack/support pair is owned", async () => {
    const { evolvedWaveUltimate } = await import("../src/systems/attack-patterns.js");
    const { simulateSurvivorWaves } = await import("../src/systems/survivor-waves.js");
    const combos = [
      { id: "lingzai", attack: "thunder", support: "rune", style: "storm", bonuses: [4, 6, 8] },
      { id: "zombie", attack: "blades", support: "armor", style: "barrage", bonuses: [7, 6, 5] },
      { id: "beast", attack: "claws", support: "instinct", style: "hunt", bonuses: [3, 6, 9] },
    ];
    for (const combo of combos) {
      const build = {
        attack: [{ id: combo.attack, lv: 2 }],
        support: [{ id: combo.support, lv: 1 }],
        evolved: true,
      };
      const base = simulateSurvivorWaves(combo.id, { ...build, evolved: false }, POWERS, {
        day: 70, level: 2, momentum: 1,
      });
      const evolved = simulateSurvivorWaves(combo.id, build, POWERS, {
        day: 70, level: 2, momentum: 1,
      });
      expect(evolved.waves.map((wave) => wave.attack.style)).toEqual([
        combo.style, combo.style, combo.style,
      ]);
      expect(evolved.waves.map((wave) => wave.attack.bonus)).toEqual(combo.bonuses);
      expect(evolved.defeated).toBeGreaterThan(base.defeated);
      expect(evolved.waves.every((wave) => wave.defeated <= wave.encountered)).toBe(true);
      expect(evolvedWaveUltimate(combo.id, { ...build, support: [] }, 2)).toBeNull();
      expect(evolvedWaveUltimate(combo.id, { ...build, evolved: false }, 2)).toBeNull();
      expect(evolvedWaveUltimate(combo.id, build, 4)).toBeNull();
      expect(JSON.parse(JSON.stringify(evolved)).waves[2].attack.ultimate).toBe(true);
    }
  });

  it("does not grant an ultimate to a forged evolved flag or a build without attack powers", async () => {
    const { simulateSurvivorWaves } = await import("../src/systems/survivor-waves.js");
    const fake = { attack: [], support: [{ id: "rune", lv: 1 }], evolved: true };
    const result = simulateSurvivorWaves("lingzai", fake, POWERS, {
      day: 15, level: 1, momentum: 0,
    });
    expect(result.waves.every((wave) => wave.attack.style === "basic")).toBe(true);
    expect(result.waves.every((wave) => wave.attack.bonus === 0)).toBe(true);
  });
});

describe("late-game elite enemy waves", () => {
  it("introduces predictable threats at day thresholds without adding random state", async () => {
    const { waveEnemyTrait, simulateSurvivorWaves } = await import("../src/systems/survivor-waves.js");
    const empty = { attack: [], support: [], evolved: false };
    expect(waveEnemyTrait(13, 1)).toBeNull();
    expect(waveEnemyTrait(14, 1)?.id).toBe("horde");
    expect(waveEnemyTrait(21, 2)?.id).toBe("armored");
    expect(waveEnemyTrait(28, 3)?.id).toBe("swift");
    const first = simulateSurvivorWaves("beast", empty, POWERS, {
      day: 28, level: 2, momentum: 0,
    });
    expect(first.waves.map((wave) => wave.trait.id)).toEqual(["horde", "armored", "swift"]);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first.waves.every((wave) => wave.defeated <= wave.encountered)).toBe(true);
  });

  it("matching weapon styles counter elite resistance in actual kill counts", async () => {
    const { simulateSurvivorWaves } = await import("../src/systems/survivor-waves.js");
    const withWeapon = (id) => ({
      attack: [{ id, lv: 1 }], support: [], evolved: false,
    });
    const chain = simulateSurvivorWaves("lingzai", withWeapon("thunder"), POWERS, {
      day: 35, level: 2, momentum: 0,
    });
    const pierce = simulateSurvivorWaves("lingzai", withWeapon("sword"), POWERS, {
      day: 35, level: 2, momentum: 0,
    });
    expect(chain.waves[0].trait.countered).toBe(true);
    expect(chain.waves[1].trait.countered).toBe(false);
    expect(pierce.waves[1].trait.countered).toBe(true);
    expect(pierce.waves[0].trait.countered).toBe(false);
    expect(pierce.waves[1].defeated).toBeGreaterThan(0);
    expect(chain.waves[0].defeated).toBeGreaterThan(0);
    expect(chain.waves.every((wave) => wave.defeated <= wave.encountered)).toBe(true);
  });
});

describe("skill choices explain existing elite counters", () => {
  it("derives the displayed counters from the same enemy rules used for kills", async () => {
    const { counteredEliteWaveLabels, ELITE_WAVES } = await import("../src/systems/survivor-waves.js");
    expect(counteredEliteWaveLabels("fan")).toEqual(["密集异常群"]);
    expect(counteredEliteWaveLabels("pierce")).toEqual(["装甲防线"]);
    expect(counteredEliteWaveLabels("chain")).toEqual(["密集异常群", "迅捷兽影"]);
    expect(counteredEliteWaveLabels("storm")).toEqual(["密集异常群", "装甲防线"]);
    expect(counteredEliteWaveLabels("basic")).toEqual([]);
    expect(Object.keys(ELITE_WAVES)).toHaveLength(3);
  });
});


describe("performance-scaled wave combat budget", () => {
  it("ties clear, loss and loot effects to actual kills and elite counters", () => {
    const equipped = {
      attack: [
        { id: "blades", lv: 1 },
        { id: "arc", lv: 1 },
      ],
      support: [{ id: "armor", lv: 1 }],
      evolved: false,
    };
    const poorClear = {
      encountered: 30,
      defeated: 6,
      waves: [
        { trait: { countered: false } },
        { trait: { countered: false } },
        { trait: { countered: false } },
      ],
    };
    const strongClear = {
      encountered: 30,
      defeated: 27,
      waves: [
        { trait: { countered: true } },
        { trait: { countered: false } },
        { trait: { countered: true } },
      ],
    };
    const weak = computeWaveBonuses("zombie", equipped, POWERS, poorClear);
    const strong = computeWaveBonuses("zombie", equipped, POWERS, strongClear);

    expect(strong.clearRate).toBe(0.9);
    expect(strong.counteredWaves).toBe(2);
    expect(strong.waveClearBonus).toBeGreaterThan(weak.waveClearBonus);
    expect(strong.waveLossMitigation).toBeGreaterThan(weak.waveLossMitigation);
    expect(strong.waveLootModifier).toBeGreaterThan(weak.waveLootModifier);
    expect(strong.xp).toBeLessThanOrEqual(0.75);
    expect(strong.resource).toBeLessThanOrEqual(0.5);
    expect(strong.doomReduction).toBeLessThanOrEqual(0.25);
  });

  it("does not award evolution effects from a forged flag without the real combo", () => {
    const forged = {
      attack: [],
      support: [{ id: "armor", lv: 1 }],
      evolved: true,
      evolutionName: "钢雨防线",
    };
    const ordinary = computeWaveBonuses("zombie", { ...forged, evolved: false }, POWERS);
    const invalid = computeWaveBonuses("zombie", forged, POWERS);

    expect(invalid.evolution).toBe("");
    expect(invalid.xp).toBe(ordinary.xp);
    expect(invalid.resource).toBe(ordinary.resource);
    expect(invalid.doomReduction).toBe(ordinary.doomReduction);
    expect(invalid.waveClearBonus).toBe(0);
    expect(invalid.waveLootModifier).toBe(0);
  });
});


describe("shared combat effect budget across all worlds", () => {
  const worlds = [
    { id: "lingzai", clear: "thunder", loot: "sword", defense: "rune" },
    { id: "zombie", clear: "blades", loot: "arc", defense: "armor" },
    { id: "beast", clear: "claws", loot: "roar", defense: "instinct" },
  ];

  for (const world of worlds) {
    it(`${world.id}: uses real clear performance for all three effect channels`, () => {
      const equipped = {
        attack: [
          { id: world.clear, lv: 1 },
          { id: world.loot, lv: 1 },
        ],
        support: [{ id: world.defense, lv: 1 }],
        evolved: false,
      };
      const spectacle = {
        encountered: 30,
        defeated: 27,
        waves: [
          { trait: { countered: true } },
          { trait: { countered: false } },
          { trait: { countered: false } },
        ],
      };
      const effect = computeWaveBonuses(world.id, equipped, POWERS, spectacle);

      expect(effect.clearRate).toBe(0.9);
      expect(effect.waveClearBonus).toBeGreaterThan(0);
      expect(effect.waveLossMitigation).toBeGreaterThan(0);
      expect(effect.waveLootModifier).toBeGreaterThan(0);
      expect(effect.xp).toBeLessThanOrEqual(0.5);
      expect(effect.resource).toBeLessThanOrEqual(0.25);
      expect(effect.doomReduction).toBeLessThanOrEqual(0.15);
    });
  }
});
