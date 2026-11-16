# Production Network, Nginx, and Assessment Runtime Tuning (2026-11-16)

- **Baseline Release**: `01687312c-43806777313` (`PR #743`)
- **Target Host Envelope**: 4 vCPU (`Intel Xeon Platinum 8255C`), `3719 MiB` RAM + `2047 MiB` Swap, `5 Mbps` public egress
- **PR**: `#744` (`codex/training-login-balance-20261116`)

## 1. Applied Settings Summary

### Layer 1 — Kernel TCP & Nginx Proxy Buffering / Keepalive

1. **Kernel sysctl (`/etc/sysctl.d/99-z-eduk12-net-tuning.conf` + `/etc/sysctl.conf`)**
   ```ini
   net.core.default_qdisc = fq
   net.ipv4.tcp_congestion_control = bbr
   net.ipv4.tcp_max_syn_backlog = 4096
   net.ipv4.tcp_max_tw_buckets = 65536
   net.ipv4.tcp_notsent_lowat = 16384
   ```
   Active NIC queue updated via `tc qdisc replace dev eth0 root fq`. (`/etc/sysctl.conf` is applied last by `sysctl --system`, so `net.ipv4.tcp_max_tw_buckets=65536` must also be updated there if present.)

2. **Host Nginx (`server-version/ops/nginx/nginx.production.conf` → `/etc/nginx/nginx.conf`)**
   - `worker_processes auto;`, `worker_rlimit_nofile 16384;`, `events { worker_connections 8192; }`
   - `upstream eduk12_frontend`: `keepalive 16` → `keepalive 64`
   - `listen 443 ssl http2 backlog=2048` (`listen 80;` left intact for `ingress.py` compatibility; full Nginx restart required to update live kernel socket `Send-Q`)
   - `training.eduk12.top` block: `keepalive_timeout 180s;`, `proxy_buffer_size 16k;`, `proxy_buffers 16 16k;`, `proxy_busy_buffers_size 32k;`

3. **Frontend Container Nginx (`server-version/frontend/nginx.conf`)**
   - Independent `eduk12_login_api` upstream and `location = /api/auth/training-login` across `backend:3000` and `backend-2:3000`
   - Server-level `proxy_buffer_size 16k;`, `proxy_buffers 16 16k;`, `proxy_busy_buffers_size 32k;`, `client_body_buffer_size 64k;` (eliminated all `proxy_temp` and `client_temp` disk buffer spills for ~142 KB `START` responses and ~18.8 KB `whole/submit` payloads)
   - Extended `location ~ ^/api/(public/)?composite-assessments/attempts/[^/]+/(whole/(definition|submit)|report-status|report)$` (`proxy_next_upstream off`)

### Layer 2 — Base Compose Contract vs Production Dual-Backend Override

1. **Base Compose & Env Defaults (`server-version/docker-compose.yml` & `.env.example`)**
   - Preserves `#743` (`docs/release/low-memory-trickle-admission.md`) default-off contract: `ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED=false`, preventing non-production single-node deployments from inheriting low-memory trickle unexpectedly.
   - Keeps single-node CPU defaults within the `<= 4.0` `prelaunch-resource-preflight.mjs` envelope (`postgres=1.0`, `redis=0.5`, `backend=1.25`, `worker=0.75`, `frontend=0.5`, sum `4.00`) while removing `redis` and `frontend` CFS throttling.
   - Sets shared protection defaults (`ASSESSMENT_RESOURCE_PROTECTION_ENABLED=true`, `ASSESSMENT_HOST_CPU_RETRY_AFTER_SECONDS=10`, `ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED=true`, `WHOLE_SUBMIT_ADMISSION_LIMIT=10`, `WHOLE_SUBMIT_ADMISSION_TIMEOUT_MS=10000`, `WORKER_MALLOC_ARENA_MAX=2`).

