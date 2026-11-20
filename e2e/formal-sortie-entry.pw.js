import { expect, test } from "@playwright/test";

test("formal home opens optional battle without creating a formal save", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const entry = page.locator("[data-sortie-preview-entry]");
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("独立进度");
  await entry.tap();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBe("sortie");
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
  await expect
    .poll(() => new URL(page.url()).searchParams.has("mode"))
    .toBe(false);
  await expect(page.locator("[data-formal-title]")).toBeVisible();
});

test("official campaign archive survives entering and leaving the battle preview", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-action="new-run"][data-onboarding="focus"]').tap();
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
