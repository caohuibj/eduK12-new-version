# Training explicit reinterpretation and 7B artifact export

The teacher's exact completed attempt/unit can create a new independent encrypted
artifact. This operation does not edit FINAL, canonical unit facts, raw answers,
the saved FINAL report receipt, or any ordinary raw export. It uses the shared
Reference Core selector, immutable release reader, numerical interpreter and
declarative renderer; no scorer runs.

## Request and source contract

- POST `/questionnaire-products/:id/courses/:courseId/attempts/:attemptId/interpretations?grantId=…`
  requires `requestId`, `itemId`, a reason and an explicit report and/or reference
  choice. An optional `previousArtifactId` links the same exact FINAL unit's prior
  artifact; omission links the original immutable FINAL receipt.
- Actor comes only from the authenticated session. Course ownership, actual
  business teacher eligibility, current composite/delivery association, exact
  completed FINAL course/epoch and the separate COURSE `data.reinterpret` grant
  intersect under locks. Administrator projections and report edit grants do not
  imply access. Relational assignment attempts are deliberately unsupported here.
- The source must have a valid saved binding and compact FINAL receipt. The exact
  unit snapshot must match receipt result hash, provenance, type, context, scorer,
  version and allowed metrics. Skipped units remain NOT_EXECUTED. Invalid quality
  cannot become an interpretable reference result. Frozen demographic context is
  verified; current profile fields or client-provided context are never inferred.
- Numeric disclosure is a separate per-unit check, not a side effect of
  `report.edit` or `data.reinterpret`. Cognitive uses the accepted child's frozen
  assignment profile and numeric definitions, excluding research-only,
  nonstandard and product-index metrics from this teacher surface. Numeric QC
  facts remain available but cannot acquire individual reference interpretation.
  Scale uses its verified frozen runtime policy and existing explicit V1
  compatibility rule; numeric, reference and derived-label capabilities remain
  separate. The current `researcher` report label is only an ADMIN mapping, not
  scientific data authorization, so it cannot widen this new declarative path.
  Existing legacy researcher projections are unchanged.
- Request UUID advisory serialization and stored actor/context/body hash preserve
  lost-response retries. Changed input is rejected. An existing artifact is never
  reselected or rendered on retry. Current authorization still applies.

## Reading, lifecycle and export

GET of the exact artifact and GET of its `/export` suffix recheck current course
and exact-attempt capability. A newly requested interpretation rejects withdrawn
measurement/reference/report releases. Normal historical retirement does not
rewrite existing artifacts. Current lifecycle notices sit outside immutable bytes;
withdrawn history remains inspectable/exportable as history, while the UI suppresses
its conclusions and explicitly warns before a historical download.

The separate export document has schema `TRAINING_INTERPRETATION_EXPORT_V1`, version
1, the original artifact identity/hash/time and exact measurement/scoring/reference/
report versions. `exportHash` is CANONICAL_JSON_SHA256_V1 over `document`. Its bytes
and canonical digest do not incorporate a moving download time or current lifecycle
notices. The artifact ID is the stable export identity; no additional server export
copy is retained. Ordinary raw exports have no dependency on this module.

Every saved read, export and idempotent replay rechecks the current exact child's
disclosure as well as the existing data grant. If disclosure no longer permits
the artifact's report or reference metrics, the request is denied. The stored
ciphertext, hash, FINAL receipt and canonical/raw facts are not rewritten or
sanitized in place. This check does not rescore, rerender or reselect references.

The teacher report page offers explicit UUID-based authoring and export for units
already exposed by its authorized FINAL report. Pending requests are saved under
actor/composite/attempt, and preserve course, grant, reason, predecessor and chosen
versions. A read of another old artifact cannot resolve a pending creation. The
server verifies manually supplied course IDs; the UI does not assume they are
valid. No participant or administrator-only authoring UI is added.

## Evidence and limits

- 26 focused backend contracts passed: real receipt decoder/shared interpreter/
  renderer, with database, release retrieval and canonical unit retrieval mocked.
- 16 focused actual component contracts passed, including eight new authoring/
  recovery/export tests and eight existing private report rendering tests.
- One strict backend check found only the concurrently edited formal-reference
  nullable field; one frontend app check found only concurrent StaticSjtSource
  metadata typing. Those owners were notified; this is not a whole-tree type pass.
- Additive SQL supplies immutable source/predecessor guards and exact product/scope
  data-grant constraints. It has not been executed against PostgreSQL in this step.
  Real HTTP, browser download/storage, SQL rollback/locking and final combined types
  remain part of the concentrated acceptance. No grant was issued and no production,
  CI, push, deletion or stress operation was performed.
- New reference choices may be private to this owned Training composite or use
  an eligible PLATFORM release through the formal-reference resolver. PLATFORM
  labeling alone is insufficient. Original measurement ownership/source scope
  and current exact-attempt data authorization must still hold; neither the
  formal release nor its source manifest grants access to other private data.
- The disclosure repair's focused local evidence covers 72 unique contracts across
  `training-metric-disclosure`, `training-reinterpretation` and
  `training-report-drafts` with one Vitest worker. 69 of 70 passed initially; one new
  test fixture accidentally included an explicit undefined optional field and
  was corrected, then its single affected test passed. A new authoring denial
  test passed separately. The Scale audience intersection was then tightened
  to retain any stricter researcher restriction as well as the teacher ceiling;
  its nine affected tests (including one new test) passed. No global types/build,
  CI, production, real grant or raw-data mutation was performed for this repair.
