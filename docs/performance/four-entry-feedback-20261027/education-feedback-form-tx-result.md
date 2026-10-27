# Pure Form disclosure and report transaction correction

Code `86953ce5bb3a8220f739cd740bc18ba16975979c`, tree `f0bb36aa5f4b3aea9dda35675151171a450e9355`, branch `feat/pr363-education-feedback`, normally absorbs root `0e3d210d`. [The preceding distribution delta](education-feedback-distribution-result.md) retains its original evidence and failures; this correction changes the report service and summary consumer, so new evidence is recorded separately.

Root's review found that pure Form completion returned before the NONE and opening gates. The corrected flow applies NONE first, validates actual Form completion without measurement/report facts, then uses the same configured education opening and shared frozen timing gate as other reports. Only then can COMPLETION_ONLY return a completion confirmation. Pure Form does not create scores, interpretations, report jobs or a synthetic PENDING state. Form failure to open cannot change the already-completed attempt.

The internal disclosure-only `readRespondentRunSummary` option now accepts the caller's `Prisma.TransactionClient`; the education report reader supplies its actual transaction. Its own/current respondent SQL and both exact historical source reads use that transaction. They previously used global Prisma autocommit reads while the outer report transaction remained open. The original two-argument numeric-summary API is unchanged.

Independent authority checks remain intentional: the generic summary supports other resource namespaces and external-parent respondent relationships, while the education report lane additionally requires its own product realm, exact self subject/respondent, organization/persona, execution/parent and frozen-source identity. Reusing the outer transaction is safe; replacing the generic respondent boundary with a cached education `own` DTO would require a different authorization contract. No authority cache or claim of fewer backend reads was introduced.

## Affected evidence

Exact commands, raw reports, exit codes, hashes, source observations and container cleanup are in [the evidence index](education-feedback-form-tx-evidence/index.json).

- Unit consumers: **36 PASS, exit 0**. Added pure Form NONE, future opening followed by legal opening, and missing configured shared timing identity cases. The existing completion case now uses a legal COMPLETION_ONLY contract and no interpretation receipt. An additional summary case refuses global Prisma reads and checks that both source reads receive the supplied transaction. Earlier numeric-summary behavior and current withdrawal checks remain covered.
- Backend types: **exit 0** for the changed internal option and consumers.
- New disposable PG16: all 240 migrations applied as setup, 267 public tables; real School and Teacher report cases **2 PASS, exit 0**. The application URL uses `connection_limit=1`, `pool_timeout=2`, `connect_timeout=5`, so a nested global query from a held report transaction cannot borrow a second connection. Real signed product-cookie middleware, source/approval identity and current SQL ran without auth/SQL mocks, including original distribution grant revocation, legal history and actual current report/account withdrawal. Prior source retirement and emergency stop checks remain part of these affected report cases.

The new PG/Redis containers were both stopped and removed. No original DB/cache was contacted, and CI/GITHUB_ACTIONS/RELEASE_VERIFY_LOCAL were unset. The PG case uses synthetic prepared source and accepted FINAL facts. The new pure Form policy cases are unit boundaries, not a claim of real producer-generated Form qualification. Root still owns the actual producer→START/recovery/FINAL→reportData positive PG integration.

Source/registry/authority/migration/shared FINAL files remain byte-identical to root `0e3d210d`. Teacher App/runtime injection remains the preceding minimal adapter contract; no Teacher runtime/source suites, frontend checks or root report-consumer tests were repeated for this backend correction. Node `24.19.0` remains below engines. No build, real browser/mobile, formal CI, merge or deployment was run.
