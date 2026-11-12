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

test("battle log tab displays recorded actions and wave bonuses", async ({ page }) => {
  await startFirstRun(page);
  await page.locator('button[data-action="step"]').click();
  await page.locator('button[data-tab="log"]').click();
  await expect(page.getByText("本局行动统计")).toBeVisible();
  await expect(page.locator(".stats-world")).toHaveCount(2);
  const snapshot = await getSnapshot(page);
  const first = snapshot.run.worlds.find((world) => world.id === "lingzai");
  expect(first.metrics.actions.growth).toBe(1);
  expect(first.metrics.waveCombats).toBe(0);
});

test("finished runs can open their archived battle log", async ({ page }) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.active = false;
    run.paused = true;
    run.result = { saved: 0, failed: 2, shards: 2, endedDay: 1 };
    run.worlds.forEach((world) => {
      world.status = "failed";
    });
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "查看本局经历" })).toBeVisible();
  await page.getByRole("button", { name: "查看本局经历" }).click();
  await expect(page.getByText("世界战报")).toBeVisible();
  await expect(page.getByText("本局行动统计")).toBeVisible();
});

test("near-finale world cards reveal each real requirement and its shortfall", async ({ page }) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((w) => w.id === "zombie");
    world.p = 98;
    world.flags.p65 = true;
    world.level = 3;
    world.resource = 4;
    world.injuryUntil = run.day + 2;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();

  const card = page.locator(".world").nth(1);
  const finale = card.locator(".finale-preview");
  await expect(finale).toBeVisible();
  await expect(finale).toContainText("终局资格");
  await expect(finale).toContainText("尚缺8");
  await expect(finale).toContainText("受伤−1");
  await expect(finale).toContainText("Lv2/Lv4");

  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((w) => w.id === "zombie");
    world.p = 100;
    world.flags.p65 = true;
    world.flags.p100 = true;
    world.level = 4;
    world.resource = 12;
    world.injuryUntil = 0;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  const ready = page.locator(".world").nth(1).locator(".finale-preview");
  await expect(ready).toContainText("6/6项满足");
  await expect(ready).toContainText("条件已齐全");
});

test("a new major event pauses real 4× simulation before another day passes", async ({ page }) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((w) => w.id === "lingzai");
    world.flags.sideFound = true;
    world.pendingEvent = {
      id: "lingzai/clue/critical",
      type: "clue",
      title: "紧急古碑线索",
      state: "queued",
      startDay: run.day,
      expiresDay: run.day + 2,
    };
    run.speed = 4;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await expect(page.locator("select[data-action='speed']")).toHaveValue("4");
  await page.locator('button[data-action="toggle"]').click();

  await expect(page.locator(".event")).toHaveCount(1, { timeout: 12000 });
  await expect(page.getByRole("button", { name: /继续模拟/ })).toBeVisible();
  const saved = await getSnapshot(page);
  expect(saved.run.paused).toBe(true);
  expect(saved.run.day).toBe(2);
});

test("fusion previews show real eligibility and charge exactly once on success", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.locator('button[data-tab="soul"]').click();
  await expect(page.locator(".fusion-row")).toHaveCount(2);
  await expect(page.locator('.fusion-row button[data-action="fusion"]:disabled')).toHaveCount(2);

  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { default: Engine } = await import("/src/engine.js");
    const { profile } = await saveRepository.load();
    const nextRun = Engine.fresh("fusion-browser", 2, false);
    const donor = nextRun.worlds.find((world) => world.id === "lingzai");
    const target = nextRun.worlds.find((world) => world.id === "zombie");
    donor.level = 2;
    target.level = 3;
    target.p = 100;
    target.flags.p65 = true;
    target.flags.p100 = true;
    target.resource = 12;
    await saveRepository.enqueueSave(nextRun, profile);
  });
  await page.reload();
  await page.locator('button[data-tab="soul"]').click();
  const fuse = page.locator('button[data-action="fusion"][data-world="zombie"]');
  await expect(fuse).toBeEnabled();
  await expect(page.locator(".fusion-row").last()).toContainText("消耗1AP / 1灵魂");
  await fuse.click();
  await expect
    .poll(async () => (await getSnapshot(page)).run?.worlds.find((w) => w.id === "zombie").status)
    .toBe("saved");
  const { run } = await getSnapshot(page);
  expect(run.ap).toBe(1);
  expect(run.soul).toBe(7);
});

test("aid preview blocks wasted progress and shows real cost", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await startFirstRun(page);
  await page.locator('button[data-tab="soul"]').click();

  const preview = page.locator("#aid-choice-preview");
  await expect(preview.getByRole("button", { name: "增加拯救准备 · P+12" })).toBeEnabled();
  await expect(preview.getByRole("button", { name: /压制毁灭压力/ })).toBeDisabled();
  await page.locator("#aid-to").selectOption("lingzai");
  await expect(preview.getByRole("button", { name: /增加拯救准备/ })).toBeDisabled();
  await expect(preview).toContainText("不同且仍在运行");
  await page.locator("#aid-to").selectOption("zombie");
  await expect(preview.getByRole("button", { name: /增加拯救准备/ })).toBeEnabled();

  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.worlds.find((w) => w.id === "lingzai").resource = 12;
    run.worlds.find((w) => w.id === "zombie").p = 98;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await page.locator('button[data-tab="soul"]').click();
  const adjusted = page.locator("#aid-choice-preview");
  await expect(adjusted).toContainText("P+2");
  await expect(adjusted).toContainText("材料低于自身终局需求");
  await adjusted.getByRole("button", { name: /增加拯救准备/ }).click();
  await expect
    .poll(async () => (await getSnapshot(page)).run?.worlds.find((w) => w.id === "zombie").p)
    .toBe(100);
  const saved = await getSnapshot(page);
  expect(saved.run.ap).toBe(1);
  expect(saved.run.soul).toBe(7);
  expect(saved.run.worlds.find((w) => w.id === "lingzai").resource).toBe(8);
  await expect(adjusted.getByRole("button", { name: /增加拯救准备/ })).toBeDisabled();
  await expect(adjusted).toContainText("目标已达到P100");
});

test("aid compares a partial doom reduction without offering a wasted intervention", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.worlds.find((w) => w.id === "zombie").d = 5.5;
    run.worlds.find((w) => w.id === "zombie").p = 100;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await page.locator('button[data-tab="soul"]').click();
  const preview = page.locator("#aid-choice-preview");
  await expect(preview.getByRole("button", { name: /增加拯救准备/ })).toBeDisabled();
  await expect(preview.getByRole("button", { name: "压制毁灭压力 · D−5.5" })).toBeEnabled();
  await expect(preview).toContainText("本次实际D−5.5");
});
