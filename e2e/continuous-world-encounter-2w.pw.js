import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const screenshots = "test-results/camp-ui";
mkdirSync(screenshots, { recursive: true });

// prettier-ignore
for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test("2W keeps real automatic encounter inside one formal game screen " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    // Start from a clean title page, not an active RunState. Otherwise
    // pagehide would save the old in-memory run over our isolated fixture.
    await expect(page.locator("[data-formal-title]")).toBeVisible();

    const result = await page.evaluate(async () => {
      const Engine = (await import("/src/engine.js")).default;
      const { getStageView } = await import("/src/presentation/stage-view.js");
      const { paintPixelStage } = await import("/src/ui/pixel-stage.js");
      const { saveRepository } = await import("/src/services/persistence.js");
      const originalSave = await saveRepository.load();
      const formalBefore = JSON.stringify(originalSave);
      const replay = Engine.fresh("2w-browser-encounter", 1, true);
      const chosen = Engine.applyCommand(replay, {
        operationId: "2w-clear-browser", type: "strategy", args: ["lingzai", "clear"],
      });
      if (!chosen.ok) throw new Error("Could not select the genuine clear-first strategy");
      let view = null;
      for (let day = 0; day < 100 && replay.active; day++) {
        Engine.step(replay);
        for (const world of replay.worlds) {
          const candidate = getStageView(replay, world.id);
          if (candidate.encounter && candidate.scene.summary.includes("上日交战")) {
            view = candidate;
            break;
          }
        }
        if (view) break;
      }
      if (!view) return { found: false };

      const stateBefore = JSON.stringify(replay);
      const element = document.createElement("canvas");
      element.width = 320;
      element.height = 208;
      document.body.append(element);
      paintPixelStage(element, view, 0);
      paintPixelStage(element, view, 16);
      paintPixelStage(element, view, 32);
      element.remove();
      const stateAfter = JSON.stringify(replay);
      const formalAfter = JSON.stringify(await saveRepository.load());
      // Test-only fixture: persist a real Engine.step state inside this isolated browser.
      // Reload must then show the encounter in the *actual* formal UI.
      await saveRepository.enqueueSave(replay, originalSave.profile ?? { runCount: 0, shards: 0 });
      return {
        worldId: view.worldId,
        found: true,
        status: view.scene.summary,
        encounter: view.encounter,
        unchanged: stateAfter === stateBefore,
        savedUnchanged: formalAfter === formalBefore,
      };
    });

    expect(result.found).toBe(true);
    expect(result.status).toContain("上日交战");
    expect(result.encounter.encountered).toBeGreaterThan(0);
    expect(result.encounter.defeated).toBeLessThanOrEqual(result.encounter.encountered);
    expect(result.unchanged).toBe(true);
    expect(result.savedUnchanged).toBe(true);
    await page.reload();
    await expect(page.locator("[data-game-stage]")).toBeVisible();
    const canvas = page.locator("[data-stage-canvas]");
    await expect(canvas).toBeVisible();
    if (result.worldId !== "lingzai") {
      await page.locator('[data-action="scene-world"][data-world="' + result.worldId + '"]').click();
    }
    await expect(page.locator(".stage-scene-status")).toContainText("上日交战");
    await page.screenshot({ path: screenshots + "/2w-continuous-encounter-" +
      viewport.width + "x" + viewport.height + ".png" });

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      stage: document.querySelector("[data-stage-canvas]").getBoundingClientRect().height,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(dimensions.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(dimensions.stage).toBeGreaterThan(150);

    // Existing strategy is the authoritative indirect intervention; not a new mode.
    await page.locator('[data-action="scene-panel"][data-panel="strategy"]').click();
    await expect(page.getByRole("dialog", { name: "世界档案与策略" })).toBeVisible();
    await page.locator('[data-action="scene-close"]').last().click();
    await expect(page.locator("[data-game-stage]")).toBeVisible();
    await expect(page.locator("[data-stage-modal]")).toHaveCount(0);
  });
}
