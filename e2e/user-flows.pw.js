import { test, expect } from "@playwright/test";

async function getSnapshot(page) {
  return page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
}

async function startFirstRun(page) {
  await page.goto("/?debug=1");
  const newRun = page.locator('[data-action="new-run"][data-onboarding="full"]');
  await expect(newRun).toBeVisible();
  await newRun.click();
  await expect(page.locator(".world")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /继续模拟/ })).toBeVisible();
  await expect.poll(async () => (await getSnapshot(page)).run?.day).toBe(1);
}

test("new mobile session saves one day and restores it after refresh", async ({ page }) => {
  await startFirstRun(page);
  await expect(page.locator(".world-title")).toHaveText(["灵灾", "废土救援"]);

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

  // Guarantee a real wave combat; a random first-day seed may choose
  // gathering even under clear-first strategy when supplies are scarce.
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((w) => w.id === "zombie");
    world.level = 2;
    world.resource = 12;
    world.threat = { id: "fixture-nest", status: "active", progress: 0, retryDay: 1 };
    world.build.attack = [{ id: "blades", lv: 2 }];
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await page.locator('button[data-action="step"]').click();
  await expect(page.locator(".metric").first()).toContainText("第 2 天");
  await expect(page.getByText("自主判断：")).toHaveCount(2);
  await expect(page.locator(".combat-recap")).toHaveCount(1);
  await expect(page.locator(".combat-phases span:not(.combat-arrow)")).toHaveCount(3);
  await expect(page.locator(".survivor-wave")).toHaveCount(3);
  await expect(page.locator(".survivor-score-main")).toContainText("异常群体已稳控");
  const replay = page.locator("[data-survivor-replay]");
  await expect(replay).toHaveCount(1);
  await expect(replay.locator("[data-replay-arena]")).toHaveClass(/is-playing/);
  await expect(replay.locator("[data-wave-number]")).toHaveCount(3);
  const beforeReplay = await getSnapshot(page);
  await replay.locator('button[data-action="replay-wave"]').click();
  await expect(replay.locator("[data-replay-arena]")).toHaveClass(/is-playing/);
  await replay.locator('button[data-action="replay-wave"]').click();
  expect(await getSnapshot(page)).toEqual(beforeReplay);
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
  await expect(page.getByText("使用战技：碎片飞刃")).toBeVisible();

  const snapshot = await getSnapshot(page);
  const zombie = snapshot.run.worlds.find((world) => world.id === "zombie");
  expect(zombie.lastDecision.actionId).toBe("fight");
  expect(zombie.lastCombat.day).toBe(1);
  expect(zombie.lastCombat.bonus.xp).toBeGreaterThan(0);
  expect(zombie.lastCombat.spectacle.waves[0].attack.style).toBe("fan");
  await expect(page.locator('[data-world-card="zombie"] .attack-fan')).toHaveCount(3);
  expect(zombie.lastCombat.spectacle.waves).toHaveLength(3);
  expect(zombie.lastCombat.spectacle.defeated).toBeGreaterThan(0);
  expect(zombie.waveMomentum.count).toBe(1);
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
  await expect(preview.getByRole("button", { name: /压制危机压力/ })).toBeDisabled();
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
  await expect(preview.getByRole("button", { name: "压制危机压力 · D−5.5" })).toBeEnabled();
  await expect(preview).toContainText("本次实际D−5.5");
});

test("strategy switching shows AP cost and never misrepresents an unavailable choice", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.day = 4;
    run.ap = 0;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();

  const zombie = page.locator(".world").nth(1);
  const strategy = zombie.locator('select[data-action="strategy"]');
  await expect(strategy).toHaveValue("rescue");
  await expect(strategy).toBeDisabled();
  await expect(zombie.locator(".strategy-price")).toContainText("行动点");

  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.ap = 1;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();

  const enabled = page.locator(".world").nth(1).locator('select[data-action="strategy"]');
  await expect(enabled).toBeEnabled();
  await expect(page.locator(".world").nth(1).locator(".strategy-price")).toContainText("1AP");
  await enabled.selectOption("clear");
  await expect
    .poll(async () => {
      const saved = await getSnapshot(page);
      return saved.run.worlds.find((world) => world.id === "zombie").strategy;
    })
    .toBe("clear");
  const saved = await getSnapshot(page);
  expect(saved.run.ap).toBe(0);
});

