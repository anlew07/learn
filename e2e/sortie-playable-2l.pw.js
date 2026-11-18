import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const folder = "test-results/camp-ui";
mkdirSync(folder, { recursive: true });

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

// prettier-ignore
async function archives(page) {
  return page.evaluate(async () => {
    const { sortieRepository } = await import("/src/services/sortie-persistence.js");
    const { saveRepository } = await import("/src/services/persistence.js");
    return {
      prototype: await sortieRepository.load(),
      formal: await saveRepository.load(),
    };
  });
}

// prettier-ignore
async function capture(page, viewport, phase) {
  await page.screenshot({
    path: folder + "/sortie-2l-" + viewport.width + "x" + viewport.height + "-" + phase + ".png",
    animations: "disabled",
  });
}

// Audit viewport coordinates and actual hit-testing BEFORE any scrolling/clicking.
// prettier-ignore
async function visibleTarget(page, selector) {
  const rect = await page.locator(selector).boundingBox();
  if (!rect) return null;
  const viewport = page.viewportSize();
  if (!viewport || rect.width <= 0 || rect.height <= 0 ||
      rect.x < 0 || rect.y < 0 ||
      rect.x + rect.width > viewport.width + 1 ||
      rect.y + rect.height > viewport.height + 1) return null;
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const hit = await page.evaluate(
    ({ x, y, selector }) => Boolean(document.elementFromPoint(x, y)?.closest(selector)),
    { ...point, selector },
  );
  return hit ? point : null;
}

// prettier-ignore
async function tapStrict(page, selector) {
  const point = await visibleTarget(page, selector);
  expect(point, selector + " must be visible and physically touchable").not.toBeNull();
  await page.touchscreen.tap(point.x, point.y);
}

// Real CDP touch gesture. Never use locator.scrollIntoViewIfNeeded() or locator.click().
// prettier-ignore
async function swipeCamp(page) {
  const viewport = page.viewportSize();
  const client = await page.context().newCDPSession(page);
  const x = viewport.width / 2;
  const from = viewport.height * 0.78;
  const to = viewport.height * 0.30;
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x, y: from, id: 2 }],
    });
    for (let step = 1; step <= 8; step++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: from + (to - from) * step / 8, id: 2 }],
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
async function tapCampWithFingerScroll(page, selector) {
  for (let i = 0; i < 6; i++) {
    const point = await visibleTarget(page, selector);
    if (point) {
      await page.touchscreen.tap(point.x, point.y);
      return;
    }
    await swipeCamp(page);
  }
  await tapStrict(page, selector);
}

// Simulate a held thumb on the actual joystick and a square escape route.
// The 60Hz runtime runs unmodified; all movement is recorded as tick actions.
// prettier-ignore
async function thumbRoute(page, segments, assertMovement = false) {
  const joystick = page.locator("[data-sortie-joystick]");
  await expect(joystick).toHaveCSS("touch-action", "none");
  const rect = await joystick.boundingBox();
  expect(rect).not.toBeNull();
  const origin = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const vectors = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const offset = rect.width * 0.38;
  const client = await page.context().newCDPSession(page);
  const canvas = page.locator("[data-sortie-canvas]");
  const initialX = Number(await canvas.getAttribute("data-hero-x"));
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ ...origin, id: 1 }],
    });
    for (let i = 0; i < segments; i++) {
      if (await page.locator("[data-sortie-results]").isVisible()) break;
      if (await page.locator("[data-sortie-choice]").isVisible()) break;
      const direction = vectors[i % 4];
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{
          x: origin.x + direction[0] * offset,
          y: origin.y + direction[1] * offset,
          id: 1,
        }],
      });
      await page.clock.runFor(5_000);
      if (i === 0 && assertMovement) {
        expect(Number(await canvas.getAttribute("data-hero-x"))).toBeGreaterThan(initialX);
      }
    }
  } finally {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd", touchPoints: [],
    });
    await client.detach();
  }
}

// prettier-ignore
async function start(page) {
  await tapStrict(page, "[data-start-sortie]");
  await expect(page.locator("[data-sortie-canvas]")).toBeVisible();
}

