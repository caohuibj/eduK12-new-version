# Frozen education feedback policy consumer

Feedback code `892c55996a118e93833f9f8609d3ead248cd4dad` (tree `5392828f322667e5c8613e6912183e01223e9955`) starts from root `467baeb59`. Root's optional policy contract `385277be09228ace5d9ff8da1bbd8934d86cd471` was normally merged in `19d58f8ab3d83919fb4074b2bf492bde47e5f35d`, tree `1401590420f7ac4c468223772a094cc1141dccc9`. Source/producer/management/frontend files are unchanged relative to that root baseline.

The actual education report reader now consumes verified `source.origin.feedbackPolicy` and uses the original pure `trainingFeedbackPolicySchema` / `trainingFeedbackAvailability`. It no longer depends on Training COURSE snapshot identity. Missing old fields mean IMMEDIATE without adding a field or changing the source hash; malformed present policies fail closed. NONE and actual parent/job readiness remain earlier gates. Pure Form needs no report job or interpretation, but obeys the same frozen timing. The optional `readReportOpening` hook remains only a stricter workflow restriction: it cannot widen the frozen policy. Whole-source rechecks still detect a changed policy during materialization.

Teacher report routing now matches the runtime's SCHOOL-domain approved TEACHER/ADMIN boundary. ADMIN still has to pass the exact self execution, TEACHER persona, organization and current report rights in the reader. No Training/LEGACY/system-admin authentication exception was added.

## Scoped execution and limits

[Raw evidence and source bindings](feedback-policy-consumer-evidence/index.json): 47 direct consumer contracts PASS, exit 0; backend `tsc --noEmit` exit 0. These ran at `892c55996` on **Node 24.19.0**, below engines, and are explicitly development observations rather than formal qualification. Absorbed root `385277be` adds the optional field using the same schema with no default; its two new root compatibility cases were not repeated. The earlier consumer results are not relabelled as fresh post-merge executions.

Cases cover production composition with no injected opening reader, frozen future/elapsed times, offset normalization, absent-field hash stability, invalid present policy, Form NONE/incomplete/no-authority, stricter workflow timing, and approved School-domain ADMIN routing through the real reader boundary. Authentication and verified-source boundaries are mocked in these contracts; this is not real PG or producer qualification. No PG, runtime/source suites, frontend checks, CI/build/PR merge/deploy were started.

## Exact cases needed by the runtime PG owner

Use its existing real source producer→independent review/publication→START→durable FINAL→production report route fixture, with Node 24.21 and actual product cookies. Do not substitute the injected opening hook or synthetic prepared FINAL facts:

1. Register explicit IMMEDIATE, read the actual registration back, complete, and receive approved READY report data from the concrete route.
2. Register SCHEDULED with a future instant, confirm normalized frozen UTC in the actual readback, complete with the real saved receipt, and receive WITHHELD plus releaseAt. For the positive elapsed case use another legally registered source whose configured time is already elapsed; do not mutate frozen policy or wait/rewrite an accepted version.
3. Pure Form BUNDLE: NONE remains WITHHELD; future COMPLETION_ONLY remains WITHHELD; elapsed/immediate COMPLETION_ONLY returns COMPLETED with no invented measurement, receipt or job.
4. A legal SCHOOL account with business role ADMIN, approved teacher status and actual TEACHER persona can read its own completed Teacher report. Supply real MFA-bearing Teacher session claims as required by current middleware. No persona/non-owner/approval withdrawal must still deny; Training cookie remains rejected.

Reuse the runtime owner's existing durable FINAL, retired-history and current revocation evidence; only add affected assertions/fixtures. Source producer owns required explicit registration policy, UTC normalization and immutable freeze. Management owner owns actual UI/API/readback. Until those are integrated, this consumer's absent-field legacy fallback must not be called configurable education delay qualification.
