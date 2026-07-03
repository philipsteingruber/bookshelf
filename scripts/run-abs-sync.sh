#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="$PROJECT_ROOT/scripts/.bookshelf-db.lock"
LOG_FILE="$PROJECT_ROOT/logs/abs-sync.log"

mkdir -p "$PROJECT_ROOT/logs"
cd "$PROJECT_ROOT"

# Shared with run-calibre-sync.sh: both scripts write to the same Postgres
# rows via Prisma, so this prevents a lost-update race if they ever overlap.
exec 200>"$LOCK_FILE"
flock -w 1800 200

echo "" >> "$LOG_FILE"
echo "=== ABS Sync started at $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"

set +e
node node_modules/tsx/dist/cli.mjs scripts/sync-abs.ts \
  --apply \
  >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
set -e

echo "=== Finished with exit code $EXIT_CODE ===" >> "$LOG_FILE"
exit $EXIT_CODE
