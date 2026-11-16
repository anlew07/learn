import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const captures = "test-results/camp-ui";
mkdirSync(captures, { recursive: true });

for (const width of [320, 375, 390, 430]) {
  test(`camp mission hierarchy and touch navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /守住营火/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "你需要做什么？" })).toBeVisible();
    await page.screenshot({
      path: `${captures}/home-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });

    await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
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
      };
    });
    expect(audit.documentWidth).toBeLessThanOrEqual(audit.viewportWidth + 1);
    expect(audit.smallTargets).toEqual([]);
    expect(audit.missionTop).toBeLessThan(audit.worldsTop);

    await page.screenshot({
      path: `${captures}/camp-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });

    await page.locator('button[data-tab="party"]').click();
    await expect(page.locator("[data-party-world]")).toHaveCount(2);
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
