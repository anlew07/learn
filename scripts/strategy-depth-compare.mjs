import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { compareRescueNestPriority } from "./strategy-depth-core.js";

export { compareRescueNestPriority } from "./strategy-depth-core.js";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = process.argv.slice(2);
  const sampleArg = options.find((arg) => arg.startsWith("--seeds="));
  const samples = Number(sampleArg?.split("=")[1] ?? 100);
  const waves = options.includes("--waves");
  const report = compareRescueNestPriority(samples, { waves });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (options.includes("--assert") && report.rows.some((row) => row.incomplete > 0)) {
    throw new Error("Seeded balance runs did not reach a terminal state.");
  }
}
