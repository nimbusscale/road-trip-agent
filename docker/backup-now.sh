#!/usr/bin/env bash
# Dumps the database, copies the dump to DigitalOcean Spaces, and removes dumps older
# than 3 days (systems design section 9). Runs in the backup container.
#
# Compose passes in everything secret as environment variables, never as arguments, so
# nothing secret shows in the process list:
# - PGHOST, PGUSER, PGPASSWORD, and PGDATABASE, which pg_dump reads.
# - RCLONE_CONFIG_SPACES_ACCESS_KEY_ID and RCLONE_CONFIG_SPACES_SECRET_ACCESS_KEY, which
#   rclone reads.
#
# To restore, load a dump into a new, empty Postgres:
#   pg_restore --no-owner -d <database> <dump>
set -euo pipefail
trap 'echo "backup: failed" >&2' ERR

readonly BUCKET=jjk3-backups
# Only this folder of the bucket is ever written or pruned.
readonly FOLDER=road-trip-agent
readonly KEEP_DAYS=3

if [[ -z "${RCLONE_CONFIG_SPACES_ACCESS_KEY_ID:-}" ||
  -z "${RCLONE_CONFIG_SPACES_SECRET_ACCESS_KEY:-}" ]]; then
  echo "backup: failed, SPACES_ACCESS_KEY_ID or SPACES_SECRET_ACCESS_KEY isn't in .env" >&2
  exit 1
fi

# The rest of rclone's setup. With these, it needs no config file.
export RCLONE_CONFIG_SPACES_TYPE=s3
export RCLONE_CONFIG_SPACES_PROVIDER=DigitalOcean
export RCLONE_CONFIG_SPACES_ENDPOINT=nyc3.digitaloceanspaces.com
# The key may only reach this bucket, so don't try to check or create it.
export RCLONE_CONFIG_SPACES_NO_CHECK_BUCKET=true
# An empty path says there's no config file, which rclone would otherwise note each time.
export RCLONE_CONFIG=""

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# The dump goes to a file first, so a failed dump is never uploaded. The custom format
# is compressed, and pg_restore can load it into any empty database.
dump="$(date -u +%Y-%m-%dT%H%M%SZ).dump"
pg_dump --format=custom --file="$workdir/$dump"
echo "backup: dumped $dump ($(stat -c %s "$workdir/$dump") bytes)"

rclone copyto "$workdir/$dump" "spaces:$BUCKET/$FOLDER/$dump"
echo "backup: copied $dump to $BUCKET/$FOLDER"

# One hour short of the limit, so the dump from 3 nights ago is always removed, even if
# tonight's run started a few seconds earlier than that one. With one run a night, the
# last 3 dumps are kept.
rclone delete "spaces:$BUCKET/$FOLDER" \
  --include '*.dump' --min-age "$((KEEP_DAYS * 24 - 1))h" -v
echo "backup: removed dumps older than $KEEP_DAYS days"
