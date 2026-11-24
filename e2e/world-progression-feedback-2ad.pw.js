import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { getSavedState, startFirstRun, startProgressedRun } from "./helpers/run-fixtures.js";

async function resolveWorldThroughEngine(page, worldId) {
  mkdirSync("test-results", { recursive: true });
  await page.evaluate(async (id) => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { default: Engine } = await import("/src/engine.js");
    const saved = await saveRepository.load();
    const world = saved.run.worlds.find((item) => item.id === id && item.status === "running");
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

test("first rescue visibly expands one active world into two", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startFirstRun(page);
  await resolveWorldThroughEngine(page, "lingzai");

  const receipt = page.locator("[data-world-progression]");
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("灵灾获救");
  await expect(receipt).toContainText("新界 +2");
  await expect(receipt).toContainText("并行 2/3");
  await expect(page.locator('[data-stat="parallel"]')).toContainText("2/3");
  await expect(page.locator(".stage-worlds [data-world]")).toHaveCount(2);

  const saved = await getSavedState(page);
  expect(saved.run.worldSlots).toBe(2);
  expect(saved.run.worldsSavedThisRun).toBe(1);
  expect(saved.run.worlds.filter((world) => world.status === "running")).toHaveLength(2);

  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(321);
  expect(dimensions.height).toBeLessThanOrEqual(569);
  await page.screenshot({ path: "test-results/world-progression-2ad-320.png" });

  await page.locator('[data-action="scene-panel"][data-panel="guide"]').click();
  const guide = page.getByRole("dialog", { name: "生存手册" });
  await guide.locator(".guide-reference summary").click();
  await expect(guide).toContainText("第一次救援：世界名额会成长");
  await expect(guide).toContainText("下一次成功救援将继续解锁并行名额");
});

test("at the three-world cap, rescue feedback explains slot replacement", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startProgressedRun(page, { runCount: 2, worldsSaved: 2 });
  await resolveWorldThroughEngine(page, "lingzai");

  const receipt = page.locator("[data-world-progression]");
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("灵灾获救");
  await expect(receipt).toContainText("新界 +1");
  await expect(receipt).toContainText("并行 3/3");
  await expect(receipt).toHaveAttribute("aria-label", /后续救援只替换获救槽位/);
  await page.screenshot({ path: "test-results/world-progression-2ad-390.png" });

  const saved = await getSavedState(page);
  expect(saved.run.worldSlots).toBe(3);
  expect(saved.run.worldsSavedThisRun).toBe(1);
  expect(saved.run.worlds.filter((world) => world.status === "running")).toHaveLength(3);
  expect(saved.run.worlds.find((world) => world.worldNumber === 2).status).toBe("running");
  expect(saved.run.worlds.find((world) => world.worldNumber === 3).status).toBe("running");
});
