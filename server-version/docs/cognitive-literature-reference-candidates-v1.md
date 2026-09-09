# Cognitive Literature Reference Candidate Audit v1（COG-P4 §4.2 / §4.2.1）

- 日期：2026-09-09
- 基线：COG-P3 PR #67 合并后的 `main @ 2ed9e4e`
- 分支：`feat/cognitive-pilot-reference-v1`
- 性质：**literature candidate audit / design only**。本文不创建 `AssessmentReferenceSet` 或 `AssessmentReferenceEntry`，不把任何 mean、SD、percentile、threshold 或 sample-size 统计写入 Reference Core；4.3 的 measurement applicability 只在 shared/runtime contract 层完成，本文没有 production binding。
- 前置审计：`cognitive-reference-eligibility-v1.md`（COG-P4 §4.1 / §4.1.1）

## 1. Decision summary

本轮只对当前 9 个 `PUBLISHED` exact identities 的 **15 个显式 `referenceEligible=true` metrics** 做来源盘点。action enum 已从旧的笼统标签收紧为：

```text
READY_NORMATIVE_BETA: 0
READY_DESCRIPTIVE_BETA: 0
NEEDS_PROTOCOL_MATCH: 10
NEEDS_NUMERIC_SOURCE: 3
CONSTRUCT_LEAD_ONLY: 2
DEFER: 0
reference rows created: 0
ACTIVE reference rows created: 0
```

“有一篇论文研究相同构念”不等于“可以直接比较数值”。截至本轮，没有一个 metric 同时满足 exact task identity、profile/config、刺激与时序、计分公式、RT trimming、人口范围和设备限制的完整 admission 门槛，因此没有 `READY_NORMATIVE_BETA` 或 `READY_DESCRIPTIVE_BETA`。

未来如果启用 `literature_beta`，产品语义应显示为“试行参考 / Pilot Reference”，明确它不是正式常模、不是诊断结论，也不把 `PILOT` scientific status 改写成软件不稳定。

## 2. Audit rules

### 2.1 只审 exact identity，不跨版本借用

每一行都绑定：

```text
testType / engineVersion / scoringVersion
```

即使两个任务都叫 `dPrime`、`maxSpan`、`accuracy` 或 `switchCostRtMs`，也不能跨 task family、engine、scoring version 或 profile 借用统计量。

### 2.2 数值比较的最低证据

候选 source 必须至少能回答：

- stimulus identity/set、语言和文化属性；
- stimulus duration、ISI/foreperiod、response window/timeout；
- formal/practice trial 数、block 结构、adaptive/termination rule；
- response modality、RT clock、RT floor/trim、timeout/omission/error handling；
- 当前 metric 的精确定义和方向（lower/higher/target range/descriptive）；
- 参与者年龄、grade、语言、地区及必要 context；
- 论文中实际报告的统计量及其表格/行位置，或可复核的原始/补充数据来源。

缺少任一关键字段时，本文只保留为 construct/protocol candidate，不把统计量写进 Reference Core。

### 2.3 ReferenceKind 与 action 的含义

- `normative_distribution`：只有 exact protocol 和明确人群的分布统计量才可考虑；
- `descriptive_sample`：只能描述有边界的研究样本，不能暗示人口常模；
- `criterion_threshold`：只有有明确、非临床化的任务标准和完整阈值依据时才考虑；本轮没有批准 threshold；
- `NEEDS_PROTOCOL_MATCH`：构念/来源接近，但 protocol 或 scoring 尚未锁定；
- `NEEDS_NUMERIC_SOURCE`：需要从文章补充材料/作者数据中取得可复核的目标数值，不能从图表目测；
- `CONSTRUCT_LEAD_ONLY`：只足以支持构念方向，不能作为当前 metric 的数值候选；
- `READY_*`：仅在 admission checklist 全部完成后使用。

### 2.4 设备原则

device/input 只记录为 provenance 和 limitation，遵循：

```text
RECORD, DO NOT CORRECT
```

不推导 touch penalty、desktop bonus、browser timing correction、device-specific norm switch，也不把设备类别当作能力分层。

## 3. Current PUBLISHED protocol snapshot

