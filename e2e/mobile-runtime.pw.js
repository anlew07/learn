import { test, expect } from "@playwright/test";

async function saved(page) {
  return page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
}

async function start(page) {
  await page.goto("/?debug=1");
  await expect(page.locator('[data-action="new-run"][data-onboarding="full"]')).toBeVisible();
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  await expect(page.locator(".world")).toHaveCount(2);
  await expect.poll(async () => (await saved(page)).run?.day).toBe(1);
}

test("automatic day timer does not accumulate 300ms polling drift", async ({ page }) => {
  // Install the official Playwright clock before navigation so performance.now
  // and setInterval use the same controlled time source.
  await page.clock.install({ time: new Date("2026-11-13T00:00:00Z") });
  await start(page);
  await page.locator('button[data-action="toggle"]').click();
  await expect.poll(async () => (await saved(page)).run?.paused).toBe(false);

  await page.clock.runFor(420_000); // 21 virtual days, reveals small drift per polling cycle
  await expect.poll(async () => (await saved(page)).run?.day).toBe(22);
  await page.locator('button[data-action="toggle"]').click();
  await expect.poll(async () => (await saved(page)).run?.paused).toBe(true);
  await page.reload();
  expect((await saved(page)).run.day).toBe(22);
});

test("long suspended tab and repeated visibility changes cannot cause catch-up", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-13T00:00:00Z") });
  await start(page);
  await page.locator('button[data-action="toggle"]').click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    for (let i = 0; i < 4; i++) {
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
  await expect.poll(async () => (await saved(page)).run?.paused).toBe(true);
  const before = (await saved(page)).run.day;
  await page.clock.fastForward("04:00:00");
  await page.clock.runFor(60_000);
  expect((await saved(page)).run.day).toBe(before);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.locator('button[data-action="toggle"]').click();
  await page.clock.runFor(20_000);
  await expect.poll(async () => (await saved(page)).run?.day).toBe(before + 1);
});

test("three rapid tab handoffs always reload the latest writer snapshot", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const first = await context.newPage();
  let second;
  let third;
  try {
    await start(first);
    second = await context.newPage();
    await second.goto("/?debug=1");
    await expect(second.locator(".app-shell")).toHaveClass(/readonly/);

    await first.locator('button[data-action="step"]').click();
    await expect.poll(async () => (await saved(first)).run.day).toBe(2);
    await second.getByRole("button", { name: /重新取得控制权/ }).click();
    await expect(second.locator(".app-shell")).toHaveClass(/readonly/);

    await first.close();
    await second.getByRole("button", { name: /重新取得控制权/ }).click();
    await expect(second.locator(".app-shell")).not.toHaveClass(/readonly/);
    await expect(second.locator(".metric").first()).toContainText("第 2 天");

    third = await context.newPage();
    await third.goto("/?debug=1");
    await expect(third.locator(".app-shell")).toHaveClass(/readonly/);
    await second.locator('button[data-action="step"]').click();
    await expect.poll(async () => (await saved(second)).run.day).toBe(3);
    await second.reload();
    await expect(second.locator(".app-shell")).not.toHaveClass(/readonly/);
    await third.getByRole("button", { name: /重新取得控制权/ }).click();
    await expect(third.locator(".app-shell")).toHaveClass(/readonly/);

    await second.close();
    await third.getByRole("button", { name: /重新取得控制权/ }).click();
    await expect(third.locator(".app-shell")).not.toHaveClass(/readonly/);
    await expect(third.locator(".metric").first()).toContainText("第 3 天");
    await third.locator('button[data-action="step"]').click();
    await expect.poll(async () => (await saved(third)).run.day).toBe(4);
  } finally {
    for (const tab of [first, second, third]) {
      if (tab && !tab.isClosed()) await tab.close();
    }
    await context.close();
  }
});

test("320–430px portrait and landscape retain accessible navigation without overflow", async ({
  page,
}) => {
  await start(page);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const tab of ["world", "soul", "log"]) {
      await page.locator('button[data-tab="' + tab + '"]').click();
      const geometry = await page.evaluate(() => {
        const nav = document.querySelector(".footer-nav");
        const rect = nav.getBoundingClientRect();
        const buttons = [...nav.querySelectorAll("button")];
        return {
          viewport: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          bottom: rect.bottom,
          viewportHeight: innerHeight,
          minButtonHeight: Math.min(
            ...buttons.map((button) => button.getBoundingClientRect().height),
          ),
        };
      });
      expect(geometry.pageWidth, width + "px " + tab + " horizontal overflow").toBeLessThanOrEqual(
        geometry.viewport + 1,
      );
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
      expect(geometry.minButtonHeight).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('button[data-tab="world"]').click();
  const landscape = await page.evaluate(() => ({
    viewport: innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    navBottom: document.querySelector(".footer-nav").getBoundingClientRect().bottom,
    height: innerHeight,
  }));
  expect(landscape.pageWidth).toBeLessThanOrEqual(landscape.viewport + 1);
  expect(landscape.navBottom).toBeLessThanOrEqual(landscape.height + 1);
});

test("enlarged Chinese text preserves the bottom navigation and action targets", async ({
  page,
}) => {
  await start(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.evaluate(() => {
    // Root rem scaling is a deterministic approximation, not iOS Dynamic Type validation.
    document.documentElement.style.fontSize = "20px";
  });
  await page.locator('button[data-tab="soul"]').click();
  await expect(page.locator("#aid-from")).toBeVisible();
  const geometry = await page.evaluate(() => {
    const nav = document.querySelector(".footer-nav");
    return {
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
      navBottom: nav.getBoundingClientRect().bottom,
      minTap: Math.min(
        ...[...nav.querySelectorAll("button")].map((el) => el.getBoundingClientRect().height),
      ),
    };
  });
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.navBottom).toBeLessThanOrEqual(720 + 1);
  expect(geometry.minTap).toBeGreaterThanOrEqual(44);
});

test("cancelled restart dialog preserves the run and accepted restart replaces it once", async ({
  page,
}) => {
  await start(page);
  const original = (await saved(page)).run;
  await page.locator('button[data-action="home"]').click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator('button[data-action="new-run"]').click();
  expect((await saved(page)).run.id).toBe(original.id);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('button[data-action="new-run"]').click();
  await expect(page.locator(".world")).toHaveCount(2);
  await expect.poll(async () => (await saved(page)).run?.id).not.toBe(original.id);
  expect((await saved(page)).run.day).toBe(1);
});
