# V10 connected acceptance: local evidence

As of 2026-10-20 08:22 UTC. The affected local database, HTTP and final backend type checks below are complete. This is a local synthetic acceptance record, not a production deployment, CI qualification, performance result, scientific validity claim, or browser pass.

## Inputs and execution boundary

- Initial source: `23e3b3cb4caa64a84f525cf9ba92ccd3797c1863`.
- Incremental source: `c1174758b108fac1dab136a414f6b4fb7b3bc570`.
- The exact six-file `703cfb542fb4bba0aa6627abfe58b2b97d155bbb` overlay fixes real UNIFIED context binding and direct-child reference readiness. Later targeted repairs are listed below, not silently attributed to the earlier source.
- Node 24.21.0, PostgreSQL 16.15, Redis 7.4.11, Prisma 5.22.0 and Vitest 4.1.11. Existing officially sourced binaries and locked dependencies were reused.
- Disposable cluster only, loopback listeners, random synthetic owner/runtime credentials, restricted runtime Prisma clients. Source services run against PostgreSQL, not SQL single-user mode or a fake Redis. Credential files and raw API logs are not publication artifacts.
- Evidence directory: sibling scratch directory `measurement-v10-connected-20261020-0717`. The [sanitized ledger](20261020-connected-acceptance-ledger.json) binds result filenames, checksums, exact test/script inputs, exits and execution counts.
- Schema applied once: initial 200 migrations, then only `20261020142000_training_reference_selection`. Final 201-ledger fingerprint: `23e1f6f6fb1ef99ba4b2ff1b17c627e63831890eecb413ed2baac1611136a7b7`. Restricted role validation covered 233 tables and one sequence. No applied migration was changed or replayed.
- All HTTP and database test clients were children of the same supervised loopback namespace. Fixed-hash mailbox inputs selected exact committed test/script files. No tunnel, alternate bind, new network permission, or denied-socket workaround was used.

The supervisor command was `python3 server-version/scripts/recovery/measurement-v10-resume.py --state STATE --repo REPO --tools TOOLS --hold-seconds 3600`. Fixed HTTP tasks ran `node --import tsx EXACT_SCRIPT STATE PHASE INDEX`; fixed database tasks ran `node node_modules/vitest/vitest.mjs run EXACT_TEST --maxWorkers=1 --no-file-parallelism --reporter=verbose --reporter=json --outputFile.json=RESULT`, with only the explicitly recorded failed-case filter when necessary. Synthetic connection and crypto configuration came from private fixture environment files, never production credentials.

## Completed connected checks

| Check | Actual outcome | Evidence |
|---|---|---|
| Restricted runtime/schema, unknown table denial, immutable rows and ownership protections | 8/8, zero skipped; exit 0 | `connected-results.json`, initial `status.json` |
| Same-release publication, source read/write exclusion, capability revoke/read order, database-clock expiry | Included in those eight real two-connection checks; not substituted for service races | Same result |
| Actual API readiness | PostgreSQL, socket Redis and cache Redis all `ready` | Initial and resumed status files |
| Synthetic Training source conversion and authoring | Actual converter, cookie/CSRF, scope denials, strict report publication and parent freeze | `training-seed-result.json`, `training-author-result.json` |
| Training Scale consumer | Five real START/native FINAL/same-body UUID replay/outbox/receipt chains; each exit 0 | `training-final-0-result.json` through `training-final-4-result.json` |
| Aggregate FINAL failure atomicity | Target-specific stricter test trigger caused receipt failure; parent aggregate transaction rolled back while the already accepted child remained durable; original pending outbox retry succeeded | `training-final-4-result.json` |
| Private reference production | Five actual prior FINALs, current-authorized candidate/review/publication, request recovery and no participant identifiers in DTOs | `training-reference-result.json` |
| Explicit reinterpretation/export | Current capability required, foreign scope denied, same UUID immutable artifact replay, runtime delete denied, original FINAL unchanged | `training-reinterpret-result.json` |
| School registered longitudinal consumer | 1/1, zero skipped; exit 0 | `task-5f562559-2699-4419-bbe0-b71bfae1100c.vitest.json` |
| Teacher personal Scale consumer | 1/1, zero skipped; exit 0 | `task-b68a606b-47be-4e80-bd90-4d1a3815fe51.vitest.json` |
| Real context/reference freeze | Failure rollback, exact original request-body/UUID retry and replay, V2 reference-bearing receipt, absent-context START freeze, immutable binding and report-read nonmutation | Context checkpoint evidence below |
| Formal reference governance | 5/5, zero skipped; exit 0, 12.01 seconds | `task-785bc74e-7b4a-4604-9e11-ecebea486e76.vitest.json` |
| Higher-level source-authority races | Original five passed cases retained; only two corrected cases rerun, 2 passed / 0 failed / 5 excluded, exit 0 | Two race results below |
| Cognitive native HTTP | One standard 120-trial GoNoGo START/FINAL/same-body UUID replay, one raw fact, exact profile/config/scorer binding, original outbox/receipt and read-only reports | `training-cognitive_sjt-result.json` |
| Static SJT native HTTP | One installed, licensed generated source, original two-answer native FINAL/replay, one raw fact, exact receipt/source and PILOT disclosure | Same result; terminal task `6e197800-d82c-430d-83cc-f4288a185b3b` |

