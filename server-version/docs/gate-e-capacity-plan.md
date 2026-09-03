# Gate-E capacity plan — public limiter, ingress, and eventual-success KPI

Post-#47 follow-up. Code lands on `perf/gate-e-public-limiter-and-capacity`.
Primary product KPI for Gate-E is **eventual successful students/sec** and
**success rate**, not raw HTTP RPS that includes intentional 503/429.

Reuse Gate-D envelope unless a profile says otherwise:

- Host: 4C4G-class box
- Postgres / Redis: isolated `eduk12-gate47-pg` / `eduk12-gate47-redis` (+ host proxies)
- Node heap: 1 GiB; API Prisma pool baseline: **10**
- Workers: API-process aggregation only (`BACKGROUND_WORKERS_ENABLED=false`)
- k6: `/home/box/bin/k6`
- Fixture rule: **fresh fixture per logical submit** (no cross-submit reuse of the same attempt)

Do **not** change the default Prisma pool in application config from these
experiments. Do **not** merge from this document alone.

---

## Work A (direct — land with this branch)

### A1 — Split Public Assessment limiter

Replace the single `publicAssessmentLimiter` (`600 / 15 min` on all
`/api/public/*`) with a Check-in-style dual (multi) dimension limiter:

| Dimension | Key | Role |
|-----------|-----|------|
| Coarse NAT IP | client IP (`trust proxy` hops) | High ceiling for school NAT share |
| Capability / start-token | public link `:token` | Shared class-entry budget |
| Per-attempt recovery-token | `x-recovery-token` (hashed) | One student/session budget |

Separate **GET** vs **FINAL** budgets (same window, different counters):

- **GET budget**: reads / resume / report / assignment info (`GET`/`HEAD`, and
  non-finalizing safe methods).
- **FINAL budget**: start + final submit + restart paths
  (`POST` matching `/(start|submit|restart)(/|$)` or ending in `/submit`).

**Formula-based env** (15-minute window `W`). Defaults derive from:

| Symbol | Env | Default | Meaning |
|--------|-----|---------|---------|
| `N` | `PUBLIC_ASSESSMENT_EXPECTED_CLASS_SIZE` | 60 | Students per class wave |
| `G` | `PUBLIC_ASSESSMENT_GETS_PER_STUDENT` | 40 | Resume/poll/report GETs per student |
| `F` | `PUBLIC_ASSESSMENT_FINALS_PER_STUDENT` | 8 | Start + finals + restart per student |
| `NAT` | `PUBLIC_ASSESSMENT_NAT_SHARE_FACTOR` | 50 | Concurrent classes behind one NAT |

Derived ceilings (overridable by explicit `*_LIMIT` envs when set):

| Limit | Formula | Explicit override |
|-------|---------|-------------------|
| IP GET | `N × G × NAT` | `PUBLIC_ASSESSMENT_IP_GET_LIMIT` |
| IP FINAL | `N × F × NAT` | `PUBLIC_ASSESSMENT_IP_FINAL_LIMIT` |
| Start-token GET | `N × G` | `PUBLIC_ASSESSMENT_TOKEN_GET_LIMIT` |
| Start-token FINAL | `N × F` | `PUBLIC_ASSESSMENT_TOKEN_FINAL_LIMIT` |
| Recovery GET | `G` | `PUBLIC_ASSESSMENT_RECOVERY_GET_LIMIT` |
| Recovery FINAL | `F` | `PUBLIC_ASSESSMENT_RECOVERY_FINAL_LIMIT` |

Window: `PUBLIC_ASSESSMENT_WINDOW_MS` (default `900000`).

**Client contract (non-negotiable):** FinalDraft capacity retry must **not**
treat HTTP **429** as retryable. Only capacity/busy (`503` + known busy codes)
and transport failures retry. Rate-limit 429 is a hard client stop / operator
signal, not a jittered submit loop.

### A3 — Restore ordinary `/api/` request buffering ON

In `frontend/nginx.conf`, ordinary `location /api/` must use default
`proxy_request_buffering on` (remove the explicit `off`). Upload / video
locations keep `proxy_request_buffering off` and large `client_max_body_size`.

