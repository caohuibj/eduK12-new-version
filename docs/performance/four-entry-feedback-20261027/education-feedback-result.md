# PR363 education feedback task result

Independent cloud branch: `feat/pr363-education-feedback`. Started from the requested clean integration anchor `6cf241d65b4bc44878ef9d9fe21c81fdd02561cd`, without resetting the previous workspace HEAD `dff80f0604163a04e2f5a8119d7d4295116eeb41`. Main task baseline remains `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc`.

The final application source commit is `9555c2c4b` (full identity in the evidence index), tree `6fbe95e22ede62fdc7b5ef100f0094d2754dcb21`. Backend tree: `394873d5a694b268c3a271f34ff51e11e7a9c937`; frontend tree: `1fe7f42ff5c7900c058f8c950dd9f4b313991183`. The following evidence/documentation commit does not change those application trees. Every push was followed by a remote ref read. All commits use `[skip ci]`; no integration branch/PR/CI/protection/credential/merge/deploy mutation was made.

## Implemented behavior

- `EducationTaskFeedback` takes an injected product-bound loader and preserves confirmed completion through report failure, PENDING and WITHHELD. It reads once, handles StrictMode reattachment, supports explicit retry/refresh/close/Escape, clears old content before a fresh authorization read, and rejects late responses after identity/task switch or close. It performs no FINAL or polling.
- School transitions directly from an actually loaded parent COMPLETED to self feedback, with Form completion-only and observer exclusions. The active task identity survives background list replacement, and list failure/pending cannot erase the feedback transition. A completion hint or empty current item is insufficient. Teacher Scale similarly opens feedback on authoritative parent completion without waiting for list refresh. This removes manual list navigation; no backend request-count improvement is claimed.
- A dedicated injectable multi-tool report reader/projector/router consumes exact frozen C/P/R and the shared interpreter's saved FINAL receipt, selected reference slots, current-epoch canonical results and active slots. It rechecks current self/population/member/report/source authority and the exact original issuer proof after asynchronous work. No scorer, template approval/publication, latest-version substitution or authorization cache was added.
- The report renderer is shared with the existing declared-node renderer. Approved student/teacher templates can display; Training private reports and wrong audiences cannot. Missing reports/references/thresholds are explicit and produce no inferred diagnosis or raw-score fallback. ASSET nodes only show alternative text; they do not create an asset authorization path.
- Real PENDING requires a matching real accepted async job; missing facts are WITHHELD. Existing frozen feedback timing is retained; an optional stricter injected education opening time is checked and rechecked. This task creates no opening-time configuration or content approvals.
- The existing respondent reader has an internal disclosure-only overload. Education reports use its current authorization/metric-key ceiling while retaining each unit's facts, including identically named metrics in a mixed bundle. Original two-argument numeric-summary behavior and ambiguity refusal remain intact.

## Remaining integration work owned by root

The source/authority/migration/START/C/P/R files reserved for root were not modified. Root's actual `f46336cc45abaa21d4b946029cda2a0dfadec654` source reader was fetched and read only; it was not merged over this branch. The synthetic fixture accommodates its additive `runtimeDefinitionHash` field.

1. Compose the report factory with the actual identity reader (`resourceVersion` maps to `version`) and the appropriate current source/report authority adapter using its original proof array. Identity alone is not caller authorization.
2. Mount each dedicated router under the correct `/api/campus` or `/api/huiteacher` base. For School new families, invoke the new reader before legacy student-feedback fallback, or use the dedicated endpoint; do not leave the legacy completion-only fallback as the new-family consumer. The new Teacher runtime host can inject the dedicated endpoint into the shared feedback component.
3. Ensure actual education START/worker FINAL freezes the shared content/reference bindings and saves the shared interpreter receipt and canonical rows. Only actually selected parameter slots are consumed; origin references are candidate ceilings, not automatic norm selections.
4. If an education opening-time contract is configured, inject the actual frozen opening reader. Dedicated report assets are a separate permission-preserving task; no unprotected URL fallback exists here.