The actual Scale fixture used the existing inline encrypted storage mode with canonical `assessmentUnitSnapshot`; `ASSESSMENT_COMPACT_FACTS_ENABLED` was not enabled. These results do not claim compact-fact-mode acceptance.

### Context recovery evidence

The completed phase intentionally resumed checkpoints instead of repeating accepted submissions. Its terminal result therefore lists only checks executed in the final continuation:

1. `training-reference_context-before-replay-wire-fix.json`: same-owner/course selection and foreign denial; actual UNIFIED injected failure left no answer, section FINAL, canonical fact, context or reference binding.
2. `training-reference_context-before-identity-location-fix.json`: original successful POST body, including its original null context wire and UUID, replayed successfully; immutable binding erasure denied.
3. `training-reference_context-result.json`, terminal task `ad6eae31-ebd7-4ace-b986-73c8ac3a867c`: original native Scale FINAL retained, correct V2 reference binding location checked, report reads nonmutating; separate absent-context START freezes reference before delivery.

Earlier harness failures are retained: one retry mistakenly constructed a new context wire rather than replaying the original request, and one assertion looked for an intentionally absent release ID on the numeric receipt instead of the authoritative reference binding. Neither was fixed by weakening business schemas, changing accepted facts, or repeating scoring.

### Formal and source race detail

Formal source preparation used five **new** synthetic study participants who accepted the actual published consent body/hash before START and native FINAL. It did not retrofit consent onto the earlier five facts. Actual independent reviewer identity/scope/grant checks, immutable reviewer provenance, aggregate-only publication, ordinary cookie/CSRF governance routes, and an actual release-axis wait crossing grant expiry all passed. Scientific grant rows were isolated fixtures, not real administrator issuance or a simulated WebAuthn success.

Source races: `task-aecf767a-b443-454c-82d0-7ec84d454abd` retained five passed cases for both orderings of Scale conversion/withdrawal and Survey publication/withdrawal, plus late Scale license expiry rollback. The corrected `f76932ec37b6a405b223a21e947de799d6197895` input executed only `three clients:|static SJT actual Composite`, yielding two passes in `task-8c590d7a-c3a7-4065-8205-786e1551b04c`.

The queued-writer case does not incorrectly claim PostgreSQL always refuses a compatible SHARE reader behind a queued writer. It records the actual queued-reader/writer outcome and no writes; a separately held valid User writer exercises the real NOWAIT busy response and safe retry. The Static case uses explicit synthetic scientific grants plus real source services, never a forged administrator authentication proof, and verifies a downstream report-row wait crossing source validity causes full publication rollback.

## Final targeted repairs and connected confirmation

- `a274b6c4598b63fa4664d5f02d7a9990374bf890`: preserve existing typed `STALE_ATTEMPT` 409 on direct Scale reads. The actual new gate correctly denied the first pre-context GET, but its controller had flattened the typed error to generic 400. One focused controller case passed, including unchanged generic handling for unknown errors. The same existing attempt then passed its single GET retry with exact 409 and no context/reference/answer/fact writes: task `62d2898a-9a56-4b25-bf52-fae845351a4c`, exit 0.
- `a3653e309eb490dd8857f74c92a78de02cf3fec7`: exact Cognitive delivery-wrapper provenance in declarative disclosure. The native runner legally creates a course wrapper with a different assignment ID; the original guard wrongly required ID equality. The repair preserves exact source identity, owner/course/config/profile/version/hash/report/quota lineage. Its affected 35 unit cases passed. Task `b4e50ffb-373e-4af9-b5b1-6da0099dd73e` then passed both real guard branches, new explicit historical declarative report/artifact creation, same UUID replay, GET and export through actual cookie/CSRF HTTP. Original parent/child/raw/source/snapshot and both assignment hashes remained unchanged. No new START, FINAL, scoring or outbox processing occurred.
- `b94adefcdffc0f9788f82b0e27c3384be0cbd185`: transaction-local private reference owner-expiry receipt and final database-clock fences. Real task `0dccd404-c468-4e1c-9519-8f3b52168207` passed 1/1, zero skipped, exit 0 in 8.75 seconds. A later release-row lock was observed through PostgreSQL, owner expiry elapsed, and START failed with `CONTENT_TRAINING_REFERENCE_SCOPE_DENIED` while parent/binding/children all rolled back. Only the isolated synthetic owner's expiry was temporarily changed; its exact original value was restored and verified in `finally`. Prior source facts/publication history remained unchanged.
- All three patches overlay the same private generated-client snapshot. The final backend strict command `node node_modules/typescript/bin/tsc --noEmit --declaration false --declarationMap false` passed with exit 0 and an empty diagnostic log. `backend-final-repair-types-inputs.json` binds the combined source overlays, TypeScript configuration, lockfile and generated Prisma types. No earlier unchanged test suite or migration was repeated.

## Explicit limitations

- Genuine interactive browser acceptance is not passed. Local Chromium process launch was denied; no flags were changed or alternate subprocess used. The user postponed work requiring a new browser conversation.
- No real administrator security-key signing/issuance positive was synthesized. Existing security gates and route denials are not a new WebAuthn positive.
- No production account, production data, persistent external role permission, CI, deployment or pressure test was touched.
- Already completed unchanged checks were reused. An early opt-in integration invocation with zero executed tests is explicitly excluded, despite its process exit 0.