Rationale: without buffering, large JSON finals hold upstream workers for the
full client upload; buffering restores ingress isolation for ordinary API JSON.

### A4 — Metrics: `auth_account_lookup` + `request_body_receive_parse`

Add two phases to `runtimeObservability` / `ptool_assessment_phase_duration_seconds`:

| Phase | Where measured |
|-------|----------------|
| `auth_account_lookup` | Authenticated account status `prisma.user.findUnique` in auth middleware |
| `request_body_receive_parse` | Wall time of `express.json` / `urlencoded` body receive+parse |

No payloads, tokens, or account identifiers in labels.

---

## Work B — Gate-E (mandatory)

Primary KPI: **eventual successful students/sec** + **success rate**
(durable success after client-visible capacity retries where allowed; 429 does
not count as eventual success via FinalDraft retry).

| ID | Profile | Shape |
|----|---------|-------|
| **E1** | Public NAT | Concurrent VUs behind one IP: **100 / 250 / 500** — assert limiter dimensions (IP high ceiling vs token/recovery) and 429 vs 503 mix |
| **E2** | Scale open-loop | Target **25 / 50 / 75 / 100** successful/s (not merely offered RPS) |
| **E3** | Cognitive payload | Body sizes: **small / normal / near-1.5MiB** finals |
| **E4** | Aggregate | **Many-parent** stampede + **same-parent** concurrent last-GET |
| **E5** | Bundle mixed + FFmpeg | Mixed classroom traffic with FFmpeg concurrency **0 / 1 / 2** |

### Round-1 sweep (locked)

- Prisma pool = **10** (config experiment only; do not change app default)
- UNIT × Aggregate permits: **`{6,7,8} × {2,3}` only**
- Fresh fixture per logical submit
- Record: eventual success/s, success rate, intentional 503 busy, 429 rate-limit,
  p50/p95/p99, admission rejection reasons, phase histograms for A4

Harness lives under `server-version/perf/` (Gate-E README + scenario stubs).
Full E1–E5 may continue after Work A lands; stubs must already emit eventual-success KPIs.

---

## Work C — Evidence-driven follow-ups (after Gate-E)

Only act on measured observations. Suggested mapping:

| Observation | Next change (candidate) |
|-------------|-------------------------|
| IP GET 429 dominates before UNIT 503 | Raise `NAT` or IP GET ceiling; verify trust-proxy hops |
| Recovery FINAL 429 while IP headroom remains | Student/session abuse or too-low `F`; tune recovery FINAL only |
| Start-token FINAL 429 with low per-IP usage | Class link shared too widely; split tokens or raise token FINAL |
| `request_body_receive_parse` dominates p95 on E3 large bodies | Keep `/api/` buffering ON; consider body-size class metrics |
| `auth_account_lookup` dominates authenticated paths | Evidence for a later auth cache design (out of scope here) |
| Eventual success/s flat while 503 busy rises on E2 | Re-sweep UNIT×Aggregate within `{6,7,8}×{2,3}`; do not jump pool |
| Same-parent E4 CAS losers expected; many-parent regresses | Aggregate permits / queue — still inside round-1 matrix only |
| E5 FFmpeg=2 starves API event loop | Cap media workers; do not introduce Bull FINAL submit |
| nginx upload paths regress after A3 | Confirm upload locations still have buffering OFF |

---

## Explicit non-goals (still out of scope)

- Redis distributed semaphore for submit
- Bull / HTTP 202 FINALIZING submit queue
- `worker_threads` for scoring/crypto
- Prisma pool bump to **20 / 30** (or changing the application default)
- Encryption migration
- V3.2 rewrite
- Auth account cache (observe via A4 only)

---

## Safety boundary

- Do not point load at shared `ptool-*` services.
- Do not run `docker compose down -v` or delete volumes not created for the run.
- Keep secrets in env / secret manager; never commit fixture credentials.
- Never commit unrelated dirty tower / cognitive matrix files from other worktrees.
