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

test("joystick pointer drag moves the hero and releases without drift", async ({ page }) => {
  await page.goto("/?mode=sortie");
  await page.locator("[data-start-sortie]").click();
  const joystick = page.locator("[data-sortie-joystick]");
  const canvas = page.locator("[data-sortie-canvas]");
  const bounds = await joystick.boundingBox();
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 36, centerY, { steps: 4 });
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-hero-x")))
    .toBeGreaterThan(160);
  await page.mouse.up();
  const stopped = await canvas.getAttribute("data-hero-x");
  await page.waitForTimeout(150);
  expect(await canvas.getAttribute("data-hero-x")).toBe(stopped);
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
test("the 25-second skill choice freezes time and resumes with a real choice", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-17T00:00:00Z") });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?mode=sortie");
  await page.locator("[data-start-sortie]").click();
  await page.clock.runFor(25_700);
  const choice = page.getByRole("dialog", { name: "战技觉醒 · 选择一项" });
  await expect(choice).toBeVisible();
  await expect(choice.locator('[data-sortie-skill="thunder"]')).toBeVisible();
  await expect(choice.locator('[data-sortie-skill="rune"]')).toBeVisible();
  const dims = await choice.boundingBox();
  expect(dims.y).toBeGreaterThanOrEqual(0);
  expect(dims.y + dims.height).toBeLessThanOrEqual(568);
  const canvas = page.locator("[data-sortie-canvas]");
  const frozen = await canvas.getAttribute("data-ticks");
  expect(Number(frozen)).toBe(1500);
  await page.clock.runFor(2_000);
  expect(await canvas.getAttribute("data-ticks")).toBe(frozen);
  await choice.locator('[data-sortie-skill="rune"]').click();
  await expect(choice).toBeHidden();
  await expect(page.locator("[data-sortie-power]")).toContainText("聚灵阵纹");
  await page.clock.runFor(400);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-ticks")))
    .toBeGreaterThan(Number(frozen));
});

test("retreat confirmation shows sandbox-only loss rules without touching saves", async ({
  page,
}) => {
  await page.goto("/?mode=sortie");
  await page.locator("[data-start-sortie]").click();
  await page.locator("[data-sortie-retreat]").click();
  const confirm = page.getByRole("dialog", { name: "确定撤离雾谷？" });
  await expect(confirm).toBeVisible();
  await confirm.locator("[data-sortie-confirm-no]").click();
  await expect(confirm).toBeHidden();
  await expect(page.locator("[data-sortie-play]")).toBeVisible();
  await page.locator("[data-sortie-retreat]").click();
  await confirm.locator("[data-sortie-confirm-yes]").click();
  await expect(page.locator("[data-sortie-results]")).toBeVisible();
  await expect(page.locator("[data-sortie-results]")).toHaveAttribute("data-result", "retreated");
  await expect(page.locator("[data-sortie-reward-preview]")).toContainText("生存 0");
  await expect(page.locator("[data-sortie-reward-preview]")).toContainText("经验 +0");
  await page.reload();
  await expect(page.locator("[data-sortie-intro]")).toBeVisible();
  const saved = await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
  expect(saved.run).toBeNull();
  expect(saved.profile).toBeNull();
});

