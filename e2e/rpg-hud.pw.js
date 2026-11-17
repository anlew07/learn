import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("RPG HUD keeps the scene dominant and the primary action reachable", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  const stage = page.locator("[data-game-stage]");
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute("data-stage-phase", "stable");

  mkdirSync("test-results/camp-ui", { recursive: true });
  for (const [width, height] of [
    [320, 568],
    [375, 812],
    [390, 844],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    const metrics = await page.evaluate(() => {
      const bounds = (selector) =>
        document.querySelector(selector)?.getBoundingClientRect().toJSON();
      const menuButtons = [...document.querySelectorAll(".stage-nav-action")];
      return {
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        scene: bounds(".stage-window"),
        play: bounds(".stage-play-button"),
        nav: menuButtons.map((button) => button.getBoundingClientRect().toJSON()),
        action: bounds(".stage-action-line"),
        caption: bounds(".stage-caption"),
        status: bounds(".stage-scene-status"),
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(width + 1);
    expect(metrics.documentHeight).toBeLessThanOrEqual(height + 1);
    expect(metrics.scene.height).toBeGreaterThan(180);
    expect(metrics.play.width).toBeGreaterThan(100);
    expect(metrics.play.height).toBeGreaterThanOrEqual(42);
    expect(metrics.nav).toHaveLength(5);
    for (const button of metrics.nav) {
      expect(button.width).toBeGreaterThan(43);
      expect(button.height).toBeGreaterThanOrEqual(42);
    }
    expect(metrics.action.bottom).toBeLessThanOrEqual(metrics.scene.bottom);
    expect(metrics.caption.right).toBeLessThanOrEqual(metrics.status.left + 3);
    if (width === 320 || width === 390) {
      await page.screenshot({
        path: `test-results/camp-ui/rpg-hud-${width}.png`,
      });
    }
  }
});

test("RPG game controls preserve existing actions and world-scene ownership", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  await expect(page.locator(".stage-worlds .stage-world-thumb").first()).toBeVisible();
  await expect(page.locator(".stage-worlds .stage-world-risk").first()).toBeVisible();
  await expect(page.locator(".stage-bars .stage-meter")).toHaveCount(2);

  await page.locator('.stage-worlds [data-action="scene-world"][data-world="zombie"]').click();
  await expect(page.locator(".stage-caption")).toContainText("废土救援");
  await expect(page.locator(".stage-game")).toHaveAttribute("data-stage-phase", "stable");

  await page.locator('.stage-actions [data-action="toggle"]').click();
  await expect(page.locator('.stage-actions [data-action="toggle"]')).toContainText("暂停模拟");
  await page.locator('.stage-actions [data-action="toggle"]').click();
  await expect(page.locator('.stage-actions [data-action="toggle"]')).toContainText("继续模拟");

  await page.locator('.stage-actions [data-panel="strategy"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("世界档案与策略");
  await page.locator('.stage-sheet-head [data-action="scene-close"]').click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator('.stage-actions [data-panel="event"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