test("committed aid consequences remain visible after reload and in the battle log", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await startFirstRun(page);
  await page.locator('button[data-tab="soul"]').click();
  await page.locator('button[data-action="aid"][data-mode="p"]').click();
  const activity = page.locator(".intervention-history").first();
  await expect(activity).toContainText("跨世界援助");
  await expect(activity).toContainText("拯救准备+12");
  await expect(activity).toContainText("资源-4");
  await expect(activity).toContainText("AP−1");
  await expect(activity).toContainText("第10日起");
  const snapshot = await getSnapshot(page);
  expect(snapshot.run.interventions).toHaveLength(1);
  await page.reload();
  await expect(page.locator(".intervention-history")).toContainText("跨世界援助");
  await page.locator('button[data-tab="log"]').click();
  await expect(page.locator(".intervention-history")).toContainText("拯救准备+12");
  expect((await getSnapshot(page)).run.interventions).toHaveLength(1);
});

test("paid strategy choice records its cause without claiming immediate doom reduction", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.day = 4;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await page.locator('select[data-action="strategy"][data-world="zombie"]').selectOption("growth");
  await expect(page.locator(".intervention-history")).toContainText("调整长期策略");
  await expect(page.locator(".intervention-history")).toContainText("拯救优先 → 成长优先");
  await expect(page.locator(".intervention-history")).toContainText("AP−1");
  const log = (await getSnapshot(page)).run.interventions;
  expect(log).toHaveLength(1);
  expect(log[0].changes[0].effects.d).toBe(0);
});

test("crisis advisory compares a legal rescue without spending or changing the world", async ({
  page,
}) => {
  await startFirstRun(page);
  await expect(page.locator(".crisis-panel")).toHaveCount(0);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.worlds.find((world) => world.id === "zombie").d = 93;
    run.worlds.find((world) => world.id === "lingzai").resource = 15;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();

  const panel = page.locator(".crisis-panel");
  await expect(panel).toHaveCount(1);
  await expect(panel.locator(".crisis-item")).toHaveCount(1);
  await expect(panel).toContainText("危机压力已达D93");
  await expect(panel).toContainText("实际D−12");
  const before = (await getSnapshot(page)).run;
  await panel.getByRole("button", { name: "比较援助方案" }).click();
  await expect(page.locator("#aid-from")).toHaveValue("lingzai");
  await expect(page.locator("#aid-to")).toHaveValue("zombie");
  await expect(page.locator("#aid-choice-preview")).toContainText("D−12");
  const after = (await getSnapshot(page)).run;
  expect(after).toEqual(before);
});

test("expiring event is shown first and opens its existing choice screen", async ({ page }) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((item) => item.id === "lingzai");
    world.pendingEvent = {
      id: "crisis-clue",
      type: "clue",
      title: "限时古碑",
      state: "active",
      expiresDay: run.day + 1,
    };
    run.worlds.find((item) => item.id === "zombie").d = 94;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();

  const cards = page.locator(".crisis-item");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute("data-crisis-world", "lingzai");
  await expect(cards.first()).toContainText("自动处理");
  const previous = (await getSnapshot(page)).run;
  await cards.first().getByRole("button", { name: "查看重大事件" }).click();
  await expect(page.locator('.event[data-world="lingzai"]')).toBeVisible();
  expect((await getSnapshot(page)).run).toEqual(previous);
});

test("a P100 materials-only finale displays a blocker, not an invalid aid shortcut", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((item) => item.id === "zombie");
    world.p = 100;
    world.flags.p65 = true;
    world.flags.p100 = true;
    world.level = 3;
    world.resource = 4;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();

  const crisis = page.locator('.crisis-item[data-crisis-world="zombie"]');
  await expect(crisis).toBeVisible();
  await expect(crisis).toContainText("材料");
  await expect(crisis).toContainText("跨世界援助不会转移材料");
  await expect(crisis.locator('button[data-action="crisis-aid"]')).toHaveCount(0);
  await expect(crisis.locator('button[data-action="crisis-fusion"]')).toHaveCount(0);
});

