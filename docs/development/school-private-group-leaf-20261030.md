# School private GROUP parent/leaf resolution

Dependent local slice on `aa840084f97af4259275e4ba1192d4b42556a2f2`; that source/picker/guard migration checkpoint remains unchanged. No previous source publication, frontend type suite or15/22/37 observations are replayed.

## School-owned implementation

`education-tools/school-private-group-history.ts::resolveSchoolPrivateGroupHistory` already resolves the new School-only published source entry. It needs no missing shared export. This slice adds `school-private-group-leaf.ts`:

- `loadSchoolPrivateGroupDisclosure(tx, {organizationId, runId, trackId})` resolves a real School-linked PUBLISHED/CLOSED Track, verifies its frozen policy hash against the published source, and reads the exact frozen runtime/slot mapping. Private Scale uses its explicit V2 contract; an ordinary questionnaire uses only explicitly configured `educationComposition.unitReports[].groupDisclosure`. Parent and leaf audience ceilings both apply. No old NONE source, another slot's same-named score or ORGANIZATION audience fallback is accepted.
- The private request-local descriptor contains source identities, contracts and hashes, not participant values. It is loaded once for the selected Track. Full fixed Scale definition hashing supplies the canonical runtime source hash; the scientific `definition_hash` alone is insufficient for definitions with independently versioned report axes.
- `schoolPrivateGroupLeafDisclosure(source, leaf, core?)` checks the frozen slot and actual instrument. Catalog/generation pass their actual already-decoded canonical core and call the shared `resolveSelfGroupLeafIdentity`, additionally checking the original source-definition hash. Metadata-only historical authorization returns no invented core proof and decrypts no FINAL.
- `reporting/resultSource.ts` reuses this descriptor in discovery and selected-leaf materialization. Actual canonical identity is checked before projecting values; the old result/decryption/statistics path is retained. New School group sources require an explicit leaf for group aggregation and fail closed if their School binding cannot resolve. Unselected leaves stay unavailable.
- `campus/group-reports.ts` reuses the same leaf ceiling for its original minimum-N/differencing check. It retains manager, closure/delay, population and overlap rules. School private V2 identity is also recognized in the existing personal-change source read; Teacher/V1 checks remain unchanged.

## Small shared-consumer hook for DOT coordination

The adjacent prepared patch changes only two shared consumers; it is **not applied** in this local slice:

1. `assessment-run/registeredResources.ts::resolveHistoricalRelationalEntry`: before its existing private-lane rejection, route only new School private V2 / School group-configured questionnaire history to `resolveSchoolPrivateGroupHistory`. NEW_USE and all legacy branches remain unchanged.
2. `reporting/governedDisclosure.ts::reportingLeafDisclosureContract`: accept an optional actual Track scope/db, resolve the School-specific contract for private leaf identities, then retain the original non-School lookup. The existing stored GROUP artifact consumer passes its immutable source Run/Track scope. All current audience/minimum-N/permission narrowing remains in the original consumer.

`school-private-group-shared-hooks-20261030.patch` passed `git apply --check`. Before/proposed-after blobs are recorded with the evidence. These files may be in use by the Group owner, so DOT coordinates those exact hunks; no School-specific implementation is left for Group to design. The full two-wave journey runs after those real hooks are installed, without a permissive resolver mock.

## New evidence only

One pure synthetic-core contract case passed for correct binding, wrong slot, wrong source-definition/runtime identity and no audience fallback. A separate read-only PostgreSQL continuation reused the actual previously published synthetic School Run; it resolved one explicitly allowed leaf, rejected cross-org/another-slot metadata, and recorded11 bounded SQL events with zero FINAL/attempt-payload reads. It does not claim a real canonical-core/FINAL proof. Publisher setup was not replayed. Raw script/log and the original reporter are retained.

## Native journey prepared for the next connection point

Use a fresh isolated School STUDENT SELF private Scale with explicit professional/organization aggregate metrics and original authorized own summary/longitudinal keys. Reuse the existing real roster/activation/whole-class approval and activity/Run publishers to create a ten-student cohort. Publish T1 with `schoolTrackingOptions` and explicit tracking, use `completeEducationLibraryScaleExecution` for actual answer saves and FINAL, and verify the authorized own report. Create T2 through `createNextSchoolTrackingActivity`, publish/complete it through the same existing services, then read own changes plus existing single GROUP and planned GROUP longitudinal snapshots. No result/status insertion or source-authority mock is used. Retain a pre-close/release denial; the24-hour SQL disclosure gate requires an explicitly documented synthetic time-aging fixture or elapsed time, never a reduced production guard. Wrong actor/audience and stored history checks stay scoped to this new path.

No new test execution claims that journey yet. The original source/group storage migrations retain their formal qualification requirements; no Ready, CI, merge, deployment or production rights change is included.
