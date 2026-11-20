import { spawnSync } from "node:child_process";

const args = ["test", "--", "tests/sortie-thunder-value-2i.test.js"];
const run = spawnSync("npm", args, { stdio: "inherit" });
process.exit(run.status ?? 1);
