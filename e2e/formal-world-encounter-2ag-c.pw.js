import { expect, test } from "@playwright/test";
import { getSavedState } from "./helpers/run-fixtures.js";

async function installLevelFourFightFixture(page) {
  await page.goto("/?debug=1");
  const preview = await page.evaluate(async () => {
    const Engine = (await import("/src/engine.js")).default;
    const { saveRepository } = await import("/src/services/persistence.js");
    const { normalizeLegacyProfile } = await import("/src/systems/legacy-progression.js");
    const run = Engine.fresh("2ag-level-four-hud", 1, true);
    Engine.byId(run, "lingzai").level = 4;
    Engine.byId(run, "lingzai").p = 100;
    Engine.byId(run, "lingzai").resource = 20;
    Engine.byId(run, "lingzai").strategy = "clear";
    run.paused = true;
    const profile = normalizeLegacyProfile({ runCount: 0, worldsSaved: 0, shards: 0 });
    const next = Engine.previewNextAction(run, "lingzai");
    await saveRepository.enqueueSave(run, profile);
    return next;
  });
  expect(preview).toMatchObject({ ok: true, actionId: "fight" });
  await page.reload();
  await expect(page.locator('[data-action="step"]')).toBeVisible();
}

async function installFightFixture(page) {
  await page.goto("/?debug=1");
  const preview = await page.evaluate(async () => {
    const Engine = (await import("/src/engine.js")).default;
    const { saveRepository } = await import("/src/services/persistence.js");
    const { normalizeLegacyProfile } = await import("/src/systems/legacy-progression.js");
    const run = Engine.fresh("2ag-preview-fight", 1, true);
    Engine.byId(run, "lingzai").strategy = "clear";
    run.paused = true;
    const profile = normalizeLegacyProfile({
      runCount: 0,
      worldsSaved: 0,
      shards: 0,
    });
    const next = Engine.previewNextAction(run, "lingzai");
    await saveRepository.enqueueSave(run, profile);
    return next;
  });
  expect(preview).toMatchObject({
    ok: true,
    actionId: "fight",
    pendingEvent: false,
    pendingBuild: false,
  });
  await page.reload();
  await expect(page.locator('[data-action="step"]')).toBeVisible();
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(
    "formal Lingzai encounter can be taken over, recovered and handed back at " +
      viewport.width +
      "x" +
      viewport.height,
    async ({ page }) => {
      await page.setViewportSize(viewport);
      await installFightFixture(page);

      await page.locator('[data-action="step"]').tap();
      await expect(page.locator('[data-stage-panel="encounter"]')).toBeVisible();
      await expect(page.getByText("本源意识接管")).toBeVisible();
      const pendingBeforeChoice = await getSavedState(page);
      expect(pendingBeforeChoice.run.day).toBe(1);
      expect(pendingBeforeChoice.run.pendingEncounter.controller).toBe("choice");

      await page.locator('[data-action="encounter-player"]').tap();
      await expect(page.locator("[data-encounter-screen]")).toBeVisible();
      await expect(page.locator("[data-encounter-canvas]")).toBeVisible();

      const layout = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));
      expect(layout.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(layout.height).toBeLessThanOrEqual(viewport.height + 1);

      const joystick = page.locator("[data-encounter-joystick]");
      const bounds = await joystick.boundingBox();
      expect(bounds).not.toBeNull();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 + 22, bounds.y + bounds.height / 2 - 14);
      await page.mouse.up();

      await page.waitForTimeout(1200);
      await page.locator('[data-action="encounter-toggle"]').tap();
      await expect
        .poll(async () => {
          const saved = await getSavedState(page);
          return saved.run.pendingEncounter?.actions?.length || 0;
        })
        .toBeGreaterThan(0);

      const beforeReload = await getSavedState(page);
      expect(beforeReload.run.day).toBe(1);
      expect(beforeReload.run.pendingEncounter.controller).toBe("player");
      const savedTicks = beforeReload.run.pendingEncounter.actions.length;

      await page.reload();
      await expect(page.locator("[data-encounter-screen]")).toBeVisible();
      const recovered = await getSavedState(page);
      expect(recovered.run.pendingEncounter.actions.length).toBe(savedTicks);
      expect(recovered.run.paused).toBe(true);

      await page.locator('[data-action="encounter-ai-handoff"]').tap();
      await expect.poll(async () => (await getSavedState(page)).run?.day).toBe(2);
      const settled = await getSavedState(page);
      expect(settled.run.pendingEncounter).toBeNull();
      expect(settled.run.lastEncounter).toMatchObject({
        day: 1,
        nextDay: 2,
        battle: { outcome: "won" },
      });
      const lingzai = settled.run.worlds.find((world) => world.id === "lingzai");
      expect(lingzai.lastDecision).toMatchObject({ day: 1, actionId: "fight" });
      expect(lingzai.metrics.actions.fight).toBe(1);
      expect(lingzai.metrics.actions.sortie).toBeUndefined();
      const otherWorld = settled.run.worlds.find((world) => world.id !== "lingzai");
      expect(otherWorld.lastDecision.day).toBe(1);
      expect(settled.run.encounterPreference).toBe("player");
    },
  );
}

