# Scale authoring: bounded CI activation (2026-10-21)

## Frozen scope and location

The candidate changes custom Scale authoring, quality-only items, frozen raw-score
feedback/media, Training/Survey consumption and export projections. It is not a
UI-only or content-only change. The 84 product/test paths based on main
`d3b51288a66843168480af99fe451914a76a020f`, one new PostgreSQL case and the
explicit CI/browser control files are frozen by before/after Git blobs in
`.github/scripts/scale-authoring-bindings.json`. The manifest itself is reviewed
configuration, not a self-authenticating execution receipt. Unknown paths, missing
paths, source drift, deletions, modes and renames fail; no full-platform fallback.

Ordinary `work/scale-authoring-feedback-20261021` pushes remain backup only.
Only the separately created `ci/scale-authoring-feedback-20261021` branch activates
the dedicated workflow, after the final review. No PR is created and PR322, main,
existing CI routes, repository rules and production settings are unchanged.

## Required checks and their failure targets

- Locked backend/frontend installs and the existing Dockerfile build stages each
  run once. This catches dependency/schema/compiler integration failures; backend
  retains its normal full build command and Prisma generation. Runtime targets
  consume the same cache. Runtime output hashes are compared with the original
  build output. No consumer recompiles.
- Explicit changed and directly affected regression files cover scoring identity,
  quality-item exclusion, feedback boundaries, compact/canonical persistence,
  privacy/media authorization, exports and old editor/result paths. The selection
  is in the manifest. Earlier local checks used an adjacent dependency environment,
  not the exact official lock environment, so these selected checks run once on
  the locked inputs. They are not a rerun of the whole application suite.
- Frontend app/Cognitive types and changed-file lint catch integration and invalid
  UI API usage. Full-dependency audit retains HIGH threshold for both components.
- One new real PostgreSQL case exercises quality raw facts, frozen image feedback,
  native submission, authorized read/export and replay. Filtered old cases are
  counted separately; exactly the named new assertion must execute and pass.
  Empty isolated schema migration is fixture preparation, not an added full
  migration/recovery regression. No schema/migration files change in this feature.
- The browser consumes the same compiled frontend and backend runtime. Native
  backend modules remain inside the original Debian builder/runtime environment;
  they are not loaded into the Ubuntu runner. PostgreSQL/Redis are fresh isolated
  services, with a restricted API role. Fixtures create only synthetic prerequisites,
  not successful sessions, final answers, reports or published instruments.
- Actual Training and Survey UI editing, publication, participant submission,
  feedback image/report/export and responsive checks are implemented by the new
  Chromium script. Required checkpoints must all pass. No mock network fulfillment,
  fake JWT, browser certificate bypass or production access is allowed.
- Both actual runtime images retain the repository Trivy HIGH/CRITICAL policy,
  including its existing ignore-unfixed setting. CodeQL uses the existing
  JavaScript/TypeScript analysis and `upload: never` policy. Its successful job
  means analysis completed, not absence of findings; SARIF is retained for review.

The build/audit/scan critical path is provisionally 15–30 minutes on hosted Ubuntu,
not a guarantee. Report the actual blocking stage after five minutes rather than
adding unrelated checks. No performance, unrelated media/Ops, full browser matrix,
production deployment or blanket regression is selected.

## Test transport approval and evidence

The user explicitly approved this round's temporary independent browser-profile
CA trust and Training/Survey loopback mapping. The manifest records this one-round
approval; false/missing approval stops before creating trust. The existing isolated
TLS/proxy code is reused. No system trust store, user Mac or production certificate
is changed. The private profile, certificate keys, credentials and synthetic fixture
are removed after the run; no private fixture, cookies, HAR or database dump is
uploaded. Reports, screenshots, scanner output and exact build artifacts are retained
for three days. Reports must distinguish executed tests from filtered cases and
static review. No browser pass is claimed before actual execution.

All selected jobs must succeed. A bounded pass is not merge qualification or
production permission. A failed run is preserved: diagnose the exact failing step,
reuse successful immutable input artifacts after review, and rerun only invalidated
or missing work. Do not click an unchanged monolithic rerun or create another
activation commit merely to repeat completed builds/checks. No automatic fallback
rebuild or blanket-retry mechanism is introduced by this lane.
