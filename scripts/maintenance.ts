import "dotenv/config";

import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";

const RESULT_PREFIX = "MAINTENANCE_RESULT: changes=";
const DIVIDER = "─".repeat(56);
const HEAVY_DIVIDER = "═".repeat(56);

interface ScriptDef {
  name: string;
  file: string;
  applyCmd: string;
  note?: string;
}

const SCRIPTS: ScriptDef[] = [
  {
    name: "Cleanup Orphaned Covers",
    file: "scripts/cleanup-orphaned-covers.ts",
    applyCmd: "pnpm cleanup:covers -- --delete",
  },
  {
    name: "Backfill Cover URLs",
    file: "scripts/backfill-cover-urls.ts",
    applyCmd: "pnpm backfill:cover-urls -- --apply",
  },
  {
    name: "Backfill Sort Fields",
    file: "scripts/backfill-sort-fields.ts",
    applyCmd: "pnpm backfill:sort-fields -- --apply",
  },
  {
    name: "Backfill User Stats",
    file: "scripts/backfill-user-stats.ts",
    applyCmd: "pnpm backfill:user-stats -- --apply",
  },
  {
    name: "Backfill Page Count",
    file: "scripts/backfill-page-count.ts",
    applyCmd: "pnpm backfill:page-count -- --apply",
    note: "Stops and restarts the CWA Docker container",
  },
  {
    name: "Enrich Goodreads URLs",
    file: "scripts/enrich-goodreads-url.ts",
    applyCmd: "pnpm enrich:goodreads-url -- --apply",
    note: "Requires Calibre library to be accessible",
  },
];

interface RunResult {
  name: string;
  changes: number | null;
  output: string;
  exitCode: number;
  applyCmd: string;
  note?: string;
}

function parseChanges(output: string): number | null {
  const lines = output.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (line.startsWith(RESULT_PREFIX)) {
      const n = parseInt(line.slice(RESULT_PREFIX.length), 10);
      return isNaN(n) ? null : n;
    }
  }
  return null;
}

function runScript(script: ScriptDef, index: number, total: number): RunResult {
  process.stdout.write(`[${index + 1}/${total}] ${script.name} ... `);

  const result = spawnSync("tsx", [script.file], {
    encoding: "utf-8",
    stdio: "pipe",
    env: process.env,
    shell: true,
  });

  const output = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.status ?? 1;

  let combinedOutput = output;
  if (exitCode !== 0) {
    if (result.error) combinedOutput += `\nERROR: ${result.error.message}`;
    if (stderr) combinedOutput += `\nSTDERR:\n${stderr}`;
  }

  if (exitCode === 0) {
    const changes = parseChanges(output);
    if (changes === null) {
      process.stdout.write("? (no result reported)\n");
    } else if (changes === 0) {
      process.stdout.write("nothing to do\n");
    } else {
      process.stdout.write(`${changes} change${changes === 1 ? "" : "s"} found\n`);
    }
    return { name: script.name, changes, output: combinedOutput, exitCode, applyCmd: script.applyCmd, note: script.note };
  } else {
    process.stdout.write("FAILED\n");
    return { name: script.name, changes: null, output: combinedOutput, exitCode, applyCmd: script.applyCmd, note: script.note };
  }
}

function printOutput(result: RunResult): void {
  if (!result.output.trim()) return;
  console.log(`\n${DIVIDER}`);
  console.log(`  ${result.name}`);
  console.log(DIVIDER);
  process.stdout.write(result.output.endsWith("\n") ? result.output : result.output + "\n");
}

function main(): void {
  const { values } = parseArgs({
    options: { verbose: { type: "boolean", default: false } },
  });
  const verbose = values.verbose ?? false;

  console.log(`\n${HEAVY_DIVIDER}`);
  console.log("  BOOKSHELF MAINTENANCE — DRY RUN");
  console.log(`${HEAVY_DIVIDER}\n`);

  const results: RunResult[] = [];

  for (let i = 0; i < SCRIPTS.length; i++) {
    results.push(runScript(SCRIPTS[i]!, i, SCRIPTS.length));
  }

  // Print script output
  const failed = results.filter((r) => r.exitCode !== 0);
  const outputResults = verbose ? results : failed;

  if (outputResults.some((r) => r.output.trim())) {
    console.log(`\n${HEAVY_DIVIDER}`);
    console.log(verbose ? "  SCRIPT OUTPUT" : "  FAILED SCRIPT OUTPUT");
    console.log(HEAVY_DIVIDER);
    for (const result of outputResults) {
      printOutput(result);
    }
  }

  // Summary
  const withChanges = results.filter((r) => r.exitCode === 0 && (r.changes ?? 0) > 0);
  const noChanges = results.filter((r) => r.exitCode === 0 && r.changes === 0);
  const unknownResult = results.filter((r) => r.exitCode === 0 && r.changes === null);

  console.log(`\n${HEAVY_DIVIDER}`);
  console.log("  SUMMARY");
  console.log(HEAVY_DIVIDER);

  if (withChanges.length > 0) {
    console.log("\nSUGGESTED — changes found, run to apply:");
    for (const r of withChanges) {
      const note = r.note ? `  (${r.note})` : "";
      console.log(`\n  ${r.name} — ${r.changes} change${r.changes === 1 ? "" : "s"}${note}`);
      console.log(`    ${r.applyCmd}`);
    }
  }

  if (noChanges.length > 0) {
    console.log("\nNO CHANGES:");
    for (const r of noChanges) {
      console.log(`  • ${r.name}`);
    }
  }

  if (unknownResult.length > 0) {
    console.log("\nUNKNOWN RESULT (script succeeded but emitted no result):");
    for (const r of unknownResult) {
      console.log(`  • ${r.name}`);
    }
  }

  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const r of failed) {
      console.log(`  • ${r.name} (exit code ${r.exitCode})`);
    }
  }

  console.log(`\n${HEAVY_DIVIDER}\n`);

  if (withChanges.length === 0 && failed.length === 0) {
    console.log("Everything is up to date.\n");
  }
}

main();
