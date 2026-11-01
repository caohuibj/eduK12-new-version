#!/usr/bin/env bash
set -euo pipefail
image=nginx:1.31.6-alpine3.24-slim
prefix="eduk12-edge-${GITHUB_RUN_ID:-local}-$$"
tmp=$(mktemp -d)
cleanup() { docker rm -f "$prefix-front" "$prefix-a" "$prefix-b" >/dev/null 2>&1 || true; docker network rm "$prefix" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
cp server-version/frontend/nginx.conf "$tmp/candidate.conf"
cat > "$tmp/backend.conf" <<'NGINX'
server { listen 3000; location / { return 200 "$hostname\n"; } }
NGINX
chmod 755 "$tmp"; chmod 644 "$tmp/"*.conf
docker pull "$image"
docker network create "$prefix" >/dev/null
docker run -d --name "$prefix-a" --hostname backend-a --network "$prefix" --network-alias backend -v "$tmp/backend.conf:/etc/nginx/conf.d/default.conf:ro" "$image" >/dev/null
docker run -d --name "$prefix-b" --hostname backend-b --network "$prefix" --network-alias backend-2 -v "$tmp/backend.conf:/etc/nginx/conf.d/default.conf:ro" "$image" >/dev/null
docker run -d --name "$prefix-front" --network "$prefix" --ulimit nofile=65535:65535 -v "$tmp/candidate.conf:/etc/nginx/conf.d/default.conf:ro" "$image" >/dev/null
docker exec "$prefix-front" nginx -t
for i in $(seq 1 15); do
 if docker exec "$prefix-front" wget -qO- http://127.0.0.1/api/health > "$tmp/ready"; then break; fi
 sleep 1
done
[ -s "$tmp/ready" ]
[ "$(docker exec "$prefix-front" sh -c 'ulimit -n')" = 65535 ]
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
echo 'PASS: actual Nginx syntax, nofile, ordinary/whole two-node routing, Socket.IO single-node routing, and existing ingress boundaries.'
