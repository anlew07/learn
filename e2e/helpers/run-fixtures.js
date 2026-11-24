import { expect } from "@playwright/test";

export async function getSavedState(page) {
  return page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
}

export async function startFirstRun(page, { debug = false } = {}) {
  await page.goto(debug ? "/?debug=1" : "/");
  const start = page.locator('[data-action="new-run"][data-onboarding="focus"]');
  await expect(start).toBeVisible();
  await start.click();
  await expect.poll(async () => (await getSavedState(page)).run?.day).toBe(1);
  await expect.poll(async () => (await getSavedState(page)).run?.worlds?.length).toBe(1);
  return getSavedState(page);
}

export async function startProgressedRun(
  page,
  { debug = false, runCount = 1, worldsSaved = 1 } = {},
) {
  if (!Number.isInteger(runCount) || runCount < 1) {
    throw new RangeError("runCount must be a positive integer");
  }
  if (!Number.isInteger(worldsSaved) || worldsSaved < 1 || worldsSaved > 2) {
    throw new RangeError("worldsSaved must be 1 or 2");
  }

  await page.goto(debug ? "/?debug=1" : "/");
  await page.evaluate(
    async ({ runCount: count, worldsSaved: saved }) => {
      const { saveRepository } = await import("/src/services/persistence.js");
      await saveRepository.enqueueSave(null, {
        runCount: count,
        worldsSaved: saved,
        shards: 0,
      });
    },
    { runCount, worldsSaved },
  );
  await page.reload();

  const start = page.locator('[data-action="new-run"]');
  await expect(start).toBeVisible();
  await start.click();
  const expectedWorlds = Math.min(3, 1 + worldsSaved);
  await expect.poll(async () => (await getSavedState(page)).run?.day).toBe(1);
  await expect
    .poll(async () => (await getSavedState(page)).run?.worlds?.length)
    .toBe(expectedWorlds);
  return getSavedState(page);
}