// prettier-ignore
async function passChoice(page, skill, viewport) {
  await thumbRoute(page, 5, true);
  await page.clock.runFor(700);
  const dialog = page.getByRole("dialog", { name: "战技觉醒 · 选择一项" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("[data-sortie-choice-state]")).toContainText("时间已冻结");
  const canvas = page.locator("[data-sortie-canvas]");
  const ticks = await canvas.getAttribute("data-ticks");
  expect(Number(ticks)).toBe(1500);
  await capture(page, viewport, "skill-" + skill + "-frozen");
  await page.clock.runFor(1_500);
  expect(await canvas.getAttribute("data-ticks")).toBe(ticks);
  await tapStrict(page, '[data-sortie-skill="' + skill + '"]');
  await expect(dialog).toBeHidden();
}

// prettier-ignore
async function finishByThumb(page) {
  await thumbRoute(page, 10);
  await expect(page.locator("[data-sortie-results]")).toHaveAttribute("data-result", "won");
  await expect(page.locator("[data-sortie-summary]")).toContainText("存活 75.0 秒");
}

// prettier-ignore
for (const viewport of viewports) {
  test("2L-C two 75s outings, finger payment and authoritative resources " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    test.setTimeout(150_000);
    await page.clock.install({ time: new Date("2026-11-18T00:00:00Z") });
    await page.setViewportSize(viewport);
    await page.goto("/?mode=sortie");
    await page.evaluate(async () => {
      const { sortieRepository } = await import("/src/services/sortie-persistence.js");
      const { createSortieArchive } = await import("/src/systems/sortie-session.js");
      await sortieRepository.enqueueSave(createSortieArchive("forge-e2e"));
    });
    await page.reload();

    await expect(page.locator(".sortie-objective")).toContainText("坚持 75 秒");
    await expect(page.locator(".sortie-intro-tip")).toContainText("第 25 秒自动暂停");
    const beginning = await archives(page);
    expect(beginning.prototype.run.worlds[0].resource).toBe(4);
    await capture(page, viewport, "camp-first");

    await start(page);
    await expect(page.locator("[data-sortie-canvas]")).toHaveAttribute("data-weapon-damage", "1");
    await expect(page.locator("[data-sortie-timebar]")).toHaveAttribute("aria-valuenow", "75");
    await capture(page, viewport, "battle-first");
    await passChoice(page, "thunder", viewport);
    await finishByThumb(page);

    const first = await archives(page);
    const award = first.prototype.lastReceipt.battle;
    expect(award.outcome).toBe("won");
    expect(award.baseStones).toBe(3);
    expect(award.shardStones).toBeGreaterThanOrEqual(0);
    expect(award.shardStones).toBeLessThanOrEqual(2);
    expect(award.stones).toBe(award.baseStones + award.shardStones);
    expect(first.prototype.run.worlds[0].resource).toBe(4 + award.stones);
    expect(first.prototype.run.day).toBe(2);
    expect(first.prototype.pending).toBeNull();
    expect(first.prototype.lastReceipt.worlds).toHaveLength(2);
    await expect(page.locator("[data-sortie-reward-preview]")).toContainText("灵石 " + award.stones);
    await expect(page.locator("[data-sortie-world-report]")).toHaveAttribute("data-day", "2");
    await capture(page, viewport, "receipt-first");

    await tapStrict(page, "[data-sortie-retry]");
    await expect(page.locator("[data-sortie-camp]")).toContainText("第 2 日");
    await expect(page.locator("[data-sortie-forge-preview]")).toContainText("投入 6 灵石");
    // The camp is a real scroll container on short screens. Only finger gestures may reveal it.
    await tapCampWithFingerScroll(page, "[data-sortie-build]");
    await expect(page.locator("[data-sortie-forge]")).toHaveAttribute("data-level", "1");
    const purchased = await archives(page);
    expect(purchased.prototype.run.worlds[0].resource).toBe(
      first.prototype.run.worlds[0].resource - 6,
    );
    expect(purchased.prototype.run.day).toBe(2);
    expect(purchased.prototype.run.worlds[1]).toEqual(first.prototype.run.worlds[1]);
    await capture(page, viewport, "forge-paid");

    await page.reload();
    await expect(page.locator("[data-sortie-forge]")).toHaveAttribute("data-level", "1");
    await expect(page.locator("[data-sortie-build]")).toBeHidden();

    // Start run two, interrupt before completion, then replay from the saved camp.
    await start(page);
    await expect(page.locator("[data-sortie-canvas]")).toHaveAttribute("data-weapon-damage", "2");
    await passChoice(page, "rune", viewport);
    await thumbRoute(page, 2);
    await page.reload();
    await expect(page.locator("[data-sortie-intro]")).toBeVisible();
    await expect(page.locator("[data-sortie-session-notice]")).toContainText("未完成提交");
    const aborted = await archives(page);
    // Recovery clears the pending flag in memory; the IDB pre-battle snapshot
    // may retain it until the next explicit write. Neither form is a reward.
    if (aborted.prototype.pending) {
      expect(aborted.prototype.pending.day).toBe(2);
    }
    expect(aborted.prototype.lastReceipt).toEqual(purchased.prototype.lastReceipt);
    expect(aborted.prototype.run.day).toBe(2);
    expect(aborted.prototype.run.worlds[0].resource).toBe(
      purchased.prototype.run.worlds[0].resource,
    );
    expect(Object.keys(aborted.prototype.run.sortieLedger)).toHaveLength(1);
    expect(aborted.prototype.run.sortieCamp.forgeLevel).toBe(1);
    await capture(page, viewport, "interrupted-second");

    await start(page);
    await passChoice(page, "rune", viewport);
    await capture(page, viewport, "battle-second-grown");
    await finishByThumb(page);
    const second = await archives(page);
    expect(second.prototype.run.day).toBe(3);
    expect(second.prototype.pending).toBeNull();
    expect(second.prototype.lastReceipt.battle.weaponDamage).toBe(2);
    expect(second.prototype.lastReceipt.battle.outcome).toBe("won");
    expect(Object.keys(second.prototype.run.sortieLedger)).toHaveLength(2);
    expect(second.prototype.run.worlds[0].metrics.actions.sortie).toBe(2);
    expect(second.prototype.run.sortieCamp.forgeLevel).toBe(1);
    expect(second.formal.run).toBeNull();
    expect(second.formal.profile).toBeNull();
    await capture(page, viewport, "receipt-second");
    await page.reload();
    await expect(page.locator("[data-sortie-camp]")).toContainText("第 3 日");
  });
}

