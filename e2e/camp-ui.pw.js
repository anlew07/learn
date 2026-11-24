import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startProgressedRun } from "./helpers/run-fixtures.js";

const captures = "test-results/camp-ui";
mkdirSync(captures, { recursive: true });

for (const width of [320, 375, 390, 430]) {
  test(`camp mission hierarchy and touch navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator("[data-formal-title]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "同时穿越" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "你的第一段冒险" })).toBeVisible();
    await page.screenshot({
      path: `${captures}/home-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });

    await startProgressedRun(page, { runCount: 1, worldsSaved: 1 });
    await page.locator('[data-action="scene-panel"][data-panel="menu"]').click();
    await page.locator('[data-action="scene-classic"]').click();
    await expect(page.locator("[data-rescue-board]")).toBeVisible();
    await expect(page.locator("[data-decision-board]")).toBeVisible();
    await expect(page.locator("[data-world-overview]")).toHaveCount(2);
    await expect(page.locator(".world-fold").first()).not.toHaveAttribute("open", "");
    await expect(page.locator('nav[aria-label="主要导航"] button')).toHaveCount(4);
    await expect(page.locator(".mission-line")).toContainText("分身自动");
    await expect(page.locator(".camp-alert")).toContainText("暂无紧急危机");
    await expect(page.locator(".no-decisions")).toContainText("无需每天手动操作");

    const audit = await page.evaluate(() => {
      const targets = [...document.querySelectorAll("button, select, summary")].filter((node) => {
        const style = getComputedStyle(node);
        return node.getClientRects().length > 0 && style.visibility !== "hidden";
      });
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        smallTargets: targets
          .filter((node) => node.getBoundingClientRect().height < 43.5)
          .map((node) => node.outerHTML.slice(0, 120)),
        missionTop: document.querySelector("[data-rescue-board]").getBoundingClientRect().top,
        worldsTop: document.querySelector(".world-map").getBoundingClientRect().top,
        navRows: [...document.querySelectorAll(".footer-nav button")].map((node) =>
          Math.round(node.getBoundingClientRect().top),
        ),
      };
    });
    expect(audit.documentWidth).toBeLessThanOrEqual(audit.viewportWidth + 1);
    expect(audit.smallTargets).toEqual([]);
    expect(audit.missionTop).toBeLessThan(audit.worldsTop);
    expect(new Set(audit.navRows).size).toBe(1);

    await page.screenshot({
      path: `${captures}/camp-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });

    await page.locator('button[data-tab="party"]').click();
    await expect(page.locator("[data-party-world]")).toHaveCount(2);
    await expect(page.locator(".run-dashboard")).toHaveClass(/run-dashboard-compact/);
    await expect(page.locator(".run-dashboard .metrics")).toBeHidden();
    expect((await page.locator("[data-party-world]").first().boundingBox()).y).toBeLessThan(600);
    if (width === 390) {
      await page.screenshot({
        path: captures + "/party-390.png",
        fullPage: true,
        animations: "disabled",
      });
    }

    await page.locator('button[data-tab="soul"]').click();
    await expect(page.locator("#aid-from")).toBeVisible();
    await page.locator('button[data-tab="log"]').click();
    await expect(page.getByRole("heading", { name: "世界战报" })).toBeVisible();
    if (width === 390) {
      await page.screenshot({
        path: captures + "/archive-390.png",
        fullPage: true,
        animations: "disabled",
      });
    }

    await page.locator('button[data-tab="world"]').click();
    await page.locator(".world-fold summary").first().click();
    await expect(page.locator(".world-fold").first()).toHaveAttribute("open", "");
    await expect(page.locator('.world [data-action="strategy"]').first()).toBeVisible();
  });
}
