#!/usr/bin/env bash
set -euo pipefail
image=nginx:1.31.6-alpine3.24-slim
prefix="eduk12-edge-${GITHUB_RUN_ID:-local}-$$"
candidate="$prefix-config"
tmp=$(mktemp -d)
cleanup() { docker rm -f "$prefix-front" "$prefix-a" "$prefix-b" >/dev/null 2>&1 || true; docker network rm "$prefix" >/dev/null 2>&1 || true; docker image rm "$candidate" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
cat > "$tmp/backend.conf" <<'NGINX'
server { listen 3000; location / { return 200 "$hostname\n"; } }
NGINX
chmod 755 "$tmp"; chmod 644 "$tmp/"*.conf
docker pull "$image"
# BuildKit skips the independent Node stage: static assets and npm inputs are unchanged.
# Exercise the actual Dockerfile config layer with its inherited official entrypoint.
DOCKER_BUILDKIT=1 docker build --target runtime-config -t "$candidate" server-version/frontend
docker network create "$prefix" >/dev/null
docker run -d --name "$prefix-a" --hostname backend-a --network "$prefix" --network-alias backend -v "$tmp/backend.conf:/etc/nginx/conf.d/default.conf:ro" "$image" >/dev/null
docker run -d --name "$prefix-b" --hostname backend-b --network "$prefix" --network-alias backend-2 -v "$tmp/backend.conf:/etc/nginx/conf.d/default.conf:ro" "$image" >/dev/null
docker run -d --name "$prefix-front" --network "$prefix" --ulimit nofile=65535:65535 "$candidate" >/dev/null
docker exec "$prefix-front" nginx -t
docker exec "$prefix-front" nginx -T > "$tmp/effective.conf"
grep -Eq '^worker_rlimit_nofile[[:space:]]+65535;' "$tmp/effective.conf"
grep -Eq 'worker_connections[[:space:]]+1024;' "$tmp/effective.conf"
for i in $(seq 1 15); do
 if docker exec "$prefix-front" wget -qO- http://127.0.0.1/api/health > "$tmp/ready"; then break; fi
 sleep 1
done
[ -s "$tmp/ready" ]
[ "$(docker exec "$prefix-front" sh -c 'ulimit -n')" = 65535 ]
[ "$(docker exec "$prefix-front" sh -c 'ulimit -Hn')" = 65535 ]
docker exec "$prefix-front" awk '/Max open files/ { if ($4 != 65535 || $5 != 65535) exit 1; found=1 } END { if (!found) exit 1 }' /proc/1/limits
docker exec "$prefix-front" sh -ec '
 found=0
 for path in /proc/[0-9]*/cmdline; do
  case "$(tr "\000" " " < "$path" 2>/dev/null)" in
   "nginx: worker process"*)
    awk '\''/Max open files/ { if ($4 != 65535 || $5 != 65535) exit 1; found=1 } END { if (!found) exit 1 }'\'' "${path%/cmdline}/limits"
    found=1;;
  esac
 done
 [ "$found" = 1 ]
'
for path in /api/health /api/composite-assessments/attempts/synthetic/whole/definition; do
 : > "$tmp/responses"
 for i in $(seq 1 12); do docker exec "$prefix-front" wget -qO- "http://127.0.0.1$path" >> "$tmp/responses"; done
 grep -qx backend-a "$tmp/responses"; grep -qx backend-b "$tmp/responses"
done
for i in $(seq 1 6); do
 [ "$(docker exec "$prefix-front" wget -qO- 'http://127.0.0.1/socket.io/?EIO=4&transport=polling&sid=synthetic')" = backend-a ]
done
docker exec "$prefix-front" wget -S -O /dev/null http://127.0.0.1/ 2> "$tmp/headers"
grep -qi 'X-Frame-Options: DENY' "$tmp/headers"
grep -qi 'X-Content-Type-Options: nosniff' "$tmp/headers"
for path in /metrics /api/metrics /uploads/synthetic; do
 if docker exec "$prefix-front" wget -S -O /dev/null "http://127.0.0.1$path" 2> "$tmp/denied"; then exit 1; fi
 grep -q '404' "$tmp/denied"
done
echo 'PASS: image-owned main/site config without Nginx binds, actual syntax, master/worker nofile, ordinary/whole two-node routing, Socket.IO single-node routing, and existing ingress boundaries.'
