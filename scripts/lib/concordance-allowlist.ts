import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Takes books off Concordance's write allowlist (~/concordance/allowlist, keyed
 * by Calibre id) when Bookshelf stops treating them as READING. Concordance's
 * own sync also prunes them, but only after 24h not READING; doing it here as
 * well means an abandoned book is off the list the moment it's marked.
 *
 * Shells out to Concordance's allowlist CLI rather than editing the file, so
 * the file format has one owner. `remove` is a no-op for ids that aren't there.
 */

type Runner = (dir: string, args: string[]) => string;

const defaultRunner: Runner = (dir, args) =>
  execFileSync(process.env.CONCORDANCE_PYTHON ?? "python3", ["-m", "concordance.allowlist", ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
  });

export const concordanceDir = (): string => process.env.CONCORDANCE_DIR ?? path.join(homedir(), "concordance");

export const removeArgs = (calibreIds: (number | null)[]): string[] | null => {
  const ids = [...new Set(calibreIds.filter((id): id is number => id !== null))].sort((a, b) => a - b);
  return ids.length > 0 ? ["remove", ...ids.map(String)] : null;
};

/** Returns the lines to log. Never throws: the Bookshelf update has already been made. */
export const removeFromConcordanceAllowlist = (
  calibreIds: (number | null)[],
  dir: string = concordanceDir(),
  run: Runner = defaultRunner,
): string[] => {
  const args = removeArgs(calibreIds);
  if (args === null) return [];
  if (!existsSync(path.join(dir, "concordance"))) {
    return [`Concordance allowlist: skipped, no Concordance checkout at ${dir}`];
  }
  try {
    const output = run(dir, args).trim();
    return output.split("\n").map((line) => `Concordance allowlist: ${line}`);
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return [`Concordance allowlist: FAILED to remove ${args.slice(1).join(", ")}: ${message}`];
  }
};
