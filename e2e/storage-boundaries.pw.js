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

test("abort after first IndexedDB put keeps run and profile together", async ({ page }) => {
  await startRun(page);
  const original = await snapshot(page);
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    window.__restorePut = () => {
      IDBObjectStore.prototype.put = originalPut;
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = originalPut.apply(this, args);
      if (args[1] === "simultaneous-apocalypse-profile-v1") {
        this.transaction.abort();
      }
      return request;
    };
  });

  await page.locator('button[data-action="step"]').click();
  await expect(page.getByRole("alert").filter({ hasText: "存档写入失败" })).toBeVisible();
  expect(await snapshot(page)).toEqual(original);
  await page.evaluate(() => window.__restorePut());
  await page.getByRole("button", { name: "重试保存" }).click();
  await expect.poll(async () => (await snapshot(page)).run?.day).toBe(2);
  const after = await snapshot(page);
  expect(after.profile).toEqual(original.profile);
  await page.reload();
  expect((await snapshot(page)).run.day).toBe(2);
});

test("damaged world build cannot remain writable or overwrite the previous save", async ({
  page,
}) => {
  await startRun(page);
  await page.evaluate(async () => {
    const { saveRepository } = await import("/src/services/persistence.js");
    const { run, profile } = await saveRepository.load();
    run.worlds[0].build = null;
    await saveRepository.enqueueSave(run, profile);
  });
  await page.reload();
  await expect(page.getByText(/读取存档失败，已停止写入/)).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveClass(/readonly/);
  expect((await snapshot(page)).run.worlds[0].build).toBeNull();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { GAME_SESSION_LOCK } = await import("/src/services/exclusive-session.js");
        return (await navigator.locks.query()).held.some((lock) => lock.name === GAME_SESSION_LOCK);
      }),
    )
    .toBe(false);
});

test("read failure can be retried only after storage is accessible again", async ({ page }) => {
  await startRun(page);
  await page.addInitScript(() => {
    const nativeGet = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args) {
      if (sessionStorage.getItem("deny-read") === "1") {
        throw new DOMException("Storage restricted", "SecurityError");
      }
      return nativeGet.apply(this, args);
    };
  });
  await page.evaluate(() => sessionStorage.setItem("deny-read", "1"));
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/readonly/);
  await expect(page.getByText(/读取存档失败，已停止写入/)).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem("deny-read"));
  await page.getByRole("button", { name: /重新取得控制权/ }).click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/readonly/);
  await expect(page.locator(".metric").first()).toContainText("第 1 天");
  expect((await snapshot(page)).run.day).toBe(1);
});
