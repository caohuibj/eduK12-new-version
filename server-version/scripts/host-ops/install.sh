#!/usr/bin/env bash
set -euo pipefail
# Install monitor assets only; never invoke Compose, restart apps or modify data.
[ "$(id -u)" = 0 ] || { echo 'Run as root'; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
release=${1:?Usage: install.sh reviewed-release-id}
[[ "$release" =~ ^[a-zA-Z0-9_-]{8,64}$ ]] || { echo 'Invalid release ID'; exit 1; }
command -v python3 >/dev/null
command -v docker >/dev/null
command -v curl >/dev/null
[ ! -e "/opt/eduk12-ops/releases/$release" ] || { echo 'Release already exists'; exit 1; }
install -d -m 0755 /opt/eduk12-ops /opt/eduk12-ops/releases
install -d -m 0700 /etc/eduk12-ops /var/lib/eduk12-ops /var/log/eduk12-ops
install -d -m 0755 "/opt/eduk12-ops/releases/$release"
install -m 0644 "$source_dir/monitor.py" "/opt/eduk12-ops/releases/$release/monitor.py"
if [ ! -e /etc/eduk12-ops/config.json ]; then
  install -m 0600 "$source_dir/config.example.json" /etc/eduk12-ops/config.json
fi
# Preserve previous units/link for manual rollback, without changing application services.
for kind in service timer; do
  unit="eduk12-ops-monitor.$kind"
  if [ -e "/etc/systemd/system/$unit" ]; then
    install -m 0600 "/etc/systemd/system/$unit" "/opt/eduk12-ops/releases/$release/previous.$kind"
  fi
  install -m 0644 "$source_dir/systemd/$unit" "/etc/systemd/system/$unit"
done
if [ -L /opt/eduk12-ops/current ]; then
  readlink /opt/eduk12-ops/current > "/opt/eduk12-ops/releases/$release/previous-link.txt"
elif [ -e /opt/eduk12-ops/current ]; then
  echo 'Refuse to overwrite a non-symlink current path'; exit 1
fi
ln -s "/opt/eduk12-ops/releases/$release" /opt/eduk12-ops/current.new
mv -Tf /opt/eduk12-ops/current.new /opt/eduk12-ops/current
systemd-analyze verify /etc/systemd/system/eduk12-ops-monitor.service /etc/systemd/system/eduk12-ops-monitor.timer
systemctl daemon-reload
systemctl start eduk12-ops-monitor.service
systemctl enable --now eduk12-ops-monitor.timer
