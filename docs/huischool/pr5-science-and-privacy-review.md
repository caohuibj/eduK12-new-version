# Huischool PR5 — Scientific content and privacy release dossier

**Status:** DEVELOPMENT / NOT PILOT READY (2026-10-10). This dossier is an implementation and review checklist, **not** an approval certificate. Source of product requirements: [Huischool product and privacy specification](https://app.notion.com/p/3f3d27635a3881bfa9a3d01c38019d69) and [acceptance matrix](https://app.notion.com/p/3f3d27635a38814992f5d0c58c332c1e).

## What PR5 first tranche actually enables

- A SCHOOL-only, **internal** whole-Run **student SELF-report GROUP** workbench. It delegates scientific calculations, source resolution, permission re-checks, and immutable artifact generation to existing Reporting services.
- Current SCHOOL organization governor or explicitly authorized counselor with `COUNSELOR` + `PSYCHOLOGY_STAFF` can operate. No ordinary class teacher or parent/student access.
- All source execution roles must be `STUDENT → STUDENT`, SELF / SELF_REPORT, with unique student subjects; **at least 10 distinct students**, a `CLOSED` Activity and `CLOSED` Run, **24h** after each closure. No arbitrary cohort selector.
- Only independently reviewed `PUBLISHED` GROUP specs with `minimumCohortN`, `minimumContributorN`, and **each** `minimumMetricN` ≥ 10 can generate a school group projection.
- A partial contributor set, missing metric data, insufficient N or missing published `MEAN` is **WITHHELD**, with no count or individual indicator. Ready projection includes **only one-decimal means**, static caveats and opaque artifact ID; no SD, distribution cells, exact N, member identity, raw answers, response timestamps or diagnostic/cut-off claims.
- The workbench deliberately does **not** publish results to subjects, parents, teachers, or external school audiences. The floor of 10 and a 24-hour delay are **provisional additional engineering protections**, not evidence of anonymity against overlapping cohorts or repeated queries. Independent school-privacy review is still required before wider disclosure.
- `SchoolGroupLongitudinal` now uses existing canonical longitudinal Reporting/Series generation for **exactly the same set of 10+ distinct STUDENT actors on every 2–4 whole closed Run/Track**. The wrapper rejects changed cohort identity, duplicate respondents, partial-wave noncontribution, missing per-metric pairwise version evidence and unapproved analysis specs, and sends only rounded one-decimal group-wave means. It does **not** expose person-level trends, variance, exact N, raw answers, difference scores or teacher reports. `REPEATED_COHORT` and `MATCHED_LONGITUDINAL(FULL_CASE)` remain internal-only.
- Cross-Run `GROUP` differencing protection rejects **overlapping, non-identical** previously published GROUP populations, including historical sources; identical or disjoint contributor sets remain eligible under their separate source/privacy rules. This is a conservative engineering safeguard, **not** evidence against all possible external/linkage attacks or legacy export channels.
- `SchoolIndividualLongitudinalStudio` supplies current `COUNSELOR`+`PSYCHOLOGY_STAFF`+`CLIENT`-scoped (pseudonymous) candidate students and 2–8 closed campus self-report Run/Tracks. Every adjacent resource-version pair/metric must match a `PUBLISHED` evidence-hash-addressed comparability rule. It uses original reference resolution, official individual frozen wave artifacts and a second governed read; generation response contains **no** individual scores, causal interpretation, or account identifiers.
- `SchoolStudentTasks` reports completed status and neutral, youth-readable support language **without** raw metric codes/values when independent exact-tool student explanation approval is unavailable. This guard is in the SCHOOL API as well as its UI. `publishedCampusStudentNarratives` remains empty; no score-based text was invented.
- Existing GROUP reports are **re-read only after integrity checking their stored frozen cohort**. An artifact from a filtered `FILTERED_RUN_TRACK_SUBJECTS` selector, smaller member population, wrong Organization, Run or Track is refused, **including when an ORG_ADMIN would otherwise bypass the ordinary fixed-population test**.
- **Professional PROTECTED_FEEDBACK studio**: current SCHOOL counselor persona + explicit psychology grant, current `CLIENT` case relationship, an approved active SCHOOL STUDENT with a closed associated Activity/Run, a published independently reviewed protected feedback spec with respondent, contributor and metric floors >=5. Frontend receives an opaque `林-` reference only; the server alone resolves the internal user and submits a frozen `subjectUserId` to the existing official reporting engine. The generation reply conveys availability/withheld only, not a score or a rater identity. This is counselor-only and is **not** parent or teacher release approval.
- This does not introduce a new scorer, trust raw answers, open Cognitive Organization Run, or change TRAINING reporting.

## Scientific content publication gate — *no auto-approval*

The following entries are **not complete** and may **not** be used to populate runtime `reviewedParentTemplates`, automatically activate the parent-report flag, or publish report-policy/specs:

| Candidate school scope | Tool/version/license | Population / informant | Evidence & maturity | Reviewed audience language | Release |
|---|---|---|---|---|---|
| Student wellbeing / coping | **NOT YET VERIFIED** | age/grade, STUDENT→STUDENT | validity, provenance, cut-off/norm if any | STUDENT; COUNSELOR | BLOCKED |
| Learning adaptation / school belonging | **NOT YET VERIFIED** | age/grade, STUDENT SELF | content validity and limitations | STUDENT; TEACHER only if explicitly allowed aggregate | BLOCKED |
| Parent observation of student | **NOT YET VERIFIED** | PARENT→STUDENT | target/observer direction, permission, informant comparability | COUNSELOR; PARENT only if reviewed per exact report | BLOCKED |
| Teacher observation of student | **NOT YET VERIFIED** | TEACHER→STUDENT | teacher-informant norms/limitations | COUNSELOR; TEACHER educational-only if approved | BLOCKED |
| Student experience of teacher/class | **NOT YET VERIFIED** | STUDENT→TEACHER / group | rater-reidentification test, release delay, context | teacher receives only approved delayed group summary | BLOCKED |
| Family-support experience | **NOT YET VERIFIED** | STUDENT→PARENT | individual power/privacy risk, child safeguarding | do **not** disclose to parent automatically | BLOCKED |

A school content pack must bind at least: immutable `resourceKind/resourceKey/resourceVersion/definitionHash`; permission or license and provenance documents; applicable ages/grades and language; exact `subjectRole/respondentRole/perspective`; immutable `ResultDisclosureContract` and audience-specific metric keys; scoring/reverse-item and missingness contracts; scientific maturity and evidence ceiling; each audience's reviewed text plus signer/date; school/student consent and intervention/safety policy; protected group `minimumN`; and separate review of response-time/redaction policy. The existing **platform human review → PUBLISHED** workflow is mandatory. A PILOT resource cannot silently acquire research-ready norms, diagnosis thresholds or causal claims.

## Audience writing acceptance (candidate text is not a score interpretation)

**Student (youth language; generic, without metric interpretation):** “谢谢你认真回答。一次测评无法定义你，也不需要凭一个分数给自己贴标签。如果最近学习、人际关系或者心情里有让你难受的事，可以和信任的大人、班主任或学校心理老师聊一聊。你可以决定先从哪件事说起。” This paragraph is suitable **only as an unscored general support notice**. It has no evidentiary basis to interpret any particular construct or student.

**Parent (supportive, not surveillance):** “你看到的内容，是为了帮助你更好地理解和支持孩子，而不是判断他是不是‘有问题’。可以先问问孩子最近有哪些事情需要帮助，留一点空间给他自己表达。单份报告的授权随时可能撤销。” This text does **not** authorize access. Exact-tool parent feedback still needs a separate reviewed, age-appropriate template and a per-report consent + grant.

**Ordinary teacher:** “请把群体信息用作改进课堂支持的线索，而不是给学生贴标签或对个人进行排名。个体心理结果不属于任课教师的默认可见范围。” Individual results remain inaccessible without a separate explicit educational disclosure contract.

**School counselor:** Record the named tool/version, reliability and applicability, source/informant/perspective, sample limitations, scientific maturity, potential missingness, compatible comparison evidence, current authorization and possible next supportive steps. Do not infer diagnosis, causation or crisis status solely from a score.

Audience strings above are **unreviewed content examples, not the released content registry**, and should be revised by the human psychology/content reviewers before production activation.

## Privacy acceptance that still blocks wider release

1. **Student→teacher**: no report or raw rater export is enabled by the new GROUP workbench. Independently verify cohort minN, repeated/time-based differentials, overlapping classes, respondents joining/leaving, small subject-subgroups, incomplete contribution, cached artifacts, prints/exports, guessable IDs and revocation. Any such re-identification risk is **NO-GO**.
2. **GROUP same/repeated source**: the whole frozen Run/Track + delayed closed activity restriction eliminates arbitrary selectors from this campus entrypoint only. It does **not** prove protection against two differently targeted Runs or source-level overlap; multi-run differencing requires a separate formally reviewed release/provenance decision before exposing summaries to nonprofessional teachers.
3. **Protected individual**: current `COUNSELOR` + `PSYCHOLOGY_STAFF` + current `CLIENT` relationship, reviewed spec and source identity; no parent or school-admin individual access. Never treat `ORG_ADMIN` as psychological report authority.
4. **Parent**: `reviewedParentTemplates` currently has no resource-specific educational entry; retain `CAMPUS_PARENT_REPORT_ENABLED=false` until **every tool being opened** has a genuine approved age-appropriate template and complete grant/revoke tests.
5. **Longitudinal**: only same subject, truly compatible instrument/version/source metric evidence and approved audience; never infer improvements or causal reasons from repeated values. Automatic multi-rater synthesis remains explicitly unsupported.
6. **Pilot**: two independent synthetic schools / all declared roles and workflows E2E-01..12; 390/768/1440 viewport with screenshots; exact-head GitHub evidence; source/version licensing; 4C4G real scenario, support SOP, recovery and appropriate rollback. Neither the CI merge gate nor this document substitutes for the pilot sign-off.

## Remaining PR5 work after the first group-studio tranche

- Campus-native **individual/group longitudinal generation** has an initial fail-closed SCHOOL implementation. Its remaining requirements are true instrument-specific comparability evidence and scientific signoff, protected group-member overlap/participant movement empirical validation, and representative PostgreSQL/browser cross-school acceptance; never expose raw subject IDs or professional report results to general staff.
- Exact instrument selections, licensing/evidence dossiers, independently reviewed student/parent/teacher/counselor textual feedback and actual sign-off; populate production registries only after review, keep unapproved report UI honest. Source-backed candidate inventory: [Exact Instrument / Audience Evidence Ledger](./pr5-instrument-evidence-ledger.md).
- Prove or explicitly withhold student→teacher privacy-safe release under repeated/differencing attacks; maintain no student→parent automatic disclosure.
- Final independent pilot acceptance matrix and evidence, separate from the requested coding PR and separate from production deployment.
