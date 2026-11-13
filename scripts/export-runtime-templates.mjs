import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = join(root, "docs/review/runtime-templates.csv");
const chinese = /[\u3400-\u9fff]/u;
const reviewRisk = /(?:死亡|血腥|血液|屠|虐待|绝望|末日|毁灭|尸潮|兽潮|猎杀|清剿|杀戮)/u;

function jsFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...jsFiles(path));
    else if (extname(entry.name) === ".js") result.push(path);
  }
  return result.sort();
}

function csvCell(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

/**
 * Use ESLint's existing JavaScript parser instead of a hand-written regex lexer.
 * This archive is intentionally conservative: expressions, branches, HTML and
 * join() results still need humans to reconstruct actual display strings.
 */
export function extractDynamicTemplatesFromSource(source, path = "src/example.js") {
  const rows = [];
  const linter = new Linter();
  const rule = {
    meta: { type: "problem", schema: [] },
    create(context) {
      const code = context.sourceCode;
      const expr = (node) => code.getText(node).replace(/\s+/gu, " ").slice(0, 100);
      const merge = (a, b) => ({
        text: a.text + b.text,
        bindings: [...a.bindings, ...b.bindings],
      });
      const render = (node) => {
        if (node.type === "Literal" && typeof node.value === "string") {
          return { text: node.value, bindings: [] };
        }
        if (node.type === "TemplateLiteral") {
          let rendered = { text: "", bindings: [] };
          for (let i = 0; i < node.quasis.length; i++) {
            rendered = merge(rendered, {
              text: node.quasis[i].value.cooked ?? node.quasis[i].value.raw,
              bindings: [],
            });
            if (i < node.expressions.length) {
              rendered = merge(rendered, { text: "【变量】", bindings: [expr(node.expressions[i])] });
            }
          }
          return rendered;
        }
        if (node.type === "BinaryExpression" && node.operator === "+") {
          return merge(render(node.left), render(node.right));
        }
        return { text: "【变量】", bindings: [expr(node)] };
      };
      const record = (node, kind) => {
        const result = render(node);
        if (!result.bindings.length || !chinese.test(result.text)) return;
        rows.push([
          path,
          node.loc.start.line,
          kind,
          reviewRisk.test(result.text) ? "重点复核" : "常规核对",
          "待人工复原",
          result.text,
          result.bindings.join("；"),
        ]);
      };
      return {
        BinaryExpression(node) {
          if (node.operator !== "+") return;
          if (node.parent?.type === "BinaryExpression" && node.parent.operator === "+") return;
          record(node, "加号拼接");
        },
        TemplateLiteral(node) {
          if (node.parent?.type === "BinaryExpression" && node.parent.operator === "+") return;
          record(node, "模板字符串");
        },
      };
    },
  };
  const messages = linter.verify(
    source,
    {
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
      plugins: { review: { rules: { collect: rule } } },
      rules: { "review/collect": "error" },
    },
    { filename: path },
  );
  const syntaxError = messages.find((message) => message.fatal);
  if (syntaxError) throw new Error(path + ":" + syntaxError.line + " " + syntaxError.message);
  return rows;
}

export function collectRuntimeTemplates() {
  return jsFiles(join(root, "src")).flatMap((path) =>
    extractDynamicTemplatesFromSource(
      readFileSync(path, "utf8"),
      relative(root, path).replaceAll("\\", "/"),
    ),
  );
}

export function renderRuntimeCsv(rows) {
  const header = [
    "源码文件",
    "起始行",
    "提取方式",
    "风险提示",
    "复核状态",
    "可搜索候选句式（变量需替换）",
    "变量源码表达式",
  ];
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = collectRuntimeTemplates();
  const csv = renderRuntimeCsv(rows);
  if (process.argv.includes("--stdout")) process.stdout.write(csv);
  else {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, csv, "utf8");
    console.log("动态候选句式：" + rows.length + " 条，输出：docs/review/runtime-templates.csv");
  }
}
