import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  CANDIDATE,
  THREAT_RADIUS,
  assertExpeditionValue,
  makeExpeditionCandidate,
  pairedExpedition,
  runExpeditionValue,
  withCandidateAuthority,
} from "../scripts/sortie-expedition-value-2k.mjs";

const execFileAsync = promisify(execFile);

describe("2K-B isolated resource-recovery mission experiment", () => {
  it("does not increase stone cap, alter drop production, enemies or production sources", async () => {
    const simPath = new URL("../src/systems/sortie-sim.js", import.meta.url);
    const rewardPath = new URL("../src/systems/sortie-rewards.js", import.meta.url);
    const [sim, rewards] = await Promise.all([
      readFile(simPath, "utf8"),
      readFile(rewardPath, "utf8"),
    ]);
    const patched = makeExpeditionCandidate(sim, rewards);
    expect(CANDIDATE).toBe("one-victory-stone-requires-contested-recovery-96px");
    expect(THREAT_RADIUS).toBe(96);
    expect(SORTIE.rewards.maxShardStones).toBe(2);
    expect(SORTIE.rewards.pickupRadius).toBe(28);
    expect(SORTIE.rewards.defeatedPerShard).toBe(3);
    expect(SORTIE.rewards.baseStonesOnWin).toBe(3);
    expect(patched.sim).toContain("exposedRecovered++");
    expect(patched.rewards).toContain("objectiveStones");
    expect(patched.sim).toContain("battle.drops.push({ id: enemy.id, x: enemy.x, y: enemy.y });");
    expect(patched.sim).toContain("if (battle.hero.hp <= 0) battle.outcome = \"lost\";");
    expect(patched.sim).not.toBe(sim);
    expect(patched.rewards).not.toBe(rewards);
    expect(() => makeExpeditionCandidate(patched.sim, patched.rewards)).toThrow();
    await withCandidateAuthority(async ({ engine, session }) => {
      const archive = session.createSortieArchive("isolated-2k-b");
      expect(engine.byId(archive.run, "lingzai").resource).toBe(4);
    });
    expect(await readFile(simPath, "utf8")).toBe(sim);
    expect(await readFile(rewardPath, "utf8")).toBe(rewards);
  });

  it("uses two authoritative world receipts and rejects a duplicate forged trace", async () => {
    await withCandidateAuthority(async (candidateAuthority) => {
      const pair = pairedExpedition({
        candidateAuthority,
        seedIndex: 0,
        danger: 75,
        skill: "rune",
        route: "pickup",
      });
      expect(pair.control.day).toBe(2);
      expect(pair.candidate.day).toBe(2);
      expect(pair.control.defeated).toBe(pair.candidate.defeated);
      expect(pair.control.shards).toBe(pair.candidate.shards);
      expect(pair.control.hp).toBe(pair.candidate.hp);
      expect(pair.control.hurt).toBe(pair.candidate.hurt);
      expect(pair.control.stones).toBeGreaterThanOrEqual(0);
      expect(pair.candidate.stones).toBeLessThanOrEqual(5);
      expect(pair.candidate.baseStones).toBe(
        pair.candidate.won ? 2 + pair.candidate.objectiveStones : 0,
      );
      const oldStones = candidateAuthority.engine.byId(pair.trial.archive.run, "lingzai").resource;
      const replay = candidateAuthority.engine.settleSortie(pair.trial.archive.run, {
        sortieId: pair.trial.receipt.sortieId,
        actions: pair.trace,
      });
      expect(replay.ok).toBe(true);
      expect(replay.replayed).toBe(true);
      expect(candidateAuthority.engine.byId(replay.run, "lingzai").resource).toBe(oldStones);
      const forged = candidateAuthority.engine.settleSortie(pair.trial.archive.run, {
        sortieId: pair.trial.receipt.sortieId,
        actions: [["retreat"]],
      });
      expect(forged.ok).toBe(false);
    });
  });

  it("has a small fixed-seed authoritative smoke test", async () => {
    const result = await runExpeditionValue(1);
    expect(assertExpeditionValue(result)).toBe(true);
    expect(result.metadata.pairs).toBe(30);
    expect(result.metadata.authoritativeSorties).toBe(60);
    expect(result.metadata.unchangedPhysics).toBe(30);
    for (const row of result.rows) {
      expect(row.baseline.n).toBe(1);
      expect(row.candidate.n).toBe(1);
      expect(row.baseline.wins).toBe(row.candidate.wins);
      expect(row.baseline.shardStones).toBe(row.candidate.shardStones);
    }
  }, 120_000);

  it("runs forty fixed seeds across danger, skills, pickup and mistake routes", async () => {
    const script = new URL("../scripts/sortie-expedition-value-2k.mjs", import.meta.url).pathname;
    const { stdout } = await execFileAsync(
      process.execPath,
      [script, "--seeds=40", "--assert"],
      { maxBuffer: 1024 * 1024, timeout: 720_000 },
    );
    const line = stdout.split("\n").find((item) => item.startsWith("EXPEDITION_VALUE_2K_JSON="));
    expect(line).toBeDefined();
    const report = JSON.parse(line.slice("EXPEDITION_VALUE_2K_JSON=".length));
    expect(assertExpeditionValue(report)).toBe(true);
    expect(report.metadata.pairs).toBe(1200);
    expect(report.metadata.authoritativeSorties).toBe(2400);
    expect(report.metadata.unchangedPhysics).toBe(1200);
    expect(report.rows).toHaveLength(30);
    console.log("EXPEDITION_VALUE_2K_JSON=" + JSON.stringify(report));
  }, 750_000);
});
