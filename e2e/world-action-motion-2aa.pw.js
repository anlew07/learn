import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test("2AA makes settled autonomous actions legible in the pixel world " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
    const canvas = page.locator("[data-stage-canvas]");
    await expect(canvas).toBeVisible();

    const result = await page.evaluate(async () => {
      const Engine = (await import("/src/engine.js")).default;
      const { getStageView } = await import("/src/presentation/stage-view.js");
      const { getWorldActionMotion } = await import("/src/ui/world-action-motion.js");
      const { paintPixelStage } = await import("/src/ui/pixel-stage.js");
      const run = Engine.fresh("2aa-action-scene", 1, true);
      run.paused = false;
      const world = run.worlds[0];
      const actions = [
        { id: "growth", activity: "training", label: "吸纳灵气", frame: 10 },
        { id: "gather", activity: "gathering", label: "搜集物资", frame: 24 },
        { id: "explore", activity: "exploring", label: "调查遗迹", frame: 30 },
        { id: "fight", activity: "defending", label: "排险妖兽", frame: 15 },
        { id: "rescue", activity: "rescuing", label: "准备救援", frame: 30 },
      ];
      const element = document.querySelector("[data-stage-canvas]");
      const results = [];
      for (const action of actions) {
        world.action = action.label;
        world.lastDecision = { day: run.day - 1, actionId: action.id };
        world.lastCombat = action.id === "fight" ? {
          day: run.day - 1,
          spectacle: {
            encountered: 10, defeated: 6, grade: "守住防线",
            waves: [{ encountered: 10, defeated: 6 }],
          },
        } : null;
        const view = getStageView(run, world.id);
        const motion = getWorldActionMotion(view.scene.activity, action.frame,
          false, Boolean(view.encounter));
        paintPixelStage(element, view, action.frame);
        results.push({
          action: action.id,
          activity: view.scene.activity,
          phase: motion.phase,
          interacting: motion.interacting,
          strike: motion.strike,
          offsetX: motion.offsetX,
        });
      }
      return {
        results,
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });

    expect(result.results.map((entry) => entry.activity)).toEqual([
      "training", "gathering", "exploring", "defending", "rescuing",
    ]);
    expect(result.results.map((entry) => entry.interacting)).toEqual([
      true, true, true, true, true,
    ]);
    expect(result.results[3].strike).toBe(true);
    expect(result.results[3].offsetX).toBeGreaterThan(0);
    expect(result.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(result.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.screenshot({ path: "test-results/camp-ui/2aa-action-motion-" +
      viewport.width + "x" + viewport.height + ".png" });
  });
}
