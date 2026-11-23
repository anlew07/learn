import { expect, test } from "@playwright/test";

test("formal title keeps one game and retains the sortie QA deep link", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("[data-formal-title]")).toBeVisible();
  await expect(page.locator("[data-sortie-preview-entry]")).toHaveCount(0);
  await expect(page.locator("[data-formal-title-primary]")).toBeVisible();
  await page.goto("/?mode=sortie");
  await expect(page).toHaveURL(/mode=sortie$/);
  await expect(page.locator("[data-sortie-title-screen]")).toBeVisible();
  await expect(page.locator("[data-sortie-menu-enter]")).toBeEnabled();
  await page.locator("[data-sortie-menu-enter]").tap();
  await expect(page.locator("[data-sortie-intro]")).toBeVisible();
  const formal = await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
  expect(formal.run).toBeNull();
  await page.locator("[data-sortie-menu-return]").tap();
  await expect(page.locator("[data-sortie-title-screen]")).toBeVisible();
  await page.getByRole("link", { name: "返回正式模拟器" }).click();
  await expect(page.locator("[data-formal-title]")).toBeVisible();
});

test("existing official campaign survives loading sortie", async ({ page }) => {
  await page.goto("/");
  const start = page.locator('[data-action="new-run"][data-onboarding="focus"]');
  await start.tap();
  await expect(page.locator("[data-game-stage]")).toBeVisible();
  const read = () =>
    page.evaluate(async () => {
      const { saveRepository } = await import("/src/services/persistence.js");
      return saveRepository.load();
    });
  await expect.poll(async () => (await read()).run?.day).toBe(1);
  const before = await read();
  await page.goto("/?mode=sortie");
  await expect(page.locator("[data-sortie-title-screen]")).toBeVisible();
  const after = await read();
  expect(after.run).toEqual(before.run);
  expect(after.profile).toEqual(before.profile);
});