2. **Verified Production Override (`server-version/docker-compose.prod-override.example.yml`, secret-free)**
   - Codifies the exact dual-backend + dual-worker production topology without passwords, tokens, or keys:
     - `backend`: `cpus=2.0`, `mem_limit=896m`, `NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=16"`, `ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED=true`, **`ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT=1`**, `ASSESSMENT_START_LOW_MEMORY_MAX_CPU_PERCENT=85`, `MALLOC_ARENA_MAX=2`
     - `backend-2`: `cpus=2.5`, `mem_limit=640m`, `NODE_OPTIONS="--max-old-space-size=384 --max-semi-space-size=16"`, `ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED=true`, **`ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT=0`** (host-wide serial trickle across dual backends), `MALLOC_ARENA_MAX=2`, loopback port `127.0.0.1:18081:3000`
     - `worker`: `cpus=1.0`, `cpu_shares=256`, `mem_limit=640m`, `ASSESSMENT_REPORT_WORKER_CONCURRENCY=3`, `MALLOC_ARENA_MAX=2`
     - `report-worker-2`: `cpus=1.0`, `cpu_shares=256`, `mem_limit=384m`, `ASSESSMENT_REPORT_WORKER_CONCURRENCY=3`, `MALLOC_ARENA_MAX=2`
     - `postgres`: `cpus=1.5`, `mem_limit=1024m`, `memswap_limit=1472m`, `shared_buffers=192MB`, `max_connections=80`
     - `redis`: `cpus=0.5`, `mem_limit=192m`, `--maxmemory 96mb --maxmemory-policy noeviction`
     - `frontend`: `cpus=0.5`, `mem_limit=128m` (set `FRONTEND_HTTP_PORT=18080` in `.env` when behind host Nginx TLS)

### Layer 3 — CPU Rebalancing & Worker/Memory Consolidation Notes

1. **Eliminated Redis & Postgres CFS Throttling (`server-version/docker-compose.yml`, `.env.example`, prod override)**
   - `redis.cpus`: `0.25` → `0.5` (previously `761,225` throttled periods / `60,120.4s` cumulative; dropped to `0` new throttles during 150 VU + soak)
   - `postgres.cpus`: `1.0` → `1.5`, `mem_limit`: `1342177280` (`1.25 GiB`) → `1073741824` (`1024m`) (previously `12,008` throttled periods / `296.3s`; dropped to `0` new throttles while bounding OS page cache growth inside the DB cgroup)
   - `backend.cpus`: `1.75` → `2.0` (closer symmetry with `backend-2` `2.5` under 50:50 LB)
2. **Consolidated Workers & Reclaimed Host Memory**
   - Production report worker topology consolidated from `3` containers × concurrency `2` (`worker`, `report-worker-2`, `report-worker-3`) down to **`2` containers × concurrency `3`** (`worker` `cpus=1.0`, `report-worker-2` `cpus=1`), preserving total `6` concurrent report slots and queue coverage while dropping 4 idle PG connections
   - Added `MALLOC_ARENA_MAX=2` on workers (`WORKER_MALLOC_ARENA_MAX=2` in Compose / `.env.example`)
   - Stopped unused host `pm2` daemon (`PM2` + `pm2-logrotate`, port `3001` unused, systemd unit already disabled) on `140.143.146.97`, reclaiming `~41.5 MiB` `MemAvailable` + `~22.0 MiB` Swap immediately
   - Production rollback snapshots saved under `/opt/eduk12-new/deploy/cpu-mem-tuning-20261116/`

## 2. Observed Verification & Capacity Boundaries

### Layer 1 + Layer 2 Validation (`01687312c-43806777313`)

