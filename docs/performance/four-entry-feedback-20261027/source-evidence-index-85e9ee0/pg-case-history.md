# 原始 PG case 历史（只读索引）

P=原报告 passed；F=failed；S=原报告 skipped/filtered；∅=该调用没有声明这个 case。均不是当前85的重跑。

原报告完整名称、错误栈、原状态和 SHA 见 `invocations.json`；以下不把失败调用中的局部 P 改成整轮通过。

## 普通生产者18

| 原 case | pr363-source-pg-r1 | pr363-source-pg-r2 | pr363-source-pg-r3 | pr363-source-pg-r4 | pr363-source-pg-r5 | pr363-source-pg-r6 | pr363-source-pg-r7 | pr363-source-pg-r8 | pr363-source-pg-r9 | pr363-source-pg-r10 | pr363-source-pg-r11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP 'TEACHER' 'COGNITIVE' prepares a real independent runtime, freezes once, independently reviews, publishes and retires | F | F | P | S | S | S | S | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP 'TEACHER' 'SITUATIONAL' prepares a real independent runtime, freezes once, independently reviews, publishes and retires | F | F | P | S | S | S | P | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP 'TEACHER' 'MIXED' prepares a real independent runtime, freezes once, independently reviews, publishes and retires | F | F | P | S | S | S | P | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP 'TEACHER' 'FORM' prepares a real independent runtime, freezes once, independently reviews, publishes and retires | F | F | P | S | S | S | S | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP 'SCHOOL' 'COGNITIVE' prepares a real independent runtime, freezes once, independently reviews, publishes and retires | F | F | P | S | S | S | S | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP 'SCHOOL' 'SITUATIONAL' prepares a real independent runtime, freezes once, independently reviews, publishes and retires | F | F | P | S | S | S | P | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP 'SCHOOL' 'MIXED' prepares a real independent runtime, freezes once, independently reviews, publishes and retires | F | F | P | S | S | S | P | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP 'SCHOOL' 'FORM' prepares a real independent runtime, freezes once, independently reviews, publishes and retires | F | F | P | S | S | S | S | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP requires explicit target distribution, not product administrator identity, and pins the original grant against replacement | F | F | P | S | S | S | S | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP preserves the original creator role proof when a different later role is granted | F | F | P | S | S | S | S | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP requires target runtime/owner/audience for reports, allows explicit empty, and does not invent raw summary permission | F | F | P | S | S | S | S | S | S | S | P |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP uses actual product cookies, current actor reads, MFA and CSRF for HTTP mutations | F | P | S | P | S | S | S | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP projects only explicitly granted sources and exact approved educational C/P/R choices, and retries keep the same immutable registration | ∅ | ∅ | ∅ | P | S | S | S | S | P | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP requires the exact stimulus grant and actual stored asset hash, and Form bundles cannot request metrics | ∅ | ∅ | ∅ | F | P | S | S | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP serializes an in-flight review behind real grant withdrawal without replacing the pinned grant | ∅ | ∅ | ∅ | F | F | P | S | S | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP SCHOOL registers all four real tool families in one shared Composite without a fake Scale | ∅ | ∅ | ∅ | ∅ | ∅ | ∅ | F | P | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP TEACHER registers all four real tool families in one shared Composite without a fake Scale | ∅ | ∅ | ∅ | ∅ | ∅ | ∅ | F | P | S | S | S |
| Education resource producer with real isolated PostgreSQL, source engines and product HTTP accepts a published pure Form source with an already frozen, genuinely empty C/P/R snapshot | ∅ | ∅ | ∅ | ∅ | ∅ | ∅ | ∅ | ∅ | ∅ | P | S |

## marker5

| 原 case | pr363-marker-pg-incremental-r1 | pr363-marker-teacher-pr-pg-r1 | standard-pg-r1 | pr363-marker-standard-pg-r2 | pr363-marker-pg-r3 |
|---|---|---|---|---|---|
| Education privateVersion real persisted source and shared START binding > retains an owned exact version in an independent education runtime and rejects a forged source-item mapping | S | ∅ | ∅ | ∅ | P |
| Education privateVersion real persisted source and shared START binding > refuses to prepare another author privateVersion even for an education product administrator | P | ∅ | ∅ | ∅ | ∅ |
| Education exact standard marker real approved source > performs actual approval/trials and preserves original Training rights in a separately authorized School runtime | S | S | F | P | ∅ |
| Education exact standard marker real approved source > checks exact original use at collection, rejects revocation and keeps frozen identity independently readable | P | S | ∅ | ∅ | ∅ |
| Education exact standard marker real approved source > selects exact approved PLATFORM parameters and a teacher-audience report for an independently reviewed Teacher delivery | ∅ | P | ∅ | ∅ | ∅ |

## 反馈策略4（2单元＋2PG）

| 原 case | pr363-source-feedback-policy-r1 |
|---|---|
| education registration requires an explicit shared feedback timing policy > refuses absence, null, unknown mode and invalid or timezone-free scheduled times | P |
| education registration requires an explicit shared feedback timing policy > normalizes explicit offset timestamps to the existing Training UTC representation | P |
| education registration freezes explicit feedback timing in real PostgreSQL > stores normalized UTC in the frozen entry, replays equivalent input and rejects changing a registered schedule | P |
| education registration freezes explicit feedback timing in real PostgreSQL > reads a prior real publication without inserting a policy or changing its original entry hash | P |

## 精确licenses4

| 原 case | pr363-source-license-selection-r1 | pr363-source-license-selection-r2 | pr363-source-license-selection-r3 |
|---|---|---|---|
| education management exact multi-grant selection with real isolated PostgreSQL > marks incomplete source/C/assets authority unavailable, then projects only the exact three independent grants | F | ∅ | P |
| education management exact multi-grant selection with real isolated PostgreSQL > returns original preparation licenses on creation/replay/recovery and never substitutes a new grant after withdrawal | F | ∅ | P |
| education management exact multi-grant selection with real isolated PostgreSQL > projects complete P/R asset selections, pins overlapping source assets and registers without leaking unrelated grant keys | F | ∅ | P |
| education management exact multi-grant selection with real isolated PostgreSQL > marks an invalid persisted source definition unavailable without exposing its source body | ∅ | ∅ | P |

## 复用限制

marker 的5个唯一 PG case 是资源生产、START candidate、collection 准入和 HISTORY/P/R 身份验证；没有真实受试者 Scale FINAL。runtime 线程正补该闭环。

exact-license 的无效 Form 来源 case 在 b045 原通过；85/root96 过滤缺少实际 InstrumentFinalSubmitError，不能直接接纳为当前可用。其余三个只作为未触及该错误转换的条件复用候选。root96那一项合同不填补实际错误类缺口。
