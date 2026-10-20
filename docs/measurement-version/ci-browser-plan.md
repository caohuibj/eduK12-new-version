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

The first run built both components once. The repair round pins original run
`39399331312`, attempt 1, head `da713c522be4fd3309e4dcf327bfb71384c784fe`.
That run's browser jobs failed and remain failed; only its successful backend job
`118549912875` and frontend job `118549912646` are admitted. Exact original build
artifact IDs, ZIP sizes/digests, receipt hashes, tar hashes and component trees are
frozen in the binding file. The workflow has no producer or rebuild fallback.

Before download, Actions API must confirm the original run/head/attempt/branch,
producer success and exact unexpired artifact. Signed artifact ZIP bytes are
stream-hashed, and only the expected receipt/tar pair is extracted. Consumers
verify the original receipt identity, flags, lockfiles, archive hash and restored
required-file hashes. Current source identity is recorded separately, never
rewritten over the producer identity. GitHub authorization is not forwarded to
signed storage URLs. Missing/expired/mismatched evidence stops, never rebuilds.

All production component files remain identical. The only backend-tree exception
is the exact reviewed `scripts/measurement-browser-fixture.ts` before/after blob,
which is not included by production tsconfig and not consumed by npm build. Full
component inventories excluding that one test fixture must match the original;
frontend tree remains exact. Other harness/control changes remain inside the
previous precise tool allowlist and complete frozen-source boundary.

Use **Re-run failed jobs** for an unchanged current attempt. For this repaired
harness commit the workflow consumes the fixed original build artifacts directly,
without relabeling them as a new build. A production input change stops for an
explicit affected-evidence review. Failures, missing/skipped/cancelled jobs cannot
pass the final bounded result. This is not generic cross-run evidence discovery.

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

## Third round: retain successful administrator evidence

Run `39400868129` attempt 1, head
`2fced5c637a039700322efe297744fddbc85132a`, completed administrator browser job
`118555111929` successfully. Its exact artifact `12254318750`, ZIP digest and
result digest are fixed. Admission requires the original successful job and all
ten actual administrator checks, no browser errors/external requests, and the
original two consumed build identities. The run's failed journey setup is not
rewritten as success.

Only `journeys` executes in the repair round. Administrator admission runs no
browser, database, fixture or authentication operation. Its browser/helper/proxy
blobs and runtime configuration must stay identical. The fixture's exact
`4fd705b7…` → `2d7b7007…` repair is limited to Survey prerequisites used only by
journeys and safe failure diagnostics. The successful administrator code path,
including shared setup and cleanup, is independently fingerprinted without those
precise regions. The full new fixture blob remains explicitly pinned; this is
not a generic permission to change arbitrary excluded code. Old success retains
its original SHA/run/attempt and ten checks; current journeys get new evidence.
