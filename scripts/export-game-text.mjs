import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewPriority } from "./text-review-risk.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = join(root, "docs/review/game-text.csv");
const chinese = /[\u3400-\u9fff]/u;
const uiEnglish = /\b(?:WAVE|CLEAR|FRENZY|MULTIVERSE|EARLY ACCESS)\b/;
const sourceExt = new Set([".js", ".html", ".css", ".svg"]);

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(path));
    else if (sourceExt.has(extname(entry.name))) found.push(path);
  }
  return found.sort();
}

function quoteCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

/**
 * Conservative review archive: all Chinese-bearing source lines, including
 * template/string fragments, plus directly rendered English playback labels.
 * Do not suppress uncertain lines: review the "source line" column manually.
 * Runtime interpolations still require a separate human pass.
 */
export function collectTextLines() {
  const files = [join(root, "index.html"), ...sourceFiles(join(root, "src"))].sort();
  const rows = [];
  for (const file of files) {
    const source = relative(root, file).replaceAll("\\", "/");
    const lines = readFileSync(file, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (!chinese.test(line) && !uiEnglish.test(line)) return;
      const original = line.trim();
      const isComment = /^(?:\/\/|\/\*|\*|<!--|#)/u.test(original);
      let category = "静态/待复核";
      if (isComment) category = "注释/需筛除";
      else if (/\$\{|['"]\s*\+|\+\s*['"]/u.test(original)) category = "动态拼接/需复原";
      rows.push([source, index + 1, category, reviewPriority(original), original]);
    });
  }
  return rows;
}

export function renderReviewCsv(rows) {
  const header = ["源码文件", "行号", "审核类型", "风险提示", "可搜索原文（源码静态片段）"];
  const csvRows = [header, ...rows].map((row) => row.map(quoteCell).join(","));
  return `\uFEFF${csvRows.join("\n")}\n`;
}

const rows = collectTextLines();
const expected = renderReviewCsv(rows);
if (process.argv.includes("--check")) {
  if (!existsSync(output) || readFileSync(output, "utf8") !== expected) {
    console.error("审查文本清单与游戏源码不一致；执行 npm run text:export 并提交更新的 CSV。");
    process.exitCode = 1;
  }
} else {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, expected, "utf8");
}
console.log(
  `游戏文案候选行：${rows.length}（${new Set(rows.map((row) => row[0])).size} 个源码文件）`,
);
