#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID} -eq 0 && ${1:-} =~ ^[a-f0-9]{40}$ ]] || { echo 'root and reviewed exact commit required' >&2; exit 1; }
[[ ${2:-} == '' || ${2:-} == '--enable-plan' ]] || exit 1
source_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
base=/opt/eduk12-cos-cleanup
target=$base/releases/$1
[[ ! -e "$target" ]] || exit 1
install -d -m 0700 "$base/releases" /etc/eduk12-cos-cleanup /var/lib/eduk12-cos-cleanup
install -d -m 0755 "$target/cleanup" "$target/attachment-backup"
for file in runner.py cli.mjs model.mjs engine.mjs store.mjs config.example.json README.md; do
  install -m 0644 "$source_dir/$file" "$target/cleanup/$file"
done
install -m 0644 "$source_dir/../attachment-backup/core.mjs" "$target/attachment-backup/core.mjs"
if [[ ! -e /etc/eduk12-cos-cleanup/config.json ]]; then install -m 0600 "$source_dir/config.example.json" /etc/eduk12-cos-cleanup/config.json; fi
# Installer never grants deletion permission or creates a recovery certificate.
python3 -c 'import json; assert json.load(open("/etc/eduk12-cos-cleanup/config.json"))["mode"] == "plan_only"'
if [[ -L "$base/current" ]]; then cp -a "$base/current" "$base/previous-$1"; fi
ln -s "$target/cleanup" "$base/current.new"; mv -Tf "$base/current.new" "$base/current"
for kind in service timer; do
  unit=eduk12-cos-cleanup.$kind
  if [[ -e /etc/systemd/system/$unit ]]; then cp -a /etc/systemd/system/$unit "$target/$unit.previous"; fi
  install -m 0644 "$source_dir/systemd/$unit" "/etc/systemd/system/$unit"
done
systemd-analyze verify /etc/systemd/system/eduk12-cos-cleanup.service /etc/systemd/system/eduk12-cos-cleanup.timer
systemctl daemon-reload
if [[ ${2:-} == '--enable-plan' ]]; then systemctl enable --now eduk12-cos-cleanup.timer; fi
echo 'COS cleanup installed in plan-only mode; deletion requires verified rollout'
