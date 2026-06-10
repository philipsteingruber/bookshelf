import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { resolve } from "node:path";

import { parsePythonChanges } from "./lib/script-output";

const SCRIPT = resolve("E:\\docker\\data\\cwa\\Cleanup\\consolidate_tags.py");

function main(): void {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false } },
  });
  const apply = values.apply ?? false;

  const args = apply ? [SCRIPT] : [SCRIPT, "--dry-run"];
  const result = spawnSync("python", args, {
    encoding: "utf-8",
    stdio: "pipe",
    env: process.env,
  });

  const output = result.stdout ?? "";
  const exitCode = result.status ?? 1;

  process.stdout.write(output);

  if (exitCode !== 0) {
    const stderr = result.stderr ?? "";
    if (stderr) process.stderr.write(stderr);
    process.exit(exitCode);
  }

  const changes = parsePythonChanges(output);
  console.log(`MAINTENANCE_RESULT: changes=${changes}`);
}

main();
