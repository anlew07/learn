import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";

const captures = "test-results/camp-ui";
mkdirSync(captures, { recursive: true });

const screens = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function readArchives(page) {
  return page.evaluate(async () => {
    const { sortieRepository } = await import("/src/services/sortie-persistence.js");
    const { saveRepository } = await import("/src/services/persistence.js");
    return {
      prototype: await sortieRepository.load(),
      formal: await saveRepository.load(),
    };
  });
}

async function startBattle(page) {
  await page.locator("[data-start-sortie]").click();
  await expect(page.locator("[data-sortie-canvas]")).toBeVisible();
}

async function capture(page, size, phase) {
  await page.screenshot({
    path: captures + "/sortie-2h-" + size.width + "x" + size.height + "-" + phase + ".png",
    animations: "disabled",
  });
}

async function checkBattleLayout(page, size) {
  const layout = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      stats: box(".sortie-stats"),
      timebar: box("[data-sortie-timebar]"),
      loot: box(".sortie-lootbar"),
      canvas: box("[data-sortie-canvas]"),
      stick: box("[data-sortie-joystick]"),
      buttons: box(".sortie-actions"),
      controls: box(".sortie-controls"),
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(size.width + 1);
  expect(layout.scrollHeight).toBeLessThanOrEqual(size.height + 1);
  expect(layout.stats.bottom).toBeLessThanOrEqual(layout.timebar.top + 1);
  expect(layout.timebar.bottom).toBeLessThanOrEqual(layout.loot.top + 1);
  expect(layout.canvas.height).toBeGreaterThan(200);
  expect(layout.stick.right).toBeLessThan(layout.buttons.left);
  expect(layout.controls.bottom).toBeLessThanOrEqual(size.height + 1);
  expect(layout.buttons.right).toBeLessThanOrEqual(size.width + 1);
}

