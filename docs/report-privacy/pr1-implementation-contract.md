# Report Privacy Preferences PR1 — Implementation contract

Baseline: main at 1a7d086544574d992decd645544df4e71f36d5f2.
Branch: feat/report-privacy-preferences-pr1.
This PR delivers configuration foundations only. **No existing GROUP, FINAL, private report, consent, or disclosure guard has been relaxed.**

## Scope

- Registry: four scenario identifiers for School/Teacher, four optional groups, eight selectable extra protections, two presets and custom.
- Preference inheritance: publisher preference > school default > scenario preset; school minimum and sensitive-resource baseline can only add restrictions.
- Storage: one school-default / school-minimum row or one publisher row per organization/product/scenario, optimistic revision (0 = new) and commandKey replay receipts. No student identities/answers stored.
- API: separate School and Huiteacher endpoints under /organizations/:organizationId/report-privacy; existing product cookies, current publisher authority, CSRF and step-up MFA on school-level writes.
- View: opt-in, grouped accessible tri-state controls and a single save; non-admin sees only MY scope; cross-browser persistence uses the server.
- Frozen snapshot helper and append-only release evidence table exist for PR2/PR3 to consume. No current Run publication invokes them; unknown/old Run evidence is LEGACY_STRICT.

## Feature gates

Both are **OFF** by default:

- Backend: REPORT_PRIVACY_PREFERENCES_V1_ENABLED=false.
- Frontend build: VITE_REPORT_PRIVACY_PREFERENCES_V1_ENABLED=false.

They enable preference **management** only, not relaxed report generation. The settings panel labels the state PREFERENCES_ONLY. PR2 and PR3 will separately make reporting consumers honor a reviewed, immutable Run snapshot. Do not deploy with these toggles enabled as evidence that reports are already using selected options.

## Next phases / non-goals

PR2: student/teacher FORM resource floor changes, protected group output, versioned immutable materialized releases, remove lifetime teacher-only disclosure lock for new supported runs. PR3: approved SCHOOL general education reporting, not personal psychology, parent or Survey/Training data.

No PR1 edits to: huiteacher/studentReport.service.ts, huiteacher/groupReport.service.ts, campus/group-reports.ts, assessment-run/publish.ts, reporting/fixedPopulationPrivacy.ts, Survey or Training.

## Test obligations (official evidence, not claimed here)

1. Prisma migration forward + runtime table privilege list on isolated PostgreSQL.
2. Same-school school default / publisher rows distinct; CAS, command replay, permission revocation, product/session separation, real PG constraints and immutable snapshot trigger.
3. Group ON/OFF/MIXED, locked sensitive values, keyboard and 390/768/1440 UI, one save and cross-browser refresh.
4. Same SHA source build/type check, route feature flag OFF by default, no change in current report reader semantics.

Minimal validation: AGENTS.md and docs/release/README.md select only impacted schema/backend/Teacher-School frontend/compose checks. Reuse formally supported same-input evidence only. CI and server must not duplicate identical validated work. No deployment authorized.
