import { test, expect } from "@playwright/test";

async function snapshot(page) {
  return page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    return saveRepository.load();
  });
}

async function startRun(page) {
  await page.goto("/?debug=1");
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  await expect(page.locator(".world")).toHaveCount(2);
  await expect.poll(async () => (await snapshot(page)).run?.day).toBe(1);
}

test("incompatible save remains intact and the tab is not allowed to overwrite it", async ({
  page,
}) => {
  await startRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.version = "incompatible-save-version";
    await saveRepository.enqueueSave(run, profile);
  });

  await page.reload();
  await expect(page.getByText(/读取存档失败，已停止写入/)).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveClass(/readonly/);

  await page.locator('[data-action="new-run"][data-onboarding="full"]').evaluate((button) => {
    button.click();
  });
  expect((await snapshot(page)).run.version).toBe("incompatible-save-version");
  expect((await snapshot(page)).run.day).toBe(1);
});

test("a rejected IndexedDB open releases Web Locks instead of starting writable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      if (location.search.includes("reject-idb=1")) {
        throw new DOMException("Storage denied in test", "SecurityError");
      }
      return originalOpen(...args);
    };
  });
  await page.goto("/?reject-idb=1");
  await expect(page.getByText(/读取存档失败，已停止写入/)).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveClass(/readonly/);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const held = (await navigator.locks.query()).held;
        return held.some((lock) => lock.name === "simultaneous-apocalypse-active-session-v1");
      }),
    )
    .toBe(false);

  await page.goto("/?debug=1");
  await expect(page.locator('[data-action="new-run"][data-onboarding="full"]')).toBeVisible();
  await page.locator('[data-action="new-run"][data-onboarding="full"]').click();
  await expect.poll(async () => (await snapshot(page)).run?.day).toBe(1);
});

test("failed writes pause gameplay and retry commits the same in-memory state", async ({
  page,
}) => {
  await startRun(page);
  await page.evaluate(() => {
    window.__originalObjectStorePut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Simulated full storage", "QuotaExceededError");
    };
  });

  await page.locator('button[data-action="step"]').click();
  await expect(page.getByRole("alert").filter({ hasText: "存档写入失败" })).toBeVisible();
  expect((await snapshot(page)).run.day).toBe(1);
  await page.locator('button[data-action="step"]').evaluate((button) => button.click());
  expect((await snapshot(page)).run.day).toBe(1);

  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.__originalObjectStorePut;
    delete window.__originalObjectStorePut;
  });
  await page.getByRole("button", { name: "重试保存" }).click();
  await expect.poll(async () => (await snapshot(page)).run?.day).toBe(2);
  await expect(page.getByRole("alert").filter({ hasText: "存档写入失败" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".metric").first()).toContainText("第 2 天");
  expect((await snapshot(page)).run.paused).toBe(true);
});

test("background visibility handling pauses and persists without jumping days", async ({
  page,
}) => {
  await startRun(page);
  await page.locator('button[data-action="toggle"]').click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  await expect.poll(async () => (await snapshot(page)).run?.paused).toBe(true);
  await page.reload();
  await expect(page.locator(".metric").first()).toContainText("第 1 天");
  await expect(page.getByRole("button", { name: /继续模拟/ })).toBeVisible();
});
