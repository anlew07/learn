import { describe, expect, it, vi } from "vitest";
import {
  applyTextSize,
  readTextSize,
  setTextSize,
  supportPageHtml,
} from "../src/ui/support-pages.js";

describe("first-session help and local settings", () => {
  it("explains actual rules, two initial worlds and non-reward replays", () => {
    const html = supportPageHtml("help");
    expect(html).toContain("分身自动行动");
    expect(html).toContain("P100");
    expect(html).toContain("废土世界仍在同步运行");
    expect(html).toContain("不额外获得奖励");
    expect(html).not.toContain("购买");
  });

  it("shows only real settings without placeholder audio or cloud toggles", () => {
    const html = supportPageHtml("settings", {
      textSize: "large", hasRun: true, readonly: true, saveFailed: false,
    });
    expect(html).toContain('data-action="text-size"');
    expect(html).toContain('data-value="large" aria-pressed="true"');
    expect(html).toContain("此标签页目前只读");
    expect(html).toContain("没有账号登录和云存档");
    expect(html).not.toContain("data-action=\"cloud");
    expect(html).not.toContain("data-action=\"music");
  });

  it("stores only a cosmetic preference, never altering game state", () => {
    const store = new Map();
    const root = { dataset: {} };
    vi.stubGlobal("localStorage", {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, value),
    });
    vi.stubGlobal("document", { documentElement: root });
    try {
      expect(readTextSize()).toBe("standard");
      expect(setTextSize("large")).toBe(true);
      expect(readTextSize()).toBe("large");
      expect(applyTextSize()).toBe("large");
      expect(root.dataset.textSize).toBe("large");
      expect(setTextSize("ineligible")).toBe(false);
      expect(store.size).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not crash when the browser blocks preference storage", () => {
    const root = { dataset: {} };
    vi.stubGlobal("localStorage", {
      getItem() { throw new Error("Storage denied"); },
      setItem() { throw new Error("Storage denied"); },
    });
    vi.stubGlobal("document", { documentElement: root });
    try {
      expect(readTextSize()).toBe("standard");
      expect(setTextSize("large")).toBe(false);
      expect(root.dataset.textSize).toBe("large");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
