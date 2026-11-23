import { expect, test } from "@playwright/test";

test("2AC starts with one active world and opens the second slot after rescue", async ({
  page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?debug=1");
    await page.locator('[data-action="new-run"]').first().click();
    await expect(page.locator("[data-rescue-board]")).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const { saveRepository } = await import("/src/services/persistence.js");
          return (await saveRepository.load()).run?.worlds?.length ?? 0;
        }),
      )
      .toBe(1);

    await page.evaluate(async () => {
      const { saveRepository } = await import("/src/services/persistence.js");
      const saved = await saveRepository.load();
      const world = saved.run.worlds.find((item) => item.id === "lingzai");
      world.p = 100;
      world.d = 0;
      world.level = 3;
      world.resource = 40;
      world.strategy = "rescue";
      world.flags.p65 = true;
      world.flags.p100 = true;
      await saveRepository.enqueueSave(saved.run, saved.profile);
    });
    await page.reload();
    await expect(page.locator("[data-rescue-board]")).toBeVisible();
    await page.locator('[data-action="step"]').click();

    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const { saveRepository } = await import("/src/services/persistence.js");
          const saved = await saveRepository.load();
          return {
            savedWorlds: saved.profile.worldsSaved,
            slots: saved.run.worldSlots,
            active: saved.run.worlds.filter((world) => world.status === "running").length,
          };
        }),
      )
      .toEqual({ savedWorlds: 1, slots: 2, active: 2 });
    await expect(page.locator("[data-world-overview]")).toHaveCount(2);
  },
);
