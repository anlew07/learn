import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const folder = "test-results/camp-ui";
mkdirSync(folder, { recursive: true });

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

// Coordinate-aware real finger checks, deliberately kept in one readable block.
// prettier-ignore
async function tapInViewport(page, selector) {
  const box = await page.locator(selector).boundingBox();
  expect(box, selector + " must have a hitbox").not.toBeNull();
  const viewport = page.viewportSize();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  expect(x).toBeGreaterThanOrEqual(0);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(x).toBeLessThanOrEqual(viewport.width);
  expect(y).toBeLessThanOrEqual(viewport.height);
  expect(
    await page.evaluate(
      ({ x, y, selector }) =>
        Boolean(document.elementFromPoint(x, y)?.closest(selector)),
      { x, y, selector },
    ),
  ).toBe(true);
  await page.touchscreen.tap(x, y);
}

// prettier-ignore
for (const viewport of viewports) {
  test(
    `compact camp keeps the real choice and fixed sortie action touchable ${viewport.width}x${viewport.height}`,
    async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/?mode=sortie&screen=camp");

      await expect(page.locator("[data-sortie-camp]")).toContainText("第 1 日");
      await expect(page.locator("[data-sortie-stones]")).toHaveText("4");
      await expect(page.locator("[data-sortie-last-stones]")).toHaveText("—");
      await expect(page.locator("[data-sortie-last-shards]")).toHaveText("—");
      await expect(page.locator("[data-sortie-mission-salvage]")).toBeEnabled();
      await expect(page.locator("[data-sortie-forge-preview]")).toContainText(
        "投入 6 灵石",
      );
      await expect(page.locator("[data-sortie-camp-report]")).not.toHaveAttribute(
        "open",
      );
      await expect(page.locator("[data-sortie-camp-more]")).not.toHaveAttribute(
        "open",
      );
      await expect(page.locator("[data-sortie-budget]")).toBeHidden();

      const safe = await page.locator("[data-sortie-mission-safe]").boundingBox();
      const risky = await page
        .locator("[data-sortie-mission-salvage]")
        .boundingBox();
      expect(safe.x + safe.width).toBeLessThanOrEqual(risky.x + 2);
      await page.screenshot({
        path: `${folder}/sortie-2t-compact-camp-${viewport.width}x${viewport.height}.png`,
      });

      await tapInViewport(page, "[data-sortie-camp-report] > summary");
      await expect(page.locator("[data-sortie-camp-report]")).toHaveAttribute(
        "open",
        "",
      );
      await tapInViewport(page, "[data-sortie-camp-report] > summary");
      await tapInViewport(page, "[data-sortie-mission-salvage]");
      await expect
        .poll(async () =>
          page.evaluate(async () => {
            const { sortieRepository } = await import(
              "/src/services/sortie-persistence.js"
            );
            return (
              await sortieRepository.load()
            )?.run?.sortieCamp?.missionSelection?.missionId;
          }),
        )
        .toBe("salvage");
      await expect(page.locator("[data-sortie-mission-safe]")).toBeDisabled();
      await expect(page.locator("[data-start-sortie]")).toContainText(
        "险地回收",
      );
      await tapInViewport(page, "[data-start-sortie]");
      await expect(page.locator("[data-sortie-play]")).toBeVisible();
      await page.screenshot({
        path: `${folder}/sortie-2t-camp-to-battle-${viewport.width}x${viewport.height}.png`,
      });
    },
  );
}
