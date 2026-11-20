import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const folder = "test-results/camp-ui";
mkdirSync(folder, { recursive: true });

async function fingerTap(page, selector) {
  const rect = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  expect(rect, selector + " must exist").not.toBeNull();
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  expect(point.x).toBeGreaterThan(0);
  expect(point.y).toBeGreaterThan(0);
  expect(point.x).toBeLessThan(viewport.width);
  expect(point.y).toBeLessThan(viewport.height);
  expect(await page.evaluate(({ x, y, selector }) =>
    Boolean(document.elementFromPoint(x, y)?.closest(selector)),
  { ...point, selector })).toBe(true);
  await page.touchscreen.tap(point.x, point.y);
}

// prettier-ignore
for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test("2V battle prioritizes the canvas and keeps finger controls usable " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?mode=sortie&screen=camp");
    await fingerTap(page, "[data-start-sortie]");
    await expect(page.locator("[data-sortie-play]")).toBeVisible();
    await expect(page.locator(".sortie-head")).toBeHidden();
    await expect(page.locator("[data-sortie-time]")).toContainText("75");
    await expect(page.locator("[data-sortie-hp]")).toContainText("生命");
    await expect(page.locator("[data-sortie-loot]")).toContainText("碎片");
    await expect(page.locator("[data-sortie-play]")).toHaveAttribute("data-mission", "safe");
    await expect(page.locator(".sortie-goal")).toHaveCSS("position", "absolute");

    const boxes = await page.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom };
      };
      return {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        stats: rect(".sortie-stats"),
        timer: rect("[data-sortie-timebar]"),
        loot: rect(".sortie-lootbar"),
        field: rect(".sortie-field"),
        canvas: rect("[data-sortie-canvas]"),
        controls: rect(".sortie-controls"),
        joystick: rect("[data-sortie-joystick]"),
      };
    });
    expect(boxes.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(boxes.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(boxes.stats.bottom).toBeLessThanOrEqual(boxes.timer.y + 1);
    expect(boxes.timer.bottom).toBeLessThanOrEqual(boxes.loot.y + 1);
    expect(boxes.loot.bottom).toBeLessThanOrEqual(boxes.field.y + 1);
    expect(boxes.canvas.height).toBeGreaterThan(300);
    expect(boxes.controls.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(boxes.joystick.y).toBeGreaterThanOrEqual(0);
    await expect(page.locator("[data-sortie-joystick]")).toHaveCSS("touch-action", "none");
    await page.screenshot({ path: folder + "/sortie-2v-battle-" +
      viewport.width + "x" + viewport.height + ".png" });

    await fingerTap(page, "[data-sortie-pause]");
    await expect(page.locator("[data-sortie-paused]")).toBeVisible();
    await expect(page.locator("[data-sortie-pause]")).toHaveAttribute("aria-pressed", "true");
    await fingerTap(page, "[data-sortie-pause]");
    await expect(page.locator("[data-sortie-paused]")).toBeHidden();
    await fingerTap(page, "[data-sortie-retreat]");
    await expect(page.locator("[data-sortie-confirm]")).toBeVisible();
  });
}