// The single remaining gate is deliberately blocked: no beacon authority or payment UI yet.
// prettier-ignore
test.fixme("2L-B pending: task-specific one-time preparation and repeat payment", () => {});


// The 2L-A+B combined slice: these tests use real finger coordinates and
// the unmodified 60 Hz runtime. The objective is NEVER completed by direct
// state mutation, locator.click(), or scrolling an element into view.
// prettier-ignore
async function thumbToRecoverySite(page) {
  const rect = await page.locator("[data-sortie-joystick]").boundingBox();
  expect(rect).not.toBeNull();
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const initial = Number(await page.locator("[data-sortie-canvas]").getAttribute("data-hero-x"));
  const client = await page.context().newCDPSession(page);
  const offset = rect.width * 0.38;
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ ...center, id: 6 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{
        x: center.x + 0.596 * offset,
        y: center.y - 0.803 * offset,
        id: 6,
      }],
    });
    await page.clock.runFor(1_760);
  } finally {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd", touchPoints: [],
    });
    await client.detach();
  }
  expect(Number(await page.locator("[data-sortie-canvas]").getAttribute("data-hero-x")))
    .toBeGreaterThan(initial);
}

// prettier-ignore
async function chooseSalvageWithFinger(page) {
  await expect(page.locator("[data-sortie-mission-salvage]")).toBeEnabled();
  await tapCampWithFingerScroll(page, "[data-sortie-mission-salvage]");
  await expect.poll(async () => {
    const a = await archives(page);
    return a.prototype?.run?.sortieCamp?.missionSelection?.missionId;
  }).toBe("salvage");
  const committed = await archives(page);
  expect(committed.prototype.run.sortieCamp.missionSelection.day).toBe(1);
  await page.reload();
  await expect(page.locator("[data-sortie-mission-salvage]"))
    .toContainText("已选险地回收");
}

