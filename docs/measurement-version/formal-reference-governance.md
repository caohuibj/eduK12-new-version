# V06 formal cross-entry reference governance

This is software governance, not proof that a real norm is scientifically valid. No production data, real grants or deployment are changed.

## Boundaries

- Only a trusted Survey/Training private candidate owner may explicitly submit, under their exact current analyze grant. Candidate ID/hash and that grant are frozen. Server-side source checks remain bounded to the submission; reviewers receive no personal-data authority.
- Values, measurement/scoring identity, membership and mean/sample SD come from the existing verified producer. HTTP accepts no norm tables, statistics, sample IDs or actor identities. Normality and estimated percentiles are never inferred.
- targetPopulation is mandatory: SUPPORTED_MATCH uses existing discrete/month-age predicates, or GENERAL_POPULATION is explicitly chosen with a basis. Text-only applicability never matches everyone. This is an application boundary, not evidence of demographic re-sampling or representativeness; unsupported scopes remain descriptive.
- Actual accepted consent evidence must cover every sample. Survey verifies frozen consent digest/version and exact accepted-attempt coverage. Training verifies accepted study scope hashes, immutable notice bodies/body hashes against the actual acceptance and full eligible-sample coverage; ordinary logged-in samples do not inherit research consent. Owner assessment and explicit independent consent review do not change or expand consent.
- One platform grant namespace: TRAINING / PLATFORM / reference-governance / reference / exact measurement release UUIDs. Published scope is PLATFORM without a product restriction. Current approved Training/Legacy business teachers still need explicit review/publish grants; neither teacher nor SYSTEM_ADMIN identity implicitly grants scientific ability. Strong-auth root issuance remains the existing management workflow.
- Reviewer must differ from original analyzer. Immutable review records candidate hash, reviewer, exact review grant/version, decision and statement. Request UUID is the review identity; altered-body retries fail.
- Publish accepts exact candidate hash and persisted review ID, never an approval object. Source ownership, analyze permission, quality/consent/lifecycle, reviewer qualification/current grant and publisher grant are rechecked transactionally. New publication uses existing NEW_ADMINISTRATION lifecycle checks. After awaited candidate/review writes or release publication, original source/caller/reviewer grant identities and versions are rechecked with current database time; no alternate grants or repeated scoring are used.
- Platform views and all published references contain aggregates/evidence plus sample-manifest hash/count, never member manifests, Training sourceIds or raw observations. Reviewers see the exact accepted notice body and hash, including restrictions not represented in structured purpose fields. Published consent evidence is scope/body hashes, not consent bodies. Private source storage remains internal.

## API

Training session and existing global CSRF/origin rules:

- GET /api/training/reference-governance/capabilities: only current subject's bounded actual grants, no candidate enumeration.
- POST /submissions: exact source candidate/hash, analyze grant, statement, population description, structured targetPopulation/basis, applicability, sample adequacy, uncertainty and consent-use assessment.
- POST /read: candidateId, grantId, purpose REVIEW or PUBLISH; aggregate and recorded consent evidence only.
- POST /reviews: requestId, candidateId/hash, review grantId, decision, statement, consentReviewed=true.
- POST /publish: candidateId/hash, stored reviewId, publish grantId, localKey/version; release metadata only.

Survey has only POST /api/survey/reference-governance/submissions, using Survey owner authentication, recent MFA and existing workspace/analytics flags. Survey identity does not acquire platform review/publish.

Submission is content-hash idempotent; review is UUID-idempotent; publish uses immutable key/version. Unknown outcomes retain the identical body. Later denial does not prove an older uncertain operation absent.

## Storage and acceptance

Existing candidate/review/release tables are reused. 20261020137000 adds optional reviewer_grant_id/reviewer_grant_version; old private reviews remain readable. Existing immutable-row and independent-review database triggers remain.

Targeted pure/service/source/authority/route-handler contracts passed, including real frozen-selector population outcomes. Handler mocks do not prove live HTTP or database races. Shared final strict types, real migration/transaction acceptance and browser interaction belong to V10. The actual UI is embedded in existing Training course analysis, the Training teacher homepage (including reviewers with no authored course), and the Survey private-candidate workspace. The platform panel renders scientific controls only after reading current explicit grants. Survey source submission uses only its Survey session. Source submission, exact-hash independent review and exact-review publication all require explicit confirmation; pending operations preserve the same body across unknown responses, reload and later refusals. Recovery stores source identity only, never scores or sample membership, and does not authorize new submission before a fresh candidate read. Tests cover component interaction and transport contracts; this is not a claim of live browser acceptance.

## Published consumers

resolveFormalReferenceRelease resolves only an exact platform release linked to its immutable formal candidate and independent approved review with recorded grant metadata. It returns aggregate entries only. Callers may provide the exact release already lifecycle-locked in their transaction, and must still authorize their own measurement/material and target scope. Grant expiry after publication is not a retroactive release revocation. Explicit release lifecycle blocks new binding or reinterpretation as appropriate, while history remains marked.