for (const size of screens) {
  test("2H-D full loop " + size.width, async ({ page }) => {
    test.setTimeout(90_000);
    await page.clock.install({ time: new Date("2026-11-17T00:00:00Z") });
    await page.setViewportSize(size);
    await page.goto("/?mode=sortie");
    await expect(page.getByRole("heading", { name: "出击雾谷" })).toBeVisible();
    await expect(page.getByText("拖动移动躲避灵息弹", { exact: false })).toBeVisible();
    await expect(page.getByText("不读取、写入正式存档", { exact: false })).toBeVisible();
    await expect(page.locator("[data-start-sortie]")).toBeEnabled();

    // A normal fresh archive with a repeatable seed, not injected rewards or stats.
    await page.evaluate(async () => {
      const { sortieRepository } = await import("/src/services/sortie-persistence.js");
      const { createSortieArchive } = await import("/src/systems/sortie-session.js");
      await sortieRepository.enqueueSave(createSortieArchive("forge-e2e"));
    });
    await page.reload();
    await expect(page.locator("[data-start-sortie]")).toBeEnabled();
    await capture(page, size, "camp-before");

    await startBattle(page);
    const canvas = page.locator("[data-sortie-canvas]");
    await expect(canvas).toHaveAttribute("data-weapon-damage", "1");
    await expect(page.locator("[data-sortie-hp]")).toContainText("生命 8/8");
    await expect(page.locator("[data-sortie-time]")).toContainText("剩余 75 秒");
    await expect(page.locator("[data-sortie-loot]")).toContainText("碎片 0");
    await expect(page.locator("[data-sortie-timebar]")).toHaveAttribute("aria-valuenow", "75");
    await checkBattleLayout(page, size);
    await capture(page, size, "battle-start");

    await page.clock.runFor(25_700);
    const choice = page.getByRole("dialog", { name: "战技觉醒 · 选择一项" });
    await expect(choice).toBeVisible();
    await expect(choice.locator('[data-sortie-skill="thunder"]')).toContainText("每4秒");
    await expect(choice.locator('[data-sortie-skill="rune"]')).toContainText("每25秒");
    const dialog = await choice.boundingBox();
    expect(dialog.y).toBeGreaterThanOrEqual(0);
    expect(dialog.y + dialog.height).toBeLessThanOrEqual(size.height + 1);
    const frozen = await canvas.getAttribute("data-ticks");
    expect(Number(frozen)).toBe(1500);
    await capture(page, size, "skill-choice");
    await page.clock.runFor(1_500);
    expect(await canvas.getAttribute("data-ticks")).toBe(frozen);
    await choice.locator('[data-sortie-skill="thunder"]').click();
    await expect(choice).toBeHidden();
    await expect(page.locator("[data-sortie-power]")).toContainText("驭雷符");

    // Real DOM keyboard movement + animation frames, never a mocked victory.
    const directions = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    for (let i = 0; i < 15; i++) {
      if (await page.locator("[data-sortie-results]").isVisible()) break;
      const direction = directions[i % directions.length];
      await page.keyboard.down(direction);
      await page.clock.runFor(5_000);
      await page.keyboard.up(direction);
    }
    await expect(page.locator("[data-sortie-results]")).toHaveAttribute("data-result", "won");
    await expect(page.locator("[data-sortie-world-report]")).toHaveAttribute("data-day", "2");
    await expect(page.locator("[data-sortie-summary]")).toContainText("存活 75.0 秒");
    const first = await readArchives(page);
    const battle = first.prototype.lastReceipt.battle;
    expect(first.prototype.run.day).toBe(2);
    expect(first.prototype.pending).toBeNull();
    expect(battle.stones).toBeGreaterThanOrEqual(3);
    expect(battle.collectedShards + battle.uncollectedShards).toBe(
      Math.floor(battle.defeated / 3),
    );
    await expect(page.locator("[data-sortie-reward-preview]")).toContainText(
      "拾取碎片 " + battle.collectedShards,
    );
    await expect(page.locator("[data-sortie-reward-preview]")).toContainText(
      "灵石 " + battle.stones,
    );
    await capture(page, size, "first-settlement");

    await page.locator("[data-sortie-retry]").click();
    await expect(page.locator("[data-sortie-camp]")).toContainText("第 2 日");
    await expect(page.locator("[data-sortie-build]")).toBeEnabled();
    await expect(page.locator("[data-sortie-forge-preview]")).toContainText("投入 6 灵石");
    await page.locator("[data-sortie-build]").click();
    await expect(page.locator("[data-sortie-forge]")).toHaveAttribute("data-level", "1");
    await expect(page.locator("[data-sortie-forge-preview]")).toContainText("伤害 2");
    const built = await readArchives(page);
    expect(built.prototype.run.worlds[0].resource).toBe(
      first.prototype.run.worlds[0].resource - 6,
    );
    expect(built.prototype.run.day).toBe(2);
    await capture(page, size, "forge-built");
    await page.reload();
    await expect(page.locator("[data-sortie-forge]")).toHaveAttribute("data-level", "1");
    await expect(page.locator("[data-sortie-build]")).toBeHidden();

    await startBattle(page);
    await expect(page.locator("[data-sortie-canvas]")).toHaveAttribute("data-weapon-damage", "2");
    await page.locator("[data-sortie-pause]").click();
    await expect(page.locator("[data-sortie-paused]")).toBeVisible();
    const pausedAt = await page.locator("[data-sortie-canvas]").getAttribute("data-ticks");
    await page.clock.runFor(800);
    expect(await page.locator("[data-sortie-canvas]").getAttribute("data-ticks")).toBe(pausedAt);
    await page.locator("[data-sortie-pause]").click();
    await expect(page.locator("[data-sortie-paused]")).toBeHidden();
    await page.locator("[data-sortie-retreat]").click();
    const confirm = page.getByRole("dialog", { name: "确定撤离雾谷？" });
    await expect(confirm).toBeVisible();
    await confirm.locator("[data-sortie-confirm-no]").click();
    await expect(confirm).toBeHidden();
    await page.locator("[data-sortie-retreat]").click();
    await confirm.locator("[data-sortie-confirm-yes]").click();
    await expect(page.locator("[data-sortie-results]")).toHaveAttribute("data-result", "retreated");
    await expect(page.locator("[data-sortie-world-report]")).toHaveAttribute("data-day", "3");
    await expect(page.locator("[data-sortie-reward-preview]")).toContainText("生存 0");
    const second = await readArchives(page);
    expect(second.prototype.run.day).toBe(3);
    expect(second.prototype.run.sortieCamp.forgeLevel).toBe(1);
    expect(second.prototype.run.worlds[0].metrics.actions.sortie).toBe(2);
    expect(Object.keys(second.prototype.run.sortieLedger)).toHaveLength(2);
    expect(second.formal.run).toBeNull();
    expect(second.formal.profile).toBeNull();
    await page.reload();
    await expect(page.locator("[data-sortie-camp]")).toContainText("第 3 日");
    await expect(page.locator("[data-sortie-forge]")).toHaveAttribute("data-level", "1");
  });
}

