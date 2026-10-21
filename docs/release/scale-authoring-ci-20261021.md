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

## Type-only recovery after run 39565491980 (not yet activated)

The official frontend producer compiled and archived the repaired product, passed
all 70 selected assertions and the full dependency audit, then stopped at app
TypeScript checking because two tests used an unsupported query option. Only those
two tests are repaired with reviewed equivalent anchored accessible-name queries.
The current frontend tree must otherwise exactly match source
`9b289945f5c782b98027ff7228c344c362247e17`; any product, lock, config or dependency
change stops reuse. The fixed official ZIP, original build-success step, reports,
all compiled-file hashes and original locked TypeScript/ESLint identities are
checked. No Vite compilation, 70-assertion test execution or audit is repeated.

Only missing app types and lint run on the original official Debian/Node base
image digest. The original frontend Docker image was not archived: its original
runtime Dockerfile tail is used to assemble a new runtime from the exact old dist
bytes, with only the COPY source adjusted. Every compiled output is rechecked;
this newly assembled runtime receives its first required Trivy scan. Browser
execution combines these original compiled frontend bytes with the unchanged
verified round-2 backend.

The original complete CodeQL analysis must finish successfully. The new analysis
runs the same JavaScript/TypeScript query/action configuration on the two actually
changed test files only. Every other change in the original scan roots stops this
partial-scan route, except the explicitly reviewed Python/data controls that were
not JavaScript/TypeScript inputs. This is not a claim of a new full-repository scan
or CodeQL coverage of Python/workflow controls; those controls receive independent
static review. Original and changed-input analysis evidence remain distinguishable.

## Earlier reviewed retry boundary

The current frontend/browser repair reuses only backend evidence from official
run `39560427570`, source `48defee0aecbc36138ad624f729b9a7cbb634efc`:
174 backend assertions, full-dependency audit, runtime scan, compiled images and
the one exact PostgreSQL case. This does not turn that failed overall run into a
pass. The original browser failure remains recorded. `scale-authoring-reuse.py`
checks the successful producer and PG/cleanup steps, immutable artifact IDs and
whole ZIP SHA-256, then original reports and inner archive checksums.

Reuse requires the entire backend tree (including fixture, tests, schema, lock and
Dockerfile), build/runtime/bootstrap/proxy scripts, backend test selection and
environment, browser service configuration, registry/timezone and tool versions to
remain unchanged. The only accepted check-script difference removes the redundant
frontend Cognitive subset typecheck. Any other relevant drift stops this fixed
lane for explicit re-scoping; it does not trigger a full fallback build.

Only the affected frontend is built and checked again, with eight directly affected
editor/save/preview suites. The original 123 frontend assertions are checked from
the fixed official report; unchanged tests and all other frontend transitive inputs
are protected by the exact seven-path repair boundary. Browser execution combines
that current frontend with the verified unchanged backend image, retaining its
original image ID. The old PostgreSQL test is not repeated; an empty database and
fresh synthetic browser prerequisites are still required. App typechecking covers
the Cognitive subset once. Fixture/readiness failures keep a nonzero exit and
small allowlisted diagnostic reports; private SQL, credentials and API logs are
not uploaded. Browser qualification still requires all 13 business checkpoints,
two image-authorization denials, three validated downloads, four zero-violation
axe records and the exact four-surface/three-width no-overflow screenshot matrix.

## Required checks and their failure targets (initial candidate)

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
- Frontend app types (including the Cognitive subset) and changed-file lint catch integration and invalid
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

Recovery SAST identity: original run 39565491980 / job 119106743347 completed successfully; action `ce5e7eeac396d720fe2d802714996c8ce561e311`, CLI `2.27.2`, JavaScript query pack `2.4.7+a7057b836bf29767461026718b14d20790b9085f`. The new two-file analysis pins that action and rejects changed CLI/query identities in actual SARIF. Original full SARIF contains findings; completion is not a zero-findings claim.
