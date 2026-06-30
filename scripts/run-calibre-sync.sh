#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="/opt/docker/data/cwa/.calibre-cron.lock"
LOG_FILE="$PROJECT_ROOT/logs/calibre-sync.log"

mkdir -p "$PROJECT_ROOT/logs"
cd "$PROJECT_ROOT"

exec 200>"$LOCK_FILE"
flock -w 1800 200

echo "" >> "$LOG_FILE"
echo "=== Calibre Sync started at $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"

set +e
node node_modules/tsx/dist/cli.mjs scripts/sync-calibre.ts \
  --apply \
  --calibre-db /opt/docker/data/calibre-library/metadata.db \
  --cwa-db /opt/docker/data/cwa/config/app.db \
  >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
set -e

echo "=== Finished with exit code $EXIT_CODE ===" >> "$LOG_FILE"
exit $EXIT_CODE
