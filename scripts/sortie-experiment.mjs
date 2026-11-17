import Engine from "../src/engine.js";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  buildSortieForge,
  createSortieArchive,
  prepareSortieArchive,
  settleSortieArchive,
} from "../src/systems/sortie-session.js";
import {
  chooseSortieSkill,
  createSortie,
  DURATION_TICKS,
  stepSortie,
} from "../src/systems/sortie-sim.js";

export const EXPERIMENT_DANGERS = Object.freeze([0, 40, 75]);
export const EXPERIMENT_SKILLS = Object.freeze(["thunder", "rune"]);
export const EXPERIMENT_MOVEMENTS = Object.freeze(["stationary", "kite", "pickup"]);
export const EXPERIMENT_BUILDS = Object.freeze(["no-build", "forge"]);
const DEFAULT_SEEDS = 40;
const WORLD_IDS = Object.freeze({ lingzai: "lingzai", other: "zombie" });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normalize = (x, y) => {
  const length = Math.hypot(x, y);
  return length > 0.001 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
};

function nearest(items, origin) {
  let result = null;
  let resultDistance = Infinity;
  for (const item of items) {
    const nextDistance = distance(item, origin);
    if (nextDistance < resultDistance) {
      result = item;
      resultDistance = nextDistance;
    }
  }
  return result ? { item: result, distance: resultDistance } : null;
}

/**
 * Three deterministic, deliberately simple player scripts:
 * - stationary: never moves (anti-pattern / AFK baseline)
 * - kite: circles the field and avoids nearby enemies, never seeks loot
 * - pickup: seeks the nearest real drop, but yields to close threats
 */
export function experimentInput(battle, movement) {
  if (movement === "stationary") return { x: 0, y: 0 };
  if (!EXPERIMENT_MOVEMENTS.includes(movement)) {
    throw new Error("Unknown experiment movement: " + movement);
  }

  const hero = battle.hero;
  const threat = nearest(battle.enemies, hero);
  const drop = movement === "pickup" ? nearest(battle.drops, hero) : null;
  let vx;
  let vy;

  if (drop) {
    vx = drop.item.x - hero.x;
    vy = drop.item.y - hero.y;
  } else {
    // A repeatable 24-second orbit is the non-pickup movement control.
    const angle = (battle.tick / (SORTIE.ticksPerSecond * 24)) * Math.PI * 2;
    const targetX = SORTIE.width / 2 + 100 * Math.cos(angle);
    const targetY = SORTIE.height / 2 + 145 * Math.sin(angle);
    vx = targetX - hero.x;
    vy = targetY - hero.y;
  }

  if (threat && threat.distance < 64) {
    const weight = clamp((64 - threat.distance) / 64, 0, 1) * 1.65;
    vx += (hero.x - threat.item.x) * weight;
    vy += (hero.y - threat.item.y) * weight;
  }
  return normalize(vx, vy);
}

function worldChanges(receipt) {
  const ling = receipt.worlds.find((world) => world.id === WORLD_IDS.lingzai);
  const other = receipt.worlds.find((world) => world.id === WORLD_IDS.other);
  return {
    lingDDelta: ling?.dDelta ?? 0,
    otherDDelta: other?.dDelta ?? 0,
    otherActionId: other?.actionId ?? null,
  };
}

function battleStats(battle, receipt) {
  return {
    outcome: battle.outcome,
    won: battle.outcome === "won",
    survivalSeconds: battle.tick / SORTIE.ticksPerSecond,
    danger: battle.danger,
    weaponDamage: battle.weaponDamage,
    hp: battle.hero.hp,
    damageTaken: battle.hurt,
    defeated: battle.defeated,
    collectedShards: battle.collectedShards,
    uncollectedShards: battle.drops.length,
    fired: battle.fired,
    thunderHits: battle.thunderHits,
    shieldBlocks: battle.shieldBlocks,
    stones: receipt.battle.stones,
    baseStones: receipt.battle.baseStones,
    shardStones: receipt.battle.shardStones,
    progress: receipt.battle.progress,
    experience: receipt.battle.experience,
    ...worldChanges(receipt),
  };
}

