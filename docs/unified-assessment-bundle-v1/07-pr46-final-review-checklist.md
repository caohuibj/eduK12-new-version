# PR #46 final review and merge checklist (Commit 17 / Prep 17.1)

Branch: `feature/unified-assessment-bundle-v1`  
Draft PR: https://github.com/caohuibj/eduK12-new-version/pull/46  
Base: `main`

## Review confirmations

1. Reanalysis requires unique frozen COGNITIVE/SCALE sources; Context key/version/hash match; registry dispatch + ReportFacts; new history only.
2. Safety Bull payload is ID-only; deadlines persisted; **deterministic wakeupJobId** (`sha256(caseId|kind|dueAt)`); restart reuses IDs; **processWakeupAtomically** claims ledger before apply; `now < fireAt` → TOO_EARLY; subject/analysis idempotency; Prisma UNIQUE(case_id, kind) + escalated wakeup consumption.
3. Auth evidence: first attach on EVIDENCE_PENDING OK; **post-APPROVED replacement mints DRAFT** (clears approval fields; explicit re-approve required). StoredAsset sha256 authoritative.
4. Pending teacher-assigned consent gates attempt start and FINAL submit **in domain**.
5. SDQ teacher overall=No is structural impact skip (no forged answeredItems); skip-induced quality flags stripped; completeness helper does not require skipped follow-ups.
6. Commit 16 contract suite green; focused suites + `tsc --noEmit` green.
7. Release gate matrix in `06-commit16-release-gates.md` reviewed.

## Safety production posture (intentional)

- Safety production queue remains **intentionally dormant**.
- `productionTriggerEnabled` **must stay false** for first production Bundles.
- Test-only authoritative fixture only. Do **not** wire Safety queue into production workers in this PR.

## Observer consent posture (intentional)

- Observer consent is a **domain guard** until START/FINAL HTTP wiring is explicitly completed before publish.
- Do **not** stuff full V3.2 HTTP path wiring into this PR.

## Known DRAFT / blocked product items

- TEXI zh-CN localization unsigned — fail-closed
- SDQ teacher zh-CN translation pending signed manifest — fail-closed
- First production Bundles keep `productionTriggerEnabled=false`
- Seven first-wave packages remain DRAFT until explicit publish decision after reviews

## Merge gate

1. Re-fetch `origin/main`; if advanced past branch merge-base, merge into feature and re-run focused + Commit 16 gates.
2. Prefer CI green on PR #46.
3. Explicit human authorization to mark Ready / merge (owner may merge).
4. Prefer merge commit unless repo default requires squash.