for (const size of screens) {
  test("2H-D touch controls " + size.width, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/?mode=sortie");
    await expect(page.locator("[data-start-sortie]")).toBeEnabled();
    await startBattle(page);
    const canvas = page.locator("[data-sortie-canvas]");
    const joystick = page.locator("[data-sortie-joystick]");
    await expect(joystick).toHaveCSS("touch-action", "none");
    const bounds = await joystick.boundingBox();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    const client = await page.context().newCDPSession(page);
    const dispatch = (type, dx) => {
      const touchPoints = [];
      if (type === "touchStart" || type === "touchMove") {
        touchPoints.push({ x: x + dx, y, id: 1 });
      }
      return client.send("Input.dispatchTouchEvent", { type, touchPoints });
    };
    try {
      await dispatch("touchStart", 0);
      await dispatch("touchMove", 28);
      await expect
        .poll(async () => Number(await canvas.getAttribute("data-hero-x")))
        .toBeGreaterThan(160);
      const right = Number(await canvas.getAttribute("data-hero-x"));
      await dispatch("touchMove", -28);
      await expect
        .poll(async () => Number(await canvas.getAttribute("data-hero-x")))
        .toBeLessThan(right);
      await dispatch("touchCancel", -28);
      expect(
        await joystick.locator("[data-sortie-knob]").evaluate((node) => node.style.transform),
      ).toBe("translate(0px, 0px)");
      const stopped = await canvas.getAttribute("data-hero-x");
      await page.waitForTimeout(150);
      expect(await canvas.getAttribute("data-hero-x")).toBe(stopped);
      const field = await canvas.boundingBox();
      await page.touchscreen.tap(field.x + field.width / 2, field.y + 25);
      await page.waitForTimeout(100);
      expect(await canvas.getAttribute("data-hero-x")).toBe(stopped);
      const view = await page.evaluate(() => ({
        x: window.scrollX,
        y: window.scrollY,
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));
      expect(view.x).toBe(0);
      expect(view.y).toBe(0);
      expect(view.width).toBeLessThanOrEqual(size.width + 1);
      expect(view.height).toBeLessThanOrEqual(size.height + 1);
    } finally {
      await client.detach();
    }
  });
}

test("2H-D interruption remains isolated", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=sortie");
  await expect(page.locator("[data-start-sortie]")).toBeEnabled();
  await startBattle(page);
  await expect(page.locator("[data-sortie-canvas]")).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-sortie-intro]")).toBeVisible();
  await expect(page.locator("[data-sortie-session-notice]")).toContainText("未完成提交");
  await expect(page.locator("[data-sortie-camp]")).toContainText("第 1 日");
  const interrupted = await readArchives(page);
  expect(interrupted.prototype.lastReceipt).toBeNull();
  expect(interrupted.formal.run).toBeNull();
  expect(interrupted.formal.profile).toBeNull();

  await startBattle(page);
  await page.locator("[data-sortie-retreat]").click();
  await page.locator("[data-sortie-confirm-yes]").click();
  await expect(page.locator("[data-sortie-world-report]")).toHaveAttribute("data-day", "2");
  const committed = await readArchives(page);
  expect(committed.prototype.run.day).toBe(2);
  expect(Object.keys(committed.prototype.run.sortieLedger)).toHaveLength(1);
  await page.reload();
  await expect(page.locator("[data-sortie-camp]")).toContainText("第 2 日");
  const reloaded = await readArchives(page);
  expect(reloaded.prototype.run.day).toBe(2);
  expect(Object.keys(reloaded.prototype.run.sortieLedger)).toHaveLength(1);
  expect(reloaded.formal.run).toBeNull();
  expect(reloaded.formal.profile).toBeNull();
});
