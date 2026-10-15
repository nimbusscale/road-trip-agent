#!/usr/bin/env bash
# Runs backup-now every day at 09:00 UTC (systems design section 9). It's the backup
# container's main process, so its output is the container's log.
set -euo pipefail

readonly RUN_AT=09:00

while true; do
  now="$(date -u +%s)"
  next="$(date -u -d "today $RUN_AT" +%s)"
  if ((next <= now)); then
    next="$(date -u -d "tomorrow $RUN_AT" +%s)"
  fi
  echo "backup: next run at $(date -u -d "@$next" +%Y-%m-%dT%H:%M:%SZ)"
  sleep "$((next - now))"
  # backup-now logs its own failure. The loop goes on, so the next night still runs.
  backup-now || true
done
