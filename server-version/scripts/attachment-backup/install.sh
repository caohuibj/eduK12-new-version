#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID} -eq 0 ]] || { echo "root required" >&2; exit 1; }
release=${1:-}
[[ "$release" =~ ^[a-f0-9]{8,40}$ ]] || { echo "reviewed commit required" >&2; exit 1; }
[[ ${2:-} == "" || ${2:-} == "--enable" ]] || exit 1
source_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
base=/opt/eduk12-attachments
target=$base/releases/$release
[[ ! -e "$target" ]] || { echo "release already exists; do not overwrite" >&2; exit 1; }
install -d -m 0700 "$base/releases" /etc/eduk12-attachments /var/lib/eduk12-attachments
install -d -m 0755 "$target"
for f in core.mjs cos-store.mjs cli.mjs runner.py config.example.json README.md; do
  install -m 0644 "$source_dir/$f" "$target/$f"
done
chmod 0700 "$target/runner.py"
if [[ ! -e /etc/eduk12-attachments/config.json ]]; then
  install -m 0600 "$source_dir/config.example.json" /etc/eduk12-attachments/config.json
fi
if [[ -L "$base/current" ]]; then cp -a "$base/current" "$base/previous-$release"; fi
ln -s "$target" "$base/.current-$release"
mv -Tf "$base/.current-$release" "$base/current"
for command in backup verify plan; do
  for extension in service timer; do
    unit=eduk12-attachments-$command.$extension
    if [[ -e /etc/systemd/system/$unit ]]; then
      cp -a /etc/systemd/system/$unit "$target/$unit.previous"
    fi
    install -m 0644 "$source_dir/systemd/$unit" /etc/systemd/system/$unit
  done
done
systemctl daemon-reload
if [[ ${2:-} == "--enable" ]]; then
  systemctl enable --now eduk12-attachments-backup.timer eduk12-attachments-verify.timer eduk12-attachments-plan.timer
fi
echo "attachment tasks installed; cleanup remains plan_only"
