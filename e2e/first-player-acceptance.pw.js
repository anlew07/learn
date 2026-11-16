import { test, expect } from "@playwright/test";

// A/B/C integrated regression: selectors track the current camp UI and guidance.
async function saved(page) {
  return page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
}

async function start(page, mode = "full") {
  await page.goto("/?debug=1");
  await expect(
    page.locator('[data-action="new-run"][data-onboarding="' + mode + '"]'),
  ).toBeVisible();
  await page.locator('[data-action="new-run"][data-onboarding="' + mode + '"]').click();
  await expect.poll(async () => (await saved(page)).run?.day).toBe(1);
}

test("first player observes hidden worlds and skips focus safely", async ({ page }) => {
  await page.goto("/?debug=1");
  await expect(page.locator(".hero")).toContainText("救回三个世界");
  await expect(page.locator(".progression-panel")).toContainText("世界碎片");
  await page.locator('[data-action="new-run"][data-onboarding="focus"]').click();

  const hint = page.locator("[data-guide-tip]");
  await expect(hint).toContainText("为什么有两个我");
  await page.locator('button[data-action="guide-seen"]').click();
  await expect(page.locator("[data-guide-tip]")).toContainText("第一天");
  const guide = page.locator('[data-onboarding-guide="focus"]');
  await expect(guide).toContainText("P 是救援准备");
  await expect(guide).toContainText("D 是危机压力");
  await expect(guide).toContainText("AP 用于关键支援");
  await expect(page.locator(".world")).toHaveCount(1);
  await expect(page.locator("nav.footer-nav")).toHaveCount(0);

  await page.locator('[data-action="step"]').click();
  await expect.poll(async () => (await saved(page)).run?.day).toBe(2);
  const beforeSkip = (await saved(page)).run;
  expect(beforeSkip.paused).toBe(true);
  expect(beforeSkip.worlds).toHaveLength(2);
  // The hidden second world must still make its one autonomous daily choice.
  expect(beforeSkip.worlds[1].lastDecision?.day).toBe(1);
  await expect(page.locator(".world-goal")).toContainText("当前目标");
  await expect(page.locator(".world-note").first()).toContainText("正在进行");

  await page.locator('[data-action="show-all-worlds"]').click();
  await expect(page.locator(".world-title")).toHaveText(["灵灾", "废土救援"]);
  await expect(page.locator("nav.footer-nav button")).toHaveCount(4);
  await expect.poll(async () => (await saved(page)).run?.onboardingFocus).toBe(false);
  const afterSkip = (await saved(page)).run;
  expect(afterSkip.day).toBe(beforeSkip.day);
  expect(afterSkip.ap).toBe(beforeSkip.ap);
  expect(afterSkip.soul).toBe(beforeSkip.soul);
  expect(afterSkip.worlds).toEqual(beforeSkip.worlds);

  const selector = page.locator('select[data-action="strategy"][data-world="zombie"]');
  await expect(selector).toHaveValue("rescue");
  await selector.selectOption("growth");
  await expect.poll(async () => (await saved(page)).run.worlds[1].strategy).toBe("growth");
  expect((await saved(page)).run.ap).toBe(beforeSkip.ap); // First three days are free.

  await page.locator('button[data-tab="soul"]').click();
  await expect(page.locator("#aid-choice-preview")).toBeVisible();
  await page.locator('button[data-tab="log"]').click();
  await expect(page.getByText("本局行动统计")).toBeVisible();
  await page.reload();
  await expect(page.locator(".world")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /继续模拟/ })).toBeVisible();
  expect((await saved(page)).run.paused).toBe(true);
});

test("cross-world aid preview, confirmed cost and one-time persisted result agree", async ({
  page,
}) => {
  await start(page);
  await page.locator('button[data-tab="soul"]').click();
  await page.locator("#aid-from").selectOption("lingzai");
  await page.locator("#aid-to").selectOption("zombie");
  const preview = page.locator("#aid-choice-preview");
  await expect(preview).toContainText("4材料、1AP、1灵魂");
  const aid = preview.getByRole("button", { name: /增加拯救准备/ });
  await expect(aid).toBeEnabled();

  const before = (await saved(page)).run;
  let prompt = "";
  page.once("dialog", async (dialog) => {
    prompt = dialog.message();
    await dialog.accept();
  });
  await aid.click();
  await expect.poll(async () => (await saved(page)).run.soul).toBe(before.soul - 1);
  expect(prompt).toContain("确认援助");
  const after = (await saved(page)).run;
  expect(after.ap).toBe(before.ap - 1);
  expect(after.worlds[0].resource).toBe(before.worlds[0].resource - 4);
  expect(after.worlds[1].p).toBe(before.worlds[1].p + 12);
  await expect(aid).toBeDisabled();

  await page.reload();
  const restored = (await saved(page)).run;
  expect(restored.ap).toBe(after.ap);
  expect(restored.soul).toBe(after.soul);
  expect(restored.worlds[1].p).toBe(after.worlds[1].p);
});

