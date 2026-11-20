import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import ProductionEngine from "../src/engine.js";
import { SORTIE as PRODUCTION_SORTIE } from "../src/config/sortie-data.js";
import {
  buyExperimentalPreparation,
  openCampChoiceSandbox,
  PREP_COST,
  PREP_HP,
  replayExperimentalSortie,
  runCampChoiceExperiment,
} from "../scripts/sortie-camp-choice-2k.mjs";

const execFileAsync = promisify(execFile);
const live = [];

async function sandbox() {
  const env = await openCampChoiceSandbox();
  live.push(env);
  return env;
}

afterEach(() => {
  for (const env of live.splice(0)) env.close();
});

// prettier-ignore
function findAffordableFirst(env) {
  for (let n = 0; n < 40; n++) {
    const seed = "sortie-2e-fixed-" + String(n).padStart(3, "0") + "-danger-40";
    const initial = env.session.createSortieArchive(seed);
    env.Engine.byId(initial.run, "lingzai").d = 40;
    const first = replayExperimentalSortie(env, initial, "rune", "pickup");
    if (first.available && env.Engine.byId(first.archive.run, "lingzai").resource >= PREP_COST) {
      return first;
    }
  }
  throw new Error("No genuinely affordable first sortie among 40 seeds");
}

describe("2K-C isolated camp choice with authoritative replay", () => {
  it("keeps the official engine, archive version and immutable config untouched", async () => {
    const official = ProductionEngine.fresh("2k-c-production-isolation", 1, false);
    const original = JSON.stringify(official);
    const env = await sandbox();
    const candidate = env.session.createSortieArchive("2k-c-isolated");
    const before = JSON.stringify(candidate);
    const unavailable = buyExperimentalPreparation(env, candidate, "2k:premature");
    expect(unavailable.ok).toBe(false);
    expect(JSON.stringify(candidate)).toBe(before);
    expect(JSON.stringify(official)).toBe(original);
    expect(official.sortieCamp).toBeUndefined();
    expect(PRODUCTION_SORTIE.player.hp).toBe(8);
    expect(PRODUCTION_SORTIE.forge.cost).toBe(6);
    expect(env.session.SORTIE_ARCHIVE_VERSION).toBe("sortie-world-v1");
  });

  it("deducts precisely 3 real stones, persists refresh, rejects duplicate spending", async () => {
    const env = await sandbox();
    const first = findAffordableFirst(env);
    const before = env.Engine.byId(first.archive.run, "lingzai").resource;
    const spent = buyExperimentalPreparation(env, first.archive, "2k:buy:one");
    expect(spent).toMatchObject({ ok: true, replayed: false });
    expect(env.Engine.byId(spent.archive.run, "lingzai").resource).toBe(before - PREP_COST);
    expect(env.Engine.byId(first.archive.run, "lingzai").resource).toBe(before);
    expect(spent.receipt).toMatchObject({ charges: 1, hpBonus: PREP_HP, cost: PREP_COST });
    expect(buyExperimentalPreparation(env, spent.archive, "2k:buy:one")).toMatchObject({
      ok: true, replayed: true,
    });
    expect(buyExperimentalPreparation(env, spent.archive, "2k:buy:two").ok).toBe(false);
    expect(buyExperimentalPreparation(env, spent.archive, "../../bad").ok).toBe(false);
    const refreshed = JSON.parse(JSON.stringify(spent.archive));
    expect(env.session.assertSortieArchive(refreshed)).toBe(true);
    const prepared = env.session.prepareSortieArchive(refreshed);
    expect(prepared.ok).toBe(true);
    expect(buyExperimentalPreparation(env, prepared.archive, "2k:buy:three").ok).toBe(false);
    const recovered = env.session.recoverSortieArchive(prepared.archive);
    expect(recovered.interrupted).toBe(true);
    expect(recovered.archive.pending).toBeNull();
    expect(recovered.archive.run.sortieCamp.prepared.charges).toBe(1);
    expect(env.Engine.byId(recovered.archive.run, "lingzai").resource).toBe(before - 3);

    const second = replayExperimentalSortie(env, recovered.archive, "rune", "pickup");
    expect(second.available).toBe(true);
    expect(second.battle.prepHp).toBe(2);
    expect(second.archive.run.sortieCamp.prepared.charges).toBe(0);
    expect(second.archive.run.sortieCamp.prepared.usedOn).toBe(second.sortieId);
    expect(second.receipt.worlds.map((item) => item.id)).toEqual(["lingzai", "zombie"]);
    expect(buyExperimentalPreparation(env, second.archive, "2k:buy:four").ok).toBe(false);
    const third = replayExperimentalSortie(env, second.archive, "rune", "pickup");
    expect(third.available).toBe(true);
    expect(third.battle.prepHp).toBe(0);
    expect(third.battle.hp).toBeLessThanOrEqual(8);
  }, 120_000);

  it("rejects malformed shadow consumption state before awarding the next sortie", async () => {
    const env = await sandbox();
    const first = findAffordableFirst(env);
    const purchased = buyExperimentalPreparation(env, first.archive, "2k:tamper:one");
    expect(purchased.ok).toBe(true);
    const corrupted = JSON.parse(JSON.stringify(purchased.archive));
    corrupted.run.sortieCamp.prepared.charges = 5;
    expect(() => replayExperimentalSortie(env, corrupted, "rune", "kite")).toThrow(
      /replay rejected/i,
    );
  }, 120_000);

  it("runs a small complete set without a fake prebuilt forge or fabricated rewards", async () => {
    const result = await runCampChoiceExperiment(1, 3);
    expect(result.metadata).toMatchObject({
      pairs: 18, maxSorties: 3, forgeCost: 6, prepCost: 3, prepHp: 2,
    });
    expect(result.overall).toHaveLength(4);
    expect(result.byDangerSkill).toHaveLength(24);
    expect(result.byRoute).toHaveLength(36);
    for (const row of result.overall) {
      expect(row.invested).toBeLessThanOrEqual(row.total);
      expect(row.paidBack).toBeLessThanOrEqual(row.invested);
      expect(row.matched).toBeLessThanOrEqual(row.invested);
    }
    await expect(runCampChoiceExperiment(0)).rejects.toThrow();
    await expect(runCampChoiceExperiment(1, 7)).rejects.toThrow();
  }, 120_000);

  it("runs 40 fixed seeds × D0/40/75 × two skills × 3 routes to sortie six", async () => {
    // Run in a subprocess to keep Vitest workers responsive during the heavy matrix.
    const script = new URL("../scripts/sortie-camp-choice-2k.mjs", import.meta.url).pathname;
    const { stdout } = await execFileAsync(
      process.execPath,
      [script, "--seeds=40", "--sorties=6"],
      { maxBuffer: 4 * 1024 * 1024, timeout: 600_000 },
    );
    const prefix = "CAMP_CHOICE_2K_JSON=";
    const line = stdout.split("\n").find((part) => part.startsWith(prefix));
    expect(line).toBeDefined();
    const result = JSON.parse(line.slice(prefix.length));
    expect(result.metadata.pairs).toBe(720);
    expect(result.metadata.maxSorties).toBe(6);
    expect(result.overall).toHaveLength(10);
    expect(result.byDangerSkill).toHaveLength(60);
    expect(result.byRoute).toHaveLength(36);
    expect(result.checks).toMatchObject({
      identicalFirstSortie: true,
      actualDeduction: true,
      shadowAuthoritativeReplay: true,
      doubleWorldReceipt: true,
      immutableProductionModules: true,
    });
    for (const row of result.overall) {
      expect(row.matched + row.heldOnly + row.investedOnly).toBeLessThanOrEqual(row.invested);
      expect(row.paidBack).toBeLessThanOrEqual(row.invested);
    }
    console.log(prefix + JSON.stringify(result));
  }, 600_000);
});
