import { execSync } from "child_process";

interface StepResult {
  name: string;
  passed: boolean;
  output: string;
}

const steps = [
  { name: "Tests", command: "vitest run" },
  { name: "Type check", command: "tsc --noEmit" },
  { name: "Build", command: "next build" },
];

const results: StepResult[] = [];

for (const step of steps) {
  const stepLabel = `[${results.length + 1}/${steps.length}]`;
  process.stdout.write(`${stepLabel} Running ${step.name}...`);

  try {
    execSync(step.command, {
      stdio: "pipe",
      encoding: "utf-8",
    });
    results.push({ name: step.name, passed: true, output: "" });
    process.stdout.write(" \x1b[32mPASS\x1b[0m\n");
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    const output = [execError.stdout, execError.stderr]
      .filter(Boolean)
      .join("\n");
    results.push({ name: step.name, passed: false, output });
    process.stdout.write(" \x1b[31mFAIL\x1b[0m\n");
  }
}

const maxNameLength = Math.max(...results.map((r) => r.name.length));

console.log("\n--- Preflight Summary ---\n");

for (const result of results) {
  const label = result.name.padEnd(maxNameLength);
  const status = result.passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${label}  ${status}`);
}

console.log("");

const failed = results.filter((r) => !r.passed);

if (failed.length > 0) {
  for (const result of failed) {
    console.log(`\x1b[31m--- ${result.name} output ---\x1b[0m\n`);
    console.log(result.output);
    console.log("");
  }
  process.exit(1);
}
