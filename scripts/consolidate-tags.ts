import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const SCRIPT = resolve("E:\\cwa\\Cleanup\\consolidate_tags.py");

function parseChanges(output: string): number {
  let total = 0;
  const patterns: [RegExp, number][] = [
    [/Tags merged\s*:\s*(\d+)/, 1],
    [/Book links removed\s*:\s*(\d+)/, 1],
    [/AI-categorized books\s*:\s*(\d+)/, 1],
    [/Uncategorized books\s*:\s*(\d+)/, 1],
    [/Orphan tags cleaned\s*:\s*(\d+)/, 1],
  ];
  for (const [pattern] of patterns) {
    const match = output.match(pattern);
    if (match) total += parseInt(match[1]!, 10);
  }
  return total;
}

function main(): void {
  const result = spawnSync("python", [SCRIPT, "--dry-run"], {
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

  const changes = parseChanges(output);
  console.log(`MAINTENANCE_RESULT: changes=${changes}`);
}

main();
