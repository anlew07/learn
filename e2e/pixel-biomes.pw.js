import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

// Keep the long browser acceptance flow readable without formatter reflow.
// prettier-ignore
test("three worlds use distinct pixel scenes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("[data-action=new-run][data-onboarding=full]").click();
  const canvas = page.locator("[data-stage-canvas]");
  await expect(canvas).toBeVisible();

  mkdirSync("test-results/camp-ui", { recursive: true });
  const signatures = [];
  for (const id of ["lingzai", "zombie", "beast"]) {
    await page.evaluate(async (worldId) => {
      const stage = await import("/src/ui/pixel-stage.js");
      const stageView = await import("/src/presentation/stage-view.js");
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
      const state = {
        worlds: [world],
        day: 8,
        paused: true,
        active: true,
      };
      const view = stageView.getStageView(state, worldId);
      const element = document.querySelector("[data-stage-canvas]");
      stage.paintPixelStage(element, view);
    }, id);

    await page.waitForTimeout(150);
    const signature = await canvas.evaluate((element) => {
      const context = element.getContext("2d");
      const data = context.getImageData(0, 0, 320, element.height).data;
      let hash = 2166136261;
      for (let i = 0; i < data.length; i += 37) {
        hash = Math.imul(hash ^ data[i], 16777619);
      }
      return hash >>> 0;
    });
    signatures.push(signature);

    const pixelsPng = await canvas.evaluate((element) => {
      return element.toDataURL("image/png").slice(22);
    });
    const filePath = "test-results/camp-ui/pixel-biome-" + id + ".png";
    const imageBuffer = Buffer.from(pixelsPng, "base64");
    writeFileSync(filePath, imageBuffer);
  }

  expect(new Set(signatures).size).toBe(3);
  await page.reload();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  await expect(page.locator(".stage-caption")).toContainText("灵灾");
  await page.screenshot({
    path: "test-results/camp-ui/real-world-lingzai-390.png",
  });
  await page
    .locator("[data-action=scene-world][data-world=zombie]")
    .click();
  await expect(page.locator(".stage-caption")).toContainText("废土救援");
  await page.screenshot({
    path: "test-results/camp-ui/real-world-zombie-390.png",
  });
});
