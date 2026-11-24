import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("help works before creating a save and returns to first-session entry", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.locator('[data-action="open-help"]').click();
  await expect(page.locator('[data-support-page="help"]')).toBeVisible();
  await expect(page.locator('[data-support-page="help"]')).toContainText("P100");
  await expect(page.locator('[data-support-page="help"]')).toContainText("新档首局只有灵灾一个世界");
  await expect(page.locator('[data-support-page="help"]')).toContainText("最多同时守护三个世界");
  await page.locator('[data-action="support-back"]').first().click();
  await expect(page.locator("[data-formal-title]")).toBeVisible();
  await expect(page.locator('[data-action="new-run"][data-onboarding="focus"]')).toBeVisible();
});

test("settings uses actual persistent text-size preference and returns to the same game", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator('[data-action="open-settings"]').click();
  await expect(page.locator('[data-support-page="settings"]')).toBeVisible();
  await page.locator('[data-action="text-size"][data-value="large"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  await expect(page.locator('[data-value="large"]')).toHaveAttribute("aria-pressed", "true");
  const savedPreference = await page.evaluate(() => localStorage.getItem("learn:text-size"));
  expect(savedPreference).toBe("large");
  mkdirSync("test-results/camp-ui", { recursive: true });
  await page.screenshot({ path: "test-results/camp-ui/settings-390.png" });
  await page.locator('[data-action="support-back"]').first().click();
  await page.locator('[data-action="new-run"][data-onboarding="focus"]').click();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  const originalDay = await page.locator(".stage-day").textContent();

  await page.locator('[data-action="scene-panel"][data-panel="menu"]').click();
  await page.locator('[data-action="open-settings"]').click();
  await expect(page.locator('[data-support-page="settings"]')).toBeVisible();
  await page.locator('[data-action="open-help"]').click();
  await expect(page.locator('[data-support-page="help"]')).toBeVisible();
  await page.locator('[data-action="support-back"]').first().click();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  await expect(page.locator(".stage-day")).toHaveText(originalDay);
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");

  await page.locator('[data-action="scene-panel"][data-panel="menu"]').click();
  await page.locator('[data-action="home"]').click();
  await expect(page.locator("[data-formal-title]")).toBeVisible();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  await expect(page.locator(".stage-day")).toHaveText(originalDay);
  await page.reload();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
});

test("large text does not introduce main HUD scroll at the narrowest viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.locator('[data-action="open-settings"]').click();
  await page.locator('[data-action="text-size"][data-value="large"]').click();
  await page.locator('[data-action="support-back"]').first().click();
  await page.locator('[data-action="new-run"][data-onboarding="focus"]').click();
  const result = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    docHeight: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  }));
  expect(result.docWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.docHeight).toBeLessThanOrEqual(result.viewportHeight + 1);
  await expect(page.locator('.stage-actions [data-panel="strategy"]')).toBeVisible();
});
