import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const folder = "test-results/camp-ui";
mkdirSync(folder, { recursive: true });

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

// DOM is only used to inspect physical hit areas and persisted receipts.
// All gameplay actions use real browser touch coordinates, never DOM clicks.
// prettier-ignore
async function touchPoint(page, selector) {
  const rect = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  if (!rect || !viewport || rect.width <= 0 || rect.height <= 0 ||
      rect.x < 0 || rect.y < 0 ||
      rect.x + rect.width > viewport.width + 1 ||
      rect.y + rect.height > viewport.height + 1) return null;
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  return await page.evaluate(({ x, y, selector }) =>
    Boolean(document.elementFromPoint(x, y)?.closest(selector)), { ...point, selector })
    ? point : null;
}

// Only a real held finger can reveal controls below the fold.
// prettier-ignore
async function fingerSwipe(page, upward) {
  const viewport = page.viewportSize();
  const client = await page.context().newCDPSession(page);
  const x = viewport.width / 2;
  const from = viewport.height * (upward ? 0.78 : 0.26);
  const to = viewport.height * (upward ? 0.30 : 0.78);
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x, y: from, id: 21 }],
    });
    for (let step = 1; step <= 8; step++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: from + (to - from) * step / 8, id: 21 }],
      });
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd", touchPoints: [],
    });
  } finally {
    await client.detach();
  }
}

// prettier-ignore
async function fingerTapReachable(page, selector, upward = true) {
  for (let attempt = 0; attempt < 7; attempt++) {
    const point = await touchPoint(page, selector);
    if (point) {
      await page.touchscreen.tap(point.x, point.y);
      return;
    }
    await fingerSwipe(page, upward);
    await page.waitForTimeout(380);
  }
  expect(await touchPoint(page, selector),
    selector + " must be reachable without programmatic scrolling").not.toBeNull();
}

// Real joystick input at native 60 Hz; the 25-second choice is not injected.
// prettier-ignore
async function moveUntilSkillChoice(page) {
  const rect = await page.locator("[data-sortie-joystick]").boundingBox();
  expect(rect).not.toBeNull();
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const distance = rect.width * 0.38;
  const vectors = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ ...center, id: 23 }],
    });
    for (let i = 0; i < 5; i++) {
      if (await page.locator("[data-sortie-choice]").isVisible() ||
          await page.locator("[data-sortie-results]").isVisible()) break;
      const vector = vectors[i % vectors.length];
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{
          x: center.x + vector[0] * distance,
          y: center.y + vector[1] * distance, id: 23,
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
  await page.clock.runFor(700);
}

// prettier-ignore
async function archives(page) {
  return page.evaluate(async () => {
    const { sortieRepository } = await import("/src/services/sortie-persistence.js");
    const { saveRepository } = await import("/src/services/persistence.js");
    return { prototype: await sortieRepository.load(), formal: await saveRepository.load() };
  });
}

// prettier-ignore
for (const viewport of viewports) {
  test("2R fresh player finds risk choice, gets 25s pause, and never earns on interruption " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install({ time: new Date("2026-11-19T00:00:00Z") });
    await page.setViewportSize(viewport);
    await page.goto("/?mode=sortie");

    await expect(page.locator("[data-sortie-camp]")).toContainText("第 1 日");
    await expect(page.locator(".sortie-objective")).toContainText("坚持 75 秒");
    await expect(page.locator(".sortie-intro-tip")).toContainText("第 25 秒自动暂停");
    await expect(page.locator("[data-sortie-salvage-description]"))
      .toContainText("未完成、失败或撤离不领任务奖金");
    await expect(page.locator("[data-sortie-build]")).toBeHidden();
    await expect(page.locator("[data-civilization-tree] summary")).toContainText("下一目标：雾谷生还");
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    const initial = await archives(page);
    // The entry creates an in-memory camp but persists nothing until the
    // first real command. An empty IndexedDB is the expected fresh-player state.
    expect(initial.prototype).toBeNull();
    expect(initial.formal.run).toBeNull();
    expect(initial.formal.profile).toBeNull();
    await page.screenshot({ path: folder + "/sortie-2r-" + viewport.width +
      "x" + viewport.height + "-first-impression.png" });

    await fingerTapReachable(page, "[data-sortie-mission-salvage]");
    await expect(page.locator("[data-sortie-mission-salvage]"))
      .toContainText("已选险地回收");
    await expect(page.locator("[data-start-sortie]")).toContainText("险地回收");
    await expect(page.locator("[data-sortie-mission-safe]")).toBeDisabled();
    const selected = await archives(page);
    expect(selected.prototype.run.sortieCamp.missionSelection.missionId).toBe("salvage");
    expect(selected.prototype.run.worlds[0].resource).toBe(4);
    expect(selected.prototype.run.day).toBe(1);
    expect(selected.prototype.lastReceipt).toBeNull();

    await page.reload();
    await expect(page.locator("[data-sortie-mission-salvage]"))
      .toContainText("已选险地回收");
    await fingerTapReachable(page, "[data-start-sortie]", false);
    await expect(page.locator("[data-sortie-play]")).toBeVisible();
    await expect(page.locator("[data-sortie-goal]")).toContainText("10 秒出现险地目标");
    await expect(page.locator("[data-sortie-timebar]")).toHaveAttribute("aria-valuenow", "75");
    await moveUntilSkillChoice(page);
    const dialog = page.getByRole("dialog", { name: "战技觉醒 · 选择一项" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-sortie-choice-state]")).toContainText("时间已冻结");
    await expect(dialog).toContainText("偏进攻选驭雷符，偏保命选聚灵阵纹");
    const frozenTick = await page.locator("[data-sortie-canvas]").getAttribute("data-ticks");
    expect(Number(frozenTick)).toBe(1500);
    await page.clock.runFor(1_500);
    expect(await page.locator("[data-sortie-canvas]").getAttribute("data-ticks"))
      .toBe(frozenTick);
    await page.screenshot({ path: folder + "/sortie-2r-" + viewport.width +
      "x" + viewport.height + "-skill-choice.png" });
    await fingerTapReachable(page, '[data-sortie-skill="rune"]');
    await expect(dialog).toBeHidden();

    await page.reload();
    await expect(page.locator("[data-sortie-intro]")).toBeVisible();
    await expect(page.locator("[data-sortie-session-notice]"))
      .toContainText("未完成提交");
    const interrupted = await archives(page);
    expect(interrupted.prototype.run.day).toBe(1);
    expect(interrupted.prototype.run.worlds[0].resource).toBe(4);
    expect(interrupted.prototype.lastReceipt).toBeNull();
    expect(interrupted.formal.run).toBeNull();
    expect(interrupted.formal.profile).toBeNull();
    await page.screenshot({ path: folder + "/sortie-2r-" + viewport.width +
      "x" + viewport.height + "-interrupted.png" });
  });
}
