# Huischool PR5 — Exact Instrument / Audience Evidence Ledger

**Recorded from the repository at `main@cae556ba1da0f361a755755e520e687ff804926e` on 2026-10-10.** This is a *code/source inventory*, not independent legal advice, a reviewed assessment, a clinical recommendation or a content-approval signature. The underlying source files and formal InstrumentAuthorization must be rechecked before release. No resource below is newly published by PR5.

## Existing source metadata (not a substitute for tool-by-tool rights)

| Exact source identity | Repo facts | School-science limitation | Campus student/parent/teacher narrative release |
|---|---|---|---|
| `SCALE/who5@1.0.0` | `catalogStatus=ACCEPTED`, `PILOT`, self-report, 9–18; executable release `PUBLISHED`, localization `APPROVED`; evidence `who5-cn-fung-2022` (doi:10.3389/fpubh.2022.872436), study sample 1,414 **university students**. | Study's mean ages ≈20.4–20.6 do not establish K-12 age/grade-specific cut-offs or an exact youth-language report; check current electronic use rights and report audience before school activation. | **BLOCKED** until school-specific age/metric/permission and independent narrative review. |
| `SCALE/sdq_parent_zh_cn@1.0.0` | `ACCEPTED`, `PILOT`, 4–17, PARENT observer, source claims approved Chinese translation, localization `APPROVED`; Du et al. 2008 DOI:10.1186/1753-2000-2-8, mixed factor-structure evidence. Executable `PUBLISHED`. | Family informant is PARENT, not student self report. Source evidence does not activate China-specific bands/cut-offs or authorize automatic disclosure of child psychological results back to parent. Confirm legal scope of SDQ electronic use + exact report separately. | **BLOCKED**. No reviewed parent interpretation template; report sharing flag stays OFF. |
| `SCALE/sdq_teacher_zh_cn@1.0.0` | Despite historical `_zh_cn` key, **executable locale is `en`**; T4–10, ages 4–10, 29 items, PILOT, localization `APPROVED`. | Never label as Chinese-language teacher report or general 11–17 teacher form. Source cites Du et al. 2008 Chinese evidence, but explicitly disclaims this being validated exact English Teacher content as Simplified Chinese. | **BLOCKED** until target-language/adaptation + school teacher audience review. |
| `SCALE/grit_s_zh_cn@1.0.0` | `REVIEWED`, PILOT; eight-item 5-option standard, evidence Duckworth & Quinn (2009), DOI:10.1080/00223890802634290. Source `localization.reviewStatus=PENDING`, `expertReviewStatus=PENDING`, executable source records licensing via InstrumentAuthorization. | Generic original adolescent reliability evidence is not an approved Chinese K-12 scale interpretation or cut-off; exact translation must complete documented review. | **BLOCKED** pending review, legal scope and wording. |
| `SCALE/tipi_zh_cn@1.0.0` | `REVIEWED`, PILOT, 1–7 canonical TIPI source, Gosling et al. 2003 DOI:10.1016/S0092-6566(03)00046-1 and Lu et al. 2020 Chinese translation. `localization.reviewStatus=PENDING`. | No approved adolescent norm, diagnostic threshold or youth-grade result narrative. Rights declaration ≠ active authorized deployment evidence. | **BLOCKED**. |
| `SCALE/pss10_zh_cn@1.0.0` | `REVIEWED`, PILOT, source **`CATALOG_ONLY`**; references Lu et al. 2017 DOI:10.1371/journal.pone.0189543 (Chinese university students). Source explicitly requires a MAPI/ePROVIDE permission workflow and translator-rights evidence. | Source says **do not generate or deploy executable package** before verified rights; student age generalization unestablished. | **BLOCKED**, not executable; never included in campus eligible content catalog. |
| `SCALE/dass21_zh_cn@1.0.0` | `REVIEWED`, PILOT; age boundary ≥14 and Mainland adult/university evidence; localization expert/debrief **PENDING**. | 14–17 is pilot only, under 14 must not use this package, no K-12 norms, risk language requires safeguarding and independent review. | **BLOCKED**; no diagnosis or risk flag from raw score. |

Source paths follow `server-version/backend/src/modules/scale/instruments/<key>/1.0.0/instrument.ts`; authoritative scientific and rights metadata includes the distinct immutable package, localization, catalog manifest and InstrumentAuthorization records. Some manifest `usageRequirements` refer to rights maintained elsewhere: **never interpret source `PUBLISHED` or a DOI citation alone as a complete permission grant or suitable campus report**.

## Human-reviewable sign-off per exact audience and content revision

Every new released `STUDENT`, `PARENT`, `TEACHER`, or `PROFESSIONAL` text must attach independently verifiable, immutable evidence for:

1. Tool `family/key/version/definitionHash`, source language, permitted territory/use, rights/grant and exact cohort age, grade and observer; no self/parent/teacher informant conflation.
2. Source/scorer `sourceMetricKey` and audience `ResultDisclosureContract`, qualitative interpretation rule, scoring reversal, missingness and invalid answers; observed version, age group, and duration; no mixed perspectives averaged.
3. Human content author and *independent* scientific reviewer + approved date/decision + revision hash, sample-size/validity limitations, linguistic acceptance by the declared recipient and safeguarding escalation policy. A citation to another population or another translation is not an exact-form review.
4. Per-policy-only visibility `metricKeys`, exposure floor/delay, 30-day per-artifact student consent/guardian rule, current professional `CLIENT` or source-specific class eligibility, revocation and no-cache / deep-link tests.
5. For longitudinal reports, **per-metric per-adjacent-version `comparabilityRules` with real `evidenceRef` and hashed evidence**; `LIMITED` only supports descriptions, not numeric deltas. No unpublished Chinese percentile or cause attribution.
6. For protected and teacher-directed group information, actual privacy acceptance including low N, time/overlap/differencing, repeated ID combinations, source-level references and old historical reports. The current `10` and `24h` gates are preliminary **engineering** guards and cannot replace that acceptance.

## Text drafts are NOT published content

These are neutral, nonnumeric support notices for copy-review—not measurement-specific interpretations. They must not be inferred from an observed scale value.

- **Student**: “谢谢你认真作答。一个分数不能说明你是怎样的人。假如最近心情、学习或与朋友相处有些不顺，可以挑一件你愿意说的事，和信任的成年人或学校心理老师聊聊。”
- **Parent**: “请先关心孩子最近经历了什么，听听孩子希望怎样获得支持。报告不能替代与孩子的交流；同意分享一次，也不代表可以长期查看其他信息。”
- **Ordinary teacher**: “这些群体信息只提示哪些课堂支持可能值得改进。不要据此给某个学生贴标签，也不要把匿名评价当作绩效排名。”
- **Counselor**: “核对来源工具、被评与答题者方向、年级适用性、科学成熟度、缺失与审查限制；再考虑是否需要进一步沟通、教育支持或独立专业评估。”

At this PR revision, `reviewedParentTemplates` and `publishedCampusStudentNarratives` are intentionally empty. Generic student `COMPLETION_ONLY` text is available; individual student metric values are deliberately withheld until exact-instrument sign-off. Parent interpretation remains disabled. No fabricated reviewer IDs or legal clearances will be inserted.
