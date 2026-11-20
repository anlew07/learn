import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const folder = "test-results/camp-ui";
mkdirSync(folder, { recursive: true });

// Coordinates are checked against the actual painted surface. Gameplay is
// touched with a real finger, never with locator.click() or auto-scrolling.
// prettier-ignore
async function tapVisible(page, selector) {
  const rect = await page.locator(selector).boundingBox();
  const size = page.viewportSize();
  expect(rect, selector + " needs a hit area").not.toBeNull();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  expect(x).toBeGreaterThan(0);
  expect(y).toBeGreaterThan(0);
  expect(x).toBeLessThan(size.width);
  expect(y).toBeLessThan(size.height);
  expect(await page.evaluate(({ x, y, selector }) =>
    Boolean(document.elementFromPoint(x, y)?.closest(selector)),
    { x, y, selector })).toBe(true);
  await page.touchscreen.tap(x, y);
}

// prettier-ignore
for (const size of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test("2U compact settlement shows real saved rewards and touchable return " +
    size.width + "x" + size.height, async ({ page }) => {
    test.setTimeout(55_000);
    await page.setViewportSize(size);
    await page.goto("/?mode=sortie&screen=camp");
    await expect(page.locator("[data-start-sortie]")).toBeEnabled();
    await tapVisible(page, "[data-start-sortie]");
    await expect(page.locator("[data-sortie-play]")).toBeVisible();
    await page.waitForTimeout(650);
    await tapVisible(page, "[data-sortie-retreat]");
    await expect(page.locator("[data-sortie-confirm]")).toBeVisible();
    await tapVisible(page, "[data-sortie-confirm-yes]");
    const results = page.locator("[data-sortie-results]");
    await expect(results).toBeVisible();
    await expect(results).toHaveAttribute("data-result", "retreated");
    await expect(page.locator("[data-sortie-settlement-status]"))
      .toHaveAttribute("data-state", "saved");
    await expect(page.locator("[data-sortie-reward-preview]"))
      .toContainText("生存 0");
    await expect(page.locator("[data-sortie-gains] > div")).toHaveCount(4);
    await expect(page.locator("[data-sortie-world-glance]")).toBeVisible();
    await expect(page.locator("[data-sortie-world-glance] > span")).toHaveCount(2);
    await expect(page.locator("[data-sortie-world-glance]")).toContainText("第 2 日");
    await expect(page.locator("[data-sortie-world-report]"))
      .toHaveAttribute("data-day", "2");
    await expect(page.locator("[data-sortie-result-details]"))
      .not.toHaveAttribute("open");
    await expect(page.locator("[data-sortie-reward-preview]")).toBeHidden();
    await expect(page.locator("[data-sortie-retry]")).toBeEnabled();
    await page.screenshot({
      path: folder + "/sortie-2u-results-" + size.width + "x" + size.height + ".png",
      animations: "disabled",
    });
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await tapVisible(page, "[data-sortie-retry]");
    await expect(page.locator("[data-sortie-intro]")).toBeVisible();
    await expect(page.locator("[data-sortie-camp]")).toContainText("第 2 日");
    await page.reload();
    await expect(page.locator("[data-sortie-camp]")).toContainText("第 2 日");
    const saved = await page.evaluate(async () => {
      const { sortieRepository } = await import("/src/services/sortie-persistence.js");
      const { saveRepository } = await import("/src/services/persistence.js");
      const [prototype, formal] = await Promise.all([
        sortieRepository.load(), saveRepository.load(),
      ]);
      return {
        day: prototype.run.day,
        lastReceiptDay: prototype.lastReceipt.day,
        formalRun: formal.run,
        formalProfile: formal.profile,
      };
    });
    expect(saved.day).toBe(2);
    expect(saved.lastReceiptDay).toBe(1);
    expect(saved.formalRun).toBeNull();
    expect(saved.formalProfile).toBeNull();
  });
}
