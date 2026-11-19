import { test, expect } from "@playwright/test";

async function start(page) {
  await page.clock.install({ time: new Date("2026-11-17T00:00:00Z") });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
}

async function currentProgress(page) {
  return Number(await page.locator(".stage-time-progress").getAttribute("aria-valuenow"));
}

test("day progress reflects real elapsed time and the scene changes from morning to night", async ({
  page,
}) => {
  await start(page);
  const progress = page.getByRole("progressbar", { name: "距下一天的计时进度" });
  await expect(progress).toBeVisible();
  await expect(page.locator(".stage-window")).toHaveAttribute("data-time-phase", "morning");
  await expect(page.locator("[data-stage-time-label]")).toContainText("已暂停");
  expect(await currentProgress(page)).toBe(0);

  await page.locator('.stage-actions [data-action="toggle"]').click();
  // A 5.2s boundary sometimes observes 24% due to RAF/timer rounding.
  // Leave headroom while still verifying a real-time, non-skipped day.
  await page.clock.runFor(5_600);
  expect(await currentProgress(page)).toBeGreaterThanOrEqual(25);
  await expect(page.locator(".stage-window")).toHaveAttribute("data-time-phase", "day");
  await page.clock.runFor(6_600);
  expect(await currentProgress(page)).toBeGreaterThanOrEqual(57);
  await expect(page.locator(".stage-window")).toHaveAttribute("data-time-phase", "dusk");
  await page.clock.runFor(5_300);
  expect(await currentProgress(page)).toBeGreaterThanOrEqual(82);
  await expect(page.locator(".stage-window")).toHaveAttribute("data-time-phase", "night");
  await expect(page.locator("[data-stage-time-label]")).toContainText("夜晚");
  await page.screenshot({ path: "test-results/camp-ui/night-progress-320.png" });

  await page.locator('.stage-actions [data-action="toggle"]').click();
  const held = await currentProgress(page);
  await page.clock.runFor(40_000);
  expect(await currentProgress(page)).toBe(held);
  await expect(page.locator(".stage-day")).toContainText("第 1 天");
  await expect(page.locator("[data-stage-time-label]")).toContainText("已暂停");

  await page.locator('.stage-actions [data-action="toggle"]').click();
  await page.clock.runFor(3_500);
  await expect(page.locator(".stage-day")).toContainText("第 2 天");
  expect(await currentProgress(page)).toBeLessThan(20);
});

test("changing speed preserves elapsed-day fraction without skipping a game day", async ({
  page,
}) => {
  await start(page);
  await page.locator('.stage-actions [data-action="toggle"]').click();
  // A 5.2s boundary sometimes observes 24% due to RAF/timer rounding.
  // Leave headroom while still verifying a real-time, non-skipped day.
  await page.clock.runFor(5_600);
  const before = await currentProgress(page);
  expect(before).toBeGreaterThanOrEqual(25);

  // Freeze the game clock while changing speed: with a live 4x clock,
  // elapsed RAF frames during selectOption legitimately add ~2 percentage
  // points. The invariant is retained progress, not a fixed UI event latency.
  await page.locator('.stage-actions [data-action="toggle"]').click();
  await expect(page.locator("[data-stage-time-label]")).toContainText("已暂停");
  const held = await currentProgress(page);
  expect(held).toBeGreaterThanOrEqual(before);
  await page.locator('select[data-action="speed"]').selectOption("4");
  const changed = await currentProgress(page);
  expect(changed).toBeGreaterThanOrEqual(held - 1);
  expect(changed).toBeLessThanOrEqual(held + 1);
  await page.clock.runFor(1_000);
  expect(await currentProgress(page)).toBe(changed);
  await page.locator('.stage-actions [data-action="toggle"]').click();
  await page.clock.runFor(3_900);
  await expect(page.locator(".stage-day")).toContainText("第 2 天");
  expect(await currentProgress(page)).toBeLessThan(30);
});
