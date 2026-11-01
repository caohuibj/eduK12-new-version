# Translation notes and ambiguity register

Status: DRAFT, unpublished. Independent source/Chinese review required before import. This is translation preparation, not psychometric validation or an administration-ready product.

## Provenance and editorial boundaries

- Verified SHA-256 of the original supplement: a9b3dff6abd3d1a671934344aacad8e401fe13e16a607f5072402d5f8c584edc.
- Verified SHA-256 of frozen review package: 6ebef86b6fd76079f9d6bcee35d4feb11c1ffa225c38fb624235670a4c1884f1.
- English stems/options: Appendix C, Table C1, physical PDF pages 5–9. Descriptions: Appendix D, Table D1, pages 10–11. English is preserved except normalized line wrapping, removed layout-only zero-width characters, and rejoining a split stem in item 17 across pages 7–8.
- Source files remain in the adjacent source directory. No official website code, images or assets have been copied into this draft.
- Most/least administration instructions are NEW EDITORIAL wording based on the frozen reviewed procedure. The licensed supplement contains no exact administration instruction block. Do not describe this wording as verbatim author instructions.
- Authors: Malini Josiam, Walter Lee, Stephany Santos, Ananya Saini. Source https://ndownloader.figshare.com/files/68624977 . License evidence https://api.figshare.com/v2/articles/33789052 . CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ . Translation and editorial additions are modifications; no author endorsement is implied.
- Original article https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2026.1855931/full . This directory does not contain a new article backup; the original licensed supplement is already locally retained.

## Context and terminology

Retain the US undergraduate engineering context. This project restricts any later deployment to adults 18+; that restriction is not a source-supported validated age range. Do not substitute Chinese institutional equivalents, broaden to K–12, or claim Chinese reliability, validity or norms.

- advisor → 指导顾问; academic advisor → 学业指导顾问. In US university context, a person advising students on academic planning; do not silently substitute a Chinese 班主任、辅导员 or thesis supervisor.
- office hours → 教师答疑时段. Scheduled time when instructors are available to students, not generic office opening hours.
- student success center → 学生学业支持中心. Translation of the university support unit described in the source, not a claim that an identical unit exists locally.
- career services → 职业发展服务部门／办公室. Not a recruitment agency.
- student affairs professional → 学生事务专业人员. Source parenthetical counselor/mentor/etc. is retained as 咨询人员、指导者等; counselor here does not necessarily mean a clinical therapist.
- mental health professional → 心理健康专业人员. Not narrowed to psychiatrist or psychologist.
- co-op → 合作教育实践. In this US higher-education context, a structured study/work experience; not a cooperative business or simply identical to an internship.
- withdraw/drop → 退课／撤课. Local administrative distinctions vary; original dual term retained. Do not infer local deadlines or penalties.
- ombudsperson → 校内申诉专员. Institution-specific role providing a channel for concerns; no claim of binding legal authority.
- Title IX employee → Title IX 事务工作人员. US institution-specific term retained rather than replaced by a Chinese office. Exact legal duties and current legal standards are outside the draft; no legal advice is provided.
- campus organization fairs → 校园组织招新展示会. Preserve campus-organization context rather than changing this to a careers fair.
- helping professional support → 寻求助人专业人员支持. Broad source grouping includes student-support practitioners as well as mental health professionals; it is not a clinical score.

## Specific ambiguities and decisions requiring reviewer attention

1. Appendix 8 stem: “do not know any faculty well enough to ask them.” Draft “不便向他们提出请求” conveys a relational obstacle, but could sound like reluctance rather than insufficient familiarity. Reviewer should consider “但你与任何教师都不够熟悉，无法向他们提出这样的请求。” without overstrengthening impossibility.
2. Appendix 13 B: “Work on campus in a busy area” is ambiguous between employment, academic work and doing tasks. Draft “在校园里人多的地方做事” intentionally preserves breadth; do not invent a paid job or an academic study space.
3. Appendix 12: “workload inflexible” rendered as existing learning workload being hard to adjust, not a claim about administrative prohibition. The later prioritization option remains a genuine alternative.
4. Appendix 16 C / web 3 C: independent-review revision uses “与来自原有生活圈的家人和朋友交谈，进行熟悉的社交互动。” This preserves familiar social connections without narrowing “from home” to the literal hometown.
5. Appendix 22 B retains a free/low-cost PDF textbook search as a source option. It does not recommend infringement or supply unauthorized files. A general lawful-resource note may be shown outside the item, but adding “合法” inside the translated option changes the stimulus and requires explicit adaptation tracking.
6. Appendix 22 C “Ask a friend to borrow the books you need” is linguistically ambiguous. Draft treats it as borrowing needed books from a friend, not asking the friend to borrow books from someone else. Reviewer must confirm intended interpretation; no silent source repair.
7. Appendix 24 D retains the limitation “in their class”; do not expand to general institutional reporting.
8. Source category labels differ slightly: Table D1 uses “personal support,” “academic support,” “helping professional support,” while the reviewed category mapping uses “accessing … support.” JSON preserves both source labels and scoring labels. Chinese display labels express seeking support consistently. This is label harmonization, not a category change.
9. Source typos retained in English: item 9 D “Ask you advisor”; 10 B “take less responsibilities”; 18 B “websites liked Indeed”; 22 B “a free or low cost pdf versions”; Appendix D personal-support description “situations is engineering.” Chinese translates the apparent intended meaning rather than reproducing grammatical errors.
10. Appendix D's positive/negative generalizations are authors' descriptive commentary, not validated conclusions or advice about this respondent. Display only under a clearly labeled author-description section, not as diagnostic conclusions.
11. No supposedly more reasonable response is substituted. Every A–E mapping is retained, including counterintuitive mappings such as contacting an employer under B, joining an engineering student organization under D, and campus organization fairs under E.

## Required gates

- Independent bilingual reviewer checks each of 19 stems, 95 options, 5 labels and 5 complete author descriptions against the physical licensed PDF, including page-break continuations.
- Confirm original Appendix IDs and website sequence: 3, 9, 16, 22, 18, 5, 1, 12, 13, 2, 19, 24, 6, 14, 8, 21, 10, 17, 23. In particular website 14 → Appendix 14, not 15.
- Most and least must be DIFFERENT in each scene. UI guidance is insufficient: authoritative submission/scoring enforcement is required before deployment. Not implemented here.
- Complete 19 paired responses; count most and least separately; report all maximum ties separately; domain counts use most only. No reverse scores, differences, norms, ability scores, clinical conclusions or right/wrong grading.
- Later mathematical review must inspect complete paired vectors independently. Nothing here authorizes administration, publication, repository import, commit/push, CI, merge or Notion writes.

## Independent-review revisions (2026-10-21)

Four requested Chinese-only corrections applied consistently to bilingual JSON and Markdown:

- Category A: 暂不采取行动 → 不采取行动, avoiding an added temporary qualifier in the category label.
- Appendix 16 C / web 3 C: 与家乡的家人和朋友交谈，保持熟悉的社交互动。 → 与来自原有生活圈的家人和朋友交谈，进行熟悉的社交互动。
- Appendix 23 / web 19 stem: 家庭或个人问题使你无法专心于学业。 → 家庭或个人问题使你在学业上分心。
- Appendix 1 / web 7 stem: 你选修的课程负担很重、难度很高，开始感到难以应付。 → 你承担的课程学习任务很有挑战性，开始感到难以应付。

All English source text, IDs, mappings, options and scoring specifications remain unchanged. This revision remains unpublished and pending independent re-review. No product source or CI was touched.
