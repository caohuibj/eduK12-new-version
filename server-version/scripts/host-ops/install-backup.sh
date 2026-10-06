#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID} -eq 0 ]] || { echo 'root required' >&2; exit 1; }
release=${1:-}
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || { echo 'reviewed exact commit required' >&2; exit 1; }
[[ ${2:-} == '' || ${2:-} == '--enable' ]] || exit 1
source_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
base=/opt/eduk12-backups
target=$base/releases/$release
[[ ! -e "$target" ]] || { echo 'release already exists' >&2; exit 1; }
install -d -m 0700 "$base/releases" /etc/eduk12-backups /var/lib/eduk12-backups
install -d -m 0755 "$target/host-ops" "$target/attachment-backup"
for file in backup.py backup-cos.cjs backup-crypto.mjs backup-config.example.json BACKUP-AUTOMATION.md; do
  install -m 0644 "$source_dir/$file" "$target/host-ops/$file"
done
install -m 0644 "$source_dir/../attachment-backup/core.mjs" "$target/attachment-backup/core.mjs"
if [[ ! -e /etc/eduk12-backups/config.json ]]; then
  install -m 0600 "$source_dir/backup-config.example.json" /etc/eduk12-backups/config.json
fi
if [[ -L "$base/current" ]]; then cp -a "$base/current" "$base/previous-$release"; fi
ln -s "$target/host-ops" "$base/.current-$release"
mv -Tf "$base/.current-$release" "$base/current"
for extension in service timer; do
  unit=eduk12-database-backup.$extension
  if [[ -e /etc/systemd/system/$unit ]]; then cp -a /etc/systemd/system/$unit "$target/$unit.previous"; fi
  install -m 0644 "$source_dir/systemd/$unit" "/etc/systemd/system/$unit"
done
systemd-analyze verify /etc/systemd/system/eduk12-database-backup.service /etc/systemd/system/eduk12-database-backup.timer
systemctl daemon-reload
if [[ ${2:-} == '--enable' ]]; then systemctl enable --now eduk12-database-backup.timer; fi
echo 'host backup installed; new writes use backup bucket; remote deletion remains disabled'
