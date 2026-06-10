const MAINTENANCE_PREFIX = "MAINTENANCE_RESULT: changes=";

export function parseMaintenanceChanges(output: string): number | null {
  const lines = output.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (line.startsWith(MAINTENANCE_PREFIX)) {
      const n = parseInt(line.slice(MAINTENANCE_PREFIX.length), 10);
      return isNaN(n) ? null : n;
    }
  }
  return null;
}

const PYTHON_PATTERNS: RegExp[] = [
  /Tags merged\s*:\s*(\d+)/,
  /Book links removed\s*:\s*(\d+)/,
  /AI-categorized books\s*:\s*(\d+)/,
  /Uncategorized books\s*:\s*(\d+)/,
  /Orphan tags cleaned\s*:\s*(\d+)/,
];

export function parsePythonChanges(output: string): number {
  let total = 0;
  for (const pattern of PYTHON_PATTERNS) {
    const m = output.match(pattern);
    if (m) total += parseInt(m[1]!, 10);
  }
  return total;
}