test("Lingzai follow-up lets players invest into a visible seven-day seal effect", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((item) => item.id === "lingzai");
    world.flags.sideFound = true;
    world.flags.sideResolved = true;
    world.flags.p65 = true;
    world.flags.ancientSeal = true;
    world.flags.followupQueued = true;
    world.p = 65;
    world.resource = 7;
    world.pendingEvent = {
      id: "lingzai/followup/test",
      type: "followup",
      title: "古阵回路 · 阵纹护持",
      state: "active",
      expiresDay: run.day + 2,
    };
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();

  const event = page.locator('.event[data-world="lingzai"]');
  await expect(event).toContainText("未来7个游戏日");
  await expect(event).toContainText("到期不操作");
  const before = (await getSnapshot(page)).run;
  await expect(event.getByRole("button", { name: "刻印护灵古阵" })).toBeEnabled();
  expect((await getSnapshot(page)).run).toEqual(before);
  await event.getByRole("button", { name: "刻印护灵古阵" }).click();
  await expect(event).toHaveCount(0);

  await expect
    .poll(async () => {
      const saved = await getSnapshot(page);
      return saved.run.worlds.find((world) => world.id === "lingzai").flags.followupOutcome;
    })
    .toBe("commit");
  const saved = (await getSnapshot(page)).run;
  const world = saved.worlds.find((item) => item.id === "lingzai");
  expect(saved.ap).toBe(1);
  expect(world.resource).toBe(4);
  expect(world.followupEffect).toEqual({
    kind: "natural",
    start: saved.day + 1,
    until: saved.day + 7,
    perDay: 0.4,
  });
  await expect(page.locator(".world").first()).toContainText("后续机缘：已投入");
  await page.reload();
  await expect(page.locator(".world").first()).toContainText("效果至第");
});

test("follow-up event can automatically choose the safe path at expiry", async ({ page }) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((item) => item.id === "zombie");
    world.flags.sideFound = true;
    world.flags.sideResolved = true;
    world.flags.p65 = true;
    world.flags.weakness = true;
    world.flags.followupQueued = true;
    world.p = 65;
    world.pendingEvent = {
      id: "zombie/followup/test",
      type: "followup",
      title: "失联广播 · 母巢扰流",
      state: "active",
      expiresDay: run.day,
    };
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await page.locator('button[data-action="step"]').click();
  await expect
    .poll(async () => {
      const saved = await getSnapshot(page);
      return saved.run.worlds.find((world) => world.id === "zombie").flags.followupOutcome;
    })
    .toBe("safe");
  const saved = (await getSnapshot(page)).run;
  expect(saved.ap).toBe(2);
  expect(saved.worlds.find((world) => world.id === "zombie").pendingEvent).toBeNull();
  await expect(page.locator('.event[data-world="zombie"]')).toHaveCount(0);
});

test("the secret collection stays locked until discovery and survives a reload", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.locator('button[data-tab="log"]').click();
  const collection = page.locator("[data-collection]");
  await expect(collection).toContainText("0 / 2");
  await expect(collection.locator('[data-secret-world][data-discovered="false"]')).toHaveCount(2);
  await expect(collection).not.toContainText("修仙也要摸鱼");

  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((item) => item.id === "lingzai");
    world.flags.easterEggs = ["lingzai/tea-break"];
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await page.locator('button[data-tab="log"]').click();
  await expect(collection).toContainText("1 / 2");
  await expect(collection.locator('[data-secret-world][data-discovered="true"]')).toContainText(
    "修仙也要摸鱼",
  );
  await expect(collection.locator('[data-secret-world][data-discovered="false"]')).toHaveCount(1);
});

test("cross-world secret unlocks in the game and persists as a revealed collection entry", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    for (const world of run.worlds) {
      world.flags.easterEggs = [
        world.id === "lingzai" ? "lingzai/tea-break" : "zombie/expired-coffee",
      ];
    }
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await page.locator('button[data-action="step"]').click();
  await page.locator('button[data-tab="log"]').click();
  const entry = page.locator('[data-crossworld-secret="crossworld/tea-and-coffee"]');
  await expect(entry).toHaveAttribute("data-discovered", "true");
  await expect(entry).toContainText("跨界茶咖会");
  await expect.poll(async () => (await getSnapshot(page)).run.crossworldSecrets?.length).toBe(1);
  await page.reload();
  await page.locator('button[data-tab="log"]').click();
  await expect(entry).toContainText("跨界茶咖会");
});

