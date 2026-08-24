#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="/opt/docker/data/cwa/.calibre-cron.lock"
DB_LOCK_FILE="$PROJECT_ROOT/scripts/.bookshelf-db.lock"
LOG_FILE="$PROJECT_ROOT/logs/calibre-sync.log"

mkdir -p "$PROJECT_ROOT/logs"
cd "$PROJECT_ROOT"

# CWA lock: serializes against the other CWA-side cron jobs (isbn enrich, tag consolidation).
exec 200>"$LOCK_FILE"
flock -w 1800 200

# DB lock: shared with run-abs-sync.sh, both write to the same Postgres rows via Prisma.
exec 201>"$DB_LOCK_FILE"
flock -w 1800 201

echo "" >> "$LOG_FILE"
echo "=== Calibre Sync started at $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"

set +e
# 30min ceiling, SIGKILL 60s after SIGTERM if the process ignores it — a stuck
# run (e.g. an unbounded network call hanging forever) would otherwise hold
# both flocks above indefinitely, blocking every future run silently.
# See docs/kb/bookshelf.md's 2026-08-24 incident entry for why this exists.
timeout --kill-after=60 1800 \
  node node_modules/tsx/dist/cli.mjs scripts/sync-calibre.ts \
  --apply \
  --calibre-db /opt/docker/data/calibre-library/metadata.db \
  --cwa-db /opt/docker/data/cwa/config/app.db \
  >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
set -e

echo "=== Finished with exit code $EXIT_CODE ===" >> "$LOG_FILE"
exit $EXIT_CODE
