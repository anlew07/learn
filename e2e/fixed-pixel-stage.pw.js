import { test, expect } from "@playwright/test";

async function snapshot(page) {
  return page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
}

test("new players see a fixed pixel viewport", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  await expect(page.locator("[data-stage-canvas]")).toBeVisible();
  await expect(page.locator(".stage-bars")).toContainText("救援准备");
  await expect(page.locator(".stage-bars")).toContainText("危机压力");
  await expect(page.locator(".stage-actions [data-action=toggle]")).toContainText("继续模拟");

  const viewports = [
    [320, 568],
    [320, 640],
    [375, 667],
    [375, 812],
    [390, 844],
    [430, 932],
  ];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      stageHeight: document.querySelector("[data-game-stage]").getBoundingClientRect().height,
    }));
    expect(dimensions.width, "horizontal scroll " + width).toBeLessThanOrEqual(width + 1);
    expect(dimensions.height, "vertical overflow").toBeLessThanOrEqual(height + 1);
    expect(dimensions.stageHeight, "full-height HUD").toBeGreaterThan(400);
    await expect(page.locator('.stage-actions [data-panel="strategy"]')).toBeVisible();
    if (width === 320 && height === 568) {
      await page.screenshot({ path: "test-results/camp-ui/pixel-stage-320.png" });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/camp-ui/pixel-stage-390.png" });
});

test("world selection and drawers never advance the game", async ({ page }) => {
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

test("strategy command and reload return to pixel stage", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  await page.locator('[data-action="scene-panel"][data-panel="strategy"]').click();
  const strategy = page.locator('.stage-sheet-body select[data-action="strategy"]');
  await strategy.selectOption("clear");
  await expect.poll(async () => (await snapshot(page)).run.worlds[0].strategy).toBe("clear");
  await page.reload();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  await expect(page.locator("[data-stage-canvas]")).toBeVisible();
  expect((await snapshot(page)).run.worlds[0].strategy).toBe("clear");
});

test("decisions from another world appear without leaving the fixed scene", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  await expect.poll(async () => (await snapshot(page)).run?.worlds.length).toBe(2);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { default: Engine } = await import("/src/engine.js");
    const state = await saveRepository.load();
    state.run.worlds[1].build.pending = {
      due: state.run.day + 2,
      options: Engine.POWERS.zombie.slice(0, 3).map((power) => power.id),
    };
    await saveRepository.enqueueSave(state.run, state.profile);
  });
  await page.reload();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  await expect(page.locator(".stage-caption")).toContainText("灵灾");
  await expect(page.locator('.stage-worlds [data-world="zombie"]')).toContainText("!");
  await expect(page.locator('.stage-actions [data-panel="event"]')).toContainText("待处理 1");
  await page.locator('.stage-actions [data-panel="event"]').click();
  await expect(page.getByRole("dialog")).toContainText("废土救援 · 战技觉醒");
  await expect(page.locator("[data-game-stage]")).toBeVisible();
});

test("drawer keeps keyboard focus and scroll during strategy changes", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  const opener = page.locator('.stage-actions [data-panel="strategy"]');
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('.stage-sheet-head [data-action="scene-close"]')).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator('select[data-action="strategy"]')).toBeFocused();

  await page.addStyleTag({ content: ".stage-sheet-body { max-height: 120px !important; }" });
  const body = page.locator(".stage-sheet-body");
  await body.evaluate((node) => { node.scrollTop = 70; });
  expect(await body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  const strategy = dialog.locator('select[data-action="strategy"]');
  await strategy.selectOption("clear");
  await expect.poll(async () => (await snapshot(page)).run.worlds[0].strategy).toBe("clear");
  expect(await body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(strategy).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