/** Simulate one full, authoritative sortie. No DOM, wall clock or Math.random. */
export function simulateExperimentSortie(archive, skill, movement) {
  const prepared = prepareSortieArchive(archive);
  if (!prepared.ok) return { available: false, reason: prepared.error };
  const battle = createSortie(prepared.seed, prepared.danger, prepared.forgeLevel);
  const actions = [];
  let ticks = 0;

  while (battle.outcome === "running" && ticks <= DURATION_TICKS) {
    if (battle.skillChoicePending) {
      const choice = chooseSortieSkill(battle, skill);
      if (!choice.ok) throw new Error(choice.error);
      actions.push(["skill", skill]);
    }
    if (battle.outcome !== "running") break;
    const input = experimentInput(battle, movement);
    stepSortie(battle, input);
    actions.push(["tick", input.x, input.y]);
    ticks++;
  }

  if (battle.outcome === "running" || battle.skillChoicePending) {
    throw new Error("Experiment battle exceeded its fixed tick budget");
  }
  const settled = settleSortieArchive(prepared.archive, actions);
  if (!settled.ok) throw new Error("Authoritative experiment settlement failed: " + settled.error);
  return {
    available: true,
    archive: settled.archive,
    receipt: settled.receipt,
    battle: battleStats(battle, settled.receipt),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeInitialArchive(seed, danger) {
  const archive = createSortieArchive(seed);
  const ling = Engine.byId(archive.run, WORLD_IDS.lingzai);
  if (!ling) throw new Error("The experimental archive has no Lingzai world");
  ling.d = danger;
  return archive;
}

function oneCampaign(seedIndex, danger, skill, movement) {
  const seed = "sortie-2e-fixed-" + String(seedIndex).padStart(3, "0") + "-danger-" + danger;
  const first = simulateExperimentSortie(makeInitialArchive(seed, danger), skill, movement);
  if (!first.available) throw new Error("The first sortie unexpectedly became unavailable");

  const branches = [];
  for (const buildMode of EXPERIMENT_BUILDS) {
    let archive = clone(first.archive);
    let built = false;
    let buildCost = 0;
    let buildReason = "对照组：保留灵石";
    if (buildMode === "forge") {
      const candidate = buildSortieForge(
        archive,
        "2e:forge:" + seed + ":" + skill + ":" + movement,
      );
      if (candidate.ok && !candidate.replayed) {
        archive = candidate.archive;
        built = true;
        buildCost = candidate.receipt.cost;
        buildReason = "实际修复";
      } else {
        buildReason = candidate.error || "灵石不足或世界已结束";
      }
    }

    const second = simulateExperimentSortie(archive, skill, movement);
    const finalArchive = second.available ? second.archive : archive;
    branches.push({
      seedIndex,
      danger,
      skill,
      movement,
      buildMode,
      built,
      buildCost,
      buildReason,
      first: first.battle,
      second: second.available ? second.battle : null,
      secondUnavailableReason: second.available ? null : second.reason,
      endDay: finalArchive.run.day,
      endResource: Engine.byId(finalArchive.run, WORLD_IDS.lingzai)?.resource ?? 0,
      finalForgeLevel: finalArchive.run.sortieCamp?.forgeLevel ?? 0,
    });
  }
  return branches;
}

function mean(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function sampleStdDev(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1),
  );
}

function wilson(wins, count) {
  if (!count) return [0, 0];
  const z = 1.96;
  const p = wins / count;
  const denominator = 1 + (z * z) / count;
  const center = (p + (z * z) / (2 * count)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / count + (z * z) / (4 * count * count))) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function meanInterval(values) {
  if (!values.length) return [0, 0];
  const average = mean(values);
  const margin = (1.96 * sampleStdDev(values)) / Math.sqrt(values.length);
  return [average - margin, average + margin];
}

function aggregate(records) {
  const secondRuns = records.map((record) => record.second).filter(Boolean);
  const firstWins = records.filter((record) => record.first.won).length;
  const secondWins = secondRuns.filter((battle) => battle.won).length;
  const bothWins = records.filter((record) => record.first.won && record.second?.won).length;
  const winInterval = wilson(secondWins, secondRuns.length);
  return {
    n: records.length,
    firstWins,
    firstWinRate: firstWins / records.length,
    built: records.filter((record) => record.built).length,
    secondRuns: secondRuns.length,
    secondWins,
    secondWinRate: secondRuns.length ? secondWins / secondRuns.length : 0,
    secondWinLow: winInterval[0],
    secondWinHigh: winInterval[1],
    bothWins,
    bothWinRate: bothWins / records.length,
    survival: mean(secondRuns.map((battle) => battle.survivalSeconds)),
    kills: mean(secondRuns.map((battle) => battle.defeated)),
    hp: mean(secondRuns.map((battle) => battle.hp)),
    damage: mean(secondRuns.map((battle) => battle.damageTaken)),
    shards: mean(secondRuns.map((battle) => battle.collectedShards)),
    stones: mean(secondRuns.map((battle) => battle.stones)),
    thunderHits: mean(secondRuns.map((battle) => battle.thunderHits)),
    shieldBlocks: mean(secondRuns.map((battle) => battle.shieldBlocks)),
    lingD: mean(secondRuns.map((battle) => battle.lingDDelta)),
    otherD: mean(secondRuns.map((battle) => battle.otherDDelta)),
    otherActionRate: secondRuns.length
      ? secondRuns.filter((battle) => battle.otherActionId).length / secondRuns.length
      : 0,
    endResource: mean(records.map((record) => record.endResource)),
  };
}

const keyOf = (record) =>
  [record.danger, record.buildMode, record.skill, record.movement].join("|");

function pairedContrasts(records) {
  const grouped = new Map();
  for (const record of records) {
    const key = [record.danger, record.skill, record.movement, record.seedIndex].join("|");
    if (!grouped.has(key)) grouped.set(key, {});
    grouped.get(key)[record.buildMode] = record;
  }
  const pairs = new Map();
  for (const pair of grouped.values()) {
    if (!pair["no-build"] || !pair.forge) continue;
    const { danger, skill, movement } = pair.forge;
    const key = [danger, skill, movement].join("|");
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push({ control: pair["no-build"], treatment: pair.forge });
  }
  return [...pairs.entries()].map(([key, values]) => {
    const second = values.filter((pair) => pair.control.second && pair.treatment.second);
    const winDelta = second.map(
      (pair) => Number(pair.treatment.second.won) - Number(pair.control.second.won),
    );
    const killDelta = second.map(
      (pair) => pair.treatment.second.defeated - pair.control.second.defeated,
    );
    const hpDelta = second.map((pair) => pair.treatment.second.hp - pair.control.second.hp);
    const pickupDelta = second.map(
      (pair) => pair.treatment.second.collectedShards - pair.control.second.collectedShards,
    );
    const resourceDelta = values.map(
      (pair) => pair.treatment.endResource - pair.control.endResource,
    );
    return {
      key,
      n: values.length,
      comparable: second.length,
      winDelta: mean(winDelta),
      winCI: meanInterval(winDelta),
      killDelta: mean(killDelta),
      killCI: meanInterval(killDelta),
      hpDelta: mean(hpDelta),
      pickupDelta: mean(pickupDelta),
      resourceDelta: mean(resourceDelta),
      builtRate: values.filter((pair) => pair.treatment.built).length / values.length,
    };
  });
}

function percent(value) {
  return (value * 100).toFixed(1) + "%";
}
function fixed(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function printReport(result) {
  console.log("\n## 2E 固定种子实验：第二场表现");
  console.log(
      "击退 | 拾取碎片 | 次场灵石 | 余命 | 受击 | 灵灾DΔ | 废土行动率 | 废土DΔ | 末尾灵石 |",
  );
  console.log("|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of result.groups) {
    console.log(
      "| " +
        row.danger +
        " | " +
        row.buildMode +
        " | " +
        row.skill +
        " | " +
        row.movement +
        " | " +
        percent(row.firstWinRate) +
        " | " +
        percent(row.built / row.n) +
        " | " +
        percent(row.secondWinRate) +
        " [" +
        percent(row.secondWinLow) +
        "–" +
        percent(row.secondWinHigh) +
        "] | " +
        fixed(row.kills, 1) +
        " | " +
        fixed(row.shards, 1) +
        " | " +
        fixed(row.stones, 2) +
        " | " +
        fixed(row.hp, 2) +
        " | " +
        fixed(row.damage, 2) +
        " | " +
        fixed(row.lingD, 2) +
        " | " +
        percent(row.otherActionRate) +
        " | " +
        fixed(row.otherD, 2) +
        " | " +
        fixed(row.endResource, 2) +
        " |",
    );
  }

  console.log("\n## 2E 配对对照：修复剑台相对不建设");
  console.log(
    "| D | 战技 | 行为脚本 | 可比较种子 | 次场胜率差 | 击退差 | 剩余生命差 | 碎片拾取差 | 终局灵石差 | 实际建造率 |",
  );
  console.log("|---:|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of result.contrasts) {
    console.log(
      "| " +
        row.key.replaceAll("|", " | ") +
        " | " +
        row.comparable +
        "/" +
        row.n +
        " | " +
        percent(row.winDelta) +
        " [" +
        percent(row.winCI[0]) +
        "–" +
        percent(row.winCI[1]) +
        "] | " +
        fixed(row.killDelta, 2) +
        " | " +
        fixed(row.hpDelta, 2) +
        " | " +
        fixed(row.pickupDelta, 2) +
        " | " +
        fixed(row.resourceDelta, 2) +
        " | " +
        percent(row.builtRate) +
        " |",
    );
  }
  console.log(
    "\n样本：" +
      result.seedCount +
      " 个固定种子 × " +
      EXPERIMENT_DANGERS.length +
      " 个危险档 × " +
      EXPERIMENT_SKILLS.length +
      " 个战技 × " +
      EXPERIMENT_MOVEMENTS.length +
      " 个移动策略 × " +
      EXPERIMENT_BUILDS.length +
      " 个建设分组；实际模拟 " +
      result.sorties +
      " 场出击。",
  );
  console.log(
      "不是玩家胜率，也不代表真实手机体验。",
  );
}

export function runSortieExperiment(seedCount = DEFAULT_SEEDS) {
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 500) {
    throw new Error("Experiment seed count must be an integer from 1 to 500");
  }
  const records = [];
  let sorties = 0;
  for (const danger of EXPERIMENT_DANGERS) {
    for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
      for (const skill of EXPERIMENT_SKILLS) {
        for (const movement of EXPERIMENT_MOVEMENTS) {
          const branches = oneCampaign(seedIndex, danger, skill, movement);
          records.push(...branches);
          sorties += 3; // one shared first sortie and two paired second sorties
        }
      }
    }
  }

  const groupMap = new Map();
  for (const record of records) {
    const key = keyOf(record);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(record);
  }
  const groups = [...groupMap.entries()]
    .map(([key, values]) => {
      const [danger, buildMode, skill, movement] = key.split("|");
      return {
        danger: Number(danger),
        buildMode,
        skill,
        movement,
        ...aggregate(values),
      };
    })
    .sort(
      (a, b) =>
        a.danger - b.danger ||
        EXPERIMENT_BUILDS.indexOf(a.buildMode) - EXPERIMENT_BUILDS.indexOf(b.buildMode) ||
        EXPERIMENT_SKILLS.indexOf(a.skill) - EXPERIMENT_SKILLS.indexOf(b.skill) ||
        EXPERIMENT_MOVEMENTS.indexOf(a.movement) - EXPERIMENT_MOVEMENTS.indexOf(b.movement),
    );

  const result = {
    seedCount,
    sorties,
    records,
    groups,
    contrasts: pairedContrasts(records),
  };
  return result;
}