test("permanent archive survives restarting and refresh", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.worlds[0].flags.easterEggs = ["lingzai/tea-break"];
    run.crossworldSecrets = ["crossworld/tea-and-coffee"];
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await page.locator('button[data-action="step"]').click();
  await expect.poll(async () => (await getSnapshot(page)).profile.secretArchive?.length).toBe(2);
  await page.locator('button[data-action="home"]').click();
  const archive = page.locator("[data-profile-archive]");
  const firstSecret = archive.locator('[data-archive-id="lingzai/tea-break"]');
  await expect(archive).toContainText("2 / 5");
  await expect(firstSecret).toContainText("修仙也要摸鱼");
  await page.locator('button[data-action="new-run"]').click();
  await page.locator('button[data-action="home"]').click();
  await expect(archive).toContainText("2 / 5");
  await page.reload();
  await page.locator('button[data-action="home"]').click();
  await expect(archive).toContainText("2 / 5");
  const saved = await getSnapshot(page);
  expect(saved.profile.secretArchive).toContain("crossworld/tea-and-coffee");
});

test("earned archive title can be equipped on the home screen and survives reload", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    profile.secretArchive = ["crossworld/tea-and-coffee"];
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await page.locator('button[data-action="home"]').click();
  const titleButton = page.locator('[data-action="equip-title"][data-title="title/tea-coffee"]');
  await expect(titleButton).toBeEnabled();
  await expect(
    page.locator('[data-action="equip-title"][data-title="title/holiday-chair"]'),
  ).toBeDisabled();
  await titleButton.click();
  await expect(page.locator("[data-equipped-title]")).toContainText("跨界茶咖联络员");
  await expect
    .poll(async () => (await getSnapshot(page)).profile.selectedTitle)
    .toBe("title/tea-coffee");
  await page.reload();
  await page.locator('button[data-action="home"]').click();
  await expect(page.locator("[data-equipped-title]")).toContainText("跨界茶咖联络员");
  await page.locator('[data-action="equip-title"][data-title=""]').click();
  await expect(page.locator("[data-equipped-title]")).toHaveCount(0);
});

test("refreshed dashboard exposes distinct world identities and keyboard-safe navigation", async ({
  page,
}) => {
  await startFirstRun(page);
  await expect(page.locator(".run-dashboard")).toContainText("多世界行动");
  await expect(page.locator(".run-dashboard .metric")).toHaveCount(4);
  await expect(page.locator('[data-world-card="lingzai"] .world-kicker')).toContainText(
    "CULTIVATION",
  );
  await expect(page.locator('[data-world-card="zombie"] .world-kicker')).toContainText("OUTBREAK");
  await expect(page.locator('[aria-label="主要导航"] button')).toHaveCount(3);
  await page.locator('button[data-tab="soul"]').click();
  await expect(page.locator('button[data-tab="soul"]')).toHaveAttribute("aria-current", "page");
  await page.locator('button[data-tab="world"]').click();
  await expect(page.locator('button[data-tab="world"]')).toHaveAttribute("aria-current", "page");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("world intelligence is collapsible without hiding key survival bars", async ({ page }) => {
  await startFirstRun(page);
  const first = page.locator('[data-world-card="lingzai"]');
  await expect(first.locator(".bars")).toBeVisible();
  const intel = first.locator(".world-intel");
  await expect(intel).not.toHaveAttribute("open", "");
  await intel.locator("summary").click();
  await expect(intel).toHaveAttribute("open", "");
  await expect(intel).toContainText("状态效果");
  await expect(first.locator(".bars")).toBeVisible();
});

test("home archive keeps collections compact until explicitly expanded", async ({ page }) => {
  await startFirstRun(page);
  await page.locator('button[data-action="home"]').click();
  const archive = page.locator("[data-profile-archive]");
  const details = archive.locator(".archive-discoveries");
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  await expect(details.locator("[data-archive-id]")).toHaveCount(5);
  await expect(archive.locator(".collection-titles")).toBeVisible();
});

test("cautious clue outcome reveals the actual four-day protective status", async ({ page }) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((item) => item.id === "lingzai");
    world.pendingEvent = {
      id: "lingzai/clue/ui",
      type: "clue",
      title: "雾谷古碑",
      state: "active",
      expiresDay: run.day + 2,
    };
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  const event = page.locator('.event[data-world="lingzai"]');
  await expect(event).toContainText("未来4日");
  await event.getByRole("button", { name: "谨慎调查" }).click();
  const world = page.locator('[data-world-card="lingzai"]');
  await page.locator('button[data-action="step"]').click();
  await expect(world.locator(".world-intel")).toHaveAttribute("open", "");
  await expect(world).toContainText("谨慎调查防护");
  await expect.poll(async () => (await getSnapshot(page)).run.worlds[0].clueSafety.until).toBe(5);
});

test("real evolved zombie build unleashes the steel-rain ultimate in mobile replay", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((item) => item.id === "zombie");
    world.level = 2;
    world.resource = 12;
    world.threat = { id: "ultimate-nest", status: "active", progress: 0, retryDay: 1 };
    world.strategy = "clear";
    world.build.attack = [{ id: "blades", lv: 2 }];
    world.build.support = [{ id: "armor", lv: 1 }];
    world.build.evolved = true;
    world.build.evolutionName = "钢雨防线";
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await page.locator('button[data-action="step"]').click();
  const waves = page.locator('[data-world-card="zombie"] .attack-barrage');
  await expect(waves).toHaveCount(3);
  await expect(waves.first()).toContainText("钢雨防线覆盖");
  await expect(waves.first()).toContainText("终极战技");
  const snapshot = await getSnapshot(page);
  const world = snapshot.run.worlds.find((item) => item.id === "zombie");
  expect(world.lastCombat.spectacle.waves.map((wave) => wave.attack.ultimate)).toEqual([
    true,
    true,
    true,
  ]);
});

