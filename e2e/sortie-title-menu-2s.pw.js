import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

mkdirSync("test-results/camp-ui", { recursive: true });

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
];

// Real-coordinate touches, with hit testing; no DOM click or programmatic scroll.
// prettier-ignore
async function fingerTap(page, selector) {
  const rect = await page.locator(selector).boundingBox();
  expect(rect, selector + " must render").not.toBeNull();
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const size = page.viewportSize();
  expect(point.x).toBeGreaterThan(0);
  expect(point.y).toBeGreaterThan(0);
  expect(point.x).toBeLessThan(size.width);
  expect(point.y).toBeLessThan(size.height);
  expect(await page.evaluate(({ x, y, selector }) => Boolean(
    document.elementFromPoint(x, y)?.closest(selector)
  ), { ...point, selector })).toBe(true);
  await page.touchscreen.tap(point.x, point.y);
}

// prettier-ignore
for (const viewport of viewports) {
  test("2S title menu is a real first screen " + viewport.width + "x" + viewport.height,
    async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/?mode=sortie");
      const menu = page.locator("[data-sortie-title-screen]");
      const camp = page.locator("[data-sortie-intro]");
      const play = page.locator("[data-sortie-play]");
      const start = page.locator("[data-sortie-menu-enter]");
      await expect(menu).toBeVisible();
      await expect(camp).toBeHidden();
      await expect(play).toBeHidden();
      await expect(page.getByRole("heading", { name: "同时穿越" })).toBeVisible();
      await expect(start).toHaveText("开始冒险");
      await expect(start).toBeEnabled();
      await expect(page.locator("[data-sortie-menu-help]")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth -
        window.innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: "test-results/camp-ui/sortie-title-2s-" +
        viewport.width + "x" + viewport.height + ".png" });
      await fingerTap(page, "[data-sortie-menu-help]");
      await expect(page.getByRole("dialog", { name: "如何开始" })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "如何开始" }))
        .toContainText("25 秒时暂停选择战技");
      await fingerTap(page, "[data-sortie-menu-help-close]");
      await expect(page.locator("[data-sortie-menu-help-dialog]")).toBeHidden();
      await fingerTap(page, "[data-sortie-menu-enter]");
      await expect(menu).toBeHidden();
      await expect(camp).toBeVisible();
      await expect(page.locator("[data-sortie-camp]")).toContainText("第 1 日");
      await expect(page.locator("[data-sortie-mission-safe]")).toBeVisible();
      const stored = await page.evaluate(async () => {
        const { sortieRepository } = await import("/src/services/sortie-persistence.js");
        const { saveRepository } = await import("/src/services/persistence.js");
        return { prototype: await sortieRepository.load(), official: await saveRepository.load() };
      });
      expect(stored.prototype).toBeNull();
      expect(stored.official.run).toBeNull();
      expect(stored.official.profile).toBeNull();
      await fingerTap(page, "[data-sortie-menu-return]");
      await expect(menu).toBeVisible();
      await expect(camp).toBeHidden();
    });
}

test("2S direct-camp entry remains available to authoritative gameplay tests",
  async ({ page }) => {
    await page.goto("/?mode=sortie&screen=camp");
    await expect(page.locator("[data-sortie-title-screen]")).toBeHidden();
    await expect(page.locator("[data-sortie-intro]")).toBeVisible();
    await expect(page.locator("[data-start-sortie]")).toBeEnabled();
  });
