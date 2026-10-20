# Measurement: bounded browser qualification

This push-only lane is restricted to `ci/measurement-browser-20261020`.
It does not edit main/PR routing, replace a merge gate, grant release/image
qualification, deploy, or access production. The fixed complete product inventory
comes from `6b8f5333`; the source SHA is a reference, not a claim that a mapped
remote commit has the same identity. Scope checks every tracked mode/blob/path
outside the exact newly added tool files. Every output records actual Actions SHA,
run, attempt, source inventory, component tree and archive SHA-256.

## Frozen execution scope

- New control plane → reject changed source, wrong artifacts or skipped/failed
  phases → tiny local control contracts plus hosted scope verification.
- First production compilation → catch emit/bundle/catalog prerequisite errors →
  separate hosted backend/frontend producers. Backend runs `npm ci`, Prisma
  generate, then the existing `npm run build` intact. Its catalog checks have no
  matching retained successful evidence in the final local ledger, so they are not
  silently removed. Frontend uses `npm ci` and production Vite build. This is not
  a repeated no-emit types/unit/DB/HTTP run and not a deployable image build.
- Missing browser paths → actual compiled UI and isolated API, ephemeral PG16 /
  Redis7, current restricted runtime identity and synthetic fixtures. Migrations
  are empty-fixture setup, not a replay of accepted migration/race regressions.
  The browser runner records exact selected checks, failures and sanitized output.
- Prior local results → preserved as reference/not-executed; no invented formal
  local-to-Actions evidence admission. Existing release/merge prerequisites remain
  separate and must not be inferred from this bounded result.

Both components carry their installed dependencies and dist in immutable same-run
Actions artifacts. Source assets, configuration, Prisma schema and runtime files
remain the exact checked-out source, bound by scope. Consumers verify SHA/run/tree,
lockfile and archive hash before extraction. No download failure falls back to
rebuild. Failed browser jobs can use **Re-run failed jobs** on the same run, keeping
successful producer artifacts and their original attempt. Do not re-run all jobs.
A product input change requires explicit affected-evidence review, not a silent
fingerprint refresh. Failures, missing/skipped/cancelled jobs cannot pass the final
bounded result.

Only official package/tool sources are used. No production secrets, new persistent
credentials, repository settings or permissions are required. Browser artifacts
must never include private fixture files, cookies, authentication tickets, traces,
request bodies or database dumps. Private logs remain on the disposable runner.

About five minutes is the progress-diagnosis threshold, not a reason to launch
full CI; report the actual download/build/fixture/browser phase. Producer timeout
is 30 minutes; browser timeout 25 minutes includes setup, with a shorter bounded
runner deadline. This new lane does not promise a five-minute production build.

## Independent retry units and TLS boundary

The browser matrix has `admin` and `journeys`, each with its own empty database
and minimal fixture preparation. The administrator phase uses real browser virtual
CTAP2 verification; journey fixtures are explicitly synthetic grants, not a claim
that they were issued by the administrator phase. Re-running a failed matrix job
therefore does not replay the successful administrator/journey assertion unit.
The journey itself is one connected authoring/reference/interpretation sequence;
its setup and assertions are reported separately.

The emitted application runs in an isolated `NODE_ENV=test` runtime. Build flags
include `VITE_COGNITIVE_MODULE_ENABLED=true` and UTC; this does not prove production
configuration. Compiled Cognitive registry outputs and required source assets are
checked and hashed. Canonical product hosts use only Chromium host resolution to
127.0.0.1:3189; no OS hosts or trust store changes. A one-day test CA is confined to
this job's private browser HOME/NSS database, guarded by explicit user approval.
No insecure certificate flag or ignored TLS error is allowed. The Node proxy maps
canonical test origins to the backend contract; this is not production ingress
verification. Private TLS material is deleted with the private fixture directory.

The user explicitly approved the temporary browser-profile test CA on 2026-10-20
at 09:10 UTC for this bounded CI round and its scoped retries. This does not
authorize system-wide trust, persistent access, production trust changes, or a
future unrelated CI round. Private material is destroyed with each job.
