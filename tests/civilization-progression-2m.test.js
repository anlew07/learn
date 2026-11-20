import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  CIVILIZATION_NODES,
  previewCivilizationProgress,
} from "../src/systems/civilization-progression.js";
import {
  buildSortieForge,
  createSortieArchive,
  prepareSortieArchive,
} from "../src/systems/sortie-session.js";
import { simulateExperimentSortie } from "../scripts/sortie-experiment.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));
const state = (view, id) => view.nodes.find((node) => node.id === id).status;

function successfulFirstSortie() {
  for (let index = 0; index < 24; index++) {
    const first = simulateExperimentSortie(
      createSortieArchive("2m-civilization-" + index),
      "rune",
      "pickup",
    );
    if (first.available && first.battle.won &&
      Engine.byId(first.archive.run, "lingzai").resource >= SORTIE.forge.cost) {
      return first;
    }
  }
  throw new Error("No eligible fixed-seed first win");
}

describe("2M civilization milestone map", () => {
  it("starts with truthful goals and no new income, saves or unlocked combat stats", () => {
    const archive = createSortieArchive("2m-start");
    const original = clone(archive);
    const progress = previewCivilizationProgress(archive);
    expect(CIVILIZATION_NODES).toHaveLength(8);
    expect(progress.completed).toBe(1);
    expect(progress.next.id).toBe("survive");
    expect(state(progress, "fire")).toBe("complete");
    expect(state(progress, "salvage")).toBe("ready");
    expect(state(progress, "forge")).toBe("locked");
    expect(state(progress, "forge-trial")).toBe("locked");
    expect(state(progress, "rebuild")).toBe("locked");
    expect(archive).toEqual(original);

    const pending = prepareSortieArchive(archive);
    expect(pending.ok).toBe(true);
    expect(previewCivilizationProgress(pending.archive).completed).toBe(1);
    expect(pending.archive.run.sortieCamp?.evolution).toBeUndefined();
  });

  it("derives progress from an actually settled battle and subsequent real forge spend", () => {
    const first = successfulFirstSortie();
    const before = clone(first.archive);
    const progress = previewCivilizationProgress(first.archive);
    expect(state(progress, "survive")).toBe("complete");
    expect(state(progress, "worlds")).toBe("complete");
    expect(state(progress, "forge")).toBe("ready");
    expect(state(progress, "forge-trial")).toBe("locked");
    expect(first.archive).toEqual(before);
    expect(first.archive.run.day).toBe(2);
    expect(first.archive.lastReceipt.worlds.map((world) => world.id))
      .toEqual(["lingzai", "zombie"]);

    const beforeStones = Engine.byId(first.archive.run, "lingzai").resource;
    const paid = buildSortieForge(first.archive, "forge:2m-verified");
    expect(paid.ok).toBe(true);
    expect(Engine.byId(paid.archive.run, "lingzai").resource)
      .toBe(beforeStones - SORTIE.forge.cost);
    expect(state(previewCivilizationProgress(paid.archive), "forge"))
      .toBe("complete");
    expect(state(previewCivilizationProgress(paid.archive), "forge-trial"))
      .toBe("ready");
    expect(state(previewCivilizationProgress(first.archive), "forge"))
      .toBe("ready");

    const second = simulateExperimentSortie(paid.archive, "rune", "pickup");
    expect(second.available).toBe(true);
    expect(second.battle.won).toBe(true);
    expect(second.archive.lastReceipt.battle.weaponDamage).toBe(2);
    expect(state(previewCivilizationProgress(second.archive), "forge-trial"))
      .toBe("complete");
  }, 120_000);

  it("does not mark guarded recovery from a selected mission, failure or zero reward", () => {
    const first = successfulFirstSortie();
    const fixture = clone(first.archive);
    const receipt = fixture.run.sortieLedger[fixture.lastReceipt.sortieId].receipt;
    receipt.battle.missionId = "salvage";
    receipt.battle.objectiveStatus = "completed";
    receipt.battle.objectiveStones = 0;
    expect(state(previewCivilizationProgress(fixture), "salvage")).toBe("ready");
    receipt.battle.objectiveStones = SORTIE.mission.rewardStones;
    receipt.battle.outcome = "lost";
    expect(state(previewCivilizationProgress(fixture), "salvage")).toBe("ready");
    receipt.battle.outcome = "won";
    expect(state(previewCivilizationProgress(fixture), "salvage")).toBe("complete");
    expect(state(previewCivilizationProgress(first.archive), "salvage")).toBe("ready");
    expect(state(previewCivilizationProgress(fixture), "rebuild")).toBe("locked");
  });
});
