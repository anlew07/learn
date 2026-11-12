import { test, expect } from "@playwright/test";

async function getSnapshot(page) {
  return page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
}

async function startFirstRun(page) {
  await page.goto("/?debug=1");
  const newRun = page.getByRole("button", { name: /开始第 1 局/ });
  await expect(newRun).toBeVisible();
  await newRun.click();
  await expect(page.locator(".world")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /继续模拟/ })).toBeVisible();
  await expect.poll(async () => (await getSnapshot(page)).run?.day).toBe(1);
}

test("new mobile session saves one day and restores it after refresh", async ({ page }) => {
  await startFirstRun(page);
  await expect(page.locator(".world-title")).toHaveText(["灵灾", "尸潮"]);

  await page.locator('button[data-action="step"]').click();
  await expect(page.locator(".metric").first()).toContainText("第 2 天");
  await expect.poll(async () => (await getSnapshot(page)).run?.day).toBe(2);

  await page.reload();
  await expect(page.locator(".world")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /继续模拟/ })).toBeVisible();
  await expect(page.locator(".metric").first()).toContainText("第 2 天");
  const stored = await getSnapshot(page);
  expect(stored.run.paused).toBe(true);
});

test("another tab remains read-only, then takes over the latest committed state", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const first = await context.newPage();
  try {
    await startFirstRun(first);
    const second = await context.newPage();
    try {
      await second.goto("/?debug=1");
      await expect(second.locator(".app-shell")).toHaveClass(/readonly/);
      await expect(second.getByText(/另一个标签页正在运行该游戏/)).toBeVisible();
      await second.locator('button[data-action="step"]').evaluate((button) => button.click());
      await expect.poll(async () => (await getSnapshot(second)).run.day).toBe(1);

      await first.locator('button[data-action="step"]').click();
      await expect.poll(async () => (await getSnapshot(first)).run.day).toBe(2);
      await first.close();
      await second.getByRole("button", { name: /重新取得控制权并读取最新存档/ }).click();
      await expect(second.locator(".app-shell")).not.toHaveClass(/readonly/);
      await expect(second.locator(".metric").first()).toContainText("第 2 天");
      await expect(second.getByRole("button", { name: /继续模拟/ })).toBeVisible();
    } finally {
      await second.close();
    }
  } finally {
    if (!first.isClosed()) await first.close();
    await context.close();
  }
});

test("one cross-world aid is committed once and survives reload", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await startFirstRun(page);
  await page.locator('button[data-tab="soul"]').click();
  await expect(page.locator("#aid-from")).toBeVisible();
  await page.locator("#aid-from").selectOption("lingzai");
  await page.locator("#aid-to").selectOption("zombie");
  await page.locator('button[data-action="aid"][data-mode="p"]').click();

  await expect.poll(async () => (await getSnapshot(page)).run?.soul).toBe(7);
  const before = await getSnapshot(page);
  expect(before.run.ap).toBe(1);
  expect(before.run.worlds.find((world) => world.id === "lingzai").resource).toBe(0);
  expect(before.run.worlds.find((world) => world.id === "zombie").p).toBe(12);

  await page.reload();
  await expect(page.locator(".world")).toHaveCount(2);
  const after = await getSnapshot(page);
  expect(after.run.soul).toBe(7);
  expect(after.run.ap).toBe(1);
  expect(after.run.worlds.find((world) => world.id === "zombie").p).toBe(12);
});

test("world cards explain decisions and recent wave combat", async ({ page }) => {
  await startFirstRun(page);
  await page.locator('select[data-action="strategy"][data-world="zombie"]').selectOption("clear");
  await expect
    .poll(async () => {
      const saved = await getSnapshot(page);
      return saved.run?.worlds.find((world) => world.id === "zombie")?.strategy;
    })
    .toBe("clear");

  await page.locator('button[data-action="step"]').click();
  await expect(page.locator(".metric").first()).toContainText("第 2 天");
  await expect(page.getByText("自主判断：")).toHaveCount(2);
  await expect(page.locator(".combat-recap")).toHaveCount(1);
  await expect(page.locator(".combat-phases span:not(.combat-arrow)")).toHaveCount(3);
  await expect(page.getByText("本次依靠基础自动战斗")).toBeVisible();

  const snapshot = await getSnapshot(page);
  const zombie = snapshot.run.worlds.find((world) => world.id === "zombie");
  expect(zombie.lastDecision.actionId).toBe("fight");
  expect(zombie.lastCombat.day).toBe(1);
  expect(zombie.lastCombat.bonus.xp).toBe(0);
});

test("event preview describes odds, default and action costs", async ({ page }) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((w) => w.id === "lingzai");
    world.pendingEvent = {
      id: "lingzai/clue/test",
      type: "clue",
      title: "雾谷古碑",
      state: "active",
      expiresDay: run.day + 2,
    };
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();

  const event = page.locator(".event");
  await expect(event).toHaveCount(1);
  await expect(event).toContainText("成功率65%");
  await expect(event).toContainText("失败率35%");
  await expect(event).toContainText("到期自动谨慎调查");
  await expect(event.getByRole("button", { name: "谨慎调查" })).toBeEnabled();
  await event.getByRole("button", { name: "谨慎调查" }).click();
  await expect(event).toHaveCount(0);
  await expect
    .poll(async () => (await getSnapshot(page)).run?.worlds.find((w) => w.id === "lingzai").p)
    .toBe(2);

  const { run } = await getSnapshot(page);
  expect(run.ap).toBe(2);
});
