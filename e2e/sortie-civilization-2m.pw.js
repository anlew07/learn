import { expect, test } from "@playwright/test";

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

// A finger-only test: no locator.click() or programmatic scrolling.
// prettier-ignore
async function visibleTouchPoint(page, selector) {
  const bounds = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport || bounds.y < 0 ||
    bounds.x < 0 || bounds.x + bounds.width > viewport.width ||
    bounds.y + bounds.height > viewport.height) return null;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  const hit = await page.evaluate(({ x: px, y: py, selector: sel }) =>
    Boolean(document.elementFromPoint(px, py)?.closest(sel)), { x, y, selector });
  return hit ? { x, y } : null;
}

// prettier-ignore
async function fingerSwipe(page, forward = true) {
  const size = page.viewportSize();
  const client = await page.context().newCDPSession(page);
  const x = size.width * 0.5;
  const from = size.height * (forward ? 0.65 : 0.35);
  const to = size.height * (forward ? 0.43 : 0.57);
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x, y: from, id: 1 }],
    });
    for (let i = 1; i <= 8; i++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: from + (to - from) * i / 8, id: 1 }],
      });
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd", touchPoints: [],
    });
  } finally {
    await client.detach();
  }
}

// prettier-ignore
async function tapByFinger(page, selector) {
  for (let i = 0; i < 16; i++) {
    const point = await visibleTouchPoint(page, selector);
    if (point) {
      await page.touchscreen.tap(point.x, point.y);
      return;
    }
    const bounds = await page.locator(selector).boundingBox();
    const forward = !bounds || bounds.y + bounds.height / 2 > 88;
    await fingerSwipe(page, forward);
    await page.waitForTimeout(250);
  }
  throw new Error(selector + " cannot be physically reached");
}

// prettier-ignore
for (const viewport of viewports) {
  test("2M civilization map: collapsed by default, finger-open and real navigation " +
    viewport.width + "x" + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?mode=sortie");
    const tree = page.locator("[data-civilization-tree]");
    await expect(page.locator("[data-civilization-count]")).toContainText("1/8");
    await expect(tree).not.toHaveAttribute("open");
    await expect(page.locator("[data-civilization-next]")).toContainText("雾谷生还");
    await tapByFinger(page, "[data-civilization-tree] > summary");
    await expect(tree).toHaveAttribute("open", "");
    await expect(page.locator('[data-civilization-node="fire"]'))
      .toHaveAttribute("data-state", "complete");
    await expect(page.locator('[data-civilization-node="salvage"]'))
      .toHaveAttribute("data-state", "ready");
    await expect(page.locator('[data-civilization-node="forge"]'))
      .toHaveAttribute("data-state", "locked");
    await tapByFinger(page, '.sortie-civilization-shortcuts [data-civilization-target="salvage"]');
    await expect(page.locator("[data-sortie-mission-salvage]")).toBeEnabled();
    await page.waitForTimeout(450);
    expect(await visibleTouchPoint(page, "[data-sortie-mission-salvage]"))
      .not.toBeNull();
    // Navigation is not a mission selection or a hidden purchase.
    const selected = await page.evaluate(async () => {
      const { sortieRepository } = await import("/src/services/sortie-persistence.js");
      const archive = await sortieRepository.load();
      return archive?.run?.sortieCamp?.missionSelection ?? null;
    });
    expect(selected).toBeNull();
  });
}
