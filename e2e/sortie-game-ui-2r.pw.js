import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";

const folder = "test-results/camp-ui";
mkdirSync(folder, { recursive: true });

// Group the three viewport touch assertions for one screenshot gate.
// prettier-ignore
for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test("2R game-first camp keeps both route cards and the battle action readable " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?mode=sortie");
    const scene = page.locator(".sortie-intro h1");
    const routes = page.locator(".sortie-2l-missions");
    const launch = page.locator("[data-start-sortie]");
    await expect(scene).toBeVisible();
    await expect(routes).toBeVisible();
    await expect(launch).toBeVisible();
    await expect(scene).toHaveCSS("image-rendering", "pixelated");
    const art = await scene.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(art).toContain("clone-cultivator");
    expect(art).toContain("world-lingzai");
    const sceneBox = await scene.boundingBox();
    const routesBox = await routes.boundingBox();
    const launchBox = await launch.boundingBox();
    expect(routesBox.y).toBeGreaterThan(sceneBox.y);
    expect(launchBox.y).toBeGreaterThan(routesBox.y);
    const left = await page.locator("[data-sortie-mission-safe]").boundingBox();
    const right = await page.locator("[data-sortie-mission-salvage]").boundingBox();
    expect(left.x + left.width).toBeLessThanOrEqual(right.x + 1);
    expect(left.width).toBeGreaterThan(80);
    expect(right.width).toBeGreaterThan(80);
    const horizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    const launchCenter = {
      x: launchBox.x + launchBox.width / 2,
      y: launchBox.y + launchBox.height / 2,
    };
    expect(launchCenter.y).toBeLessThan(viewport.height);
    expect(await page.evaluate(({ x, y }) => Boolean(
      document.elementFromPoint(x, y)?.closest("[data-start-sortie]")
    ), launchCenter)).toBe(true);
    await page.screenshot({ path: folder + "/sortie-2r-game-camp-" +
      viewport.width + "x" + viewport.height + ".png" });
    await page.touchscreen.tap(launchCenter.x, launchCenter.y);
    await expect(page.locator("[data-sortie-play]")).toBeVisible();
    await page.screenshot({ path: folder + "/sortie-2r-game-battle-" +
      viewport.width + "x" + viewport.height + ".png" });
  });
}
