# Individual Longitudinal Reporting

Base: `main@ca80d8b0` after PR #169 (cohort selection and automatic group longitudinal).

## Product flow

Open Organization reporting → 个人纵向报告 → search/select a student → choose a measurement resource and at least two measurement dates → select a published individual reporting spec → generate. Subjects and sources are paginated. The browser displays server-computed observations and adjacent-wave comparisons; it does not compute scores or deltas.

`INDIVIDUAL_LONGITUDINAL` uses `ORG_INDIVIDUAL_LONGITUDINAL_V1` and the distinct `ORG_INDIVIDUAL_REPORT_V1` policy. Its spec has numeric metric identities, accepted quality rules, evidence ceiling and comparability rules, but no cohort minimum or aggregate functions. Publishing a scientific contract still requires the existing platform review/publish workflow; this PR does not automatically publish one.

## Source and authorization boundaries

- Only Organization SELF observations with stable user identity and frozen Membership provenance are accepted. Anonymous/public attempts and legacy records without that provenance are excluded. Canonical result resolution retains existing integrity and quality checks for Scale, Cognitive, Bundle and eligible Situational contracts.
- Select 2–50 distinct Runs for one resource family/key. The server sorts by publication time. At least two selected observations must have canonical completed results. Other selected observations may be incomplete; these are marked missing. A Run without an execution for this subject is not fabricated into a Wave.
- Each Wave cohort and manifest contains exactly one selected user. Membership IDs can differ across Waves. New completed data changes the immutable series identity; equivalent input retries/concurrent requests reuse the artifact.
- Current Organization admin/psychology staff may manage subjects in the organization. Teachers require current shared-class scope; counselors require a current counselor/client relationship. Platform role alone and knowing an artifact ID do not grant access. V1 excludes subject self-read and parent-only access.
- Discovery, generation, reading, export creation and download recheck current scope and explicit denies. Suspension denies access. Personal export uses the existing MEMBER ticket and requires `REPORT_MEMBER_EXPORT`; AGGREGATE export cannot bypass it.
- Personal series are omitted from the generic group series browser. The subject-scoped builder handles discovery without exposing other participants or raw manifests.

## Scientific interpretation

Missing/non-numeric/unaccepted-quality metrics have no values or deltas. Adjacent observations use the existing evidence-based comparability resolver. Even equal versions need an explicit comparability rule; absent evidence gives `NOT_COMPARABLE` and side-by-side values only. Numeric delta is emitted only when the rule permits it and both observations are present. Each date retains its evidence level and limitations. The projection does not infer diagnoses, improvement/decline or causality.

## API

- `GET /organizations/:organizationId/reporting/individual-subjects?search=...&page=1&pageSize=50`
- `GET /organizations/:organizationId/reporting/individual-sources?subjectUserId=...&page=1&pageSize=100`
- `GET .../reporting/specs?analysisKind=INDIVIDUAL_LONGITUDINAL`
- `POST .../reporting/analyses` with `{ analysisKind: 'INDIVIDUAL_LONGITUDINAL', subjectUserId, specId, sources: [{ runId, trackId }, ...] }`
- Existing artifact read and MEMBER export endpoints dispatch through the new subject-scoped policy.

Source discovery is a candidate list, not a promise of reportability: canonical results, ambiguity, minimum completed measurements and quality are validated on generation. No population counts or metric values are returned by discovery.

## Persistence and validation

The additive migration adds nullable `subject_user_id`, expands artifact constraints, and adds subject/source indexes. The new artifact shape requires a Series and subject, with no direct cohort field. Existing artifact payloads/hashes are not rewritten; immutability triggers and relational Wave bindings remain active.

Local validation: all 21 Reporting unit/PostgreSQL suites pass (70 tests); four frontend reporting tests pass; backend production build, frontend TypeScript and changed-file lint pass. Tests cover stable identity across membership episodes, subject isolation, concurrency, missing data, evidence-required comparisons, immutable rows, current teacher/counselor scope, explicit denies, and export revocation. The new PostgreSQL suite is mandatory in CI's critical integration list. Remote Full Gate remains required before merge.

The separate Anonymous/Public Delivery Closure from the original plan remains the next independent PR.
