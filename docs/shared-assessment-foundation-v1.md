# Shared assessment foundation: Form extraction (PR1a)

## Scope and compatibility

This change extracts existing Form functionality from Survey into reusable library modules. It does not enable new Training question types, change permissions, create a service/process, or change the database. The baseline is published commit `aeb5ce0111d28f878d733aff73c6e60e85d4bdbf` (Training round one), whose source tree equals local commit `7acd085b72d36402218e483e75b246671949b3d9`.

Server modules are under `backend/src/modules/assessment-core/`:

- `definition-primitives.ts`: stable key and immutable image-reference metadata schemas. Asset access/licensing decisions remain entry adapter responsibilities.
- `form/definition.ts`: existing Form V1/V2 registry, Zod shape, authoring/frozen validation and answer-budget checks. The historical `{kind:'FORM',definition}` hash namespace and error order are unchanged.
- `form/answers.ts`: existing typed wire values, missing reasons, explicit refusal marker, answer-object budget and shared validation error constructor.
- `form/runtime.ts`: pure normalization against an already validated definition. No project, organization, course, attempt, authentication, persistence or scorer dependencies.
- `form/import-parser.ts`: existing TEXT/CSV parsing and physical source-line handling. Revision/digest confirmation, draft mutation and publication stay in Survey's import adapter.

Browser modules are under `frontend/src/modules/assessment-core/form/`. They hold shared Form types, visibility/sanitization, professional question rendering and choice helpers. Survey image metadata is a type parameter; the shared browser layer does not import Survey, an HTTP client, an account context, or server/Zod modules. This is the browser component layer of the same Form functionality, not another server validator or scoring engine.

Existing Survey imports remain valid. Its `builder.definition.ts`, `final.compute.ts` and the three old browser component/helper paths delegate to the shared implementation. Teacher's existing consumers remain unchanged. `SurveyFinalValidationError` is an alias of the exact shared constructor, preserving `instanceof`, message and path handling. `SurveyDraftError` remains the original adapter error.

The strict preview path validates once, then normalizes answers. Its previous second definition parse was redundant. Frozen Survey readers still explicitly permit their historical condition-operator/budget compatibility mode. New authoring never inherits that allowance. The shared normalizer deliberately requires a validated definition; adapters must not pass unvalidated wire data directly.

## Verification and evidence

The committed synthetic corpus contains 47 cases captured from the baseline before extraction. It covers definition hashes, normalized values and order, error name/message/path/issue order, optional/null/zero/empty choices, all 13 existing Survey types, refusal, hidden answers, other/exclusive options, legacy frozen conditions, and deterministic TEXT/CSV imports. Tests consume the fixed oracle; they must not regenerate it from candidate code.

Additional tests assert shared/legacy constructor and schema identity, one definition parse per strict preview or frozen answer read, direct core consumption, and dependency boundaries. Existing targeted Survey, Teacher reducer and frontend rendering/pagination/flow tests cover actual consumers. The evidence bundle records exact commands, source hashes, artifacts, the baseline tree equivalence and build reuse. Local checks are not represented as official CI approval or deployment evidence.

For the 302-byte synthetic answer input, preview parsing changes from two to one and the 471-byte response is identical. This is a specific removal of redundant work, not a claim of measured CPU, heap, SQL, storage or whole-platform performance gains. Existing facade dependency closures gain thin compatibility modules; new core-only consumers can avoid loading Survey's unrelated scientific/compiler modules. Production algorithms have not been duplicated.

## Deferred work

This is PR1a with compatibility exports, not a completed PR1b or Training feature release. Training `FORM_SECTION_V1`, its hashes and its `string | string[] | null` facts remain byte-for-byte unchanged. A new Training V2 definition/facts reader must ship with a real authoring/runtime/storage/export consumer and compatibility tests; it is not introduced as an unused type/table here. Existing `MeasurementIdentityV1` already lives in the shared assessment runtime.

Ordinary optional Training Form questions, Scale copy-as-new-version, common timing policy, additional template/source capabilities and later four-family delivery work remain separate slices. No raw-answer/trial disclosure, group/longitudinal policy, role/account model, revocation policy, or retention policy is changed.

## CI and rollback boundary

An eventual PR against `main` includes the preceding Training round-one diff as well as this extraction. CI classification must inspect the entire actual base-to-head diff; foundation-only evidence must not silently qualify unrelated Training changes. Existing fixed Survey-candidate and frontend-only Teacher-Survey workflows are not a match for this server/browser core extraction. CI routing and publication are coordinated separately; this change adds no proof chain or workflow bypass.

No database rollback is needed. Before release, reverting this source change restores the prior implementation without rewriting definitions, accepted answers or reports. No production rollback/deployment has been performed or claimed.