下表来自当前 v2 `TaskDefinition.profiles` / exact protocol。`E/S/R` = `experience/standard/research`；不同 profile 的配置是不同测量协议，不能由一个文献 band 自动覆盖全部 profile。

| exact identity | current profile/config snapshot | protocol facts relevant to audit |
|---|---|---|
| `reaction/1.0.0/1.1.0` | E/S/R `totalTrials=8/20/60` | `performance` clock；foreperiod、RT floor、timeout 和有效 hit 规则属于 identity |
| `memory/1.0.0/1.1.0` | E/S/R `startLength=3`，`maxLength=6/8/9` | visual digit sequence；两 trial/level 的 short form scoring；`maxSpan` 是本次任务容量 |
| `stroop/1.0.0/1.1.0` | E/S/R `totalTrials=16/40/96`，`congruentRatio=0.5` | short form 的 RT floor、fixation、stimulus limit 和条件 RT 差值属于 identity |
| `gonogo/1.0.0/1.0.0` | E/S/R `totalTrials=40/120/240`，`nogoRatio=0.25` | commission/omission、Go RT、signal-detection metrics；No-Go 比例和 trial count 影响稳定性 |
| `cpt/1.0.0/1.0.0` | E/S/R `totalTrials=60/180/360`，`blockCount=1/3/6`，`targetRatio=0.2` | block、持续时长、target/non-target 比例、遗漏/误报和 RT variability 都是 identity |
| `nback/1.0.0/1.0.0` | E `1-back×30`；S `1/2-back×40/60`；R `1/2/3-back×60` | `dPrimeByN` 按 N 分层；`maxReliableN` 是本项目派生 level |
| `corsi/1.0.0/1.0.0` | E/S/R `startSpan=3`，`maxSpan=6/8/9` | digital block layout、序列呈现/复现、level 推进和终止规则必须与来源一致 |
| `sst/1.0.0/1.0.0` | E/S/R `totalTrials=40/96/200` | SSRT 依赖 Go RT、SSD 阶梯、stop probability 和算法；`pRespondStop` 不是 SSRT 替代品 |
| `taskswitch/1.0.0/1.0.0` | E/S/R `totalTrials=48/128/256`，`blockCount=2/4/8`；R `includePureBlocks=true` | switch/repeat、cue/刺激时序、response mapping、纯 block 与 mixing cost 不能混用 |

以上是当前代码的 protocol snapshot，不是 literature source 的替代。任何 future reference entry 仍须绑定明确的 `instrumentVersion`、`scoringVersion`、population 和 source。

## 4. Candidate matrix

本表只列当前显式 eligible 的 15 行。`Potential ReferenceKind` 是未来设计候选，不是已选类型；`Numeric comparability` 全部为 `NOT ESTABLISHED`；本轮不填任何 Reference Core 数值。

