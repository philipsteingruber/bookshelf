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
