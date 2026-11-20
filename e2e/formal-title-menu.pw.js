import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const folder = "test-results/camp-ui";
mkdirSync(folder, { recursive: true });

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
];

async function tapVisible(page, selector) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

for (const viewport of viewports) {
  test("formal title menu keeps primary actions in view " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("[data-formal-title]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "同时穿越" })).toBeVisible();
    await expect(page.locator('[data-action="new-run"][data-onboarding="focus"]'))
      .toBeVisible();
    await expect(page.locator('[data-action="new-run"][data-onboarding="full"]'))
      .toBeVisible();
    await expect(page.locator('[data-formal-title] [data-action="open-help"]'))
      .toBeVisible();
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: folder + "/formal-title-" + viewport.width + "x" + viewport.height + ".png",
    });
    await tapVisible(page, '[data-formal-title-primary]');
    await expect(page.locator("[data-game-stage]")).toBeVisible();
  });
}

test("formal title help and settings do not start or overwrite the run", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("[data-formal-title]")).toBeVisible();
  await tapVisible(page, '[data-formal-title] [data-action="open-help"]');
  await expect(page.locator(".support-page")).toBeVisible();
  await page.locator('[data-action="support-back"]').click();
  await expect(page.locator("[data-formal-title]")).toBeVisible();
  await tapVisible(page, '[data-formal-title] [data-action="open-settings"]');
  await expect(page.locator(".support-page")).toBeVisible();
  const state = await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
  expect(state.run).toBeNull();
});
