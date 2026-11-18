import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SORTIE } from "../src/config/sortie-data.js";
import { createSortie, stepSortie } from "../src/systems/sortie-sim.js";
// prettier-ignore
import { assertForgeRoiExperiment, runForgeRoiExperiment } from "./sortie-forge-roi-2h.mjs";
import { summarizeForgeHorizonPairs } from "./sortie-forge-horizon-2i.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// prettier-ignore
const OLD_FORGE = "forge: Object.freeze({ cost: 6, maxLevel: 1, damageBonus: 1 })";
// prettier-ignore
const NEW_FORGE = "forge: Object.freeze({ cost: 6, maxLevel: 1, damageBonus: 1, attackCooldownSeconds: 0.63 })";
// prettier-ignore
const OLD_FIRE = "battle.nextShotTick = battle.tick + Math.round(SORTIE.weapon.cooldownSeconds * SORTIE.ticksPerSecond);";
// prettier-ignore
const NEW_FIRE =
  "const cooldownSeconds = battle.forgeLevel > 0 ? " +
  "SORTIE.forge.attackCooldownSeconds : SORTIE.weapon.cooldownSeconds;\n" +
  "  battle.nextShotTick = battle.tick + Math.round(cooldownSeconds * SORTIE.ticksPerSecond);";

// prettier-ignore
function replaceExactlyOnce(source, oldText, newText) {
  const at = source.indexOf(oldText);
  if (at < 0 || source.indexOf(oldText, at + oldText.length) >= 0)
    throw new Error("2J-C source guard failed; inspect current forge/fire implementation");
  return source.slice(0, at) + newText + source.slice(at + oldText.length);
}

/** Only forge config and ordinary fire are patched, in a temporary project copy. */
export function makeTempoVariant(configSource, simSource) {
  return {
    config: replaceExactlyOnce(configSource, OLD_FORGE, NEW_FORGE),
    sim: replaceExactlyOnce(simSource, OLD_FIRE, NEW_FIRE),
  };
}

// prettier-ignore
const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
// prettier-ignore
const round = (value) => (value === null ? null : Math.round(value * 1000) / 1000);

// prettier-ignore
function firingTicks(forgeLevel) {
  const battle = createSortie("2j-c-cooldown-contract", 0, forgeLevel);
  battle.schedule = [];
  battle.enemies = [{ id: 100, kind: "wolf", x: 250, y: 224, hp: 999 }];
  const ticks = [];
  for (let tick = 1; tick <= 85; tick++) {
    const before = battle.fired;
    stepSortie(battle);
    if (battle.fired > before) ticks.push(battle.tick);
  }
  return ticks;
}

// prettier-ignore
function firingRow(pairs, sortie) {
  const matched = pairs.filter((pair) =>
    pair.branches.forge.built &&
    pair.branches.forge.stages[sortie - 1] &&
    pair.branches["no-build"].stages[sortie - 1]);
  const control = matched.map((pair) => pair.branches["no-build"].stages[sortie - 1].battle.fired);
  const forge = matched.map((pair) => pair.branches.forge.stages[sortie - 1].battle.fired);
  return {
    controlFired: round(mean(control)),
    forgeFired: round(mean(forge)),
    firedDelta: round(mean(matched.map((pair, i) => forge[i] - control[i]))),
  };
}

/** Reuse 2H-C real building + double-world authoritative settlement, through sortie six. */
// prettier-ignore
export function inspectTempoVariant(seedCount = 40) {
  const reference = runForgeRoiExperiment(seedCount, 6);
  assertForgeRoiExperiment(reference);
  const horizon = summarizeForgeHorizonPairs(reference.pairs, 6);
  return {
    metadata: reference.metadata,
    config: {
      normalCooldownSeconds: SORTIE.weapon.cooldownSeconds,
      builtCooldownSeconds: SORTIE.forge.attackCooldownSeconds ?? SORTIE.weapon.cooldownSeconds,
      cost: SORTIE.forge.cost,
      pickupRadius: SORTIE.rewards.pickupRadius,
    },
    firingTicks: { noBuild: firingTicks(0), built: firingTicks(1) },
    overall: horizon.overall.map((row) => ({
      ...row, ...firingRow(reference.pairs, row.sortie),
    })),
    byDangerSkill: horizon.byDangerSkill.filter((row) => row.sortie === 6),
    byRoute: horizon.byRoute,
    payback: horizon.payback,
  };
}

