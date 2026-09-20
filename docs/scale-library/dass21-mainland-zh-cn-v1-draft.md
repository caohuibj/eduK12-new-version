# DASS-21 Mainland zh-CN — wording and product draft

Status: **LOCALIZATION DRAFT / NON-EXECUTABLE**  
Date: 2026-09-20  
Instrument identity: `dass21_zh_cn`  
Instrument version target: `1.0.0`  
Target population: **14 years and older**  
Under 14: **separate DASS-Y instrument identity; never route into this package by relaxing the age gate**

## 1. Product decision

This draft freezes the product decisions for the standard 21-item DASS line before an executable package is created.

### Respondent-facing feedback

The respondent/student view must **not** expose:

- raw subscale scores;
- DASS-21 ×2 standardized-comparable scores;
- severity labels;
- cut-off classifications;
- percentile/norm statements;
- statements that the respondent is depressed, anxious, stressed, mentally healthy, mentally unhealthy, high-risk, or otherwise assigned a mental-health state;
- any automated individual interpretation conditioned on the respondent's calculated DASS score.

The respondent-facing result is instead a **non-score-conditioned descriptive/educational completion report**. It may explain that the questionnaire asked about experiences during the past week and may list general examples of low mood, worry/physical arousal, tension/irritability, and difficulty relaxing. It may also provide general help-seeking guidance that is identical regardless of the respondent's score.

### Internal / authorized professional view

Authoritative scoring is still calculated and stored for research and appropriately authorized professional use. Authorized views may access the three DASS dimensions subject to role/access governance, but this internal result must not leak through the respondent final-submit response or ordinary student report APIs.

This distinction is deliberate:

`authoritative scoring exists` != `respondent is allowed to receive that score`.

The same projection mechanism should be reusable for future sensitive scales.

## 2. Age boundary

The standard DASS/DASS-21 line is currently restricted to:

- minimum age: **14 years**;
- maximum product metadata age: **100 years**;
- normal age-appropriate language comprehension required.

For respondents younger than 14, the product must use a separate DASS-Y identity and package. DASS-Y is not a localization/version flag of the standard DASS-21; it is treated as a separate instrument because its wording and scoring rules differ.

The current user schema does not contain a canonical date of birth or age field. Therefore `minAge=14` in Scale Library is necessary metadata but is **not sufficient as a runtime age gate**. Before this package becomes launchable, age eligibility must have an authoritative source (subject profile, frozen assessment context, assignment eligibility, or another auditable source) and must be checked before attempt start.

## 3. Chinese evidence basis

The Mainland localization review uses three direct Chinese evidence anchors rather than mechanically converting a Hong Kong/Traditional Chinese form to Simplified Chinese.

1. Gong, X., Xie, X., Xu, R., & Luo, Y. (2010). Simplified-Chinese DASS-21 in Chinese university students. N=1,779, Beijing university sample.
2. Wen, Y., Wu, D., Lü, X., et al. (2012). Chinese DASS-21 in Mainland adults. N=730, six-province adult sample, 18–85 years. The paper explicitly reports wording adjustments to better fit Mainland language habits.
3. Wang, K., Shi, H. S., Geng, F. L., et al. (2016). Cross-cultural validation of DASS-21 in China. Main university sample N=1,815, with additional clinical/control samples.

These studies support the instrument family and prior Simplified/Mainland adaptations. They do **not** automatically validate every wording change in the present draft. The wording below therefore remains a localization draft until expert semantic review and a bridging/cognitive review are completed.

## 4. Localization principles

The Mainland zh-CN revision follows these rules:

- preserve the psychological meaning and time frame of the source item;
- use everyday Standard Mandarin wording understandable to a typical 14-year-old;
- avoid Hong Kong/Taiwan-specific lexical choices and Traditional-Chinese translation conventions;
- avoid literary or clinical jargon when ordinary wording conveys the same construct;
- avoid literal English syntax and nominalized translationese;
- do not strengthen or soften symptom intensity beyond the source meaning;
- preserve item order and the Depression / Anxiety / Stress scoring key;
- do not insert examples that materially narrow the source construct;
- response options must represent **degree/frequency combined**, consistent with the source response anchors, rather than turning the scale into a pure frequency scale.

## 5. Proposed respondent instructions

> 请回想**过去一周**的实际感受和经历，判断下面每句话在多大程度上符合你的情况。每题请选择一个最合适的选项。答案没有对错，请按自己的真实情况作答。

### Response options

| Value | Mainland zh-CN wording |
| ---: | --- |
| 0 | 完全不符合我的情况 |
| 1 | 有一点符合，或偶尔出现 |
| 2 | 比较符合，或较多时候如此 |
| 3 | 非常符合，或大多数时候如此 |

The response values remain 0–3. Option wording must be reviewed together with the items during cognitive debriefing; it must not be silently changed after the package definition is frozen.

## 6. Proposed Mainland zh-CN item wording

The following is a **project-created Mainland wording revision**, not a claim that these exact sentences are the official Chinese DASS-21 or an already validated exact form.

