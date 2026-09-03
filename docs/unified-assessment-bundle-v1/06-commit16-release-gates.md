# Commit 16 / Prep 17.1 release gate matrix

Authoritative contract suite: `server-version/backend/src/__tests__/assessment-bundle/release-gates-commit16.test.ts`.

Do **not** treat this file as a stub. Gates below are the merge/release checklist for Draft PR #46.

## Gate matrix

| Gate | What | How to run / evidence | Required for merge |
|---|---|---|---|
| **Contract suite** | Commit 16 release-gates (bundle/auth/observer/Safety/SDQ/reanalysis regressions) | `cd server-version/backend && npx vitest run src/__tests__/assessment-bundle/release-gates-commit16.test.ts` | Yes |
| **Focused domain** | Safety / authorization / scale (SDQ) / reanalysis / observer | `npx vitest run src/__tests__/assessment-safety src/__tests__/assessment-authorization src/__tests__/scale src/__tests__/assessment-reanalysis src/__tests__/assessment-observer` | Yes |
| **Typecheck** | Backend `tsc --noEmit` | `cd server-version/backend && npx tsc --noEmit` | Yes |
| **CI migrate + full tests** | GitHub Actions `backend (ci + migrate + build + full regression)` on PR head | PR checks / Actions run | Yes (prefer green before merge) |
| **Frontend CI** | lint + typecheck + tests + build | PR checks | Yes |
| **Docker** | compose config + production builds | PR checks `docker` job | Yes |
| **CodeQL** | javascript/typescript SAST | PR checks | Yes |
| **DRAFT product checks** | Packages remain DRAFT; Safety production queue dormant; observer consent domain-only until HTTP wiring | Checklist in `07-pr46-final-review-checklist.md` | Documented; not auto-wired |

## Local verify (Prep 17.1)

```bash
cd server-version/backend
npx vitest run src/__tests__/assessment-safety src/__tests__/assessment-authorization \
  src/__tests__/scale src/__tests__/assessment-reanalysis src/__tests__/assessment-observer \
  src/__tests__/assessment-bundle/release-gates-commit16.test.ts
npx tsc --noEmit
```

## Explicit non-gates (out of this PR)

- Wiring Safety Bull queue into production workers (`productionTriggerEnabled` must stay `false`)
- Wiring observer consent into all V3.2 HTTP START/FINAL paths before publish
- EngineManifest product engines beyond registry contract
- V3.2 reopen / Prisma pool / admission / perf SLA invention