| Task / metric（exact identity） | Potential ReferenceKind | Candidate source and verified scope | Protocol/scoring finding | Numeric comparability | Recommended action |
|---|---|---|---|---|---|
| reaction · `medianRtMs` (`reaction/1.0.0/1.1.0`) | normative only after age-band lock; otherwise descriptive sample | [Rutter et al., 2020](https://pubmed.ncbi.nlm.nih.gov/32210793/)；web simple RT / RT variability | source 30 scored trials、2000 ms response、700–1500 ms inter-trial；当前 8/20/60 profile 与清洗/身份仍需逐项对齐 | **NOT ESTABLISHED**：目标 K12 band numeric extract 尚未完成 | NEEDS_NUMERIC_SOURCE |
| reaction · `rtICV` (`reaction/1.0.0/1.1.0`) | normative only after age-band lock; otherwise descriptive sample | [Rutter et al., 2020](https://pubmed.ncbi.nlm.nih.gov/32210793/)；source reports ICV | source ICV = SD RT / mean RT；当前 valid-hit 分母、RT cleaning、profile 和 device composition 仍需 exact comparison | **NOT ESTABLISHED**：source numeric data 尚未按 current identity 重算/核验 | NEEDS_NUMERIC_SOURCE |
| memory · `maxSpan` (`memory/1.0.0/1.1.0`) | normative_distribution（future） | [Woods et al., 2011](https://pubmed.ncbi.nlm.nih.gov/20680884/)；computerized Digit Span | source 为 auditory、adaptive Digit Span；当前为 visual、`startLength=3`、two-trial progression、`maxSpan` | **NOT ESTABLISHED**：mean-span/adaptive scoring 不能直接替换当前 maxSpan | NEEDS_PROTOCOL_MATCH |
| stroop · `stroopEffectMs` (`stroop/1.0.0/1.1.0`) | normative_distribution（future） | [Forte et al., 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11162033/)；children included | source 120 trials、不同 fixation/limit 和 mean/log-transform；当前是 short-form correct-trial median difference | **NOT ESTABLISHED**：source effect 与当前公式不等值 | NEEDS_PROTOCOL_MATCH |
| stroop · `incongruentAccuracy` (`stroop/1.0.0/1.1.0`) | normative_distribution（future） | [Forte et al., 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11162033/)；condition-level accuracy lead | source 条件/反应定义、trial count 和 timeout 与当前不完全一致；valid denominator 需核对 | **NOT ESTABLISHED**：无 exact identity numeric row | NEEDS_PROTOCOL_MATCH |
| gonogo · `commissionRate` (`gonogo/1.0.0/1.0.0`) | normative_distribution（future） | [combined Go/No-Go and CPT across childhood](https://pmc.ncbi.nlm.nih.gov/articles/PMC10041761/)；[Japanese children Go/No-Go study](https://pmc.ncbi.nlm.nih.gov/articles/PMC9441813/) | No-Go ratio、trial structure、denominator、omission handling 和 quality gate 尚未锁定同构 | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| gonogo · `dPrime` (`gonogo/1.0.0/1.0.0`) | normative_distribution（future） | [combined Go/No-Go and CPT across childhood](https://pmc.ncbi.nlm.nih.gov/articles/PMC10041761/) | target probability、response window、极端率 correction 和 current scorer 公式需逐项核对 | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| cpt · `dPrime` (`cpt/1.0.0/1.0.0`) | normative_distribution（future） | [Conners et al., 2003](https://pubmed.ncbi.nlm.nih.gov/14561062/) | source 为 14-minute CPT，ISI/time-block 结构不同；当前为 60/180/360 trials、1/3/6 blocks | **NOT ESTABLISHED**：d′ correction 和 block aggregation 未证实同构 | NEEDS_PROTOCOL_MATCH |
| cpt · `omissionRate` (`cpt/1.0.0/1.0.0`) | normative_distribution（future） | [Conners et al., 2003](https://pubmed.ncbi.nlm.nih.gov/14561062/) | source 报告 omission，但 duration、ISI、target ratio、interruption 和 exclusion 需匹配 | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| cpt · `commissionRate` (`cpt/1.0.0/1.0.0`) | normative_distribution（future） | [Conners et al., 2003](https://pubmed.ncbi.nlm.nih.gov/14561062/) | commission error 的 denominator、perseveration boundary 和 current ratio 需核对 | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| cpt · `rtICV` (`cpt/1.0.0/1.0.0`) | normative_distribution（future） | [Conners et al., 2003](https://pubmed.ncbi.nlm.nih.gov/14561062/)；RT variability lead | source 报告 RT/RT standard error，但不等于 current hit-only ICV；14-minute protocol 不同 | **NOT ESTABLISHED**：需要 exact numeric/source derivation | NEEDS_NUMERIC_SOURCE |
| corsi · `maxSpan` (`corsi/1.0.0/1.0.0`) | normative_distribution（future） | [Kessels et al., 2000](https://www.tandfonline.com/doi/abs/10.1207/S15324826AN0704_8)；standardized Corsi source | source abstract reports healthy `n=70` and lesion `n=70`；K12 band、digital layout、start/max span 和 stop rule 仍需锁定 | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| sst · `ssrtMs` (`sst/1.0.0/1.0.0`) | normative_distribution（future） | [van de Laar et al., 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3238363/)；lifespan stopping study | global/selective variant、SSD schedule、integration/mean method、Go trimming 和 pRespondStop boundary 不同 | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| taskswitch · `switchCostRtMs` (`taskswitch/1.0.0/1.0.0`) | descriptive_sample（future） | [Gupta et al., 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2751760/)；180 children, age 6–11 | source uses digit-identification/counting rules, simultaneous cue/target and 0 ms CTI；当前 rule/config/block contract 不同 | **NOT ESTABLISHED**：只可作 construct lead | CONSTRUCT_LEAD_ONLY |
| taskswitch · `switchCostAccuracy` (`taskswitch/1.0.0/1.0.0`) | descriptive_sample（future） | [Gupta et al., 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2751760/)；accuracy/switch-cost lead | source response mapping、denominator、cue and preparation interval 与当前不同 | **NOT ESTABLISHED**：无 current identity numeric row | CONSTRUCT_LEAD_ONLY |

## 5. Targeted literature deep dive

### 5.1 Reaction：source 有数据入口，但还没有 K12 exact extract

[Rutter et al., 2020](https://www.frontiersin.org/journals/aging-neuroscience/articles/10.3389/fnagi.2020.00062/full) 的研究包含 12,327 位 TestMyBrain.org visitors，最终 analytic sample 为 10,060；参与者年龄范围为 10–96 岁，按年龄可视化的有效范围收缩到 10–70 岁。Simple RT protocol 是 3 个 practice + 30 个 scored trials，2000 ms response window，700–1500 ms variable inter-trial interval；RT <200 ms 会被 trim，过多 trim 或 chance performance 会被排除。

文章 Table 1 给出的是总体（不是 K7–9/K10–12）simple RT 汇总：median RT 为 301 (60) ms，ICV 为 0.33 (0.17)。文章的 age-specific 结果主要在按年龄的 figures 和 segmented regression 中；作者同时声明数据可从 [OSF repository](https://osf.io/w5nge/) 获取。它是很好的 source lead，但本轮没有把 OSF 数据重算成当前 `reaction/1.0.0/1.1.0` 的 exact profile、valid-hit median 或 ICV 行，因此不能把总体数值写成 K12 reference。

结论：`medianRtMs`、`rtICV` 保留为 eligible candidate，但 action 是 `NEEDS_NUMERIC_SOURCE`；不从 plot 目测 band，不跨设备做校正，不创建 reference entry。

### 5.2 N-back：有儿童来源，但两个当前 headline 都不进入 eligibility

[Pelegrina et al., 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4597481/) 报告 3,722 名 7–13 岁儿童/青少年，来自西班牙多个城市的 43 所学校。其 protocol 包含 500 ms stimulus、随后 3000 ms blank，整体 3500 ms response interval；每个 N level 有 20 practice trials 和两个 20-trial test blocks，总计 40 trials/level，并在 test block 正确率不足时中止。

来源 d′ 使用 `ZHits − ZFalseAlarms`，并采用 Stanislaw–Todorov 的边界修正（0 替换为 `0.5/n`，1 替换为 `(n−0.5)/n`）。当前 Huisurvey scorer 的 `dPrime` helper 使用 Hautus correction；即使两者都叫 d′，也不能直接借用数值。更重要的是：

- `dPrimeByN` 的 registry `valueType` 是 `map/object`，没有 scalar reference selector；
- `maxReliableN` 是当前项目按 `dPrime >= 0.5` 且 `hitRate >= 0.15`（并满足最低 target 数）派生的 level；
- 当前 E/S/R 的 N levels、trial counts 和中止规则也不等于来源 identity。

所以 N-back 本轮 `referenceEligible=0`，没有 candidate row，也不创建 map selector、转换路径或 synthetic literature fixture。该来源只保留为未来 protocol/scoring comparison lead。

### 5.3 CPT：儿童样本很有价值，但 ISI/time-block 是硬约束

[Conners et al., 2003](https://pubmed.ncbi.nlm.nih.gov/14561062/) 的摘要明确报告了概率加权的 816 名 9–17 岁儿童/青少年，使用 14 分钟高反应率 CPT；结果覆盖 RT、RT standard error、omission、commission、d′ 和 beta，并且 1/2/4 秒 ISI 与 time block 对多数测量有显著影响。

这支持 CPT 的 `dPrime`、`omissionRate`、`commissionRate` 作为 protocol-near candidates，但不允许把 source statistic 直接放入当前 60/180/360 trial、1/3/6 block、targetRatio=.2 的 CPT-X。`rtICV` 还需要把 source 的 RT variability statistic 与当前 hit-only ICV 定义逐项建立可复核转换，因此单独归入 `NEEDS_NUMERIC_SOURCE`。

### 5.4 Corsi、SST、Stroop 与 Task Switching

- [Kessels et al., 2000](https://www.tandfonline.com/doi/abs/10.1207/S15324826AN0704_8) 描述标准化 Corsi administration/scoring，并报告 healthy 与 lesion groups；它支持 `maxSpan` 的构念和 protocol 审计方向，但不是当前 K12 digital identity 的直接数值行。
- [van de Laar et al., 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3238363/) 可作 stopping/SSRT 的 lifespan source lead；global/selective variants、SSD 算法和 SSRT aggregation 必须先与当前 SST 锁定。`pRespondStop` 已在 eligibility hardening 中明确为 false。
- [Forte et al., 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11162033/) 提供儿童 Stroop 的 protocol/condition-level lead；source 的 120-trial、RT transformation 和当前 short-form median difference 不同，所以 `stroopEffectMs` / `incongruentAccuracy` 只进入 `NEEDS_PROTOCOL_MATCH`。
- [Gupta et al., 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2751760/) 研究 6–11 岁、每年龄 30 人的 task-switching development；但它的 digit/counting rules、同时出现 cue/target、0 ms CTI 和 response mapping 与当前任务转换不等值，当前两条 metric 只保留为 `CONSTRUCT_LEAD_ONLY`。

## 6. Population and age semantics

未来每条 reference entry 必须声明自己的 `population.match`：

- 文献只有 7–11 岁，就只覆盖 7–11 岁；
- 不做 6 岁、12 岁或其他年龄的 nearest-band fallback；
- 不做连续年龄插值；
- 不把 grade、primary language、country/region 缺失时的样本当作跨语言/跨地区常模；
- 不把 adult sample 的结果扩展成 K12 reference；
- 不以 synthetic band、产品 profile 名称或默认配置冒充参与者人口 context。

如果 source 只给总体样本统计量、图形或 breakpoint，而没有可追溯的目标年龄切片，结果最多是 source lead 或 `descriptive_sample` 设计候选，不是当前 K12 numeric reference。

## 7. Reference admission checklist

单个 metric 下一轮要升级为 `READY_NORMATIVE_BETA` 或 `READY_DESCRIPTIVE_BETA`，必须补齐：

1. exact `testType/engineVersion/scoringVersion` 和实际 profile/config；
2. source 原文表格/行、样本纳入排除和人口匹配；
3. stimulus、语言、duration/ISI/foreperiod、trial/block、response modality；
4. RT floor/trim、timeout/omission/error handling、adaptive/stopping rule；
5. 当前 scoring formula 与 source formula 的逐项 comparison；
6. 真实、可复核的 mean/SD、percentile table 或 threshold；
7. `limitations`、`disclaimer`、设备/输入 caveat；
8. shared Reference Core validation 和 non-overlapping population checks；
9. reference set 先保持 `DRAFT`，经过 review 后才可能讨论 ACTIVE，且不自动绑定到 session/report。

本轮没有任何一行完成全部条件。

## 8. Explicit non-actions

```text
AssessmentReferenceSet / Entry created: NO
ACTIVE literature reference: NO
Student/Parent report changed: NO
Teacher report changed: NO
Admin report changed: NO
FINAL runtime reference binding changed: NO
Reference applicability foundation changed: YES (production mappings remain 0)
Norm Engine created: NO
continuous-age interpolation: NO
automatic norm fitting: NO
device correction or device-specific norm switch: NO
DB schema/migration: NO
```

**4.2.1 ✅ ReferenceKind-tiered Literature Beta feasibility complete. 4.3 measurement applicability foundation is implemented; no production reference mapping is active.**

**STOPPED — waiting for review.**
