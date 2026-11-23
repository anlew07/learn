import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const screenshots = "test-results/camp-ui";
mkdirSync(screenshots, { recursive: true });

// prettier-ignore
async function fingerTap(page, selector) {
  const bounds = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  expect(x).toBeGreaterThan(0);
  expect(y).toBeGreaterThan(0);
  expect(x).toBeLessThan(viewport.width);
  expect(y).toBeLessThan(viewport.height);
  await page.touchscreen.tap(x, y);
}

// prettier-ignore
for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test("2X actual tactical command is usable and durable " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
    await expect(page.locator("[data-game-stage]")).toBeVisible();
    await expect(page.locator('[data-stat="ap"] b')).toContainText("2");
    await fingerTap(page, '[data-action="scene-panel"][data-panel="tactic"]');
    const modal = page.getByRole("dialog", { name: "战前支援" });
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-tactical-support]')).toHaveAttribute("data-state", "ready");
    await fingerTap(page, '[data-action="tactic"][data-world="lingzai"]');
    await expect(modal.locator('[data-tactical-support]')).toHaveAttribute("data-state", "armed");
    await expect(modal.locator('[data-tactical-hint]')).toContainText("已待命");
    await expect(page.locator('[data-stat="ap"] b')).toContainText("1");

    const read = () => page.evaluate(async () => {
      const { saveRepository } = await import("/src/services/persistence.js");
      return saveRepository.load();
    });
    await expect.poll(async () => (await read()).run?.worlds?.[0]?.tacticalAssist?.kind)
      .toBe("focus");
    await page.screenshot({ path: screenshots + "/2x-tactic-" +
      viewport.width + "x" + viewport.height + ".png" });

    await page.locator('.stage-sheet-head [data-action="scene-close"]').click();
    await page.reload();
    await expect(page.locator("[data-game-stage]")).toBeVisible();
    await expect(page.locator('[data-action="scene-panel"][data-panel="tactic"]')).toContainText("✓");
    await fingerTap(page, '[data-action="scene-panel"][data-panel="tactic"]');
    await expect(modal.locator('[data-tactical-support]')).toHaveAttribute("data-state", "armed");
    expect(await modal.locator('[data-action="tactic"]').count()).toBe(0);
    await page.locator('.stage-sheet-head [data-action="scene-close"]').click();

    // A test-only clone of the official saved state can resolve its next
    // automatic fight; the original formal IndexedDB record stays intact.
    const result = await page.evaluate(async () => {
      const Engine = (await import("/src/engine.js")).default;
      const { saveRepository } = await import("/src/services/persistence.js");
      const saved = await saveRepository.load();
      const before = JSON.stringify(saved);
      const simulated = JSON.parse(JSON.stringify(saved.run));
      const choice = Engine.applyCommand(simulated, {
        operationId: "2x-e2e-strategy",
        type: "strategy", args: ["lingzai", "clear"],
      });
      if (!choice.ok) return { error: choice.error };
      let fight = null;
      for(let day=0;day<30 && simulated.active;day++){
        Engine.step(simulated);
        fight = simulated.worlds.find((world) =>
          world.id === "lingzai" && world.lastCombat?.tactic) ?? null;
        if(fight)break;
      }
      const after = JSON.stringify(await saveRepository.load());
      return {
        extra: fight?.lastCombat?.tactic?.extraDefeated,
        dangerRelief: fight?.lastCombat?.tactic?.dangerRelief,
        days: simulated.day - saved.run.day,
        savedUnchanged: before === after,
      };
    });
    expect(result.error).toBeUndefined();
    expect(result.days).toBeGreaterThanOrEqual(1);
    expect(result.days).toBeLessThanOrEqual(30);
    expect(result.extra).toBeGreaterThan(0);
    expect(result.dangerRelief).toBeGreaterThanOrEqual(0);
    expect(result.savedUnchanged).toBe(true);
    const dims = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(dims.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(dims.height).toBeLessThanOrEqual(viewport.height + 1);
  });
}
