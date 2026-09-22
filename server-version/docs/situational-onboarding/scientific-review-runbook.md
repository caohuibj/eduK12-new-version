# SJT scientific review and release workflow

Scientific evidence, publication, runtime capability and historical facts are separate contracts. A published PILOT can run. A DRAFT may have advanced evidence eligibility. Eligibility never changes either the declared tier or publication status.

## Authoring and scope

Edit only the exact instrument version's `scientific.json` for governance changes. Keep instrument/scoring versions and execution content unchanged. Increase `governanceRevision` and write `changeReason` for every change, including receipt replacement, withdrawal and downgrade. The comparison uses the immutable PR base; Git history preserves earlier declarations.

Each evidence pointer has a unique ID, category, reference, review reference, exact executionRef (instrument key/version, scorer key/version, definition hash), and language/population/use/claim scope. Evidence outside the declaration's scope or execution identity blocks the candidate. A new execution version cannot inherit an old declaration or review. References are pointers; do not copy samples or protected research documents into these files.

The existing shared evaluator determines evidence eligibility: foundation + provenance for RESEARCH_READY; those plus empirical reference and formal output for RESEARCH_GRADE. The definition's traceable source/license can supply provenance. A formal output can be a validation report, not necessarily a published paper. No grade grants diagnostic interpretation or norms.

## Human review

1. Prepare evidence, scope, limitations, explicit target maturity, next revision and reason. Run `situational:onboarding-check -- --all --json` to inspect eligibility and executionRef. An advanced draft without a review deliberately fails governance validation; it can be committed to a Draft PR for review.
2. An independent human collaborator with write/maintain/admin permission reviews that exact candidate. The reviewer assesses scientific sufficiency and applicability; CI only verifies structural consistency, bindings and authority.
3. Add the actual GitHub APPROVED review URL, reviewer login and submission timestamp. Set the review's executionRef, targetMaturity, scope and governanceRevision to the reviewed claim, and `evidenceDigest` to `scientificEvidenceDigest(scientific)`. The CLI scientific decision prints this evidenceDigest. This helper hashes the normalized declaration excluding `review`; adding the receipt does not change the reviewed digest. Do not change the evidence/revision/scope after approval without a new review.
4. CI retrieves the approval, checks independence and current collaborator permission, rejects dismissal or subsequent requested changes, and reads instrument/scientific JSON at the approved commit. The reviewed scientific digest and execution hash must match. All current scientific receipts are rechecked, not just modified receipt files.
5. Run the final candidate's full CI. Review submission/dismissal now retriggers the required `merge gate / ready PR` workflow, including the authority check. The separate `publication` workflow remains an additional fast signal. Repository-wide rules are unchanged; the existing required aggregate is used. This costs another full CI run after review changes.

`reviewReference` on an individual evidence item is not an authorization credential. Only the bound, verified top-level GitHub approval authorizes an advanced declaration. CI needs GitHub read permissions sufficient to inspect collaborator permission; a permission/API failure blocks verification.

For withdrawal, remove withdrawn evidence, declare an eligible lower tier, increase revision, record the reason, and remove or replace the stale review. Remaining READY/GRADE claims require a fresh bound review. PILOT does not require a scientific approval. Publication/retirement is a separate decision.

## Checks

From the repository root:

```sh
npm --prefix server-version/backend run situational:contracts
npm --prefix server-version/backend run situational:onboarding-check -- --all --json --base <full-base-sha>
npm --prefix server-version/backend run situational:onboarding-check -- --all --governance-only --base <full-base-sha>
```

The JSON result includes scientific decisions and changed-path classifications. `--governance-only` rejects any path other than instrument-owned scientific.json; it does not bypass any scientific checks. `--verify-reviews` additionally requires `GITHUB_TOKEN` and an immutable base SHA and performs online authority verification. Offline `--all` works without Git and participates in backend/Docker builds.

## Current and frozen views

The directory and teacher's current configuration show current governance. Standalone and Bundle child creation freeze the scientific context at the existing runtime snapshot boundary. The context includes tier, revision, evidence digest, execution binding, scope and review URL; it is covered by the authenticated encrypted snapshot envelope and its snapshot hash. It is excluded from definition/compiled-runtime hashes and canonical FINAL scoring.

Resume, FINAL responses, history, result pages, Bundle reports and JSON/CSV export use the stored context. Already completed or active attempts never borrow a newer grade. Missing historical context displays fixed PILOT with `LEGACY_MISSING` and null revision. It does not claim that a historical scientific review occurred.

Do not backfill historical grades or re-score results during promotion or withdrawal. Organization Assessment Run scientific provenance retains its existing resource-policy freeze; this change does not overwrite that separate record.

## Rollback

Old snapshot envelopes still parse identically. New envelopes contain an additive scientificContext field and therefore require the updated reader. After attempts have been created on PR2, do not roll back to the old strict parser. Stop new admission independently if needed and deploy a forward fix retaining this reader. There is no database migration or history rewrite.
