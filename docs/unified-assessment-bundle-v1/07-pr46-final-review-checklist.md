# PR #46 final review and merge gate checklist (Commit 17)

**Do not merge yet.** Keep Draft until two independent reviews complete this checklist.

## Branch state

- Branch: `feature/unified-assessment-bundle-v1`
- Draft PR: https://github.com/caohuibj/eduK12-new-version/pull/46
- Base: `main` (expect `e932298` unless rebased/merged)
- Prep 15.1 + Commit 16 + Commit 17 landed on this branch

## Two independent reviews

Reviewer A and Reviewer B each confirm:

1. Reanalysis requires unique frozen COGNITIVE/SCALE sources; Context key/version/hash match; registry dispatch + ReportFacts; new history only.
2. Safety Bull payload is ID-only; deadlines persisted; wakeupJobId idempotent; subject/analysis idempotency; Prisma models present.
3. Auth evidence: first attach on EVIDENCE_PENDING OK; post-APPROVED replacement mints version; StoredAsset sha256 authoritative.
4. Pending teacher-assigned consent gates attempt start and FINAL submit.
5. SDQ teacher overall=No is structural impact skip (no forged answeredItems).
6. Commit 16 contract suite green; tsc green.
7. No merge to main from this session; Draft remains Draft.

## Known DRAFT / blocked items (not merge blockers for code freeze, but product gates)

- TEXI zh-CN localization unsigned — fail-closed
- SDQ teacher zh-CN translation pending signed manifest — fail-closed
- First production Bundles keep `productionTriggerEnabled=false` (test-only Safety fixture only)
- Seven first-wave packages remain DRAFT until explicit publish decision after reviews

## Merge gate (after both reviews)

1. Re-fetch `origin/main`; if advanced past branch merge-base, merge into feature branch and re-run focused + Commit 16 gates.
2. Confirm CI green on Draft PR #46.
3. Explicit human approval to mark Ready for review / merge.
4. Merge only by human; agents must not merge.

## Stop for user

Commit 17 ends here. No auto-merge. No push to main.