// prettier-ignore
function compareReports(baseline, candidate) {
  const overall = baseline.overall.map((oldRow, index) => {
    const row = candidate.overall[index];
    for (const key of ["sortie", "attempted", "built", "matched", "controlContinued", "controlWins"]) {
      if (row[key] !== oldRow[key])
        throw new Error("Paired baseline diverged in " + key + " at sortie " + row.sortie);
    }
    return {
      sortie: row.sortie, built: row.built, matched: row.matched,
      noBuildContinued: row.controlContinued, builtContinued: row.forgeContinued,
      baseline: {
        kills: oldRow.killDelta, hp: oldRow.hpDelta, hurt: oldRow.hurtDelta,
        shards: oldRow.shardDelta, stones: oldRow.earnedStonesDelta,
        netResource: oldRow.netResourceDeltaMatched, fired: oldRow.firedDelta,
        payback: oldRow.paidBackMatched, wins: oldRow.forgeWins,
      },
      candidate: {
        kills: row.killDelta, hp: row.hpDelta, hurt: row.hurtDelta,
        shards: row.shardDelta, stones: row.earnedStonesDelta,
        netResource: row.netResourceDeltaMatched, fired: row.firedDelta,
        payback: row.paidBackMatched, wins: row.forgeWins,
      },
      improvement: {
        kills: round(row.killDelta - oldRow.killDelta),
        hp: round(row.hpDelta - oldRow.hpDelta),
        hurt: round(row.hurtDelta - oldRow.hurtDelta),
        shards: round(row.shardDelta - oldRow.shardDelta),
        stones: round(row.earnedStonesDelta - oldRow.earnedStonesDelta),
        netResource: round(row.netResourceDeltaMatched - oldRow.netResourceDeltaMatched),
        fired: round(row.firedDelta - oldRow.firedDelta),
        wins: row.forgeWins - oldRow.forgeWins,
      },
    };
  });
  const byDangerSkill = candidate.byDangerSkill.map((row) => {
    const oldRow = baseline.byDangerSkill.find((value) =>
      value.danger === row.danger && value.skill === row.skill);
    if (!oldRow || oldRow.built !== row.built || oldRow.matched !== row.matched)
      throw new Error("Danger/skill paired cohort mismatch");
    return {
      danger: row.danger, skill: row.skill, built: row.built, matched: row.matched,
      baselineWins: oldRow.forgeWins, candidateWins: row.forgeWins,
      baselineHurtDelta: oldRow.hurtDelta, candidateHurtDelta: row.hurtDelta,
      baselineNetResource: oldRow.netResourceDeltaMatched,
      candidateNetResource: row.netResourceDeltaMatched,
      baselineKillsDelta: oldRow.killDelta, candidateKillsDelta: row.killDelta,
    };
  });
  return { overall, byDangerSkill };
}

// prettier-ignore
async function inspectCopy(root, seedCount) {
  const script = join(root, "scripts", "sortie-forge-tempo-2j.mjs");
  const { stdout } = await execFileAsync(process.execPath, [
    script, "--inner", "--seeds=" + seedCount,
  ], { cwd: root, maxBuffer: 1024 * 1024, timeout: 720_000 });
  const prefix = "FORGE_TEMPO_VARIANT_2J_JSON=";
  const record = stdout.split("\n").find((line) => line.startsWith(prefix));
  if (!record) throw new Error("Missing authoritative variant output");
  return JSON.parse(record.slice(prefix.length));
}

/** Run two full, genuinely settled campaigns in an isolated temporary tree. */
// prettier-ignore
export async function runForgeTempoExperiment(seedCount = 40) {
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 100)
    throw new Error("seedCount must be 1..100");
  const root = await mkdtemp(join(tmpdir(), "sortie-forge-tempo-2j-"));
  try {
    await cp(join(ROOT, "src"), join(root, "src"), { recursive: true });
    await cp(join(ROOT, "scripts"), join(root, "scripts"), { recursive: true });
    await cp(join(ROOT, "package.json"), join(root, "package.json"));
    await symlink(join(ROOT, "node_modules"), join(root, "node_modules"), "dir");
    const baseline = await inspectCopy(root, seedCount);
    const configFile = join(root, "src", "config", "sortie-data.js");
    const simFile = join(root, "src", "systems", "sortie-sim.js");
    const variant = makeTempoVariant(
      await readFile(configFile, "utf8"),
      await readFile(simFile, "utf8"),
    );
    await writeFile(configFile, variant.config);
    await writeFile(simFile, variant.sim);
    const candidate = await inspectCopy(root, seedCount);
    if (JSON.stringify(baseline.firingTicks.noBuild) !==
      JSON.stringify(candidate.firingTicks.noBuild))
      throw new Error("No-build weapon firing cadence changed");
    if (candidate.config.normalCooldownSeconds !== 0.7 ||
      candidate.config.builtCooldownSeconds !== 0.63 ||
      candidate.config.cost !== 6 || candidate.config.pickupRadius !== 28)
      throw new Error("Unexpected non-tempo tuning in the candidate");
    const comparison = compareReports(baseline, candidate);
    return {
      metadata: {
        seeds: seedCount, pairs: baseline.metadata.pairs,
        genuineBuilt: baseline.payback.built, maxSorties: 6,
        source: "2H-C real build + 2I-C authoritative two-world settlement",
        variant: "only built forge cooldown 0.70 -> 0.63 seconds",
        unbuiltCooldownSeconds: 0.7, realBuildCost: 6, tickRate: 60,
      },
      firingTicks: { baseline: baseline.firingTicks, candidate: candidate.firingTicks },
      comparison,
      firstPayback: { baseline: baseline.payback, candidate: candidate.payback },
      sixthByRoute: { baseline: baseline.byRoute, candidate: candidate.byRoute },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// prettier-ignore
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find((value) => value.startsWith("--seeds="));
  const seeds = arg ? Number(arg.slice("--seeds=".length)) : 40;
  if (process.argv.includes("--inner")) {
    console.log("FORGE_TEMPO_VARIANT_2J_JSON=" + JSON.stringify(inspectTempoVariant(seeds)));
  } else {
    const result = await runForgeTempoExperiment(seeds);
    console.log("FORGE_TEMPO_2J_JSON=" + JSON.stringify(result));
  }
}