// prettier-ignore
for (const viewport of viewports) {
  test("2L-C real finger reaches guarded recovery and earns authority-only bonus " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    test.setTimeout(150_000);
    await page.clock.install({ time: new Date("2026-11-18T00:00:00Z") });
    await page.setViewportSize(viewport);
    await page.goto("/?mode=sortie");
    await page.evaluate(async (width) => {
      const { sortieRepository } = await import("/src/services/sortie-persistence.js");
      const { createSortieArchive } = await import("/src/systems/sortie-session.js");
      await sortieRepository.enqueueSave(createSortieArchive("2l-c-guard-touch-" + width));
    }, viewport.width);
    await page.reload();
    const before = await archives(page);
    expect(before.prototype.run.worlds[0].resource).toBe(4);
    await chooseSalvageWithFinger(page);
    await capture(page, viewport, "guard-camp-selected");
    await start(page);
    await expect(page.locator("[data-sortie-goal]")).toContainText("10 秒出现险地目标");
    await page.clock.runFor(8_000);
    await thumbToRecoverySite(page);
    await page.clock.runFor(3_000);
    await expect(page.locator("[data-sortie-goal]")).toContainText("回收完成");
    await capture(page, viewport, "guard-recovered");
    await passChoice(page, "rune", viewport);
    await finishByThumb(page);
    const final = await archives(page);
    expect(final.prototype.lastReceipt.missionId).toBe("salvage");
    expect(final.prototype.lastReceipt.battle.objectiveStones).toBe(2);
    expect(final.prototype.lastReceipt.objectiveStones).toBe(2);
    expect(final.prototype.lastReceipt.battle.outcome).toBe("won");
    expect(final.prototype.run.day).toBe(2);
    expect(final.prototype.run.worlds[0].resource).toBe(
      4 + final.prototype.lastReceipt.battle.stones,
    );
    expect(final.prototype.run.sortieLedger[final.prototype.lastReceipt.sortieId].receipt)
      .toEqual(final.prototype.lastReceipt);
    expect(final.formal.run).toBeNull();
    expect(final.formal.profile).toBeNull();
    await expect(page.locator("[data-sortie-reward-preview]")).toContainText("险地任务 2");
    await capture(page, viewport, "guard-receipt");
  });
}

// prettier-ignore
test("2L-C completed physical salvage still pays no objective bonus on finger retreat",
  async ({ page }) => {
    const viewport = { width: 390, height: 844 };
    test.setTimeout(60_000);
    await page.clock.install({ time: new Date("2026-11-18T00:00:00Z") });
    await page.setViewportSize(viewport);
    await page.goto("/?mode=sortie");
    await page.evaluate(async () => {
      const { sortieRepository } = await import("/src/services/sortie-persistence.js");
      const { createSortieArchive } = await import("/src/systems/sortie-session.js");
      await sortieRepository.enqueueSave(createSortieArchive("2l-c-guard-retreat-touch"));
    });
    await page.reload();
    await chooseSalvageWithFinger(page);
    await start(page);
    await page.clock.runFor(8_000);
    await thumbToRecoverySite(page);
    await page.clock.runFor(3_000);
    await expect(page.locator("[data-sortie-goal]")).toContainText("回收完成");
    await tapStrict(page, "[data-sortie-retreat]");
    await tapStrict(page, "[data-sortie-confirm-yes]");
    const final = await archives(page);
    expect(final.prototype.lastReceipt.battle.objectiveStones).toBe(0);
    expect(final.prototype.lastReceipt.battle.baseStones).toBe(0);
    expect(final.prototype.run.day).toBe(2);
    expect(final.formal.run).toBeNull();
    expect(final.formal.profile).toBeNull();
    await capture(page, viewport, "guard-retreated");
  },
);
