#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="$PROJECT_ROOT/scripts/.bookshelf-db.lock"
LOG_FILE="$PROJECT_ROOT/logs/mark-abandoned.log"

mkdir -p "$PROJECT_ROOT/logs"
cd "$PROJECT_ROOT"

# Shared with run-calibre-sync.sh/run-abs-sync.sh: all three write to the
# same Postgres rows via Prisma, so this prevents a lost-update race if they
# ever overlap. Read-only here (no --apply below) but still serialized since
# it reads Book/ReadingProgress rows the other two are writing.
exec 200>"$LOCK_FILE"
flock -w 1800 200

echo "" >> "$LOG_FILE"
echo "=== Abandoned Book Check started at $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"

set +e
# 30min ceiling, SIGKILL 60s after SIGTERM if the process ignores it — a stuck
# run would otherwise hold the flock above indefinitely, blocking every
# future run silently. See docs/kb/bookshelf.md's 2026-08-24 incident entry.
timeout --kill-after=60 1800 \
  node node_modules/tsx/dist/cli.mjs scripts/mark-abandoned-books.ts \
  --days 7 \
  >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
set -e

echo "=== Finished with exit code $EXIT_CODE ===" >> "$LOG_FILE"
exit $EXIT_CODE
