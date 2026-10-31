# Minimal real-browser fixture (not executed)

Use a single narrow existing entry host/component, the actual current API and
synthetic database accounts from the new report journey. Do not rebuild or walk
the full App. The backend fixtures must produce their own exact grants, published
source/report versions and canonical FINAL; never intercept FINAL/reportData with
mock success. Teacher and School keep their own cookies and entry theme.

Required fixture identities:

1. Teacher mixed reaction + SJT + Form, immediate policy, two explicitly approved
   RAW-metric report releases, real accepted parent FINAL, current Teacher SELF.
2. A separate Teacher synthetic published version with future SCHEDULED UTC
   opening: FINAL accepted, report shows WITHHELD; no premature metric, completion
   fallback or retry-triggered resubmission.
3. Another synthetic version with an already due opening (no sleep or mutation of
   frozen history): READY report. A Form-only NONE future fixture must remain
   WITHHELD rather than COMPLETED, supplied by the source/feedback owner.
4. School current approved/enrolled student and open activity using the shared
   actual Composite adapter, frozen mixed FINAL and student-audience report.

Minimal browser observation: open the bound completion view, invoke the existing
EducationAssessmentFeedback adapter, verify READY text/metric vs WITHHELD state,
close/reopen without resubmitting FINAL, preserve entry realm, and verify layout/
focus on the narrow report view. Capture actual method/path/response status and
parent/execution/version identities without credential values. No production
content, external users or full-application rebuild is required. Root owns the
final browser/CI consumer and immutable build reuse decision.