The exact props, DTO and factory contract are in [education-feedback-interface.md](education-feedback-interface.md).

## Validation and original failures

All commands, exit codes, original JSON reporters/logs and SHA-256 are in [education-feedback-evidence/index.json](education-feedback-evidence/index.json). The latest actually executed result for each of 110 distinct cases is PASS; this inventory is **not** a formal final-tree CI qualification or an assertion that every case ran on the same source inputs.

| Execution | Actual outcome | Meaning |
|---|---|---|
| Frontend initial selected consumers | 37 PASS, exit 0 | Shared feedback, old School/Teacher Scale consumers, shared declared Training renderer |
| School completion/runner selected file | 20 PASS / 1 FAIL, exit 1 | New observer test used the wrong accessible button name |
| Observer correction only | 1 PASS / 18 filtered, exit 0 | Original failure retained |
| Teacher/message increment | 4 PASS / 16 filtered, exit 0 | Parent-completion PENDING, legacy/unknown formatting, missing-threshold message |
| School completion-hint/task-switch increment | 2 PASS / 21 filtered, exit 0 | Actual parent status and stale completion boundaries |
| School background-list increment | 1 PASS / 3 filtered, exit 0 | Active identity persists even when refreshed page rows disappear |
| Existing real CognitiveRunner consumer | 0 PASS / 2 FAIL, exit 1 | Preexisting fixture accepted old parent URL without current-unit query |
| Only that fixture's two cases after exact-path correction | 2 PASS, exit 0 | Real runner/draft hooks with synthetic transport in jsdom; not a real browser |
| Projector first pass | 11 PASS, exit 0 | Service file preparation had failed due to cwd; service was not executed in this invocation |
| Service first pass | 20 PASS / 1 FAIL, exit 1 | Completion-only fixture did not update the source's frozen disclosure copy |
| Service + routes next pass | 5 PASS / 23 FAIL, exit 1 | Routes passed; fixture parsed before unit construction, so all service cases failed during setup |
| Corrected service + projector | 34 PASS, exit 0 | Original failures retained; real canonical/encryption/interpreter/renderer helpers, mock DB boundary |
| Exact issuer proof increment | 6 PASS / 18 filtered, exit 0 | Current permission/proof changes and opening time |
| Unit disclosure + same-name bundle increment | 29 PASS, exit 0 | Actual helper default/disclosure paths plus final education service contract |
| Backend final types | `tsc --noEmit`, exit 0 | Latest backend source; original narrowing type failure retained |
| Frontend types | `tsc -p tsconfig.app.json --noEmit`, exit 0 | Final production frontend and new tests; later only a stale fixture URL literal changed and its exact two tests/lint ran |
| Final changed-file lint | exit 0, 2 preexisting warnings | Existing School runner `state` dependency warnings retained; subsequent test-only fixes have separate clean file lint |

The frontend's first final-test type attempt failed because a new test used `Array.at` while the configured TypeScript lib is older; only that test expression changed to indexed access, followed by actual successful types and file lint. Several preparation writes used the wrong relative cwd and failed with ENOENT; subsequent absolute-path writes repaired preparation. No earlier partial shell exit or filtered run is described as a successful unexecuted stage.

Environment: Node `24.19.0`; Vitest `4.1.11`; backend TypeScript `5.9.3` / Vite `7.3.7`; frontend TypeScript `5.6.3` / Vite `6.4.4`. Node is below repository engines `>=24.21.0 <25`, so these are scoped development observations, not formal supported-runtime qualification. Complete historical node_modules byte manifests were not recorded; observations are unsigned and are not backdated to earlier test runs.

No real PostgreSQL, production build, real browser/mobile keyboard/layout, complete end-to-end authorization, formal CI, deployment or actual content publication was run on this task line. Those remain unverified and must not be inferred from the synthetic tests. No action on this branch was denied or has an uncertain remote outcome.
