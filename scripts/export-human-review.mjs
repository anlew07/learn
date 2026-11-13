import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectTextLines } from "./export-game-text.mjs";
import { collectRuntimeTemplates } from "./export-runtime-templates.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = join(root, "docs/review/human-review-worklist.csv");

const headers = [
  "序号",
  "候选指纹（辅助追踪）",
  "场景分类",
  "来源类型",
  "源码文件",
  "起始行",
  "原始类别",
  "自动风险提示（非平台判断）",
  "风险方向（仅供人工研判）",
  "自动候选句式（非最终可见全文）",
  "定位用源码（非最终可见全文）",
  "动态变量表达式",
  "玩家可见完整原文（人工填写）",
  "条件与分支（人工填写）",
  "是否实际可见（待确认）",
  "人工审核状态",
  "人工处理决定与理由",
  "复核人",
  "复核日期",
  "实机截图或录屏证据",
];

export function reviewScene(path) {
  if (path.includes("easter-eggs")) return "隐藏彩蛋";
  if (/wave-combat|survivor-waves|attack-patterns/u.test(path)) return "战斗与回放";
  if (/event-chain|event-contract|clue-aftermath/u.test(path)) return "重大事件与分支";
  if (/finale-readiness|run-metrics/u.test(path)) return "结局与结算";
  if (/aid-contract|fusion-contract|strategy-contract|profile-collection/u.test(path)) {
    return "角色成长与跨世界协作";
  }
  if (/crisis-advisor|action-policy/u.test(path)) return "危机提示与自主行动";
  if (path === "src/engine.js") return "事件日志与结局";
  if (path === "src/ui.js" || path === "index.html") return "首页界面与交互";
  if (path.includes("game-data")) return "世界角色与技能";
  return "其他游戏文字";
}

export function reviewTopics(text) {
  const topics = [];
  if (/血腥|血液|杀戮|屠|虐待|猎杀|清剿|肃清/u.test(text)) {
    topics.push("暴力表现措辞");
  }
  if (/尸群|感染者|感染体|尸潮|恐怖|恐惧|惊悚|怪物/u.test(text)) {
    topics.push("感染或恐怖氛围");
  }
  if (/死亡|绝望|毁灭|末日|崩溃|失守/u.test(text)) {
    topics.push("灾变或消极叙述");
  }
  if (/受伤|伤势|牺牲|失败|撤退/u.test(text)) {
    topics.push("伤势或失败代价");
  }
  return topics.length ? topics.join("；") : "常规语境审阅";
}

export function buildReviewRows(staticRows, dynamicRows) {
  const entries = [];
  for (const row of staticRows) {
    entries.push({
      kind: "源码行",
      path: row[0],
      line: row[1],
      type: row[2],
      priority: row[3],
      candidate: "",
      source: row[4],
      variables: "",
    });
  }
  for (const row of dynamicRows) {
    entries.push({
      kind: "动态模板",
      path: row[0],
      line: row[1],
      type: row[2],
      priority: row[3],
      candidate: row[5],
      source: "",
      variables: row[6],
    });
  }
  entries.sort(
    (a, b) =>
      a.path.localeCompare(b.path, "en") ||
      Number(a.line) - Number(b.line) ||
      a.kind.localeCompare(b.kind, "en") ||
      a.candidate.localeCompare(b.candidate, "zh"),
  );
  const seen = new Map();
  return entries.map((entry, index) => {
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          entry.kind,
          entry.path,
          // Keep audit IDs stable when unrelated source lines shift.
          entry.type,
          entry.candidate,
          entry.source,
          entry.variables,
        ]),
      )
      .digest("hex")
      .slice(0, 14);
    const prior = seen.get(fingerprint) ?? 0;
    seen.set(fingerprint, prior + 1);
    const id = entry.kind === "源码行" ? "S-" : "D-";
    const uniqueId = id + fingerprint + (prior ? "-" + (prior + 1) : "");
    const text = entry.candidate || entry.source;
    return [
      index + 1,
      uniqueId,
      reviewScene(entry.path),
      entry.kind,
      entry.path,
      entry.line,
      entry.type,
      entry.priority,
      reviewTopics(text),
      entry.candidate,
      entry.source,
      entry.variables,
      "",
      "",
      "待确认",
      "待人工复核",
      "",
      "",
      "",
      "",
    ];
  });
}

function csvCell(value) {
  let result = String(value ?? "");
  // Quoting alone does not prevent spreadsheet formula execution.
  if (/^[\s]*[=+\-@]/u.test(result)) result = "'" + result;
  return '"' + result.replaceAll('"', '""') + '"';
}

export function renderHumanReviewCsv(rows) {
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const staticRows = collectTextLines();
  const dynamicRows = collectRuntimeTemplates();
  const rows = buildReviewRows(staticRows, dynamicRows);
  if (!rows.length) throw new Error("审核工作表为空，请检查文字提取器。");
  if (process.argv.includes("--stdout")) {
    process.stdout.write(renderHumanReviewCsv(rows));
  } else {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, renderHumanReviewCsv(rows), "utf8");
    console.log(
      "逐条审核候选：" +
        rows.length +
        " 条（静态 " +
        staticRows.length +
        "；动态 " +
        dynamicRows.length +
        "），输出 docs/review/human-review-worklist.csv",
    );
  }
}
