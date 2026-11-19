import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  buildSortieForge, createSortieArchive,
} from "../src/systems/sortie-session.js";
import { playRecoveryRun } from "../scripts/sortie-guarded-recovery-2l.mjs";
import { previewSortieGrowthReview } from "../src/ui/sortie-growth-review.js";

describe("2Q honest two-outing camp growth review", () => {
  it("starts hidden and never calls a projected upgrade an actual return", () => {
    const start = createSortieArchive("2q-fresh-camp");
    expect(previewSortieGrowthReview(start)).toBeNull();
    const first = playRecoveryRun(start, "thunder", "kite", "safe");
    expect(previewSortieGrowthReview(first.archive)).toBeNull();
    expect(first.receipt.battle.weaponDamage).toBe(SORTIE.weapon.damage);

    const paid = buildSortieForge(first.archive, "2q:forge:first");
    expect(paid.ok).toBe(true);
    expect(paid.replayed).toBe(false);
    expect(paid.receipt.cost).toBe(SORTIE.forge.cost);
    expect(paid.receipt.afterStones).toBe(
      paid.receipt.beforeStones - SORTIE.forge.cost);
    const state = previewSortieGrowthReview(paid.archive);
    expect(state).toMatchObject({
      phase: "prepared", title: "成长待实战 · 剑台已修复",
    });
    expect(state.payment).toContain("真实投入 6 石");
    expect(state.payment).toContain("灵刃 1 → 2 伤害");
    expect(state.outcome).toContain("下一场出击才会");
    expect(state.outcome).not.toContain("已经回本");
    expect(first.archive.run.sortieCamp.forgeLevel).toBe(0);
  }, 120_000);

  it("verifies 2 damage only after real second sortie authority settlement", () => {
    const initial = createSortieArchive("2q-authoritative-growth");
    const first = playRecoveryRun(initial, "rune", "kite", "safe");
    const paid = buildSortieForge(first.archive, "2q:forge:second");
    expect(paid.ok).toBe(true);
    const builtSnapshot = JSON.stringify(paid.archive);

    const next = playRecoveryRun(paid.archive, "rune", "kite", "safe");
    const prior = next.archive.lastReceipt;
    expect(prior).toEqual(next.receipt);
    expect(prior.battle.weaponDamage).toBe(2);
    expect(next.archive.run.day).toBe(first.archive.run.day + 1);
    expect(JSON.stringify(paid.archive)).toBe(builtSnapshot);
    const result = previewSortieGrowthReview(next.archive);
    expect(result.phase).toBe("verified");
    expect(result.title).toContain("已实战验证 · 灵刃 2 伤害");
    expect(result.payment).toContain("真实投入 6 石");
    expect(result.outcome).toContain("本场灵石 +" + prior.battle.stones);
    expect(result.outcome).toContain("建造前一场击退 " + first.receipt.battle.defeated);
    expect(result.outcome).toContain("单场灵石不是回本证明");

    const stale = JSON.parse(JSON.stringify(next.archive));
    stale.lastReceipt = first.receipt;
    expect(previewSortieGrowthReview(stale).phase).toBe("prepared");
  }, 120_000);
});
