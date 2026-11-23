import { expect, test } from "@playwright/test";

test("2AB unlocks, equips and resets a permanent doctrine without wiping the archive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("[data-formal-title]")).toBeVisible();

  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    await saveRepository.enqueueSave(null, { runCount: 2, shards: 20 });
  });
  await page.reload();
  await expect(page.locator("[data-formal-title]")).toBeVisible();
  const tree = page.locator("[data-legacy-progression]");
  await tree.locator("summary").click();

  await tree.locator('[data-action="unlock-legacy"][data-legacy-id="supply"]').click();
  await tree.locator('[data-action="unlock-legacy"][data-legacy-id="soul"]').click();
  await tree.locator('[data-action="unlock-legacy"][data-legacy-id="command"]').click();
  await tree.locator('[data-action="equip-legacy"][data-legacy-id="soul"]').click();
  await expect(tree.locator('[data-legacy-node="soul"]')).toHaveAttribute("data-status", "active");
  await tree.locator('[data-action="reset-legacy"]').click();

  const resetProfile = await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return (await saveRepository.load()).profile;
  });
  expect(resetProfile).toMatchObject({
    runCount: 2,
    shards: 2,
    legacyUnlocks: ["supply", "soul", "command"],
    activeLegacyId: "",
  });

  await tree.locator('[data-action="equip-legacy"][data-legacy-id="command"]').click();
  await page.locator("[data-formal-title-primary]").click();
  await expect(page.locator("[data-game-stage]")).toBeVisible();

  await expect.poll(async () => page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const saved = await saveRepository.load();
    return {
      legacyId: saved.run?.legacyId,
      ap: saved.run?.ap,
      soul: saved.run?.soul,
      worlds: saved.run?.worlds?.length,
      resources: saved.run?.worlds?.map((world) => world.resource),
      activeLegacyId: saved.profile?.activeLegacyId,
    };
  })).toEqual({
    legacyId: "command",
    ap: 3,
    soul: 8,
    worlds: 3,
    resources: [4, 4, 4],
    activeLegacyId: "command",
  });
});
