import { describe, expect, it } from "vitest";
import {
  extractDynamicTemplatesFromSource,
  renderRuntimeCsv,
} from "../scripts/export-runtime-templates.mjs";

describe("runtime review templates", () => {
  it("assembles nested concatenation once, keeping variable expressions", () => {
    const rows = extractDynamicTemplatesFromSource(
      'log("第" + day + "天，救援准备增加" + delta + "点。");',
      "src/demo.js",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([
      "src/demo.js",
      1,
      "加号拼接",
      "常规核对",
      "待人工复原",
      "第【变量】天，救援准备增加【变量】点。",
      "day；delta",
    ]);
  });

  it("extracts template literals without confusing comments with display copy", () => {
    const tick = String.fromCharCode(96);
    const code = [
      "// 第一天救援记录（内部注释，不应作为显示模板）",
      "const summary = " + tick + "第" + "$" + "{day}天，" + "$" + "{name}完成救援" + tick + ";",
    ].join("\n");
    const rows = extractDynamicTemplatesFromSource(code);
    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toBe(2);
    expect(rows[0][2]).toBe("模板字符串");
    expect(rows[0][5]).toBe("第【变量】天，【变量】完成救援");
    expect(rows[0][6]).toBe("day；name");
  });

  it("keeps risk flags and Excel-safe quotes, while omitting purely internal IDs", () => {
    const rows = extractDynamicTemplatesFromSource(
      'const id = "world-" + number; const copy = "毁灭压力：" + d + "，进入\\\"安全区\\\"";',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0][3]).toBe("重点复核");
    const csv = renderRuntimeCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('""安全区""');
    expect(csv).toContain('"待人工复原"');
  });

  it("surfaces JS syntax errors instead of silently shipping an incomplete report", () => {
    expect(() => extractDynamicTemplatesFromSource("const = ;", "src/broken.js")).toThrow(
      /src\/broken\.js:1/,
    );
  });
});
