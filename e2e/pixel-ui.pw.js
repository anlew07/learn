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
      const metricLabelSize = await page.locator(".run-dashboard .metric span").first().evaluate((element) => {
        return parseFloat(getComputedStyle(element).fontSize);
      });
      expect(metricLabelSize).toBeGreaterThanOrEqual(11);
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

async function computedContrastRatio(page, foregroundSelector, backgroundSelector = foregroundSelector) {
  const { foreground, background } = await page.evaluate(
    ({ foregroundSelector, backgroundSelector }) => {
      return {
        foreground: getComputedStyle(document.querySelector(foregroundSelector)).color,
        background: getComputedStyle(document.querySelector(backgroundSelector)).backgroundColor,
      };
    },
    { foregroundSelector, backgroundSelector },
  );
  const luminance = (color) => {
    const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
    if (channels.length !== 3) throw new Error(`Unsupported computed color: ${color}`);
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("status pills and selected navigation meet readable text contrast at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  await page.goto("/");
  await expect(page.locator(".topbar > .pill")).toBeVisible();
  expect(await computedContrastRatio(page, ".topbar > .pill")).toBeGreaterThanOrEqual(4.5);

  await openRun(page);
  for (const [foreground, background] of [
    [".footer-nav button.active", ".footer-nav button.active"],
    [".footer-nav button.active .nav-glyph", ".footer-nav button.active"],
    [".world-head .pill", ".world-head .pill"],
  ]) {
    expect(await computedContrastRatio(page, foreground, background), foreground).toBeGreaterThanOrEqual(4.5);
  }
  const intel = page.locator(".world-intel").first();
  if (!(await intel.evaluate((element) => element.open))) {
    await intel.locator("summary").click();
  }
  await expect(page.locator(".world-extra .pill").first()).toBeVisible();
  expect(await computedContrastRatio(page, ".world-extra .pill")).toBeGreaterThanOrEqual(4.5);
});
