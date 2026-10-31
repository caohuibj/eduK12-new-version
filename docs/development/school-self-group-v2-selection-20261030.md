# School SELF group V2 — publisher selection preparation

Parent School snapshot: `424667b022853f01887bed91841cba7c89257c73`.
Branch: `feat/school-self-group-source-v2-20261030`.

The approved implementation uses the existing `COHORT_AGGREGATE` mode plus the explicit new `EDUCATION_SELF_GROUP_V2` / `2.0.0` source identity. No third analysis mode is introduced. Old personal, NONE and cohort-only contracts retain their semantics.

This first independent local slice implements only publisher selection and its controlled UI. `school-private-group-selection.ts` validates exact immutable source pins, composition block scope, separate PROFESSIONAL/TEACHER/ORGANIZATION choices and the School/source minimum-N floors. It accepts only School STUDENT SELF. It receives explicit authoritative group ceilings from its future publishing caller; it does not derive group rights from own scores, longitudinal selection or a role. It does not implement the shared identity recognizer, disclosure contract, registry exception or personal readers. Sorting normalizes semantically equal publisher choices, not measurement C.

`SchoolPrivateGroupDisclosure.tsx` is a controlled editor with no API or independent authorization. Nothing is preselected; enabling group reporting still requires explicit audience/metric choices. Opt-out clears the selection. Changed fixed sources or narrowed metric ceilings cannot silently carry the old selection forward. The component displays only supplied group choices, preserves the distinction between role access and content ceiling, and explains that group minimum-N does not change an already authorized own report.

The new editor is deliberately not mounted into existing pickers, and the input is not admitted by the old V1 publisher. Its source configuration must never be silently accepted then ignored by that publisher. Runtime creation, V2 private Scale registration, composition sealing/source policy, execution and actual page integration remain for the dependent slice after the shared source is delivered.

## Shared integration dependency

DOT provided the fixed shared interface commit `00f2b788b764ca5c92e6fcf0ebda442928259f11` and the module path `assessment-policy/self-group-contract.ts`. The actual bytes are not available in this workspace or a confirmed remote object yet. Required exports are `isSelfGroupV2Entry`, `assertSelfGroupV2Entry`, `assertSelfGroupOwnSummaryCeiling`, `selfGroupAggregateCeiling`, `buildSelfGroupCohortAnalysisPolicy`, `SelfGroupParentIdentity` and `resolveSelfGroupLeafIdentity`.

Once DOT delivers the exact source, use that implementation for parent/leaf identity, separate audience ceilings and the existing cohort policy. Private Scale and composition source builders must preserve original C, exact SELF/tenant/owner/slot facts and the original authorized respondent report/timing; organization readers keep aggregate-only access. No local replacement for the shared module or a permissive publication mock is used here.

The existing School GROUP release delay, minimum-N, differencing, current-manager and historical snapshot checks remain unchanged. The final native publish → T1/T2 FINAL → own plus single/longitudinal GROUP journey remains unperformed. The previous 15 adapter observations and the older 22/37 observations are not rerun or presented as that journey.

## Verification boundary

Two new pure backend contract cases and one jsdom editor case passed. No PG, HTTP, browser, scoring or actual publishing is exercised by these three cases. Backend type checking first found TS18048 at the guarded source lookup; the explicit missing-source return fixes the control-flow narrowing without changing the runtime rejection. The original failure and the targeted type continuation are retained separately. Current type/lint exits and original test reporters are recorded in the companion evidence manifest.

External GitHub upload and Hui progress append remain stopped after the newly authorized one-time retries were denied again. No further write retry, alternate upload, Ready, formal CI, merge, deployment or production grant change is included.