test("major event exposes its automatic outcome and resolves using a real command", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.worlds[0].pendingEvent = {
      id: "lingzai/clue/qa",
      type: "clue",
      title: "雾谷古碑",
      state: "active",
      expiresDay: run.day + 2,
    };
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();

  const event = page.locator('.decision-board .event[data-world="lingzai"]');
  await expect(event).toContainText("不操作的结果");
  await expect(event).toContainText("成功率65%");
  const before = (await saved(page)).run;
  await event.getByRole("button", { name: "谨慎调查" }).click();
  await expect(event).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).run.worlds[0].p).toBe(2);
  expect((await saved(page)).run.ap).toBe(before.ap);
});

test("a real build choice leads to a visible three-wave report without replay rewards", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((item) => item.id === "zombie");
    world.strategy = "clear";
    world.level = 2;
    world.resource = 12;
    world.threat = { id: "qa-nest", status: "active", progress: 0, retryDay: 1 };
    world.build.attack = [{ id: "blades", lv: 2 }];
    world.build.pending = {
      id: "qa/awakening",
      reason: "QA 战技抉择",
      due: 3,
      options: ["blades", "arc", "armor"],
    };
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await expect(page.locator(".decision-board .build-panel")).toBeVisible();
  await page.locator('.decision-board button[data-action="build"][data-power="armor"]').click();
  await expect.poll(async () => (await saved(page)).run.worlds[1].build.support.length).toBe(1);
  await page.locator('button[data-action="step"]').click();
  await expect(page.locator('[data-world-card="zombie"] .combat-recap')).toBeVisible();
  await expect(page.locator(".survivor-wave")).toHaveCount(3);
  await expect(page.locator("[data-survivor-replay]")).toBeVisible();

  const before = await saved(page);
  await page.locator('button[data-action="replay-wave"]').click();
  expect(await saved(page)).toEqual(before);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const animation = await page
    .locator(".replay-hit")
    .first()
    .evaluate((el) => {
      return getComputedStyle(el).animationName;
    });
  expect(animation).toBe("none");
});

test("completed engine runs settle rewards once and can start again", async ({ page }) => {
  await start(page);
  await page.locator('button[data-action="step"]').click();
  await expect.poll(async () => (await saved(page)).run?.day).toBe(2);

  // Fast-forward via the actual engine, not by inventing a completed save or UI.
  // A major event's documented automatic default handles unanswered choices.
  const outcome = await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { default: Engine } = await import("/src/engine.js");
    const { run, profile } = await saveRepository.load();
    let steps = 0;
    while (run.active && steps < 140) {
      const result = Engine.step(run);
      if (!result.ok) throw new Error(result.error);
      steps++;
    }
    if (run.active || !run.result) throw new Error("The run did not reach an engine result");
    await saveRepository.enqueueSave(run, profile);
    return { steps, result: run.result, previousCount: profile.runCount };
  });
  expect(outcome.steps).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator(".result")).toContainText("本轮救援行动已结束");
  await expect(page.locator(".result")).toContainText("世界碎片");
  const settled = await saved(page);
  expect(settled.run.rewarded).toBe(true);
  expect(settled.profile.runCount).toBe(outcome.previousCount + 1);
  expect(settled.profile.shards).toBe(outcome.result.shards);

  await page.getByRole("button", { name: "查看本局经历" }).click();
  await expect(page.getByText("本局行动统计")).toBeVisible();
  await page.reload();
  expect((await saved(page)).profile.shards).toBe(settled.profile.shards);
  await page.getByRole("button", { name: "开始下一次穿越" }).click();
  await expect(page.locator(".world")).toHaveCount(2);
  await expect.poll(async () => (await saved(page)).run?.runNumber).toBe(2);
});

test("four phone widths keep the core decisions reachable with enlarged Chinese text", async ({
  page,
}) => {
  await start(page);
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 812 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "20px";
    });
    for (const destination of ["world", "soul", "log"]) {
      await page.locator('button[data-tab="' + destination + '"]').click();
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - window.innerWidth;
      });
      expect(overflow, width + "px: " + destination).toBeLessThanOrEqual(1);
    }
    await page.locator('button[data-tab="world"]').click();
    const strategy = page.locator('select[data-action="strategy"][data-world="zombie"]');
    await strategy.scrollIntoViewIfNeeded();
    await expect(strategy).toBeVisible();
    await page.locator('button[data-tab="soul"]').click();
    await page.locator("#aid-to").scrollIntoViewIfNeeded();
    await expect(page.locator("#aid-to")).toBeVisible();
  }
});
