import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("three worlds use different readable pixel artwork at mobile size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  const canvas = page.locator("[data-stage-canvas]");
  await expect(canvas).toBeVisible();

  mkdirSync("test-results/camp-ui", { recursive: true });
  const signatures = [];
  for (const id of ["lingzai", "zombie", "beast"]) {
    await page.evaluate(async (worldId) => {
      const { paintPixelStage } = await import("/src/ui/pixel-stage.js");
      const { getStageView } = await import("/src/presentation/stage-view.js");
      // Display-only fixtures; never touch the saved RunState.
      const world = {
        id: worldId,
        name: worldId,
        d: 58,
        p: 45,
        level: 3,
        resource: 9,
        status: "running",
        deadline: 80,
        action: "巡视",
      };
      const view = getStageView(
        { worlds: [world], day: 8, paused: true, active: true },
        worldId,
      );
      paintPixelStage(document.querySelector("[data-stage-canvas]"), view);
    }, id);

    // Wait for the browser image decoder and asynchronous sprite onload repaint.
    await page.waitForTimeout(150);
    const signature = await canvas.evaluate((element) => {
      const data = element.getContext("2d").getImageData(0, 0, 320, element.height).data;
      let hash = 2166136261;
      for (let i = 0; i < data.length; i += 37) {
        hash = Math.imul(hash ^ data[i], 16777619);
      }
      return hash >>> 0;
    });
    signatures.push(signature);
    await canvas.screenshot({
      path: "test-results/camp-ui/pixel-biome-" + id + ".png",
    });
  }
  expect(new Set(signatures).size).toBe(3);
  await page.reload();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
});
