import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";

const folder = "test-results/camp-ui";
mkdirSync(folder, { recursive: true });
const sizes = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function snapshot(page, size, stage) {
  await page.screenshot({
    path: folder + "/sortie-2j-" + size.width + "x" + size.height + "-" + stage + ".png",
    animations: "disabled",
  });
}

async function tapVisible(page, selector, height) {
  const target = page.locator(selector);
  const rect = await target.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  expect(rect.y + rect.height).toBeLessThanOrEqual(height + 1);
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  expect(
    await page.evaluate(
      ({ x, y, selector }) => Boolean(document.elementFromPoint(x, y)?.closest(selector)),
      { ...point, selector },
    ),
  ).toBe(true);
  await page.touchscreen.tap(point.x, point.y);
}

async function archives(page) {
  return page.evaluate(async () => {
    const { sortieRepository } = await import("/src/services/sortie-persistence.js");
    const { saveRepository } = await import("/src/services/persistence.js");
    return { sortie: await sortieRepository.load(), formal: await saveRepository.load() };
  });
}

for (const size of sizes) {
  test("2J-D readable closed loop " + size.width, async ({ page }) => {
    test.setTimeout(105_000);
    await page.clock.install({ time: new Date("2026-11-18T00:00:00Z") });
    await page.setViewportSize(size);
    await page.goto("/?mode=sortie");
    await page.evaluate(async () => {
      const { sortieRepository } = await import("/src/services/sortie-persistence.js");
      const { createSortieArchive } = await import("/src/systems/sortie-session.js");
      await sortieRepository.enqueueSave(createSortieArchive("forge-e2e"));
    });
    await page.reload();
    await expect(page.locator(".sortie-objective")).toContainText("坚持 75 秒");
    await expect(page.locator(".sortie-intro-tip")).toContainText("第 25 秒自动暂停");
    await expect(page.locator(".sortie-intro-tip")).toContainText("3 片兑换 1 灵石");
    await expect(page.locator("[data-sortie-entry-growth]")).toContainText("6 灵石");
    await expect(page.locator("[data-sortie-session-notice]")).toContainText("独立试验档");
    await snapshot(page, size, "camp-objective");
    await tapVisible(page, "[data-start-sortie]", size.height);
    const canvas = page.locator("[data-sortie-canvas]");
    await expect(canvas).toBeVisible();
    await expect(page.locator("[data-sortie-goal]")).toContainText("撑到 0 秒");
    await expect(page.locator("[data-sortie-time]")).toContainText("剩余 75 秒");
    await expect(canvas).toHaveAttribute("data-weapon-damage", "1");
    await expect(page.locator("[data-sortie-timebar]")).toHaveAttribute("aria-valuenow", "75");
    const viewport = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      joystick: document.querySelector("[data-sortie-joystick]").getBoundingClientRect().toJSON(),
      actions: document.querySelector(".sortie-actions").getBoundingClientRect().toJSON(),
      canvas: document.querySelector("[data-sortie-canvas]").getBoundingClientRect().toJSON(),
    }));
    expect(viewport.width).toBeLessThanOrEqual(size.width + 1);
    expect(viewport.height).toBeLessThanOrEqual(size.height + 1);
    expect(viewport.joystick.right).toBeLessThan(viewport.actions.left);
    expect(viewport.canvas.height).toBeGreaterThan(200);
    await tapVisible(page, "[data-sortie-pause]", size.height);
    await expect(page.locator("[data-sortie-paused]")).toBeVisible();
    const pauseTick = await canvas.getAttribute("data-ticks");
    await page.clock.runFor(800);
    expect(await canvas.getAttribute("data-ticks")).toBe(pauseTick);
    await tapVisible(page, "[data-sortie-pause]", size.height);
    await expect(page.locator("[data-sortie-paused]")).toBeHidden();
    await snapshot(page, size, "battle-hud");
    // Observe real DOM announcements; do not inject enemies, rewards or damage.
    await page.evaluate(() => {
      const notice = document.querySelector("[data-sortie-feedback]");
      window.__sortieFeedback2J = [];
      let previous = "";
      const observe = () => {
        if (notice.hidden || !notice.textContent || notice.textContent === previous) return;
        previous = notice.textContent;
        window.__sortieFeedback2J.push(previous);
      };
      new MutationObserver(observe).observe(notice, {
        attributes: true, childList: true, characterData: true, subtree: true,
      });
    });
    await page.clock.runFor(25_700);
    const dialog = page.getByRole("dialog", { name: "战技觉醒 · 选择一项" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-sortie-choice-state]")).toContainText("战斗时间已冻结");
    await expect(dialog).toContainText("偏进攻选驭雷符");
    await expect(dialog.locator('[data-sortie-skill="thunder"]')).toContainText("主动进攻");
    await expect(dialog.locator('[data-sortie-skill="rune"]')).toContainText("防护生存");
    await expect(dialog.locator('[data-sortie-skill="thunder"]')).toContainText("每4秒");
    await expect(dialog.locator('[data-sortie-skill="rune"]')).toContainText("每25秒");
    const frozen = await canvas.getAttribute("data-ticks");
    expect(Number(frozen)).toBe(1500);
    const dialogRect = await dialog.boundingBox();
    expect(dialogRect.y).toBeGreaterThanOrEqual(0);
    expect(dialogRect.y + dialogRect.height).toBeLessThanOrEqual(size.height + 1);
    await snapshot(page, size, "choice-frozen");
    await page.clock.runFor(1500);
    expect(await canvas.getAttribute("data-ticks")).toBe(frozen);
    await tapVisible(page, '[data-sortie-skill="thunder"]', size.height);
    await expect(dialog).toBeHidden();
    await expect(page.locator("[data-sortie-power]")).toContainText("驭雷符");
    await expect(page.locator("[data-sortie-goal]")).toContainText("已生效");
    const directions = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    for (let i = 0; i < 15; i++) {
      if (await page.locator("[data-sortie-results]").isVisible()) break;
      const direction = directions[i % directions.length];
      await page.keyboard.down(direction);
      await page.clock.runFor(5000);
      await page.keyboard.up(direction);
    }
    await expect(page.locator("[data-sortie-results]")).toHaveAttribute("data-result", "won");
    await expect(page.locator("[data-sortie-world-report]")).toHaveAttribute("data-day", "2");
    await expect(page.locator("[data-sortie-world-report] p")).toHaveCount(2);
    await expect(page.locator("[data-sortie-gains]")).toBeVisible();
    const saved = await archives(page);
    const reward = saved.sortie.lastReceipt.battle;
    const messages = await page.evaluate(() => window.__sortieFeedback2J);
    expect(messages.some((msg) => msg.includes("击退 +"))).toBe(true);
    if (reward.collectedShards > 0) {
      expect(messages.some((msg) => msg.includes("拾取碎片 +"))).toBe(true);
    }
    if (reward.shardStones > 0) {
      expect(messages.some((msg) => msg.includes("兑换灵石 +"))).toBe(true);
    }
    if (reward.weaponDamage !== 1) throw new Error("First sortie weapon damage unexpectedly changed");
    await expect(page.locator("[data-sortie-gains]")).toContainText("+" + reward.stones);
    await expect(page.locator("[data-sortie-gains]")).toContainText("+" + reward.experience);
    await expect(page.locator("[data-sortie-reward-preview]")).toContainText(
      "拾取碎片 " + reward.collectedShards,
    );
    await expect(page.locator("[data-sortie-reward-preview]")).toContainText("灵石 " + reward.stones);
    await snapshot(page, size, "settlement-resources");
    await tapVisible(page, "[data-sortie-retry]", size.height);
    await expect(page.locator("[data-sortie-camp]")).toContainText("第 2 日");
    await expect(page.locator("[data-sortie-build]")).toBeEnabled();
    await page.locator("[data-sortie-build]").scrollIntoViewIfNeeded();
    await tapVisible(page, "[data-sortie-build]", size.height);
    await expect(page.locator("[data-sortie-forge]")).toHaveAttribute("data-level", "1");
    await expect(page.locator("[data-sortie-entry-growth]")).toContainText("1 → 2");
    const built = await archives(page);
    expect(built.sortie.run.worlds[0].resource).toBe(saved.sortie.run.worlds[0].resource - 6);
    await snapshot(page, size, "forge-growth");
    await page.reload();
    await expect(page.locator("[data-sortie-entry-growth]")).toContainText("1 → 2");
    await expect(page.locator("[data-sortie-build]")).toBeHidden();
    await tapVisible(page, "[data-start-sortie]", size.height);
    await expect(canvas).toHaveAttribute("data-weapon-damage", "2");
    await expect(page.locator("[data-sortie-power]")).toContainText("灵刃 2");
    await snapshot(page, size, "second-sortie-growth");
    await tapVisible(page, "[data-sortie-retreat]", size.height);
    const confirm = page.getByRole("dialog", { name: "确定撤离雾谷？" });
    await expect(confirm).toBeVisible();
    await tapVisible(page, "[data-sortie-confirm-no]", size.height);
    await expect(confirm).toBeHidden();
    await tapVisible(page, "[data-sortie-retreat]", size.height);
    await tapVisible(page, "[data-sortie-confirm-yes]", size.height);
    await expect(page.locator("[data-sortie-results]")).toHaveAttribute("data-result", "retreated");
    await expect(page.locator("[data-sortie-world-report]")).toHaveAttribute("data-day", "3");
    await expect(page.locator("[data-sortie-reward-preview]")).toContainText("生存 0");
    const next = await archives(page);
    expect(Object.keys(next.sortie.run.sortieLedger)).toHaveLength(2);
    expect(next.sortie.run.sortieCamp.forgeLevel).toBe(1);
    expect(next.formal.run).toBeNull();
    expect(next.formal.profile).toBeNull();
    await snapshot(page, size, "retreat-settlement");
    await page.reload();
    await expect(page.locator("[data-sortie-camp]")).toContainText("第 3 日");
    await expect(page.locator("[data-sortie-forge]")).toHaveAttribute("data-level", "1");
  });
}

test("2J-D interrupted sortie is not silently rewarded", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=sortie");
  await expect(page.locator("[data-start-sortie]")).toBeEnabled();
  await page.locator("[data-start-sortie]").click();
  await expect(page.locator("[data-sortie-canvas]")).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-sortie-intro]")).toBeVisible();
  await expect(page.locator("[data-sortie-session-notice]")).toContainText("未完成提交");
  const saved = await archives(page);
  expect(saved.sortie.run.day).toBe(1);
  expect(saved.sortie.lastReceipt).toBeNull();
  expect(saved.formal.run).toBeNull();
  expect(saved.formal.profile).toBeNull();
});
