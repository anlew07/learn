import { test, expect } from "@playwright/test";

async function snapshot(page) {
  return page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
}

test("new players see a fixed pixel game screen rather than an endlessly scrolling report", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  await expect(page.locator("[data-stage-canvas]")).toBeVisible();
  await expect(page.locator(".stage-bars")).toContainText("救援准备");
  await expect(page.locator(".stage-bars")).toContainText("危机压力");
  await expect(page.locator(".stage-actions [data-action=toggle]")).toContainText("继续模拟");

  for (const [width, height] of [[320, 568], [320, 640], [375, 667],
    [375, 812], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      stageHeight: document.querySelector("[data-game-stage]").getBoundingClientRect().height,
    }));
    expect(dimensions.width, "horizontal scroll " + width).toBeLessThanOrEqual(width + 1);
    expect(dimensions.height, "page scroll " + width + "x" + height).toBeLessThanOrEqual(height + 1);
    expect(dimensions.stageHeight, "full-height HUD").toBeGreaterThan(400);
    await expect(page.locator('.stage-actions button[data-action="scene-panel"][data-panel="strategy"]')).toBeVisible();
  }
});

test("world selection, action drawers and returning from full details do not advance days", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  const before = (await snapshot(page)).run;
  await page.locator('[data-action="scene-world"][data-world="zombie"]').click();
  await expect(page.locator(".stage-caption")).toContainText("废土救援");
  await page.locator('[data-action="scene-world"][data-world="lingzai"]').click();
  await page.locator('[data-action="scene-panel"][data-panel="strategy"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".stage-sheet-body")).toContainText("灵灾");
  await page.locator('[data-action="scene-close"]').last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator('[data-action="scene-panel"][data-panel="menu"]').click();
  await page.locator('[data-action="scene-classic"]').click();
  await expect(page.locator(".world-map")).toBeVisible();
  await page.locator('[data-action="scene-return"]').click();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  const after = (await snapshot(page)).run;
  expect(after.day).toBe(before.day);
  expect(after.ap).toBe(before.ap);
  expect(after.worlds).toEqual(before.worlds);
});

test("strategy still uses real engine command, and a saved game returns to pixel stage", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  await page.locator('[data-action="scene-panel"][data-panel="strategy"]').click();
  const strategy = page.locator('.stage-sheet-body select[data-action="strategy"][data-world="lingzai"]');
  await strategy.selectOption("clear");
  await expect.poll(async () => (await snapshot(page)).run.worlds[0].strategy).toBe("clear");
  await page.reload();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  await expect(page.locator("[data-stage-canvas]")).toBeVisible();
  expect((await snapshot(page)).run.worlds[0].strategy).toBe("clear");
});
