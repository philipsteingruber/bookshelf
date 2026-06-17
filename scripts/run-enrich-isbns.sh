#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$PROJECT_ROOT/logs/enrich-isbns.log"

mkdir -p "$PROJECT_ROOT/logs"
cd "$PROJECT_ROOT"

echo "" >> "$LOG_FILE"
echo "=== ISBN Enrichment started at $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"

node node_modules/tsx/dist/cli.mjs scripts/enrich-isbns.ts --apply \
  >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo "=== Finished with exit code $EXIT_CODE ===" >> "$LOG_FILE"
exit $EXIT_CODE
