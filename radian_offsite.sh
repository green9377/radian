#!/usr/bin/env bash
# Radian - copies everything that matters OFF this machine, to Google Drive.
#
# A backup that lives on the machine it is protecting is not a backup. This is
# the half that survives the VPS dying:
#
#   backups/   the books - base backup + every archived WAL segment
#   media/     every product photo the shop serves
#   system/    the env files and a full mirror of the git repository
#
#   crontab:  0 * * * *  /root/apps/radian/radian_offsite.sh >> /var/log/radian_offsite.log 2>&1
#
# ⚠️ The env files carry real secrets and go up as they are. They are in the
# owner's own Drive, and without them a restored machine cannot be started -
# but treat that Drive folder as the secret it now holds.
set -euo pipefail

DIR=${DIR:-/root/apps/radian}
REMOTE=${REMOTE:-gdrive:RadianBackup}
FLAGS=(--fast-list --transfers 4 --checkers 8 --retries 3)

command -v rclone >/dev/null || { echo "rclone is not installed"; exit 1; }

echo "=== $(date -Is) offsite ==="

rclone sync "$DIR/backups" "$REMOTE/backups" "${FLAGS[@]}"
rclone sync "$DIR/media"   "$REMOTE/media"   "${FLAGS[@]}"

# The env files. Not in git on purpose, and nothing restores without them.
tar -czf /tmp/radian_env.tgz -C "$DIR" .env.development .env.edge
rclone copyto /tmp/radian_env.tgz "$REMOTE/system/env-files.tgz"
rm -f /tmp/radian_env.tgz

# The code. GitHub is a copy, not a guarantee - an account can be lost too.
rm -rf /tmp/radian_mirror
git clone --mirror -q "$(git -C "$DIR" remote get-url origin)" /tmp/radian_mirror
# The clone URL carries an access token. Strip it before it leaves the box.
git -C /tmp/radian_mirror remote set-url origin https://github.com/green9377/radian.git
tar -czf /tmp/radian_repo.tgz -C /tmp radian_mirror
rclone copyto /tmp/radian_repo.tgz "$REMOTE/system/github-mirror.tgz"
rm -rf /tmp/radian_mirror /tmp/radian_repo.tgz

echo "--- what is on Drive now ---"
rclone size "$REMOTE" || true
echo "=== $(date -Is) done ==="
