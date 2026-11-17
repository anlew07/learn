import { test, expect } from "@playwright/test";

test("isolated sortie opens with a clear action and fits mobile viewports", async ({ page }) => {
  await page.goto("/?mode=sortie");
  await expect(page.getByRole("heading", { name: "出击雾谷" })).toBeVisible();
  await expect(page.getByText("本模式不读取或修改正式存档", { exact: false })).toBeVisible();

  await page.locator("[data-start-sortie]").click();
  await expect(page.locator("[data-sortie-canvas]")).toBeVisible();
  await expect(page.locator("[data-sortie-hp]")).toContainText("生命 8/8");

  const viewports = [
    [320, 568],
    [390, 844],
    [430, 932],
  ];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    const dims = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      canvas: document.querySelector("[data-sortie-canvas]").getBoundingClientRect().height,
    }));
    expect(dims.width).toBeLessThanOrEqual(width + 1);
    expect(dims.height).toBeLessThanOrEqual(height + 1);
    expect(dims.canvas).toBeGreaterThan(250);
  }
});

test("keyboard movement, pause and resume operate on battle ticks", async ({ page }) => {
  await page.goto("/?mode=sortie");
  await page.locator("[data-start-sortie]").click();
  const canvas = page.locator("[data-sortie-canvas]");
  const before = Number(await canvas.getAttribute("data-hero-x"));
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-hero-x")))
    .toBeGreaterThan(before);
  await page.keyboard.up("ArrowRight");

  await page.locator("[data-sortie-pause]").click();
  await expect(page.locator("[data-sortie-pause]")).toHaveText("继续试炼");
  const frozen = await canvas.getAttribute("data-ticks");
  await page.waitForTimeout(150);
  expect(await canvas.getAttribute("data-ticks")).toBe(frozen);
  await page.locator("[data-sortie-pause]").click();
  await expect(page.locator("[data-sortie-pause]")).toHaveText("暂停");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-ticks")))
    .toBeGreaterThan(Number(frozen));
});

test("refreshing a prototype does not use the formal save", async ({ page }) => {
  await page.goto("/?mode=sortie");
  await page.locator("[data-start-sortie]").click();
  await page.reload();
  await expect(page.locator("[data-sortie-intro]")).toBeVisible();
  await expect(page.locator("[data-sortie-play]")).toBeHidden();
  const existing = await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
  expect(existing.run).toBeNull();
  expect(existing.profile).toBeNull();
});
