import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  getSavedState,
  startFirstRun,
  startProgressedRun,
} from "./helpers/run-fixtures.js";

async function resolveWorldThroughEngine(page, worldId) {
  await page.evaluate(async (id) => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { default: Engine } = await import("/src/engine.js");
    const saved = await saveRepository.load();
    const world = saved.run.worlds.find(
      (item) => item.id === id && item.status === "running",
    );
    if (!world) throw new Error("Missing running world fixture: " + id);

    world.p = 100;
    world.d = 0;
    world.level = 3;
    world.resource = 40;
    world.strategy = "rescue";
    world.flags.p65 = true;
    world.flags.p100 = true;
    if (world.id === "zombie") world.flags.weakness = true;

    const result = Engine.step(saved.run);
    if (!result.ok) throw new Error(result.error || "Engine rescue step failed");
    saved.profile.worldsSaved = Math.max(
      saved.profile.worldsSaved || 0,
      saved.run.worldsSavedCount || 0,
    );
    await saveRepository.enqueueSave(saved.run, saved.profile);
  }, worldId);
  await page.reload();
}

test("first-run gate hub exposes one real world and two locked slots", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startFirstRun(page);

  const before = await getSavedState(page);
  await page.locator('[data-stat="parallel"]').click();

  const dialog = page.getByRole("dialog", { name: "跨界航路" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-gate-state="active"]')).toHaveCount(1);
  await expect(dialog.locator('[data-gate-state="locked"]')).toHaveCount(2);
  await expect(dialog).toContainText("并行世界");
  await expect(dialog).toContainText("再成功救援 1 个世界后开启");
  await expect(dialog).toContainText("再成功救援 2 个世界后开启");

  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(321);
  expect(dimensions.height).toBeLessThanOrEqual(569);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/world-gate-hub-2ae-320.png" });

  const after = await getSavedState(page);
  expect(JSON.stringify(after.run)).toBe(JSON.stringify(before.run));

  await dialog.locator('[data-action="scene-close"]').click();
  await resolveWorldThroughEngine(page, "lingzai");
  await page.locator('[data-stat="parallel"]').click();

  const expanded = page.getByRole("dialog", { name: "跨界航路" });
  await expect(expanded.locator('[data-gate-state="active"]')).toHaveCount(2);
  await expect(expanded.locator('[data-gate-state="locked"]')).toHaveCount(1);
  await expect(expanded.locator('button[data-gate-state="active"]:disabled')).toHaveCount(2);
  await expect(expanded).toContainText("第 2 界");
  await expect(expanded).toContainText("第 3 界");
});

test("three opened gates switch the observed world without changing the run", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  mkdirSync("test-results", { recursive: true });
  await startProgressedRun(page, { runCount: 2, worldsSaved: 2 });

  const before = await getSavedState(page);
  await page.locator('[data-stat="parallel"]').click();

  const dialog = page.getByRole("dialog", { name: "跨界航路" });
  await expect(dialog.locator('[data-gate-state="active"]')).toHaveCount(3);
  await expect(dialog.locator('[data-gate-state="locked"]')).toHaveCount(0);
  await expect(dialog).toContainText("三道界门已全部开启");
  await page.screenshot({ path: "test-results/world-gate-hub-2ae-390.png" });

  await dialog.locator('[data-action="scene-world"][data-world="zombie"]').click();
  await expect(page.locator(".stage-caption b")).toHaveText("废土救援");

  const after = await getSavedState(page);
  expect(JSON.stringify(after.run)).toBe(JSON.stringify(before.run));
});
