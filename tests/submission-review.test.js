import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectTextLines } from "../scripts/export-game-text.mjs";
import { collectRuntimeTemplates } from "../scripts/export-runtime-templates.mjs";
import { describe, expect, it } from "vitest";
import {
  buildReviewRows,
  renderHumanReviewCsv,
  reviewScene,
  reviewTopics,
} from "../scripts/export-human-review.mjs";

describe("human review working sheet", () => {
  const staticInput = [
    ["src/systems/wave-combat.js", 10, "静态/待复核", "重点复核", 'message: "迎击尸群";'],
  ];
  const dynamicInput = [
    [
      "src/engine.js",
      88,
      "加号拼接",
      "重点复核",
      "待人工复原",
      "救援失败：【变量】",
      "reason",
    ],
  ];

  it("combines existing exporters and retains exact origin, branches and blank review fields", () => {
    const rows = buildReviewRows(staticInput, dynamicInput);
    expect(rows).toHaveLength(2);
    expect(rows[0][3]).toBe("动态模板");
    expect(rows[0][9]).toBe("救援失败：【变量】");
    expect(rows[0][11]).toBe("reason");
    expect(rows[0][12]).toBe("");
    expect(rows[1][10]).toContain("迎击尸群");
    expect(rows.every((row) => row[15] === "待人工复核")).toBe(true);
  });

  it("uses deterministic unique review fingerprints even for duplicate source statements", () => {
    const first = buildReviewRows([...staticInput, ...staticInput], dynamicInput);
    const second = buildReviewRows([...staticInput, ...staticInput], dynamicInput);
    expect(first).toEqual(second);
    expect(new Set(first.map((row) => row[1])).size).toBe(3);
  });

  it("keeps candidate fingerprints stable when unrelated source lines are inserted", () => {
    const before = buildReviewRows(staticInput, dynamicInput);
    const shiftedStatic = staticInput.map((row) => [row[0], row[1] + 12, ...row.slice(2)]);
    const shiftedDynamic = dynamicInput.map((row) => [row[0], row[1] + 12, ...row.slice(2)]);
    const after = buildReviewRows(shiftedStatic, shiftedDynamic);
    expect(after.map((row) => row[1])).toEqual(before.map((row) => row[1]));
    expect(after.map((row) => row[5])).not.toEqual(before.map((row) => row[5]));
  });

  it("escapes multiline quotes and spreadsheet formulas", () => {
    const sample = buildReviewRows(
      [["src/ui.js", 5, "静态/待复核", "常规核对", '=HYPERLINK("bad")\n求助']],
      [],
    );
    const csv = renderHumanReviewCsv(sample);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"\u0027=HYPERLINK(""bad"")\n求助"');
    expect(csv).toContain('"待人工复核"');
    expect(csv).toContain('"定位用源码（非最终可见全文）"');
  });

  it("can trace every generated candidate back to an existing source line", () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const staticRows = collectTextLines();
    const dynamicRows = collectRuntimeTemplates();
    const rows = buildReviewRows(staticRows, dynamicRows);
    const sources = new Map();

    expect(rows).toHaveLength(staticRows.length + dynamicRows.length);
    expect(new Set(rows.map((row) => row[1])).size).toBe(rows.length);
    for (const row of rows) {
      const path = row[4];
      if (!sources.has(path)) {
        sources.set(path, readFileSync(join(root, path), "utf8").split(/\r?\n/u));
      }
      const sourceLine = sources.get(path)[row[5] - 1];
      expect(sourceLine, path + ":" + row[5]).toBeDefined();
      if (row[3] === "源码行") expect(row[10]).toBe(sourceLine.trim());
      else {
        expect(row[9]).not.toBe("");
        expect(row[11]).not.toBe("");
      }
    }
  });

  it("exports a review sheet without touching the checked-in static text archive", () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const staticCsvPath = join(root, "docs/review/game-text.csv");
    const before = readFileSync(staticCsvPath);
    const modifiedAt = statSync(staticCsvPath).mtimeMs;
    const command = spawnSync(process.execPath, ["scripts/export-human-review.mjs", "--stdout"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });

    expect(command.status, command.stderr).toBe(0);
    expect(command.stdout.startsWith("\uFEFF")).toBe(true);
    expect(command.stdout).toContain('"玩家可见完整原文（人工填写）"');
    expect(readFileSync(staticCsvPath)).toEqual(before);
    expect(statSync(staticCsvPath).mtimeMs).toBe(modifiedAt);
  });

  it("classifies risk and game scenes without calling them platform decisions", () => {
    expect(reviewTopics("尸群逼近，分身受伤")).toContain("感染或恐怖氛围");
    expect(reviewTopics("尸群逼近，分身受伤")).toContain("伤势或失败代价");
    expect(reviewTopics("大家互相救援")).toBe("常规语境审阅");
    expect(reviewScene("src/systems/easter-eggs.js")).toBe("隐藏彩蛋");
    expect(reviewScene("src/systems/wave-combat.js")).toBe("战斗与回放");
  });
});
