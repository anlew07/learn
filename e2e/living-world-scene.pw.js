import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { startFirstRun } from "./helpers/run-fixtures.js";

const captures = "test-results/camp-ui";
mkdirSync(captures, { recursive: true });

test("the same world has visibly different calm, critical and rescued pixel scenes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startFirstRun(page);

  const canvas = page.locator("[data-stage-canvas]");
  await expect(canvas).toBeVisible();
  const signatures = [];

  for (const scenario of ["stable", "critical", "restored"]) {
    const result = await page.evaluate(async (variant) => {
      const { getStageView } = await import("/src/presentation/stage-view.js");
      const { paintPixelStage } = await import("/src/ui/pixel-stage.js");
      // These are isolated display fixtures. The actual saved game is untouched.
      const world = {
        id: "lingzai",
        name: "灵灾",
        status: variant === "restored" ? "saved" : "running",
        p: variant === "stable" ? 12 : variant === "critical" ? 65 : 100,
        d: variant === "critical" ? 90 : 9,
        level: variant === "stable" ? 1 : 4,
        resource: variant === "stable" ? 4 : 14,
        deadline: 70,
        action: variant === "critical" ? "排险妖兽" : "吸纳灵气",
        lastDecision: { day: 7, actionId: variant === "critical" ? "fight" : "growth" },
        pendingEvent: variant === "critical" ? { state: "active" } : null,
        threat: variant === "critical" ? { status: "awaiting_alpha" } : null,
        lastCombat: variant === "critical" ? { day: 7 } : null,
        build: { attack: [], support: [] },
      };
      const view = getStageView({ day: 8, paused: true, active: true, worlds: [world] }, "lingzai");
      const element = document.querySelector("[data-stage-canvas]");
      paintPixelStage(element, view, 0);
      const context = element.getContext("2d");
      const pixels = context.getImageData(0, 0, element.width, element.height).data;
      let signature = 2166136261;
      for (let index = 0; index < pixels.length; index += 47) {
        signature = Math.imul(signature ^ pixels[index], 16777619);
      }
      return { phase: view.scene.phase, signature: signature >>> 0 };
    }, scenario);
    expect(result.phase).toBe(scenario);
    signatures.push(result.signature);
    await canvas.screenshot({ path: captures + "/living-world-" + scenario + ".png" });
  }

  expect(new Set(signatures).size).toBe(3);
  await page.reload();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  await expect(page.locator("[data-stage-canvas]")).toBeVisible();
});