- **Zero-account `anon-v8 150 VU`**: `150/150` (`eab1`: `e2e avg=8.75s, P95=13.30s, 5x503`; `7c19`: `e2e avg=10.10s, P95=16.68s, 19x503 RA=10`, `info max=2.26s`).
- **Zero-account `anon-v8 200 VU`** (`7fab`): `200/200`, `e2e avg=9.91s, P95=16.59s`, **`start_503=0`**.
- **Zero-account `anon-soak-v9 20 VU × 30s`** (`a985` vs pre-tuning `122a`): `158/166` (`8` fails, `60x RA=10`, P95 `12.78s`) → **`224/224` (`0` fails, `0` 503s, `e2e avg=2.78s, P95=3.32s, 6.87/s`)**.
- **Logged-in `150 VU whole303`** (`b552`, offset `25225..25374`): **`150/150`**, `e2e avg=14.65s, P95=19.60s`, `124` initial 503s all cleared on first `RA=10s` retry (`0` second retries, `0` timeouts, gateway `submit urt avg=110ms, max=761ms`).
- **Logged-in `20/s × 20s` open-loop rate** (`8c21`, offset `25375..25774`): **`400/400` (`failed=0`)**, `288x RA=10` 503s, `submit 400/400 (timeout=0, urt avg=103ms, max=861ms)`, `e2e first_third=18.90s → last_third=14.34s`, drain `24.27s`.

### Layer 3 Re-Test After CPU & Worker/Memory Consolidation (Zero Accounts Spent)

- **Headroom & CFS Throttling (`140.143.146.97`)**:
  - `redis` (`0.5` CPU) & `postgres` (`1.5` CPU) & `frontend` (`0.5` CPU): **`0` new CFS throttles** across both `anon-v8 150 VU` and `anon-soak-v9 20 VU × 30s` (`backend`: `+1` / `+0.5ms` during 150 VU, `+3` / `+64ms` during soak).
  - Host Swap usage dropped from `~330 MiB` (`SwapFree=1,759,484 kB`) to **`~167 MiB`** (`SwapFree=1,926,396 kB`, `0` swap consumed during 150 VU + soak).
  - Post-load `MemAvailable` improved from `~826–853 MiB` to **`1,249.0 MiB`** after 150 VU and **`1,145.5 MiB`** after consecutive 150 VU + 20 VU × 30s soak (`postgres` `488.6 MiB / 1 GiB`).
- **Zero-account `anon-v8 150 VU`** (`ea4300da56974fbfa08d` vs `7c197dab5eed441fa109`):
  - Completion: **`150/150`** (`0` failed)
  - `e2e`: avg `10.10s → 9.72s` (**-3.8%**), P95 `16.68s → 15.51s` (**-7.0%**), max `19.44s → 18.19s` (**-6.4%**)
  - `start avg`: `3.42s → 2.50s` (**-26.8%**, P95 `5.08s → 4.01s`, `24x RA=10`)
  - `report_status avg`: `136.56ms → 79.06ms` (**-42.1%**); `report avg`: `72.30ms → 41.61ms` (**-42.5%**)
- **Zero-account `anon-soak-v9 20 VU × 30s`** (`48781fec608e45dfa5bc`):
  - **`218/218`** (`0` fails, `0` 503s), `rate=6.67/s`, `e2e p50=2.67s`, `avg=2.88s`, `P95=3.75s`, `first_third=3.16s → last_third=2.69s`.

### Capacity Envelope & Remaining Non-Config Bottlenecks

- **Verified capacity**:
  - Instantaneous burst: **150 VU** logged-in stable (`100%` with 1× `RA=10s` retry); **200 VU** anonymous (`0` 503s).
  - Sustained zero-accumulation throughput: **~8–9 req/s safe / ~10 req/s ceiling** (`soak 30 VU` sustained `9.87/s` with stable latency; `20/s` exceeds steady capacity and accumulates linear backlog at `~13/s`).
- **Remaining non-config bottlenecks**: `5 Mbps` physical public bandwidth cap (reproduced via `300`-thread static `GET /vite.svg` and `4`-stream PNG at `4.88 Mbps`) and `startUserAttempt` executing `assertStudentEligibility` + DB metadata/lock before `assertAssessmentStartResources`.