export function assertExperimentResult(result) {
  const expectedGroups =
    EXPERIMENT_DANGERS.length *
    EXPERIMENT_BUILDS.length *
    EXPERIMENT_SKILLS.length *
    EXPERIMENT_MOVEMENTS.length;
  if (
    result.groups.length !== expectedGroups ||
    result.records.length !== expectedGroups * result.seedCount
  ) {
    throw new Error("Experiment matrix is incomplete");
  }
  const byPair = new Map();
  for (const record of result.records) {
    const key = [record.danger, record.skill, record.movement, record.seedIndex].join("|");
    if (!byPair.has(key)) byPair.set(key, {});
    byPair.get(key)[record.buildMode] = record;
    if (record.endResource < 0) throw new Error("Experiment produced a negative resource balance");
    if (
      record.built &&
      (record.buildCost !== SORTIE.forge.cost || record.finalForgeLevel !== SORTIE.forge.maxLevel)
    ) {
      throw new Error("Forge branch did not apply the exact configured one-time cost");
    }
    if (
      record.second &&
      record.second.weaponDamage !==
        SORTIE.weapon.damage + (record.built ? SORTIE.forge.damageBonus : 0)
    ) {
      throw new Error("Second sortie damage does not match its saved forge level");
    }
    if (record.second && record.endDay !== 3) {
      throw new Error("A completed two-sortie experiment must advance exactly two world days");
    }
  }
  for (const pair of byPair.values()) {
    if (!pair["no-build"] || !pair.forge) throw new Error("Missing paired construction branch");
    if (JSON.stringify(pair["no-build"].first) !== JSON.stringify(pair.forge.first)) {
      throw new Error("Construction assignment changed the first sortie baseline");
    }
    if (pair["no-build"].built) throw new Error("Control branch unexpectedly built the forge");
  }
  return true;
}

function parseSeedCount(args) {
  const arg = args.find((value) => value.startsWith("--seeds="));
  return arg ? Number(arg.slice("--seeds=".length)) : DEFAULT_SEEDS;
}

if (process.argv[1] && process.argv[1].endsWith("sortie-experiment.mjs")) {
  const result = runSortieExperiment(parseSeedCount(process.argv.slice(2)));
  if (process.argv.includes("--assert")) assertExperimentResult(result);
  printReport(result);
}