test("skill awakening reveals elite enemy counters before committing a choice", async ({
  page,
}) => {
  await startFirstRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    const world = run.worlds.find((item) => item.id === "zombie");
    world.build.pending = {
      id: "test/counters",
      reason: "测试战技克制",
      due: 3,
      options: ["blades", "arc", "armor"],
    };
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await expect(page.locator('[data-action="build"][data-power="blades"]')).toContainText(
    "克制：密集异常群",
  );
  await expect(page.locator('[data-action="build"][data-power="arc"]')).toContainText(
    "克制：密集异常群、迅捷兽影",
  );
  await expect(
    page.locator('[data-action="build"][data-power="armor"] .build-counter-hint'),
  ).toHaveCount(0);
});

test("first run defaults to a focused rescue tutorial without changing the simulation", async ({
  page,
}) => {
  await page.goto("/?debug=1");
  await page.locator('[data-action="new-run"][data-onboarding="focus"]').click();
  await expect(page.locator(".world")).toHaveCount(1);
  await expect(page.locator(".world-title")).toHaveText("灵灾");
  await expect(page.locator('[data-onboarding-guide="focus"]')).toContainText("救援准备");
  await expect(page.locator("nav.footer-nav")).toHaveCount(0);
  const initial = await getSnapshot(page);
  expect(initial.run.worlds).toHaveLength(2);
  expect(initial.run.onboardingFocus).toBe(true);

  await page.locator('button[data-action="step"]').click();
  await expect.poll(async () => (await getSnapshot(page)).run.day).toBe(2);
  await page.reload();
  await expect(page.locator(".world")).toHaveCount(1);
  for (let index = 0; index < 7; index++) {
    await page.locator('button[data-action="step"]').click();
  }
  await expect(page.locator(".world")).toHaveCount(2);
  await expect(page.locator(".world-title")).toHaveText(["灵灾", "废土救援"]);
  const completed = await getSnapshot(page);
  expect(completed.run.day).toBe(9);
  expect(completed.run.worlds).toHaveLength(2);
});

test("quick start can reveal both worlds immediately without paying AP or losing progress", async ({
  page,
}) => {
  await page.goto("/?debug=1");
  await page.locator('[data-action="new-run"][data-onboarding="focus"]').click();
  const before = await getSnapshot(page);
  await page.locator('[data-action="show-all-worlds"]').click();
  await expect(page.locator(".world")).toHaveCount(2);
  const after = await getSnapshot(page);
  expect(after.run.onboardingFocus).toBe(false);
  expect(after.run.day).toBe(before.run.day);
  expect(after.run.ap).toBe(before.run.ap);
  expect(after.run.soul).toBe(before.run.soul);
  await page.reload();
  await expect(page.locator(".world")).toHaveCount(2);
});