test("formal encounter keeps its pending trace when the final save fails", async ({ page }) => {
  await installFightFixture(page);
  await page.locator('[data-action="step"]').tap();
  await page.locator('[data-action="encounter-player"]').tap();
  await expect(page.locator("[data-encounter-screen]")).toBeVisible();
  await page.locator('[data-action="encounter-toggle"]').tap();
  await expect
    .poll(async () => (await getSavedState(page)).run?.pendingEncounter?.controller)
    .toBe("player");

  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const original = saveRepository.enqueueSave.bind(saveRepository);
    let failFinalSave = true;
    saveRepository.enqueueSave = (run, profile) => {
      if (failFinalSave && run?.lastEncounter && !run.pendingEncounter) {
        failFinalSave = false;
        return Promise.reject(new Error("injected final encounter save failure"));
      }
      return original(run, profile);
    };
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-action="encounter-retreat"]').tap();
  await expect(page.locator('[data-action="retry-save"]')).toBeVisible();
  await expect(page.locator('[data-action="encounter-settle"]')).toBeVisible();
  await expect(page.locator('[data-stage-panel="encounter-result"]')).toHaveCount(0);
  expect((await getSavedState(page)).run.day).toBe(1);

  await page.locator('[data-action="retry-save"]').tap();
  await expect(page.locator('[data-action="retry-save"]')).toHaveCount(0);
  await expect
    .poll(async () => (await getSavedState(page)).run?.pendingEncounter?.actions.at(-1)?.[0])
    .toBe("retreat");
  await page.locator('[data-action="encounter-settle"]').tap();
  await expect.poll(async () => (await getSavedState(page)).run?.day).toBe(2);
  const saved = await getSavedState(page);
  expect(saved.run.pendingEncounter).toBeNull();
  expect(saved.run.lastEncounter.battle.outcome).toBe("retreated");
  expect(saved.run.worlds.find((world) => world.id === "lingzai").metrics.actions.fight).toBe(1);
});

test(
  "effective world level is visible and survives a formal encounter reload",
  async ({ page }) => {
  await installLevelFourFightFixture(page);
  await page.locator('[data-action="step"]').tap();
  await page.locator('[data-action="encounter-player"]').tap();
  await expect(page.locator("[data-encounter-hp]")).toHaveText("11/11");
  await page.locator('[data-action="encounter-toggle"]').tap();
  await expect
    .poll(async () => (await getSavedState(page)).run?.pendingEncounter?.combatLevel)
    .toBe(4);
  await page.reload();
  await expect(page.locator("[data-encounter-hp]")).toHaveText("11/11");
  const saved = await getSavedState(page);
  expect(saved.run.pendingEncounter.combatLevel).toBe(4);
  expect(saved.run.day).toBe(1);
  },
);