| # | Proposed wording | Scale |
| ---: | --- | --- |
| 1 | 我发现自己很难让紧绷的状态慢慢缓下来。 | Stress |
| 2 | 我注意到自己有口干的感觉。 | Anxiety |
| 3 | 我很难感受到愉快或积极的情绪。 | Depression |
| 4 | 即使没有运动或做体力活动，我也会觉得呼吸困难，比如呼吸急促或喘不过气。 | Anxiety |
| 5 | 我很难让自己主动开始做事情。 | Depression |
| 6 | 我发现自己常常会对一些事情反应过于强烈。 | Stress |
| 7 | 我出现过发抖的情况，比如手发抖。 | Anxiety |
| 8 | 我时常觉得精神紧张，整个人一直绷着。 | Stress |
| 9 | 我担心自己会在某些场合突然慌起来，并因此出丑。 | Anxiety |
| 10 | 我觉得未来没什么值得期待的。 | Depression |
| 11 | 我感到烦躁不安，很难安定下来。 | Stress |
| 12 | 我很难让自己放松下来。 | Stress |
| 13 | 我感到情绪低落、沮丧。 | Depression |
| 14 | 只要有事情妨碍我继续做手头的事，我就会很难忍受。 | Stress |
| 15 | 我感觉自己快要陷入恐慌。 | Anxiety |
| 16 | 我很难对任何事情提起兴趣和热情。 | Depression |
| 17 | 我觉得自己没什么价值。 | Depression |
| 18 | 我觉得自己很容易被惹恼。 | Stress |
| 19 | 即使没有运动或做体力活动，我也会明显感觉到心跳的变化，比如心跳加快或像漏跳了一拍。 | Anxiety |
| 20 | 我会在没有明显原因的情况下感到害怕。 | Anxiety |
| 21 | 我觉得生活没有意义。 | Depression |

### Wording review notes

Items 1 and 12 intentionally remain distinct: item 1 concerns difficulty winding down from an activated/tense state; item 12 concerns difficulty relaxing. They should not be collapsed into identical Chinese wording.

Items 4 and 19 explicitly retain the absence-of-physical-exertion condition because it is construct-relevant to autonomic anxiety symptoms.

Item 8 uses ordinary Mainland wording around sustained nervous tension rather than literal phrases such as “消耗很多精神/神经能量”.

Item 14 avoids Hong Kong/Taiwan-style phrasing and keeps the intended intolerance of interruption/obstruction without adding a new behavioral consequence.

## 7. Internal scoring contract

The scoring map remains the standard DASS-21 map:

- **Stress**: 1, 6, 8, 11, 12, 14, 18
- **Anxiety**: 2, 4, 7, 9, 15, 19, 20
- **Depression**: 3, 5, 10, 13, 16, 17, 21

Each item is scored 0–3. For the standard DASS-21, each seven-item subscale sum is multiplied by 2 when producing the conventional DASS-comparable scale score.

This scoring is **internal/authorized output** for the Huisurvey product. The student/respondent projection must not return these values.

No severity bands or diagnostic cut-offs are part of the initial package report contract.

## 8. Student descriptive report contract

The student-facing completion report is independent of calculated score. A first version may contain the following content blocks:

### What this questionnaire covered

- feelings of low mood or reduced positive emotion;
- worry, fear, panic-like feelings and physical arousal;
- tension, irritability, restlessness and difficulty relaxing;
- recall period: the past week.

### How to understand this questionnaire

- these experiences occur to different degrees in many people;
- this questionnaire is not a diagnosis;
- completing it does not by itself determine a person's mental-health status;
- the platform does not provide the student with a numerical DASS result or severity category.

### General support message

If difficult feelings are frequent, intense, persistent, or are interfering with study, sleep, relationships or everyday life, the respondent may consider talking with a trusted adult or an appropriately qualified professional. This message is generic and must not be triggered by a hidden score band.

## 9. Remaining gates before executable promotion

### Hard engineering gates

1. **Respondent-safe result projection**
   - final-submit responses for DASS must strip the scored `result` from student/respondent/public-session projections;
   - replay responses must follow the same rule;
   - standalone, Questionnaire and Composite delivery paths must all be covered;
   - the encrypted authoritative result remains stored for authorized professional/research access.

2. **Age admission gate**
   - the platform currently has no canonical age/DOB field on `User`;
   - deployment therefore needs an auditable age source and a start/admission check enforcing `age >= 14`;
   - missing age must fail closed for a DASS-21 deployment that requires age eligibility.

### Localization/scientific gates

3. Expert bilingual semantic review against the English DASS-21 source and Mainland evidence versions.
4. Mainland Chinese cognitive debriefing including at least 14–17-year-old respondents and adults.
5. A small bridging psychometric review sufficient to detect wording-induced factor/reliability anomalies before upgrading scientific maturity.
6. Record that the project translation is public domain and notify/coordinate with the DASS maintainers as recommended for new translations.

## 10. DASS-Y follow-up

DASS-Y will be handled in a separate instrument/package design. No DASS-Y item wording, scoring or evidence is frozen by this document. The only current decision is the routing boundary:

- `<14`: DASS-21 standard package is ineligible; use future DASS-Y if available and appropriate.
- `>=14`: standard DASS-21 may be eligible, subject to rights, language, report-safety and age-admission gates.
