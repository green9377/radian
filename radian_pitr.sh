#!/usr/bin/env bash
# Radian - keeps the "restore to any moment" backup healthy.
#
# Postgres itself archives every write-ahead log segment into backups/wal
# (docker-compose.stack.yml). That alone is not a backup: WAL only replays on
# top of a base backup, and left alone it grows until the disk is full. This
# script takes a fresh base weekly and drops the WAL that no kept base needs.
#
#   crontab:  30 3 * * 0  /root/apps/radian/radian_pitr.sh >> /var/log/radian_pitr.log 2>&1
#
# ⚠️ backups/wal must be owned by uid 70 - that is `postgres` inside the
# alpine image, NOT 999. Wrong owner and the archive fails silently: the shop
# keeps serving, pg_stat_archiver counts failures, and nobody is told.
set -euo pipefail

DIR=${DIR:-/root/apps/radian}
CONTAINER=${CONTAINER:-radian_postgres_dev}
ENV_FILE=${ENV_FILE:-$DIR/.env.development}
KEEP_BASES=${KEEP_BASES:-2}

PGUSER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2)
BACKUPS="$DIR/backups"
STAMP=$(date +%Y%m%d)

mkdir -p "$BACKUPS/wal"
chown -R 70:70 "$BACKUPS/wal"

echo "=== $(date -Is) base backup base_$STAMP ==="
docker exec "$CONTAINER" pg_basebackup -U "$PGUSER" -D "/backups/base_$STAMP" -Ft -z -P

# Keep the newest $KEEP_BASES bases, drop the rest.
mapfile -t OLD < <(ls -1d "$BACKUPS"/base_* 2>/dev/null | sort -r | tail -n +$((KEEP_BASES + 1)))
for d in "${OLD[@]:-}"; do
  [ -n "$d" ] && echo "dropping old base $d" && rm -rf "$d"
done

# WAL older than the OLDEST base we still keep can never be needed again.
OLDEST=$(ls -1d "$BACKUPS"/base_* 2>/dev/null | sort | head -1)
if [ -n "$OLDEST" ]; then
  BEFORE=$(find "$BACKUPS/wal" -type f | wc -l)
  find "$BACKUPS/wal" -type f ! -newer "$OLDEST" -delete
  echo "wal files: $BEFORE -> $(find "$BACKUPS/wal" -type f | wc -l) (kept from $(basename "$OLDEST"))"
fi

# Say out loud whether archiving is actually working. A silent archiver is the
# whole failure mode this script exists to catch.
docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PGUSER" -Atc \
  'select archived_count, last_archived_wal, failed_count, last_failed_time from pg_stat_archiver' \
  || echo "WARNING: could not read pg_stat_archiver"

echo "=== $(date -Is) done ==="
