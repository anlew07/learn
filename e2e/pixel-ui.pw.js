import { test, expect } from "@playwright/test";

async function openRun(page) {
  await page.goto("/");
  const action = page.locator('[data-action="new-run"][data-onboarding="full"]');
  await expect(action).toBeVisible();
  await action.click();
  await expect(page.locator(".world")).toHaveCount(2);
}

for (const width of [320, 375, 390, 430]) {
  test(`pixel art material and touch layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    await openRun(page);
    await expect(page.locator(".topbar .home-link")).toHaveCSS("white-space", "nowrap");
    if (width <= 350) {
      const columns = await page.locator(".run-dashboard .metrics").evaluate((element) => {
        return getComputedStyle(element).gridTemplateColumns.split(" ").length;
      });
      expect(columns).toBe(2);
    }

    const audit = await page.evaluate(() => {
      const visible = [...document.querySelectorAll("*")].filter((element) => {
        const style = getComputedStyle(element);
        return element.getClientRects().length > 0 && style.visibility !== "hidden";
      });
      const violations = [];
      for (const element of visible) {
        const style = getComputedStyle(element);
        const label = typeof element.className === "string" ? element.className : element.tagName;
        if (/gradient\(/i.test(style.backgroundImage)) {
          violations.push(`${label}: gradient`);
        }
        if (/blur\(/i.test(style.backdropFilter)) {
          violations.push(`${label}: backdrop blur`);
        }
        if (/(?:blur|drop-shadow)\(/i.test(style.filter)) {
          violations.push(`${label}: softened filter`);
        }
        if (parseFloat(style.borderTopLeftRadius) > 0) {
          violations.push(`${label}: rounded corner`);
        }
      }
      for (const element of visible.filter((item) => item.matches("button,select,summary"))) {
        const height = element.getBoundingClientRect().height;
        if (height < 43.5) {
          violations.push(`${element.tagName}: small target (${height}px)`);
        }
      }
      const firstWorld = document.querySelector(".world");
      const logo = firstWorld?.querySelector(".world-insignia");
      const spriteStyle = logo ? getComputedStyle(logo) : null;
      return {
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
        violations,
        sprite: spriteStyle?.backgroundImage ?? "",
        spriteRendering: spriteStyle?.imageRendering ?? "",
        nav: Boolean(document.querySelector(".footer-nav")),
      };
    });
    expect(audit.width).toBeLessThanOrEqual(audit.viewport + 1);
    expect(audit.violations).toEqual([]);
    expect(audit.sprite).toMatch(/avatar-lingzai|data:image\/svg\+xml/i);
    expect(audit.spriteRendering).toBe("pixelated");
    expect(audit.nav).toBe(true);

    await page.locator('button[data-tab="soul"]').click();
    await expect(page.locator("#aid-choice-preview")).toBeVisible();
    await page.locator('button[data-tab="log"]').click();
    await expect(page.locator(".footer-nav")).toBeVisible();
  });
}

test("reduced motion disables all replay pixel animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRun(page);
  const result = await page.evaluate(() => {
    const ghost = document.createElement("div");
    ghost.className = "replay-arena is-playing";
    const wave = document.createElement("div");
    wave.className = "replay-wave";
    const hit = document.createElement("div");
    hit.className = "replay-hit";
    wave.append(hit);
    ghost.append(wave);
    document.body.append(ghost);
    const values = [getComputedStyle(wave).animationName, getComputedStyle(hit).animationName];
    ghost.remove();
    return values;
  });
  expect(result).toEqual(["none", "none"]);
});
