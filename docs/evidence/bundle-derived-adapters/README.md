# Frozen derived Bundle report adapters

This change consumes the shared schema3 / `declarative-evidence-v1@1.2.0` contract from core commit `4379ce8431dc53ac0960ea68dd2ae8f330fc61a7` (base `fadc877e922773bb92c33cdc955ee68c886be06e`). It does not edit the core contract, engine, derivations or `derived-report.ts`, and does not edit any source instrument or existing Bundle declaration.

## Behavior

- Native analysis uses the existing canonical Scale projection with original quality flags for schema3. A computed partial report is saved without treating the whole report as invalid solely because another metric is unavailable. Applicability failures still remain unavailable. Historical V1/V2 paths retain their prior behavior.
- The saved-facts reader validates the existing encrypted facts/hash and frozen target, applies the frozen admission policies, and calls `projectDerivedBundleView`. No engine dispatch or calculation runs on a report read. Current Education item/metric availability is an additional input to that same projection, not a new grant.
- Survey accepts the existing V2 Profile contract or the explicitly versioned schema3 Scale/Form contract. It uses already-scored FINAL units. Schema3 does not read a nonexistent Profile property. Numeric Context is decoded as numeric only when declared numeric; strings/enums retain their original values, and canonical `true`/`false` choices decode as booleans. Historical V2 numeric decoding is unchanged.
- Survey stores the already authorized participant/researcher DTOs separately. The saved researcher artifact includes its exact DTO in the existing encrypted/hash-bound report. Participant release filtering can only redact rows, dependent maximum sets, themes and conclusions from the saved DTO; it cannot restore a value withheld when the result was saved.
- One `BundleDerivedReport` component serves the native Bundle reader, Education personal feedback, Survey participant feedback and the existing saved-package report reader. It reuses `ReportRangeTrack` and the existing report sections. Numeric formatting is presentation only: no scoring, normalization, denominator reconstruction, maximum search or theme classification occurs in the browser.
- Labels, row order, original ranges, units, item counts, denominators, timeframes and state distinctions come from the server DTO. The ORVIS fixture retains eight1–5 means and a separate NFC10–50 sum. All tied maximum keys come from the frozen core result. Context values are not rendered.

## Scope boundaries

This is an adapter/UI change, not six package-specific pages or six new engines. Old saved objects without `derivedView` retain their original output. No historical records, database schema, publication status, source permissions or authorizations are changed. This change does not convert the six content candidates to schema3: each package owner must explicitly opt its new version into the shared declaration.

Survey native admission remains Scale/Form only. B15's Cognitive combination is therefore not claimed supported in Survey by this change. Existing participant cognitive disclosure is a separate allowlist and is not widened here. The native schema3 projector also needs an existing authorized policy bridge for Cognitive metrics before such rows can be displayed; this branch does not invent one.

Core follow-up for the core owner: `projectDerivedBundleView` currently populates the optional `row.quality` without checking `resultQualityDetails`. The native reader masks the legacy evidence quality when that capability is absent, so the core DTO should apply the same ceiling. The core-owned file has deliberately not been patched here. This remains a prerequisite to Ready/integration for policies that suppress quality details.

## Targeted verification

All data are synthetic; no real respondent data, private design-file links or private file metadata are included.

| Check | Result |
| --- | --- |
| Backend derived adapters + existing Survey native + Education adapter | 12 passed, 0 failed |
| Saved native facts read + Education current metric intersection | 2 passed, 0 failed |
| Additional saved-policy non-restoration case only | 1 passed, 4 already-passed cases filtered |
| Final native reader summary-quality ceiling case only | 1 passed, 2 already-passed cases filtered |
| Shared range renderer + Education + legacy generic Bundle + saved-package reader | 10 passed, 0 failed |
| Survey FINAL receipt/reopen, new derived and existing native cases only | 2 passed, 56 unrelated cases filtered |
| Focused backend types: five changed modules, original Express declarations and project d.ts | 9 roots, 2066-file transitive closure, 0 diagnostics |
| Final affected native-reader types | 5 roots;0 diagnostics, exit0 |
| Frontend app types | `tsc -p tsconfig.app.json --noEmit`: exit0, no diagnostics |
| Changed frontend lint | exit0; 0 errors, 2 nonblocking warnings (new mixed helper/component Fast Refresh export and existing stored-reader ref cleanup) |
| Diff whitespace | passed |

An additional quality-ceiling case passed on the final native reader; these are28 distinct passing behavior checks. The core owner's existing mathematical tests were not rerun. After final review preserved the legacy summary restriction, only the two directly affected saved-reader cases were checked again; their earlier results are not added to the unique count. No full backend/frontend test suite, whole-tool onboarding, full administration/FINAL journey, PostgreSQL integration, all-role browser journey, performance or restore check ran.

The first backend type attempt produced68 diagnostics: the reused Prisma Client lacked fields already present in the pinned schema, and the scoped entry omitted an original Express global declaration. The client was generated from the unchanged actual schema (Prisma5.22.0), and the original global declaration entries were included; the corrected focused type check then had0 diagnostics. No database operation or application schema/source repair was used to make it pass. Initial logs remain in the task workspace. The first lint command also ran from the repository root and exited2 because the frontend configuration was not found; the corrected command ran from the frontend directory and exited0 without changing lint rules.

The first frontend type invocation emitted no diagnostics but did not retain the child compiler exit separately from a later log-print command. A final invocation records the compiler's own exit code; the earlier empty log is not treated as independent qualification.

This mixed backend/runtime/frontend change is not pure content. Existing Draft CI would select broad compile/onboarding/lint/type jobs. This review branch uses `[skip ci]` and does not activate those broad jobs; the integration owner must select the applicable formal checks for the combined final candidate. Local checks are not claimed as GitHub qualification. No CI routing or gate was modified, and no merge, production installation, publication or deployment was performed.
