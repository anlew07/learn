import { test, expect } from "@playwright/test";
import { startFirstRun, startProgressedRun } from "./helpers/run-fixtures.js";

async function snapshot(page) {
  return page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
}

async function newRun(page) {
  await startProgressedRun(page);
  await expect(page.locator("[data-game-stage]")).toBeVisible();
}

async function queueClue(page, worldIds) {
  await page.evaluate(async (ids) => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const state = await saveRepository.load();
    for (const worldId of ids) {
      const world = state.run.worlds.find((item) => item.id === worldId);
      world.pendingEvent = {
        id: `${worldId}/clue/auto-pause-qa`,
        type: "clue",
        title: worldId === "zombie" ? "失联广播" : "雾谷古碑",
        state: "queued",
        startDay: state.run.day,
        expiresDay: state.run.day + 3,
      };
    }
    await saveRepository.enqueueSave(state.run, state.profile);
  }, worldIds);
}

for (const [speed, duration] of [
  [1, 20_000],
  [2, 10_000],
  [4, 5_000],
]) {
  test(`a newly active event interrupts ${speed}x speed and opens the actual choices`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-11-17T00:00:00Z") });
    await page.setViewportSize({ width: 320, height: 568 });
    await newRun(page);
    await queueClue(page, ["zombie"]);
    await page.reload();
    await page.locator('select[data-action="speed"]').selectOption(String(speed));
    await expect.poll(async () => (await snapshot(page)).run.speed).toBe(speed);

    await page.locator('.stage-actions [data-action="toggle"]').click();
    await page.clock.runFor(duration + 600);

    const dialog = page.getByRole("dialog", { name: "待处理事件与战技" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("失联广播");
    await expect(dialog).toContainText("废土救援");
    await expect(dialog).toContainText("模拟已暂停");
    await expect(dialog).toContainText("不操作的结果");
    await expect(page.locator(".stage-day")).toContainText("已暂停");
    await expect.poll(async () => (await snapshot(page)).run.paused).toBe(true);
    const frozen = (await snapshot(page)).run;
    expect(frozen.day).toBe(2);

    // A visible modal is not sufficient: the game must actually stop ticking.
    await page.clock.runFor(duration * 2);
    expect((await snapshot(page)).run.day).toBe(frozen.day);
    await page.screenshot({ path: `test-results/camp-ui/event-popup-${speed}x-320.png` });

    await dialog.getByRole("button", { name: "谨慎调查" }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => (await snapshot(page)).run.worlds[1].p)
      .toBe(frozen.worlds[1].p + 2);
    const resolved = (await snapshot(page)).run;
    expect(resolved.paused).toBe(true);
    expect(resolved.ap).toBe(frozen.ap);
    expect(resolved.day).toBe(frozen.day);

    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const restored = (await snapshot(page)).run;
    expect(restored.day).toBe(resolved.day);
    expect(restored.ap).toBe(resolved.ap);
    expect(restored.worlds[1].p).toBe(resolved.worlds[1].p);
  });
}

test("two worlds trigger together: one pause, sequential choices, no duplicated rewards", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-17T00:00:00Z") });
  await newRun(page);
  await queueClue(page, ["lingzai", "zombie"]);
  await page.reload();
  await page.locator('.stage-actions [data-action="toggle"]').click();
  await page.clock.runFor(20_600);
  const dialog = page.getByRole("dialog", { name: "待处理事件与战技" });
  await expect(dialog.locator(".event")).toHaveCount(2);
  await expect.poll(async () => (await snapshot(page)).run.paused).toBe(true);
  const before = (await snapshot(page)).run;

  await dialog
    .locator('.event[data-world="lingzai"]')
    .getByRole("button", { name: "谨慎调查" })
    .click();
  await expect(dialog.locator(".event")).toHaveCount(1);
  await dialog
    .locator('.event[data-world="zombie"]')
    .getByRole("button", { name: "谨慎调查" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await snapshot(page)).run.worlds[1].p)
    .toBe(before.worlds[1].p + 2);
  const after = (await snapshot(page)).run;
  expect(after.worlds[0].p).toBe(before.worlds[0].p + 2);
  expect(after.day).toBe(before.day);
  expect(after.paused).toBe(true);
  await page.reload();
  const restored = (await snapshot(page)).run;
  expect(restored.worlds.map((world) => world.p)).toEqual(after.worlds.map((world) => world.p));
});

test("existing event and skill choice in a saved run reopen safely and can be dismissed", async ({
  page,
}) => {
  await newRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.paused = false;
    run.worlds[0].pendingEvent = {
      id: "lingzai/clue/restore-qa",
      type: "clue",
      title: "雾谷古碑",
      state: "active",
      expiresDay: run.day + 3,
    };
    run.worlds[1].build.pending = {
      id: "zombie/build/restore-qa",
      due: run.day + 2,
      options: ["blades", "arc", "armor"],
    };
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  const dialog = page.getByRole("dialog", { name: "待处理事件与战技" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".event")).toHaveCount(1);
  await expect(dialog.locator(".build-panel")).toHaveCount(1);
  await expect(page.locator(".stage-day")).toContainText("已暂停");
  await expect.poll(async () => (await snapshot(page)).run.paused).toBe(true);
  const before = (await snapshot(page)).run;
  await page.locator('.stage-sheet-head [data-action="scene-close"]').click();
  await expect(dialog).toHaveCount(0);
  expect((await snapshot(page)).run.worlds).toEqual(before.worlds);
  await page.reload();
  await expect(dialog).toBeVisible();
  expect((await snapshot(page)).run.day).toBe(before.day);
});

test("focus mode pauses for the opening world's urgent event without exposing locked worlds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.worlds[0].pendingEvent = {
      id: "lingzai/clue/focus-qa",
      type: "clue",
      title: "雾谷古碑",
      state: "active",
      expiresDay: run.day + 2,
    };
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  const dialog = page.getByRole("dialog", { name: "待处理事件与战技" });
  await expect(dialog).toContainText("雾谷古碑");
  await expect(dialog).toContainText("灵灾");
  await expect(page.locator(".stage-caption")).toContainText("灵灾");
  await expect(page.locator('.stage-worlds [data-world="zombie"]')).toHaveCount(0);
  const state = await snapshot(page);
  expect(state.run.onboardingFocus).toBe(true);
  expect(state.run.worlds).toHaveLength(1);
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(geometry.width).toBeLessThanOrEqual(321);
  expect(geometry.height).toBeLessThanOrEqual(569);
});
