# Survey v1.2 — implementation boundaries and acceptance evidence

This is a record of the current branch, **not** a production approval or an acceptance claim.

## Scope / risk / only verification site

| Change | Failure defended against | Main required check location | Reusable evidence | Budget |
| --- | --- | --- | --- | --- |
| Compose flags / MFA guard | enabled UI returns 404, or TOTP fails without its own secret | GitHub configuration and backend tests | unchanged auth primitives on main; new flag injection needs fresh proof | lightweight 5-min diagnostic threshold |
| Survey public domain | TLS mismatch, wrong Host, /api bypass | actual host **read only**; GitHub static config review | none for live host until socket/network works | stop at first permission/DNS blocker |
| SCORE_LONG pseudonym | researcher CSV leaks internal Attempt PK | GitHub Survey Golden | RAW_LONG previous anonymization design only | single focused test |
| Sample review / revocation | unauthorized owner, unsigned exclusion, stale export, old session | GitHub isolated PostgreSQL Survey/auth contracts | immutable FINAL tests if same inputs | one owner+withdraw+export sequence |
| >250 FINAL | partial cohort mislabeled complete, duplicated pages, oversized heap | GitHub keyset/PG and bounded data contract | existing small-sample golden | page+tie+cutoff tests |
| Participant draft / analytics flag | stale cross-wave answers, disabled analysis 404 | GitHub frontend Vitest + affected candidate UI | unchanged existing FINAL authority | focused UI cases |
| Cross-role browser | wrong-origin cookies/flows, 390/768/1440 regressions | **real isolated backend + PostgreSQL** browser acceptance, not mocks | cannot reuse earlier mocked browser | independent acceptance evidence needed |

No CI is requested before branch-wide static review. Official GitHub workflow selection remains governed by `AGENTS.md` and `docs/release/README.md` (scope C); merging and production deployment are **not** authorized.

## Export semantics and bounded large-sample support

- Paired score API streams at most **6,000 valid FINALs**, 200 per scoped read, pinning initial cutoff/revision. Returns 413 without partial estimate beyond that bound.
- Per-wave RAW_WAVE, RAW_LONG or SCORE_LONG exports have signed keyset continuation and **250 FINALs per artifact**. A 10-minute ticket and fresh five-minute Survey MFA are still enforced on create/download.
- All-Wave RAW_WIDE/SCORE_WIDE and unscoped Long remain bounded at 250. Use per-wave paged Long for bigger research cohorts; merge pages with Manifest and exact wave/variable keys. Do not present a partial Wide as complete.
- QUALITY_EXCLUDED is distinct from WITHDRAWN, ABANDONED and NO_WAVE. Researcher decisions require reason/revision and invalidate READY tickets. Immutable FINAL ciphertext remains unchanged.
- Sample review list returns a scoped internal attempt locator only over current researcher authentication, **not** in CSV exports. Score/Raw Long share one pseudonym algorithm.

## Real Chromium acceptance (unclaimed unless executed)

`server-version/e2e/survey-real-browser-journey.cjs` performs no mocked API interceptions and refuses any hostname that does not resolve **exclusively to loopback**. Provide a disposable isolated PostgreSQL backend, actual frontend build and local hostname mappings, with Survey Workspace/Publication/Analytics enabled and nonproduction test credentials.

Supply a mode-0600 JSON fixture at `SURVEY_REAL_BROWSER_FIXTURE`, containing `surveyUrl`, `adminUrl`, `entryUrl` (a fresh T1 link), `adminCookies`, `researcherCookies` (real scoped browser session cookies). The seeded researcher must have a live project with T1 and T2 both open, a Study-level linked-mode identity and enough quota for three isolated participants. The script checks Admin governance UI, Researcher project UI, and T1→T2 one-code participant FINAL/General with 390/768/1440 screenshots. It fails rather than substituting mocks when the fixture/backend are absent. These sessions are never committed. **A source file by itself is not execution evidence.**

## Live production verification remains blocked

Only standard repository Nginx can be inspected from this conversation. `server-version/ops/nginx/survey.eduk12.top.vhost.example` is **not active** and requires a real issued certificate, approved host config, and actual `nginx -t` before install. Run `bash server-version/ops/nginx/survey-readonly-check.sh` on the actual host after confirming SSH permissions and release version. This conversation's runtime does not mount the shared macOS SSH socket; public DNS lookup currently fails. Therefore **no claim of actual live TLS/Nginx correctness** is made, and no production changes are authorized.
