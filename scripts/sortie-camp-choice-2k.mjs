// prettier-ignore
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const PREP_COST = 3;
export const PREP_HP = 2;
export const ROUTES = ["kite", "pickup", "reverse"];
export const DANGERS = [0, 40, 75];
export const SKILLS = ["thunder", "rune"];

// prettier-ignore
const clone = (value) => JSON.parse(JSON.stringify(value));
// prettier-ignore
const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
// prettier-ignore
const round = (value) => (value === null ? null : Math.round(value * 1000) / 1000);

/**
 * Experimental source-copy adapter, never a change to production src/.
 * A battle must be re-simulated by the *same* shadow Engine on settlement:
 * simply awarding bonus HP after a production receipt would be invalid.
 * This adapter is intentionally disposable until its product value is proven.
 */
/**
 * Source contract for 2L-A: missionId remains fourth; shadow prepHp follows it.
 * The old 2K-C experiment must stay on the safe route, never claim a mission bonus.
 */
// prettier-ignore
export async function openCampChoiceSandbox() {
  const root = mkdtempSync(join(process.cwd(), ".sortie-camp-2k-"));
  const replace = (path, before, after) => {
    const full = join(root, path);
    const original = readFileSync(full, "utf8");
    if (!original.includes(before) || original.split(before).length !== 2) {
      throw new Error("2K-C shadow adapter source contract changed: " + path);
    }
    writeFileSync(full, original.replace(before, after));
  };
  try {
    cpSync(join(process.cwd(), "src"), join(root, "src"), { recursive: true });
    mkdirSync(join(root, "scripts"));
    cpSync(
      join(process.cwd(), "scripts/sortie-experiment.mjs"),
      join(root, "scripts/sortie-experiment.mjs"),
    );
    writeFileSync(join(root, "package.json"), '{"private":true,"type":"module"}\n');
    replace(
      "src/systems/sortie-sim.js",
      'export function createSortie(seed = "lingzai-demo", danger = 0, forgeLevel = 0, missionId = "safe", options = {}) {',
      'export function createSortie(seed = "lingzai-demo", danger = 0, forgeLevel = 0, missionId = "safe", options = {}, prepHp = 0) {',
    );
    replace(
      "src/systems/sortie-sim.js",
      "hp: SORTIE.player.hp, invulnerable: 0",
      "hp: SORTIE.player.hp + prepHp, invulnerable: 0",
    );
    replace(
      "src/systems/sortie-trace.js",
      'export function replaySortieTrace(seed, danger, actions, forgeLevel = 0, missionId = "safe", skillReleaseMode = "auto") {',
      'export function replaySortieTrace(seed, danger, actions, forgeLevel = 0, missionId = "safe", skillReleaseMode = "auto", prepHp = 0) {',
    );
    replace(
      "src/systems/sortie-trace.js",
      "const battle = createSortie(seed, danger, forgeLevel, missionId, { skillReleaseMode });",
      "const battle = createSortie(seed, danger, forgeLevel, missionId, { skillReleaseMode }, prepHp);",
    );
    replace(
      "src/engine.js",
      "var verified=replaySortieTrace(sortieSeed(s),ling.d,request.actions,forgeLevel,missionId);",
      [
        "var prep=s.sortieCamp?.prepared;",
        "if(prep&&(!Number.isInteger(prep.charges)||prep.charges<0||prep.charges>1||",
        "  prep.cost!==3||prep.hpBonus!==2||typeof prep.operationId!==\"string\"))",
        "  return {ok:false,error:\"战前准备试验状态非法\"};",
        "var prepHp=prep?.charges===1?2:0;",
        "var verified=replaySortieTrace(sortieSeed(s),ling.d,request.actions,forgeLevel,missionId,\"auto\",prepHp);",
      ].join("\n"),
    );
    replace(
      "src/engine.js",
      "var next=JSON.parse(JSON.stringify(s));\n    var before=next.worlds.map(captureSortieWorld);",
      [
        "var next=JSON.parse(JSON.stringify(s));",
        "    if(prepHp){next.sortieCamp.prepared.charges=0;",
        "      next.sortieCamp.prepared.usedOn=request.sortieId;}",
        "    var before=next.worlds.map(captureSortieWorld);",
      ].join("\n"),
    );
    const load = (relative) => import(pathToFileURL(join(root, relative)).href);
    const [{ default: Engine }, session, sim, { experimentInput }, { SORTIE }] =
      await Promise.all([
        load("src/engine.js"),
        load("src/systems/sortie-session.js"),
        load("src/systems/sortie-sim.js"),
        load("scripts/sortie-experiment.mjs"),
        load("src/config/sortie-data.js"),
      ]);
    return {
      root,
      Engine,
      session,
      sim,
      experimentInput,
      SORTIE,
      close: () => rmSync(root, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

/** Atomic, immutable purchase on a clone of the isolated archive. */
// prettier-ignore
export function buyExperimentalPreparation(env, archive, operationId) {
  env.session.assertSortieArchive(archive);
  if (typeof operationId !== "string" ||
    !/^[A-Za-z0-9:_/.-]{1,128}$/.test(operationId)) {
    return { ok: false, error: "无效的战前准备操作 ID" };
  }
  const prior = archive.run.sortieCamp?.prepared;
  if (prior?.operationId === operationId) {
    return { ok: true, replayed: true, receipt: prior, archive };
  }
  if (prior) return { ok: false, error: "本次实验只允许购买一次战前准备" };
  const world = env.Engine.byId(archive.run, "lingzai");
  if (!archive.lastReceipt || archive.pending || !archive.run.active ||
    !world || world.status !== "running" || world.retreat) {
    return { ok: false, error: "尚未结算首次出击，或出击正在进行" };
  }
  if (world.resource < PREP_COST) return { ok: false, error: "灵石不足" };
  const next = clone(archive);
  const target = env.Engine.byId(next.run, "lingzai");
  const before = target.resource;
  target.resource = Math.round((before - PREP_COST) * 100) / 100;
  const receipt = {
    operationId,
    purchasedDay: next.run.day,
    cost: PREP_COST,
    hpBonus: PREP_HP,
    beforeStones: before,
    afterStones: target.resource,
    charges: 1,
    usedOn: null,
  };
  next.run.sortieCamp = { ...next.run.sortieCamp, prepared: receipt };
  env.session.assertSortieArchive(next);
  return { ok: true, replayed: false, archive: next, receipt };
}

// prettier-ignore
const stock = (env, archive) => env.Engine.byId(archive.run, "lingzai").resource;
// prettier-ignore
const zombie = (env, archive) => env.Engine.byId(archive.run, "zombie");

// prettier-ignore
function routeInput(env, battle, route) {
  if (route !== "reverse") return env.experimentInput(battle, route);
  const input = env.experimentInput(battle, "pickup");
  // Predictable intermittent wrong-way joystick holds, not random damage.
  if (Math.floor(battle.tick / 360) % 2 === 1 && battle.tick % 360 < 48) {
    return { x: -input.x, y: -input.y };
  }
  return input;
}

/** Same prepare -> ticks -> replay -> double-world receipt as the real 2E path. */
// prettier-ignore
export function replayExperimentalSortie(env, archive, skill, route) {
  const ready = env.session.prepareSortieArchive(archive);
  if (!ready.ok) return { available: false, reason: ready.error };
  const prepCharges = ready.archive.run.sortieCamp?.prepared?.charges ?? 0;
  const prepHp = prepCharges === 1 ? PREP_HP : 0;
  const battle = env.sim.createSortie(ready.seed, ready.danger, ready.forgeLevel, "safe", {}, prepHp);
  const actions = [];
  let ticks = 0;
  while (battle.outcome === "running" && ticks <= env.sim.DURATION_TICKS) {
    if (battle.skillChoicePending) {
      const choice = env.sim.chooseSortieSkill(battle, skill);
      if (!choice.ok) throw new Error(choice.error);
      actions.push(["skill", skill]);
    }
    if (battle.outcome !== "running") break;
    const input = routeInput(env, battle, route);
    env.sim.stepSortie(battle, input);
    actions.push(["tick", input.x, input.y]);
    ticks++;
  }
  if (battle.outcome === "running" || battle.skillChoicePending) {
    throw new Error("2K-C battle did not finish");
  }
  const settled = env.session.settleSortieArchive(ready.archive, actions);
  if (!settled.ok) throw new Error("2K-C replay rejected: " + settled.error);
  const receipt = settled.receipt;
  const replay = env.Engine.settleSortie(settled.archive.run, {
    sortieId: ready.sortieId,
    actions,
  });
  if (!replay.ok || !replay.replayed ||
    JSON.stringify(replay.receipt) !== JSON.stringify(receipt)) {
    throw new Error("Repeated authoritative settlement was not idempotent");
  }
  if (receipt.battle.defeated !== battle.defeated ||
    receipt.battle.weaponDamage !== battle.weaponDamage ||
    receipt.battle.collectedShards !== battle.collectedShards ||
    receipt.battle.outcome !== battle.outcome ||
    receipt.battle.stones !== receipt.battle.baseStones + receipt.battle.shardStones ||
    receipt.worlds.length !== 2) {
    throw new Error("2K-C local battle differs from authoritative double-world receipt");
  }
  if (prepHp && (settled.archive.run.sortieCamp.prepared.charges !== 0 ||
    settled.archive.run.sortieCamp.prepared.usedOn !== ready.sortieId)) {
    throw new Error("Purchased prep not consumed exactly once");
  }
  return {
    available: true,
    archive: settled.archive,
    actions,
    sortieId: ready.sortieId,
    battle: {
      won: battle.outcome === "won",
      hp: battle.hero.hp,
      hurt: battle.hurt,
      defeated: battle.defeated,
      shards: battle.collectedShards,
      stones: receipt.battle.stones,
      baseStones: receipt.battle.baseStones,
      shardStones: receipt.battle.shardStones,
      weaponDamage: receipt.battle.weaponDamage,
      prepHp,
    },
    receipt,
  };
}

// prettier-ignore
function stage(env, result) {
  if (!result.available) return null;
  const other = zombie(env, result.archive);
  return {
    battle: result.battle,
    resource: stock(env, result.archive),
    day: result.archive.run.day,
    active: result.archive.run.active,
    zombieResource: other.resource,
    zombieDanger: other.d,
    zombieStatus: other.status,
    lingDanger: env.Engine.byId(result.archive.run, "lingzai").d,
  };
}

// prettier-ignore
function maybeBuild(env, archive, operationId) {
  const preview = env.session.previewSortieForge(archive);
  if (!preview.available) return { archive, built: false, receipt: null };
  const result = env.session.buildSortieForge(archive, operationId);
  if (!result.ok || result.replayed) throw new Error("Real forge build rejected");
  const after = stock(env, result.archive);
  if (Math.abs(after - stock(env, archive) + env.SORTIE.forge.cost) > 1e-7) {
    throw new Error("Forge did not charge exactly six stones");
  }
  return { archive: result.archive, built: true, receipt: result.receipt };
}

// prettier-ignore
function campaign(env, seedIndex, danger, skill, route, maxSorties) {
  const seed = "sortie-2e-fixed-" + String(seedIndex).padStart(3, "0") +
    "-danger-" + danger;
  const archive = env.session.createSortieArchive(seed);
  env.Engine.byId(archive.run, "lingzai").d = danger;
  const first = replayExperimentalSortie(env, archive, skill, route);
  if (!first.available) throw new Error("First sortie unavailable");
  const firstStage = stage(env, first);
  const branches = {};
  for (const mode of ["hold", "save-forge", "prep"]) {
    let next = clone(first.archive);
    let invested = false;
    let investedAfterFirst = false;
    let cost = 0;
    let spentDay = null;
    let resourceAfterFirst = stock(env, next);
    const stages = [firstStage];
    for (let sortie = 2; sortie <= maxSorties; sortie++) {
      if (mode === "prep" && sortie === 2) {
        const bought = buyExperimentalPreparation(
          env, next, "2k:prep:" + seed + ":" + skill + ":" + route,
        );
        if (bought.ok) {
          next = bought.archive;
          invested = true;
          investedAfterFirst = true;
          cost = bought.receipt.cost;
          spentDay = bought.receipt.purchasedDay;
        } else if (bought.error !== "灵石不足") {
          throw new Error("Unexpected prep rejection: " + bought.error);
        }
      }
      if (mode === "save-forge" && !invested) {
        const built = maybeBuild(
          env, next, "2k:forge:" + seed + ":" + skill + ":" + route,
        );
        if (built.built) {
          next = built.archive;
          invested = true;
          investedAfterFirst = sortie === 2;
          cost = built.receipt.cost;
          spentDay = built.receipt.day;
        }
      }
      if (sortie === 2) resourceAfterFirst = stock(env, next);
      const result = replayExperimentalSortie(env, next, skill, route);
      stages.push(stage(env, result));
      if (!result.available) break;
      next = result.archive;
    }
    branches[mode] = {
      invested,
      investedAfterFirst,
      cost,
      spentDay,
      resourceAfterFirst,
      stages,
      finalResource: stock(env, next),
      remainingPrep: next.run.sortieCamp?.prepared?.charges ?? 0,
      finalForgeLevel: next.run.sortieCamp?.forgeLevel ?? 0,
      finalDay: next.run.day,
    };
  }
  if (branches.hold.invested ||
    branches.prep.invested && Math.abs(
      branches.prep.resourceAfterFirst - firstStage.resource + PREP_COST) > 1e-7 ||
    branches["save-forge"].investedAfterFirst && Math.abs(
      branches["save-forge"].resourceAfterFirst -
      firstStage.resource + env.SORTIE.forge.cost) > 1e-7) {
    throw new Error("Unmatched first-stage investment accounting");
  }
  return { seedIndex, danger, skill, route, firstStage, branches };
}

// prettier-ignore
function summarize(pairs, mode, sortie) {
  // A later forge purchase must not be counted as an investment at earlier horizons.
  const cohort = pairs.filter((pair) => {
    const branch = pair.branches[mode];
    const stageAtHorizon = branch.stages[sortie - 1];
    return branch.invested && branch.spentDay !== null &&
      (stageAtHorizon?.day ?? branch.finalDay) > branch.spentDay;
  });
  const comparable = cohort.filter((pair) =>
    pair.branches.hold.stages[sortie - 1] &&
    pair.branches[mode].stages[sortie - 1]);
  const delta = (fn) => round(mean(comparable.map((pair) => fn(
    pair.branches[mode].stages[sortie - 1],
    pair.branches.hold.stages[sortie - 1],
  ))));
  const net = cohort.map((pair) => {
    const treatment = pair.branches[mode].stages[sortie - 1];
    const control = pair.branches.hold.stages[sortie - 1];
    return (treatment?.resource ?? pair.branches[mode].finalResource) -
      (control?.resource ?? pair.branches.hold.finalResource);
  });
  return {
    sortie,
    mode,
    total: pairs.length,
    invested: cohort.length,
    investedAfterFirst: cohort.filter((pair) =>
      pair.branches[mode].investedAfterFirst).length,
    matched: comparable.length,
    heldOnly: cohort.filter((pair) =>
      pair.branches.hold.stages[sortie - 1] &&
      !pair.branches[mode].stages[sortie - 1]).length,
    investedOnly: cohort.filter((pair) =>
      !pair.branches.hold.stages[sortie - 1] &&
      pair.branches[mode].stages[sortie - 1]).length,
    heldWins: comparable.filter((pair) =>
      pair.branches.hold.stages[sortie - 1].battle.won).length,
    investedWins: comparable.filter((pair) =>
      pair.branches[mode].stages[sortie - 1].battle.won).length,
    rescued: comparable.filter((pair) =>
      pair.branches[mode].stages[sortie - 1].battle.won &&
      !pair.branches.hold.stages[sortie - 1].battle.won).length,
    harmed: comparable.filter((pair) =>
      !pair.branches[mode].stages[sortie - 1].battle.won &&
      pair.branches.hold.stages[sortie - 1].battle.won).length,
    hpDelta: delta((a, b) => a.battle.hp - b.battle.hp),
    hurtDelta: delta((a, b) => a.battle.hurt - b.battle.hurt),
    killDelta: delta((a, b) => a.battle.defeated - b.battle.defeated),
    shardDelta: delta((a, b) => a.battle.shards - b.battle.shards),
    earnedStonesDelta: delta((a, b) => a.battle.stones - b.battle.stones),
    zombieResourceDelta: delta((a, b) => a.zombieResource - b.zombieResource),
    zombieDangerDelta: delta((a, b) => a.zombieDanger - b.zombieDanger),
    netResourceDelta: round(mean(net)),
    paidBack: net.filter((value) => value >= 0).length,
    prepAvailableAtHorizon: cohort.filter((pair) =>
      pair.branches[mode].remainingPrep === 1).length,
  };
}

/**
 * 40 fixed seeds × 3 dangers × two skills × three routes.
 * All recorded receipts are from the authoritative shadow Engine.
 * Costs, battle HP and one-use consumption are not post-hoc result edits.
 */
// prettier-ignore
export async function runCampChoiceExperiment(seedCount = 40, maxSorties = 6) {
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 80 ||
    !Number.isInteger(maxSorties) || maxSorties < 2 || maxSorties > 6) {
    throw new Error("Invalid 2K-C fixed seed or horizon");
  }
  const env = await openCampChoiceSandbox();
  try {
    const pairs = [];
    for (const danger of DANGERS) {
      for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
        for (const skill of SKILLS) {
          for (const route of ROUTES) {
            pairs.push(campaign(env, seedIndex, danger, skill, route, maxSorties));
          }
        }
      }
    }
    const horizons = Array.from({ length: maxSorties - 1 }, (_, i) => i + 2);
    const overall = [];
    const byDangerSkill = [];
    const byRoute = [];
    for (const mode of ["save-forge", "prep"]) {
      for (const sortie of horizons) overall.push(summarize(pairs, mode, sortie));
      for (const danger of DANGERS) {
        for (const skill of SKILLS) {
          const group = pairs.filter((pair) => pair.danger === danger && pair.skill === skill);
          for (const sortie of horizons) {
            byDangerSkill.push({ danger, skill, ...summarize(group, mode, sortie) });
          }
          for (const route of ROUTES) {
            byRoute.push({
              danger, skill, route,
              ...summarize(group.filter((pair) => pair.route === route), mode, maxSorties),
            });
          }
        }
      }
    }
    return {
      metadata: {
        seedCount,
        maxSorties,
        pairs: pairs.length,
        battleScenariosMax: pairs.length * (1 + 3 * (maxSorties - 1)),
        forgeCost: env.SORTIE.forge.cost,
        prepCost: PREP_COST,
        prepHp: PREP_HP,
        dangers: DANGERS,
        skills: SKILLS,
        routes: ROUTES,
        source: "2J #74 isolated shadow Engine: full authoritative replay/settlement",
      },
      overall,
      byDangerSkill,
      byRoute,
      checks: {
        identicalFirstSortie: true,
        actualDeduction: true,
        shadowAuthoritativeReplay: true,
        doubleWorldReceipt: true,
        immutableProductionModules: true,
      },
    };
  } finally {
    env.close();
  }
}

// prettier-ignore
if (process.argv[1]?.endsWith("sortie-camp-choice-2k.mjs")) {
  const countArg = process.argv.find((value) => value.startsWith("--seeds="));
  const horizonArg = process.argv.find((value) => value.startsWith("--sorties="));
  const report = await runCampChoiceExperiment(
    countArg ? Number(countArg.slice(8)) : 40,
    horizonArg ? Number(horizonArg.slice(10)) : 6,
  );
  console.log("CAMP_CHOICE_2K_JSON=" + JSON.stringify(report));
}
