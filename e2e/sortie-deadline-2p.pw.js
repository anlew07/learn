import { expect, test } from "@playwright/test";

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

// The test drives real touchscreen events and the same 60Hz battle clock.
// DOM inspection is only for assertions; no fake battle state or DOM clicks.
// prettier-ignore
async function tapVisibleFinger(page, selector) {
  const rect = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  expect(rect).not.toBeNull();
  expect(viewport).not.toBeNull();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  expect(x).toBeGreaterThanOrEqual(0);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(x).toBeLessThan(viewport.width);
  expect(y).toBeLessThan(viewport.height);
  expect(await page.evaluate(({ x, y, selector }) =>
    Boolean(document.elementFromPoint(x, y)?.closest(selector)),
  { x, y, selector })).toBe(true);
  await page.touchscreen.tap(x, y);
}

// Test-only input route: a real held thumb follows a square escape pattern.
// No page scrolling, locator.click(), or direct mutation of the battle model.
// prettier-ignore
async function thumbRoute(page, segments) {
  const rect = await page.locator("[data-sortie-joystick]").boundingBox();
  expect(rect).not.toBeNull();
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const offset = rect.width * 0.38;
  const vectors = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ ...center, id: 19 }],
    });
    for (let i = 0; i < segments; i++) {
      if (await page.locator("[data-sortie-choice]").isVisible() ||
        await page.locator("[data-sortie-results]").isVisible()) break;
      const vector = vectors[i % vectors.length];
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{
          x: center.x + vector[0] * offset,
          y: center.y + vector[1] * offset, id: 19,
        }],
      });
      await page.clock.runFor(5_000);
    }
  } finally {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd", touchPoints: [],
    });
    await client.detach();
  }
}

// Use the REAL mission-selection command, not a counterfeit saved mission
// or a fabricated entitlement; existing 2L-C tests cover its finger UI.
// prettier-ignore
async function seedSelectedSalvage(page) {
  await page.evaluate(async () => {
    const { sortieRepository } = await import("/src/services/sortie-persistence.js");
    const { createSortieArchive, selectSortieCampMission } =
      await import("/src/systems/sortie-session.js");
    const archive = createSortieArchive("2l-c-guard-touch-430");
    const selected = selectSortieCampMission(archive, "salvage", "2p:deadline:mission");
    if (!selected.ok) throw new Error("2P could not select real salvage mission");
    await sortieRepository.enqueueSave(selected.archive);
  });
  await page.reload();
  await expect(page.locator("[data-sortie-mission-salvage]"))
    .toContainText("已选险地回收");
}

// prettier-ignore
async function assertHudFits(page) {
  const viewport = page.viewportSize();
  for (const selector of [
    "[data-sortie-time]", "[data-sortie-deadline]",
    "[data-sortie-canvas]", "[data-sortie-joystick]",
  ]) {
    const bounds = await page.locator(selector).boundingBox();
    expect(bounds, selector).not.toBeNull();
    expect(bounds.y, selector).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height, selector).toBeLessThanOrEqual(viewport.height + 1);
  }
  const canvas = await page.locator("[data-sortie-canvas]").boundingBox();
  expect(canvas.height).toBeGreaterThan(170);
}

for (const viewport of viewports) {
  // prettier-ignore
  test("2P salvage deadline is distinct, freezes at skill choice and expires " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    test.setTimeout(150_000);
    await page.clock.install({ time: new Date("2026-11-19T00:00:00Z") });
    await page.setViewportSize(viewport);
    await page.goto("/?mode=sortie&screen=camp");
    await seedSelectedSalvage(page);
    await tapVisibleFinger(page, "[data-start-sortie]");
    const timer = page.locator("[data-sortie-deadline-timer]");
    const panel = page.locator("[data-sortie-deadline]");
    const canvas = page.locator("[data-sortie-canvas]");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-phase", "waiting");
    await expect(timer).toHaveAttribute("role", "timer");
    await expect(timer).toHaveAttribute("aria-live", "off");
    await expect(timer).toHaveAttribute("data-seconds", "65");
    await expect(page.locator("[data-sortie-time]")).toContainText("75");
    await assertHudFits(page);

    await thumbRoute(page, 2);
    await page.clock.runFor(700);
    await expect(panel).toHaveAttribute("data-phase", "available");
    await expect(timer).toContainText("回收截止剩余");
    await expect.poll(async () => Number(await timer.getAttribute("data-seconds")))
      .toBeLessThanOrEqual(55);
    await thumbRoute(page, 3);
    await page.clock.runFor(700);
    await expect(page.locator("[data-sortie-choice]")).toBeVisible();
    await expect(page.locator("[data-sortie-choice-state]")).toContainText("时间已冻结");
    const ticksBefore = await canvas.getAttribute("data-ticks");
    const secondsBefore = await timer.getAttribute("data-seconds");
    const timeBefore = await page.locator("[data-sortie-time]").textContent();
    await page.clock.runFor(2_300);
    expect(await canvas.getAttribute("data-ticks")).toBe(ticksBefore);
    expect(await timer.getAttribute("data-seconds")).toBe(secondsBefore);
    expect(await page.locator("[data-sortie-time]").textContent()).toBe(timeBefore);
    await tapVisibleFinger(page, '[data-sortie-skill="rune"]');
    await expect(page.locator("[data-sortie-choice]")).toBeHidden();
    await thumbRoute(page, 6);
    await page.clock.runFor(1_200);
    await expect(panel).toHaveAttribute("data-phase", "urgent");
    await expect(timer).toContainText("回收仅剩");
    expect(Number(await timer.getAttribute("data-seconds"))).toBeLessThanOrEqual(10);
    await expect(page.locator("[data-sortie-deadline-alert]"))
      .toContainText("回收点即将失效");
    await assertHudFits(page);
    await page.screenshot({ path: "test-results/camp-ui/2p-salvage-" +
      viewport.width + "x" + viewport.height + "-urgent.png" });

    await thumbRoute(page, 3);
    await expect(panel).toHaveAttribute("data-phase", "expired");
    await expect(timer).toHaveAttribute("data-seconds", "0");
    await expect(timer).toContainText("任务奖金 +0");
    await expect(page.locator("[data-sortie-time]")).not.toContainText("剩余 0 秒");
    await assertHudFits(page);
  });
}

// prettier-ignore
test("2P default safe outing never shows the salvage-only clock",
  async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/?mode=sortie&screen=camp");
    await tapVisibleFinger(page, "[data-start-sortie]");
    await expect(page.locator("[data-sortie-play]")).toBeVisible();
    await expect(page.locator("[data-sortie-deadline]")).toBeHidden();
    await expect(page.locator("[data-sortie-time]")).toContainText("75");
  });
