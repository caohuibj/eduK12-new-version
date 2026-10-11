# Huiteacher｜single-branch implementation checkpoint · 2026-10-12

**Repository:** `caohuibj/eduK12-new-version`  
**Base:** `main@2c3b9ed518a7652108b19b2ffbace2308678ca56`  
**Feature branch:** `feat/huiteacher-pr1-education-identity`  
**Checkpoint code:** `ad17d1715bb3f66b781b1e671321407b6fe741db`  
**Design:** [Notion Huiteacher implementation v1.2](https://app.notion.com/p/3f6d27635a38818d9bbddaf9ec8a48fa)

**STATUS: DEVELOPMENT SOURCE COMMITTED ONLY — UNTESTED.** User requested no GitHub PR creation, no CI activation, no merge, no deployment. The code is not accepted, running in production, or validated by any official gate. PR1 and PR2 are logical phases on the same branch, not independent pull requests.

## Current cumulative development state

| Phase | Source implemented on feature branch | Outstanding before acceptance |
| --- | --- | --- |
| **PR1: shared School/Teacher education identity** | Common School ID/credential and school/org units, separate Teacher/School login sessions, product entitlements and explicit product admin grants, Teacher-only initial school, school staff/student invitations, psychology enrollment separated, host landing + scoped workspace, School access boundaries partly audited | Exhaustive review of existing School APIs and shared Organization/Assessment Run semantics; isolated migration/auth/role/expiry/CSRF/MFA/posture checks. Cannot claim complete before this. |
| **PR2: Teacher Form V2 canonical runtime** | Stable targets/events; Teacher-owned Survey Form V2 drafts + immutable publication; explicit product-scoped released FORM resource; atomic event ↔ canonical Assessment Run; normal Run Track/preview/publish/lifecycle; current Teacher-only SELF population and START admission; transactional Run START via `HUITEACHER_FORM_V2` binding; authoritative encrypted single FINAL with idempotency; completion reconciler; personal Teacher task inbox and Survey V2 renderer; manager Run and Form Studio | Code review + official type/schema/migration/integration tests not run. No proof of full runtime science/content eligibility. Separate Form and licensed teacher Scale Tracks can be configured; a unified interpreted mixed package and independent personal entitlement remain outstanding; testing not executed. |
| **PR3: Teacher development + school organization** | School Form-only diagnosis with full frozen 10+ independent respondent cohort, small-cell/complement protection, text withheld and manager+MFA. Adult Teacher SELF Scale: platform independent review, product/school-specific resource license, canonical Composite START+Scale FINAL, Teacher-only participant transport, private Reporting metrics and authored adult-language Pilot guidance. Version digest includes scoring+report+rights; manager cannot read individual scores. | Source only, **NOT tested**. Standalone teacher personal enrollment independent of school subscription still unimplemented; formal licensed teacher instrument catalog needs actual reviewed content; overlapping-wave differencing and integrated Form+Scale narrative not implemented. |
| **PR4: observation/expert/multi-rater** | Event kinds and draft target/event foundation only | Evidence, experts, private reflections, consensus, usable multi-evaluator workflows |
| **PR5: student evaluation of teaching** | Shared School student identity/organization relationship foundation only | Student–teacher actual pairing, released student evaluator content, restricted Teacher participation, privacy-safe aggregate reports |
| **PR6: longitudinal/actions/production** | Target/event identity and initial Teacher visual shell | Multi-wave comparability, action tracking, four full workspaces, B3 fire Logo, proper Host/TLS/Compose, release and rollback |

## PR2 authoritative processing sequence

1. Teacher manager publishes **product-owned** `HuiteacherFormInstrument` with Survey V2 structural validator; media proof from Survey Researcher project **not** accepted. `huiteacher-form:<uuid>` + exact immutable digest is a Teacher-specific Form resource, not a Survey `RESEARCH_ONLY` publication.
2. Manager creates target and event, creates canonical Assessment Run **transactionally linked** to that event; adds released Teacher Form Track, previews, opens event after at least one Track, publishes Run. Teacher and School current product ACLs are checked independently. Run is the assignment and current-participant truth.
3. TEACHER subject+respondent SELF gets a frozen Run Execution. START uses existing Run claim and relational assignment; a transactional Form adapter binds precisely one `HuiteacherFormAttempt` to that Run Execution, without a parallel assessment task authority.
4. Respondent opens own Teacher task, uses Survey V2 participant form UI (conditional/MATRIX/MULTIPLE/professional questions; no research media), keeps only same-tab short lived drafts, and submits once.
5. FINAL reuses Survey's Form V2 normalization, platform canonical payload hash, existing runtime encryption; one immutable `HuiteacherFormFinal` per attempt; commit also updates the original Run and relational assignment. Exact replay returns prior receipt; altered replay is denied. Form never produces a fictitious Scale score.
6. Run completion reconciliation recognizes `HUITEACHER_FORM_V2`. Teacher management and report APIs never send raw individual results or identifiers to organization admins.

**Testing coverage committed but NOT EXECUTED:** `src/__tests__/integration/huiteacherSharedIdentity.postgres.integration.test.ts`; `huiteacherEvaluation.postgres.integration.test.ts`; `huiteacherFormRuntime.postgres.integration.test.ts`. The latter includes end-to-end Form START/FINAL/replay and protected group output with intentional below-threshold category and safely released balanced multiselect.

## PR3 privacy constraints and remaining review

- Ordinary Form group reports require a finished assessment Run **and** closed Teacher event. Every frozen independent respondent must have FINAL; `n>=10`, no partial-denominator or arbitrary respondent selectors, no person/time filters. Server checks the exact binding and decrypts/integrity-verifies encrypted Huiteacher FINAL.
- Single/Likert/Matrix and Multiple/Matrix Multiple categorical option counts are subject to item-level withholding if either a nonzero cell or a multiple-choice complement is below 5. Raw free text is **never** disclosed; numerical/ranking summaries without an approved method are explicitly WITHHELD. No non-scored Form totals, student score rankings, clinical diagnoses or causal improvement claims.
- **Future controls needed:** repeated reports with strongly overlapping but nonidentical respondent populations can still cause cross-wave differencing. Do not enable matched group longitudinal or flexible subgroups without a proven trusted disclosure policy. Current report mode is narrow first-wave whole-cohort only.
- First official candidate must validate deliberately adversarial cases: 10/11 FINAL with one attrited, repeated waves, role revocation after login, School session attempting Teacher report, Other-domain Run or research tool referenced as Teacher FORM, same attempt FINAL twice with changed payload, School-only org trying Teacher API, service outage and rollback.

## PR3｜教师描述性 Scale 自评：已提交代码的正式边界

本轮新增的 `TEACHER_INDIVIDUAL` 只适用已独立审核、`teacher_self_report`、原创可再分发、`referencePolicy: none` 的 `CUSTOM_DESCRIPTIVE` Pilot Scale。旧 Student 资源的发布语义不改变。审核人必须与资源登记者和量表原始作者均不同。成人教师报告内容须附 zh-CN 受众 QA、清晰解释及反思＋策略／支持建议。为保证发布摘要包含完整报告和授权信息，本次 Pilot 禁止另一路 `versionAxes` 局部哈希版本；媒体内容暂无安全的跨域授权适配，暂不纳入 Teacher Pilot。

`education_teacher_scale_licenses` 按学校和精确已发布资源版本控制资格；只有平台治理账号可以明确授权／撤销。共享 `ORG_ADMIN`、Huischool 心理权限或 Training `MaterialGrant` 不自动授予 Teacher Scale 使用权。Teacher Manager 的 Run 需绑定当前 Huiteacher Event、活跃校级许可、Teacher SELF 本人、`INDIVIDUAL_ONLY` 与 `HUITEACHER_ADULT_SELF_PILOT_V1`。本人可以从 Teacher 独立会话作答，沿用 Composite Scale 计分与正式 FINAL；只向本人披露经 Reporting 授权的真实指标和量表原版解释，不产生常模、诊断或自动排名；管理员只能看受控任务状态。

代码：`registeredResources.ts`、`scaleLicense.service.ts`、`teacherPilotContent.ts`、`scaleRuntime.routes.ts`、`scalePersonalReport.service.ts`、学校许可迁移与 Teacher Scale 工作台。新增 `huiteacherPersonalScale.postgres.integration.test.ts`（独立审核→许可→Task→START/FINAL→本人报告→拒绝管理员查看→许可及产品撤销）。**测试代码已提交，但没有执行、没有通过证据。**

**PR3 未完成／不可宣称已交付的部分**：① 独立于学校 Huiteacher 订阅的教师自主注册和自发测评资格（当前个人自评仍由开通 Huiteacher 的学校分配；不能创建“个人专用学校”来冒充真正学校，也不能让只开通 School 的学校自动获得 Teacher 权限）；② 首批正式量表内容的科学和版权独立核验；③ 可比较多轮组织调查的完整固定群体/差分保护；④ 同一次 Form＋Scale 的联合解释性报告；⑤ 本轮所有 CI、类型检查、迁移及端到端验收均未执行。

## Exact review scope → necessary check → unique execution place → evidence → budget

| Change | Fault target | Check's intended single execution place | Reusable formal evidence | Budget |
| --- | --- | --- | --- | --- |
| PR1 migrations/shared education identity/role grants | Invalid DDL, duplicate accounts, unauthorized psychology/Teacher access | GitHub official isolated PostgreSQL + affected auth contracts | **None yet** | Freeze actual selected jobs before CI |
| PR2 Form policy/START/FINAL/reconcile | Frozen identity mismatch, duplicate/corrupted FINAL, runtime status drift | GitHub affected backend integration and type checks | **None yet** | Freeze full changed inputs before CI |
| PR2/PR3 frontends | Missing route, incorrect Form V2 renderer, privacy UI, 390/768/1440 interactions | GitHub affected frontend build/typed browser checks | **None yet** | Freeze selected jobs |
| PR3 protected group service | Failing n/N, small-cell, multi, wrong source, free-text leak, cross-product report escalation | GitHub affected privacy integration | **None yet** | Freeze selected jobs |
| PR3 adult Scale & licensed self report | Unreviewed/scientifically unqualified source, role/tenant escalation, improper authored text, inconsistent Composite FINAL, personal score disclosure | GitHub official affected backend isolated Postgres, auth/science contracts | **None yet** (only test source) | Freeze actual selected checks when CI hold lifted |
| PR3 Teacher personal UI | Incorrect Scale player, stale status, missing teacher-only session, wrong audience | GitHub affected frontend typed/browser flows | **None yet** | Freeze exact path after final diff |
| Any production change | Wrong source/version, unavailable Host, invalid certificate, rollback failure | GitHub qualified immutable candidate; server only version/readiness/ONE affected short flow/rollback | Only same digest accepted | Only after separate deploy authorization |

Respect actual `AGENTS.md` and `docs/release/README.md`, read current HEAD and full diff again before eventual PR/CI. Only formal same-input evidence can be reused. The repository's application local→CI accepted-signature channel is NOT implemented; do not fabricate acceptance or run CI despite current user hold. Build each affected product artifact once and leave unrelated components untested.

## Latest developer next actions (no CI yet)

- PR2: static audit and corrections of new migrations/Prisma types, runtime schema and Run atomic lifecycle; explicit review of `HUITEACHER_FORM_V2` START idempotency and all new tests. **Actual green test evidence absent.** Freeze and execute tests only when user lifts CI hold.
- PR3: adult pilot Scale self path and author-reviewed private reports are source-implemented; next resolve **user-level personal entitlement independent of school subscription**, complete content review and multi-wave privacy. No claim of PR3 completion or official test success.
- Continue remaining PR4–PR6 on the **same branch only if authorized**; no formal PR, Actions trigger, CI, merge, server write until the user's next explicit permission for each relevant action.

_Last historical checkpoint (before Form runtime) was superseded by this document. Git commits preserve the exact source chronology._
