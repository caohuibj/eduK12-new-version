# Shared Form foundation: bounded candidate CI

This push-only workflow applies exclusively to `fix/shared-assessment-foundation-20261017`.
It does not change `ci.yml`, classification, required checks, or the merge gate. No PR,
merge, deployment, user-computer operation, browser trust change, or production access
is performed. A successful result is **not** merge readiness or production qualification.

## Frozen scope and existing functional evidence

The complete main `0c41f07` to product source `33500d2` diff contains 43 files: Training
round one (20) and shared Form extraction/compatibility (23). Exact before/after blobs,
regular modes and both component trees are frozen in the binding JSON. Unexpected
paths, changed product bytes, deletions, modes, a moved main, and missing changes fail
closed. Only the six named CI files may accompany this product source.

Local input-bound review covered Training's 87 backend, 86 frontend and 50 real HTTP
assertions, plus foundation's 164 backend, five unaffected Scale/SJT and 27 frontend
checks, app types and scoped lint. The 47 immutable oracle cases retain JSON bytes,
error order and old hashes; adapters preserve Survey/Teacher imports. These are local
review results, not Actions executions or signed local application admission. The
small committed ledger contains source/receipt hashes and limitations, never credentials,
cookies, private fixtures, dependency directories or raw private logs.

Foundation's pure preview parse count changes from two to one; frozen validation stays
one. Its local frontend output matches Training round one's 393 files byte for byte.
Neither result establishes lower SQL, memory use, real-user latency or capacity.

## New checks and their unique execution location

GitHub-hosted Ubuntu is the sole location for the new candidate path:

- Build backend and frontend once with clean official npm installation, pinned Node
  24.21.0 and resolved immutable official base digests. Runtime packaging consumes that
  exact builder image and never recompiles.
- The backend effective recipe changes exactly `RUN npm run build` to a 3 GiB `npx tsc`
  invocation, as in the existing Survey candidate. The tracked Scale, SJT, Cognitive
  and Bundle catalog trees, generators, scripts, Prisma and package/config inputs must
  equal frozen main. This avoids unrelated generator checks and the old Dockerfile's
  missing generator-script copies. It is a documented CI-candidate recipe, not the
  unmodified production recipe or new scientific qualification.
- Both candidate runtimes retain the existing HIGH/CRITICAL scan threshold and high
  dependency audit threshold. CodeQL scans affected code directories, including new
  CI executors. These are distinct from the local functional tests.
- The backend uses disposable PostgreSQL 16.15 and Redis 7.4.11, a real restricted
  runtime role and compiled runtime HTTP. Small new artifact-level checks cover old
  Form adapters, representative oracle bytes, precise Training IDs/course/authority,
  post-publication Scale rejection and DB persistence, and Survey draft preview/readback.
  Existing local comprehensive contracts, deterministic races and the 50-point course
  lifecycle are not replayed. The schema is initialized only to support these checks;
  no schema-upgrade, dump/restore, capacity or full-lifecycle claim is made.
- Frontend builder and runtime static files must match exactly. Official Docker flags
  enable Cognitive and default Teacher/privacy flags false; local Vite had Cognitive
  false and a local dotenv file. Therefore local-to-Docker bytes are not an equality
  gate. Official bundle bytes/gzip sizes are reported with these input differences.
  No frontend browser or new certificate trust is involved.

The official prior Survey run `39031714833` is not a source of either changed product
image. Fresh builder and runtime producers emit one artifact per component and stage, keyed
by run ID and source SHA. Runtime receipts directly bind their original builder image
and receipt digest; artifacts never contain another artifact. Audit, image scan and
bounded runtime probes are separate jobs, so a later failure does not replay them. Consumers verify same-run identity, exact component tree, tool fingerprints,
archive digest, actual image ID and revision. A failed consumer may reuse the original
successful producer through a same-run failed-job retry; artifact names do not change
with attempt. There is no multi-level or cross-run evidence framework and no fallback
rebuild. A changed input invalidates its affected evidence and must be reviewed before
retry. Do not blindly rerun a job whose already-successful phases are unchanged.

## Budget and exclusions

Cold builds/scans are estimated at 15–25 minutes, plus queueing; bounded HTTP normally
takes 1–3 minutes. At five minutes report the actual waiting phase, without adding
unrelated checks. Individual jobs have finite deadlines, requests have 10-second bounds,
and the runtime probe has a 150-second outer bound. Cleanup removes only this job's
named disposable containers and private temporary files. The running DEV, production
services/data, existing backups, Mac and all other branches remain untouched.

Raw failure status is retained. Reports and actual image artifacts expire after three
days. Output explicitly separates local review evidence, successful Actions phases,
failed/missing phases and unclaimed merge/deployment/browser qualification.
