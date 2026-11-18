import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { sortieIdentity } from "../src/systems/sortie-trace.js";
import {
  assertSortieArchive,
  buildSortieForge,
  createSortieArchive,
  prepareSortieArchive,
  previewSortieCampAllocation,
  recoverSortieArchive,
  selectSortieCampMission,
  settleSortieArchive,
} from "../src/systems/sortie-session.js";
import { simulateExperimentSortie } from "../scripts/sortie-experiment.mjs";
import {
  SHADOW_BEACON_COST,
  assertShadowBeaconArchive,
  buyShadowBeacon,
  consumeShadowBeacon,
  previewShadowBeacon,
  runCampAllocation2L,
} from "../scripts/sortie-camp-allocation-2l.mjs";

const run = promisify(execFile);
const clone = (value) => JSON.parse(JSON.stringify(value));

function firstWin(seed = "2l-b-camp-first") {
  for (let n = 0; n < 40; n++) {
    const archive = createSortieArchive(seed + "-" + n);
    const first = simulateExperimentSortie(archive, "rune", "pickup");
    if (first.available && first.battle.won &&
      Engine.byId(first.archive.run, "lingzai").resource >= 6) return first;
  }
  throw new Error("No eligible first win");
}

describe("2L-B safe-only mission, real camp payment and shadow-only preparation", () => {
  it("shows true 4-stone start, honest costs and refuses unimplemented salvage", () => {
    const fresh = createSortieArchive("2l-b-fresh");
    const before = clone(fresh);
    const preview = previewSortieCampAllocation(fresh);
    expect(preview.stones).toBe(4);
    expect(preview.keep).toMatchObject({ cost: 0, remaining: 4 });
    expect(preview.forge).toMatchObject({ cost: 6, remaining: -2, available: false });
    expect(preview.beacon).toMatchObject({
      cost: 2, remaining: 2, available: false, affordable: true,
    });
    expect(preview.salvage.available).toBe(false);
    expect(selectSortieCampMission(fresh, "salvage", "mission:try").ok).toBe(false);
    expect(selectSortieCampMission(fresh, "anything", "mission:try").ok).toBe(false);
    expect(selectSortieCampMission(fresh, "safe", "bad space").ok).toBe(false);
    expect(fresh).toEqual(before);
    expect(previewShadowBeacon(fresh).available).toBe(false);
    expect(buyShadowBeacon(fresh, "beacon:too-early").ok).toBe(false);
  });

  it("records safe selection exactly once, survives refresh and keeps old archive safe", () => {
    const fresh = createSortieArchive("2l-b-mission");
    const selected = selectSortieCampMission(fresh, "safe", "mission:safe:day-1");
    expect(selected).toMatchObject({ ok: true, replayed: false });
    expect(selected.archive.run.sortieCamp.missionSelection).toMatchObject({
      day: 1, missionId: "safe",
    });
    expect(selectSortieCampMission(selected.archive, "safe", "mission:safe:day-1"))
      .toMatchObject({ ok: true, replayed: true });
    expect(selectSortieCampMission(selected.archive, "safe", "mission:another").ok)
      .toBe(false);
    const pending = prepareSortieArchive(selected.archive);
    expect(pending.ok).toBe(true);
    expect(pending.archive.pending).toMatchObject({
      missionId: "safe", preparationId: null,
      missionOperationId: "mission:safe:day-1",
    });
    expect(selectSortieCampMission(pending.archive, "safe", "mission:again").ok)
      .toBe(false);
    const recovery = recoverSortieArchive(clone(pending.archive));
    expect(recovery.interrupted).toBe(true);
    expect(recovery.archive.run.day).toBe(1);
    expect(recovery.archive.run.sortieCamp.missionSelection.operationId)
      .toBe("mission:safe:day-1");
    expect(prepareSortieArchive(recovery.archive).archive.pending.missionId).toBe("safe");
    const fake = clone(pending.archive);
    fake.pending.missionId = "salvage";
    expect(() => assertSortieArchive(fake)).toThrow(/回放/);
    const tampered = clone(selected.archive);
    tampered.run.sortieCamp.missionSelection.missionId = "salvage";
    expect(() => assertSortieArchive(tampered)).toThrow(/任务选择/);
    const legacy = createSortieArchive("2l-b-old");
    delete legacy.run.sortieCamp;
    expect(prepareSortieArchive(legacy).archive.pending.missionId).toBe("safe");
  });

  it("keeps safe selection through genuine forge payment and next-day replay", () => {
    const first = firstWin("2l-b-real-forge");
    const before = Engine.byId(first.archive.run, "lingzai").resource;
    const mission = selectSortieCampMission(first.archive, "safe", "mission:safe:day-2");
    const paid = buildSortieForge(mission.archive, "forge:day-2");
    expect(paid.ok).toBe(true);
    expect(paid.receipt.cost).toBe(6);
    expect(Engine.byId(paid.archive.run, "lingzai").resource).toBe(before - 6);
    expect(paid.archive.run.sortieCamp.missionSelection.operationId)
      .toBe("mission:safe:day-2");
    expect(buildSortieForge(paid.archive, "forge:day-2")).toMatchObject({
      ok: true, replayed: true,
    });
    expect(buildSortieForge(paid.archive, "forge:other").ok).toBe(false);
    const prepared = prepareSortieArchive(paid.archive);
    expect(prepared.forgeLevel).toBe(1);
    expect(prepared.archive.pending.missionId).toBe("safe");
    const second = simulateExperimentSortie(paid.archive, "rune", "pickup");
    expect(second.available).toBe(true);
    expect(second.battle.weaponDamage).toBe(2);
    expect(second.archive.lastReceipt.battle.weaponDamage).toBe(2);
    expect(second.archive.run.day).toBe(3);
    expect(second.archive.lastReceipt.worlds.map((row) => row.id))
      .toEqual(["lingzai", "zombie"]);
  }, 120_000);

  it("shadow beacon pays exactly 2, is idempotent, persists refresh, exhausts once", () => {
    const first = firstWin("2l-b-beacon");
    const baseline = clone(first.archive);
    const original = Engine.byId(first.archive.run, "lingzai").resource;
    const paid = buyShadowBeacon(first.archive, "beacon:day2");
    expect(paid).toMatchObject({ ok: true, replayed: false });
    expect(Engine.byId(paid.archive.run, "lingzai").resource)
      .toBe(original - SHADOW_BEACON_COST);
    expect(first.archive).toEqual(baseline);
    expect(buyShadowBeacon(paid.archive, "beacon:day2"))
      .toMatchObject({ ok: true, replayed: true });
    expect(buyShadowBeacon(paid.archive, "beacon:again").ok).toBe(false);
    expect(buyShadowBeacon(first.archive, "space id").ok).toBe(false);
    const pending = prepareSortieArchive(paid.archive);
    const refreshed = recoverSortieArchive(clone(pending.archive));
    expect(refreshed.interrupted).toBe(true);
    expect(refreshed.archive.run.sortieCamp.shadowBeacon.charges).toBe(1);
    expect(Engine.byId(refreshed.archive.run, "lingzai").resource)
      .toBe(original - SHADOW_BEACON_COST);
    const control = simulateExperimentSortie(first.archive, "rune", "pickup");
    const next = simulateExperimentSortie(refreshed.archive, "rune", "pickup");
    expect(next.available).toBe(true);
    expect(control.available).toBe(true);
    // Proof that the 2G engine does NOT yet apply this proposed effect.
    expect(next.battle).toEqual(control.battle);
    expect(next.archive.lastReceipt.battle).toEqual(control.archive.lastReceipt.battle);
    expect(Engine.byId(next.archive.run, "lingzai").resource)
      .toBe(Engine.byId(control.archive.run, "lingzai").resource - 2);
    expect(next.archive.lastReceipt.worlds.map((row) => row.id))
      .toEqual(["lingzai", "zombie"]);
    const consumed = consumeShadowBeacon(refreshed.archive, next.archive);
    expect(consumed.ok).toBe(true);
    expect(consumed.receipt).toMatchObject({
      charges: 0, usedOn: sortieIdentity(refreshed.archive.run),
    });
    expect(consumeShadowBeacon(consumed.archive, consumed.archive).ok).toBe(false);
    expect(buyShadowBeacon(consumed.archive, "beacon:third").ok).toBe(false);
    expect(assertShadowBeaconArchive(clone(consumed.archive))).toBe(true);
    const third = simulateExperimentSortie(consumed.archive, "rune", "pickup");
    expect(third.available).toBe(true);
    expect(third.archive.run.sortieCamp.shadowBeacon.charges).toBe(0);
    const bad = clone(consumed.archive);
    bad.run.sortieCamp.shadowBeacon.charges = 2;
    expect(() => assertShadowBeaconArchive(bad)).toThrow(/shadow beacon/);
  }, 120_000);

  it("rejects stale, unverifiable or already-consumed shadow settlement", () => {
    const first = firstWin("2l-b-rejected");
    const paid = buyShadowBeacon(first.archive, "beacon:valid");
    const invalid = consumeShadowBeacon(paid.archive, paid.archive);
    expect(invalid.ok).toBe(false);
    expect(buyShadowBeacon(first.archive, "../../space id").ok).toBe(false);
    const interrupted = prepareSortieArchive(paid.archive);
    expect(consumeShadowBeacon(interrupted.archive, paid.archive).ok).toBe(false);
    const withdrew = settleSortieArchive(interrupted.archive, [["retreat"]]);
    expect(withdrew.ok).toBe(true);
    const exhausted = consumeShadowBeacon(paid.archive, withdrew.archive);
    expect(exhausted.ok).toBe(true);
    expect(exhausted.archive.lastReceipt.battle.stones).toBe(0);
    expect(exhausted.receipt.charges).toBe(0);
  }, 120_000);

  it("validates 40 fixed seeds: actual second/sixth forge vs hold, not fake beacon ROI", async () => {
    const script = new URL("../scripts/sortie-camp-allocation-2l.mjs", import.meta.url).pathname;
    const { stdout } = await run(
      process.execPath, [script, "--seeds=40", "--sorties=6"],
      { timeout: 600_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const prefix = "CAMP_ALLOCATION_2L_JSON=";
    const line = stdout.split("\n").find((item) => item.startsWith(prefix));
    expect(line).toBeDefined();
    const result = JSON.parse(line.slice(prefix.length));
    expect(result.metadata).toMatchObject({
      seedCount: 40, maxSorties: 6, pairs: 720,
      forgeCost: 6, beaconCost: 2,
    });
    expect(result.overall.map((row) => row.sortie)).toEqual([2, 6]);
    expect(result.byDangerSkill).toHaveLength(12);
    expect(result.byRoute).toHaveLength(36);
    expect(result.checks).toMatchObject({
      authoritativeDoubleWorldForge: true, sameFixedSeedPairs: true,
      beaconOutcomeVerified: false, beaconPurchaseEnabledInUI: false,
    });
    for (const row of result.overall) {
      expect(row.built).toBeLessThanOrEqual(row.eligible);
      expect(row.matched).toBeLessThanOrEqual(row.built);
      expect(row.paidBack).toBeLessThanOrEqual(row.matched);
      expect(row.controlWins).toBeLessThanOrEqual(row.matched);
      expect(row.forgeWins).toBeLessThanOrEqual(row.matched);
      expect(Number.isFinite(row.netResourceDelta)).toBe(true);
      expect(Number.isFinite(row.hurtDelta)).toBe(true);
    }
    console.log(prefix + JSON.stringify({
      metadata: result.metadata, overall: result.overall,
      byDangerSkill: result.byDangerSkill, checks: result.checks,
    }));
    expect(() => runCampAllocation2L(0)).toThrow();
    expect(() => runCampAllocation2L(1, 7)).toThrow();
  }, 600_000);
});
