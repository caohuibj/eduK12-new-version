# DASS-21 Student Report V1 — Non-score Descriptive Feedback

Status: **IMPLEMENTED FRONTEND CONTRACT / RELEASE-GATED**  
Date: 2026-09-20  
Instrument: `dass21_zh_cn@1.0.0`  
Audience: respondent/student  
Scored result visibility: **NONE**

## 1. Product intent

The student report is deliberately not a conventional psychometric score report.

It must be useful without revealing:

- raw scores;
- DASS-21 doubled subscale scores;
- severity categories;
- percentile/norm positions;
- diagnostic or risk labels;
- claims that the student is depressed, anxious, stressed, mentally healthy, mentally unhealthy, or otherwise assigned a mental-health status;
- automated individual interpretation generated from hidden DASS scores.

The report instead functions as a **self-observation and psychoeducational completion experience**.

The design goal is:

> no score + no label + no hidden-score personalization, while still giving the student a coherent, attractive and actionable report.

## 2. Core design rule

The report may be personalized only through **respondent-initiated interaction**, not through DASS scoring.

Allowed personalization:

- the student chooses a topic they want to focus on;
- the student chooses which generic action plan to view;
- the student writes or mentally answers reflection prompts;
- future versions may store a student-authored private note if an appropriate privacy contract exists.

Not allowed:

- choosing content because Depression/Anxiety/Stress score is high or low;
- changing the tone because a hidden severity band was reached;
- showing more urgent help-seeking language because of a hidden score;
- claiming that one theme is the student's "main problem".

## 3. Report architecture

### Block A — Completion hero

Headline:

> 这一周，给自己一点观察空间

Body:

> 这份反馈不会给你打分，也不会给你贴上任何心理健康标签。它更像一张观察地图：帮助你理解刚才问卷关注了哪些体验，并选择一个你愿意照顾的方向。

Purpose:

- confirms completion;
- immediately explains why no score is shown;
- frames the report as useful rather than withheld.

### Block B — Three experience themes

These are **questionnaire topics**, not student-specific findings.

#### 情绪与动力

> 问卷关注了低落、难以感到愉快、兴趣减少，以及开始做事情时感觉费力等体验。

#### 担忧与身体反应

> 问卷也涉及害怕、慌张、心跳或呼吸变化、发抖等在紧张时可能出现的情绪和身体体验。

#### 紧绷与烦躁

> 另一部分关注难以放松、坐立不安、容易烦躁，以及被事情打断时很难缓下来的体验。

Required qualifier:

> 下面三类内容只是问卷涉及的主题，并不表示系统判断你一定存在这些情况。

### Block C — Student-chosen focus

Headline:

> 选一个你现在最想照顾的方向

Required note:

> 这里的选择完全由你决定，不是系统根据隐藏分数推荐的。可以随时换一个方向看看。

Choices:

1. **让身体慢一点**
   - 离开屏幕走动几分钟；
   - 喝点水，活动肩颈和手臂；
   - 找一个相对安静的地方坐一会儿。

2. **把事情拆小一点**
   - 只写下接下来最小的一步；
   - 先做 10 分钟，再决定是否继续；
   - 完成一个小步骤后允许自己停一下。

3. **给大脑留一点空隙**
   - 安排几分钟不看消息和短视频；
   - 把反复出现的担心先写下来；
   - 暂时不要求自己立刻想清所有问题。

4. **找一个人说说**
   - 选一个相对信任的人；
   - 可以从“我最近有点累，想跟你聊一会儿”开始；
   - 如果更愿意，也可以联系学校心理老师或合适的专业人员。

5. **先观察，不急着改变**
   - 留意一天里情绪变化比较明显的时段；
   - 记住一个让自己稍微舒服一点的情境；
   - 一周后再回看是否出现新的规律。

No choice is scored, ranked, recommended, or stored as a DASS interpretation.

### Block D — Reflection prompts

Headline:

> 给未来自己的三个问题

Prompts:

1. 过去一周，什么事情最消耗我的精力？
2. 什么时刻，我会稍微轻松或自在一点？
3. 接下来一周，我愿意为自己做的一件小事是什么？

These prompts provide personal meaning without requiring the system to interpret DASS responses.

### Block E — General help-seeking guidance

Headline:

> 什么时候值得找人聊聊

Body:

> 如果一些困难持续存在、越来越强，或者已经明显影响学习、睡眠、人际关系或日常生活，可以考虑和可信任的成年人、学校心理老师或合适的专业人员谈一谈。

Required qualifier:

> 这条建议对所有完成问卷的人都一样，不是由你的隐藏分数触发的。

### Block F — Universal safety information

Headline:

> 需要立即帮助时

Body:

> 如果你此刻担心自己可能伤害自己、无法保证自己的安全，或正处在明显危险中，请立即联系身边可信任的成年人、当地紧急服务或可用的危机支持渠道。

This block is displayed to all respondents. It must never be conditionally triggered from hidden DASS scores.

### Footer — Report boundary

> DASS-21 是一份关于过去一周体验的自评问卷。本学生报告不显示数值分数、严重程度等级、百分位或诊断结论，也不根据隐藏分数生成个体化判断。

## 4. UX principles

The report should visually feel like a completed product rather than an error state or a redacted clinical report.

Required UX characteristics:

- strong completion hero;
- short cards rather than dense paragraphs;
- three clear experience-theme cards;
- interactive focus chips/buttons;
- a visible action plan after student selection;
- reflection prompts presented as a small personal worksheet;
- support/safety content separated from the main experience themes;
- no gauges, score bars, traffic-light colors, percentile graphics, risk meters, severity thermometers or hidden-score-derived visualizations.

The absence of a score is a deliberate feature, not missing data.

## 5. Current frontend implementation

Implemented component:

`server-version/frontend/src/modules/reporting/Dass21StudentReport.tsx`

Standalone Scale report routing:

`server-version/frontend/src/pages/student/ScaleResult.tsx`

When `scale.code === 'dass21_zh_cn'`, the student page renders the DASS-specific non-score component rather than `ScaleUnitReportCard`.

The component does not consume DASS scores or interpretations.

## 6. Remaining release blocker

The frontend renderer is not sufficient to make DASS launchable.

The backend currently has general Scale response projections capable of returning decrypted authoritative `result` data to the respondent. Before DASS is released:

1. respondent final-submit responses must strip DASS `result`;
2. replay must strip it;
3. standalone result reads must strip it;
4. Questionnaire/public Questionnaire/Composite respondent projections must strip it;
5. teacher/admin/research-authorized views may retain the authoritative result;
6. regression tests must prove that no respondent route can observe DASS scores.

Until that projection work and the separate 14+ runtime admission gate are complete, the DASS package remains non-launchable.
