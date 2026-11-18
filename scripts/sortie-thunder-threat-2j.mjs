import { spawnSync } from "node:child_process";

const args = ["test", "--", "tests/sortie-thunder-threat-2j.test.js"];
const run = spawnSync("npm", args, {
  stdio: "inherit",
  env: { ...process.env, SORTIE_THUNDER_FULL: "1" },
});
process.exit(run.status ?? 1);
