# Cognitive Literature Reference Candidate Audit v1（COG-P4 §4.2）

- 日期：2026-09-09
- 基线：COG-P3 PR #67 合并后的 `main @ 2ed9e4e`
- 分支：`feat/cognitive-pilot-reference-v1`
- 性质：**literature candidate audit / design only**。本文不创建 `AssessmentReferenceSet` 或 `AssessmentReferenceEntry`，不填入 mean、SD、percentile、threshold 或 sample-size reference row。
- 前置审计：`cognitive-reference-eligibility-v1.md`（COG-P4 §4.1）

## 1. Decision summary

本轮只对当前 9 个 `PUBLISHED` exact identities 的 22 个 `referenceEligible=true` metrics 做第一批来源盘点。结论是：

```text
READY_FOR_LITERATURE_BETA: 0
DESCRIPTIVE_ONLY: 0（本轮未批准任何 descriptive row）
NEEDS_PROTOCOL_MATCH: 15
NEEDS_BETTER_SOURCE: 5
DEFER: 2
reference rows created: 0
ACTIVE reference rows created: 0
```

“有一篇论文研究相同构念”不等于“可以直接比较数值”。截至本轮，没有一个 metric 同时满足 exact task identity、profile/config、刺激与时序、计分公式、RT trimming、人口范围和设备限制的完整门槛，因此没有 `READY_FOR_LITERATURE_BETA`。

未来产品语义若启用 `literature_beta`，应显示为“试行参考 / Pilot Reference”，并明确它不是正式常模、不是诊断结论，也不把 `PILOT` scientific status 改写成软件不稳定。

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
- 论文中实际报告的统计量及其表格/行位置。

缺少任一关键字段时，本文只保留为 construct/protocol candidate，不把统计量写进 Reference Core。

### 2.3 ReferenceKind 不能默认都用 percentile

- `normative_distribution`：只有 exact protocol 和明确人群的分布统计量才可考虑。
- `descriptive_sample`：只能描述一个有边界的研究样本，不能暗示人口常模。
- `criterion_threshold`：只有有明确、非临床化的任务标准和完整阈值依据时才考虑；本轮没有批准任何 threshold。

第一版 evidence level 的上限是 `literature_beta`。本轮不使用 `local_norm` 或 `validated_norm`。

## 3. Current PUBLISHED protocol snapshot

下表来自当前 v2 `TaskDefinition.profiles` / exact protocol。`E/S/R` = `experience/standard/research`；不同 profile 的配置是不同测量协议，不能由一个文献 band 覆盖全部 profile。

| exact identity | current profile/config snapshot | protocol facts relevant to audit |
|---|---|---|
| `reaction/1.0.0/1.1.0` | E/S/R `totalTrials=8/20/60` | `performance` clock；foreperiod 需核对实际 resolved config；当前 literature validation 以 700–1500 ms foreperiod、2000 ms timeout 为 candidate boundary |
| `memory/1.0.0/1.1.0` | E/S/R `startLength=3`，`maxLength=6/8/9` | visual digit sequence；两 trial/level 的 short form scoring；`maxSpan` 是本次任务容量，不是标准化记忆等级 |
| `stroop/1.0.0/1.1.0` | E/S/R `totalTrials=16/40/96`，`congruentRatio=0.5` | current short form 使用 200 ms RT floor、约 500 ms fixation、2000 ms stimulus limit；干扰效应为条件 RT 差值 |
| `gonogo/1.0.0/1.0.0` | E/S/R `totalTrials=40/120/240`，`nogoRatio=0.25` | commission/omission、Go RT、signal-detection metrics；No-Go 比例和 trial count 影响稳定性 |
| `cpt/1.0.0/1.0.0` | E/S/R `totalTrials=60/180/360`，`blockCount=1/3/6`，`targetRatio=0.2` | block 结构、持续时长、target/non-target 比例、遗漏/误报和 RT variability 都是 identity 的一部分 |
| `nback/1.0.0/1.0.0` | E `1-back×30`；S `1/2-back×40/60`；R `1/2/3-back×60` | `dPrimeByN` 按 N 分层；`maxReliableN` 是本项目派生 level，不是论文通用分数 |
| `corsi/1.0.0/1.0.0` | E/S/R `startSpan=3`，`maxSpan=6/8/9` | digital block layout、序列呈现/复现、level 推进和终止规则必须与来源一致 |
| `sst/1.0.0/1.0.0` | E/S/R `totalTrials=40/96/200` | SSRT 依赖 Go RT、SSD 阶梯、stop probability 和算法；`pRespondStop` 是过程比例，不是 SSRT 的替代品 |
| `taskswitch/1.0.0/1.0.0` | E/S/R `totalTrials=48/128/256`，`blockCount=2/4/8`；R `includePureBlocks=true` | switch/repeat 条件、cue/刺激时序、response mapping、纯 block 与 mixing cost 不能混用 |

以上是当前代码的 protocol snapshot，不是 literature source 的替代。任何 future reference entry 仍须绑定明确的 `instrumentVersion`、`scoringVersion`、population 和 source。

## 4. Candidate matrix

列说明：

- `Potential ReferenceKind` 是未来设计候选，不是已选类型；
- `Protocol match` / `Scoring match` 的“部分”不满足 admission；
- `Numeric comparability` 全部明确写为 `NOT ESTABLISHED`，表示本轮没有批准可写入 Reference Core 的数值；
- `Device caveat` 遵循 COG-P2 原则：**RECORD, DO NOT CORRECT**。

| Task / metric（exact identity） | construct · unit · direction | Ref eligible? | Potential ReferenceKind | Candidate source | Population | Protocol match | Scoring match | Device caveat | Numeric comparability | Recommended action |
|---|---|---:|---|---|---|---|---|---|---|---|
| reaction · `medianRtMs` (`reaction/1.0.0/1.1.0`) | processing speed · ms · lower | ✅ | normative_distribution（future） | [Rutter et al., 2020](https://pubmed.ncbi.nlm.nih.gov/32210793/)；construct-near web simple RT / RT variability study | web-based lifespan sample；不是已审的 K7–9/K10–12 cohort slice | 部分：source 与当前短式的 formal trial/profile、设备和 cohort 不等值 | 部分：source 有 median RT，但当前是 valid hits 的 exact median/trim 规则，需逐表核对 | RT 对设备、输入和浏览器 timing 敏感；记录 provenance，不校正 | **NOT ESTABLISHED**：repo 中无已批准年龄带 mean/SD extract | NEEDS_PROTOCOL_MATCH |
| reaction · `rtICV` (`reaction/1.0.0/1.1.0`) | processing speed · ratio · lower | ✅ | normative_distribution（future） | [Rutter et al., 2020](https://pubmed.ncbi.nlm.nih.gov/32210793/)；source reports RT variability/ICV construct | broad web lifespan sample；年龄切片和设备组成需重新审计 | 部分：trial count、foreperiod、profile 和 device composition 未与当前 identity 锁定 | 部分：ICV 定义、有效 RT 清洗及分母必须完全一致 | 同上；不得把 device effect 当能力差异校正掉 | **NOT ESTABLISHED**：无 exact identity 数值行 | NEEDS_PROTOCOL_MATCH |
| reaction · `missRate` (`reaction/1.0.0/1.1.0`) | processing speed · ratio · lower | ✅ | descriptive_sample（候选） | [Rutter et al., 2020](https://pubmed.ncbi.nlm.nih.gov/32210793/) 可作 RT/质量背景；不是本项目 miss-rate numeric source | source population 与当前 K12 产品 cohort 不同 | 不足：source 与当前 missed/timeout 计分和 8/20/60 trial profiles 未建立等值 | 不足：没有可核验的同公式 miss-rate 表格/行 | omission 受设备、注意和输入链路共同影响；只记录 | **NOT ESTABLISHED** | NEEDS_BETTER_SOURCE |
| memory · `maxSpan` (`memory/1.0.0/1.1.0`) | verbal short-term storage · count · higher | ✅ | normative_distribution（future） | [Woods et al., 2011](https://pubmed.ncbi.nlm.nih.gov/20680884/)；computerized Digit Span source | repository audit 标记为 adult computerized sample；不是 K12 band | 不匹配：source 为 auditory、adaptive Digit Span；当前为 visual、`startLength=3`、two-trial progression、`maxSpan` | 不匹配：source 的 mean-span/adaptive scoring 不能直接替换当前 maxSpan | 输入方式、语言、键盘/屏幕布局记录；不做 memory/device correction | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| memory · `totalCorrectTrials` (`memory/1.0.0/1.1.0`) | verbal short-term storage · count · higher | ✅ | descriptive_sample（候选） | [Woods et al., 2011](https://pubmed.ncbi.nlm.nih.gov/20680884/) 仅作 Digit Span construct lead；无本项目 total-correct formula source | source population 不匹配当前 K12 产品 | 不足：total correct 受 maxLength、两 trial/level 和终止规则影响 | 不足：没有 source 与当前 `totalCorrectTrials` 完全同义的 numeric output | 屏幕/键盘交互记录；不把输入方式转成校正项 | **NOT ESTABLISHED** | NEEDS_BETTER_SOURCE |
| stroop · `stroopEffectMs` (`stroop/1.0.0/1.1.0`) | semantic interference · ms · lower | ✅ | normative_distribution（future） | [Forte et al., 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11162033/)；children included in lifespan Stroop study | source includes children 7–11 and wider age groups；不能直接覆盖全部 K12 | 不匹配：source 120 trials、约 400 ms fixation、3000 ms limit；当前 16/40/96 short form、约 500/2000 ms | 不匹配：source mean/log-transformed condition difference；当前 correct-trial median difference | RT/condition effect 对设备和输入 timing 敏感；只记录 | **NOT ESTABLISHED**：repo 已明确 Forte bands 未通过等值审核 | NEEDS_PROTOCOL_MATCH |
| stroop · `errorCost` (`stroop/1.0.0/1.1.0`) | semantic interference · ratio · lower | ✅ | descriptive_sample（候选） | [Forte et al., 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11162033/) 作 Stroop protocol lead；无 exact errorCost source | source 的年龄/语言/任务条件与当前不等值 | 不足：stimulus、trial count、accuracy/error definition 未形成 exact match | 不足：当前 errorCost 的 formula 与 source statistic 未建立一一对应 | 输入方式和阅读自动化是混淆；不校正 | **NOT ESTABLISHED** | NEEDS_BETTER_SOURCE |
| stroop · `incongruentAccuracy` (`stroop/1.0.0/1.1.0`) | semantic interference · ratio · higher | ✅ | normative_distribution（future） | [Forte et al., 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11162033/)；condition-level Stroop candidate | child band 可作 source lead，语言/阅读能力仍需显式匹配 | 不匹配：source 与当前短式 trial count、fixation、timeout 不同 | 部分：condition accuracy 可能同构，但 response/timeout/valid-trial denominator 需核对 | 阅读和输入 modality 记录，不做语言/设备 correction | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| gonogo · `commissionRate` (`gonogo/1.0.0/1.0.0`) | response inhibition · ratio · lower | ✅ | normative_distribution（future） | [Psychometric Properties of a Combined Go/No-Go and CPT across Childhood](https://pmc.ncbi.nlm.nih.gov/articles/PMC10041761/)；[Japanese children Go/No-Go study](https://pmc.ncbi.nlm.nih.gov/articles/PMC9441813/) | children samples；具体年龄、地区、任务版本和 cohort slice 仍需逐表核验 | 不足/部分：当前 No-Go ratio=.25、40/120/240 trials，source task composition 未锁定相同 | 部分：commission error/rate 名称相近，但 denominator、omission handling、quality gates 需匹配 | click/keyboard provenance 未进 legacy metric；记录 coarse provenance，不切换 norm | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| gonogo · `dPrime` (`gonogo/1.0.0/1.0.0`) | response inhibition · d-prime · higher | ✅ | normative_distribution（future） | [Psychometric Properties of a Combined Go/No-Go and CPT across Childhood](https://pmc.ncbi.nlm.nih.gov/articles/PMC10041761/) | childhood source 可作 construct lead；population/context 仍需 exact match | 不足：Go/No-Go trial structure、target probability 和 response window 需相同 | 部分：d′ correction for extreme rates 和 current scorer 公式必须逐项核对 | device/input 只记录；不做 device adjustment | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| cpt · `dPrime` (`cpt/1.0.0/1.0.0`) | sustained attention · d-prime · higher | ✅ | normative_distribution（future） | [Continuous performance test performance in a normative epidemiological sample](https://pubmed.ncbi.nlm.nih.gov/14561062/) | source is 9–17-year-old children/adolescents；与 K12 有关但不是当前产品 cohort contract | 不匹配：source 14-minute CPT、ISI/time-block design；当前 60/180/360 trials、1/3/6 blocks、targetRatio=.2 | 部分：source reports d′, 但 d′ correction、valid target denominator 和 block aggregation 未证实同构 | sustained RT 与设备/输入 timing 相关；记录不校正 | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| cpt · `omissionRate` (`cpt/1.0.0/1.0.0`) | sustained attention · ratio · lower | ✅ | normative_distribution（future） | [Continuous performance test performance in a normative epidemiological sample](https://pubmed.ncbi.nlm.nih.gov/14561062/) | 9–17 sample 可作候选，但 age/sex/context 与当前仍需锁定 | 不匹配：duration、ISI、block 和 target ratio 不同 | 部分：omission/error denominator、interruption 和 quality exclusion 需同公式 | 记录 coarse administration provenance；不把设备差异修正为分数 | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| cpt · `commissionRate` (`cpt/1.0.0/1.0.0`) | sustained attention · ratio · lower | ✅ | descriptive_sample（候选） | [Continuous performance test performance in a normative epidemiological sample](https://pubmed.ncbi.nlm.nih.gov/14561062/) | 9–17 normative epidemiological sample；不是 exact product protocol | 不匹配：CPT duration/ISI/time block 结构不同 | 部分：commission error source 可能可作 lead，但当前 ratio 和 perseveration/quality boundary 需核对 | device/input 记录，不校正 | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| cpt · `rtICV` (`cpt/1.0.0/1.0.0`) | sustained attention · ratio · lower | ✅ | normative_distribution（future） | [Continuous performance test performance in a normative epidemiological sample](https://pubmed.ncbi.nlm.nih.gov/14561062/) 作 RT variability lead；不是 exact ICV row | 9–17 sample；cohort and task version mismatch | 不匹配：14-minute / ISI design 与当前 profile/block contract 不同 | 不足：source RT SE/variability 不自动等于当前 hit-only ICV | RT variability 对 device/browser/input 特别敏感；只记录 | **NOT ESTABLISHED** | NEEDS_BETTER_SOURCE |
| nback · `dPrimeByN` (`nback/1.0.0/1.0.0`) | working-memory updating · map · higher | ✅ | normative_distribution（future，按 N 分层） | [Normative data on the n-back task for children and young adolescents](https://pmc.ncbi.nlm.nih.gov/articles/PMC4597481/) | children 7–13；年龄覆盖有价值，但语言/字母刺激与本项目 task identity 仍需匹配 | 部分：source 1/2/3-back、40 trials/level、letter stimuli、3500 ms response window；当前 E/S/R 试次和 config 不同 | 部分：source 有 d′ by level，但 false-alarm correction、missing responses 和 current map shape 需完全对应 | response device/keyboard/click 记录；不做 correction | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| nback · `maxReliableN` (`nback/1.0.0/1.0.0`) | working-memory updating · level · higher | ✅ | descriptive_sample 或 criterion_threshold（未来再选） | [Normative data on the n-back task for children and young adolescents](https://pmc.ncbi.nlm.nih.gov/articles/PMC4597481/) 只作 level-performance lead | source children 7–13；但 `maxReliableN` 是当前项目派生概念 | 不足：source completion/discontinuation 不能直接替代当前 reliable-level rule，且 profile loads 不同 | 不足：没有 source 对本项目 `maxReliableN` 的精确定义和阈值 | 不因 device 更换 N-level threshold；只记录 | **NOT ESTABLISHED** | DEFER |
| corsi · `maxSpan` (`corsi/1.0.0/1.0.0`) | visuospatial short-term storage · count · higher | ✅ | normative_distribution（future） | [Kessels et al., 2000](https://www.tandfonline.com/doi/abs/10.1207/S15324826AN0704_8)；standardization/normative Corsi source | source has healthy participants；K12 age band、语言、地区和可用分层需重新确认 | 部分：source standardizes Corsi layout/procedure；当前 digital layout、start/max span 和 stop rule 需逐项等值 | 部分：span 的定义接近，但 total/first-pass/termination details 不得假定相同 | screen layout、pointer/touch/keyboard provenance 记录；不做 spatial/device correction | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| corsi · `totalCorrectTrials` (`corsi/1.0.0/1.0.0`) | visuospatial short-term storage · count · higher | ✅ | descriptive_sample（候选） | [Kessels et al., 2000](https://www.tandfonline.com/doi/abs/10.1207/S15324826AN0704_8) 作 Corsi span lead；无 exact total-correct source | source population/procedure 不能直接覆盖 current profile | 不足：total correct 受 maxSpan、two-trial/level、终止和 digital layout 影响 | 不足：source norm score 与当前 totalCorrectTrials 不是同一 metric | 记录 layout/input provenance；不校正 | **NOT ESTABLISHED** | DEFER |
| sst · `ssrtMs` (`sst/1.0.0/1.0.0`) | response inhibition · ms · lower | ✅ | normative_distribution（future） | [van de Laar et al., 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3238363/)；lifespan global/selective stopping study | source includes child age groups around 8/12 and adults；不是当前 exact cohort/protocol | 不匹配：global/selective stop variants、SSD schedule、stop probability 与当前 40/96/200 profile 需逐项对应 | 部分：都使用 SSRT concept，但 integration/mean method、go RT trimming、pRespondStop boundary 必须一致 | RT/SSD 对 device timing 敏感；只记录，不以设备切换参考 | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| sst · `pRespondStop` (`sst/1.0.0/1.0.0`) | response inhibition · ratio · target range | ✅ | descriptive_sample 或 criterion_threshold（未来再选） | [Logan & Cowan, 1984](https://pubmed.ncbi.nlm.nih.gov/6232345/) 作 stop-signal model/method lead；不是 K12 norm source | original experiments are method evidence, not current K12 population | 不足：SSD selection、stop probability 和 current staircase 未形成 match | 不足：pRespondStop 的当前 valid range/quality use 不能由理论论文直接填 threshold | device timing 只作为 limitation；不做 stop correction | **NOT ESTABLISHED** | NEEDS_BETTER_SOURCE |
| taskswitch · `switchCostRtMs` (`taskswitch/1.0.0/1.0.0`) | cognitive flexibility · ms · lower | ✅ | descriptive_sample（候选） | [Development of task switching and post-error-slowing in children](https://pmc.ncbi.nlm.nih.gov/articles/PMC2751760/)；children 6–11 developmental task-switch study | child age coverage relevant；task rules/cue design are not current product contract | 不匹配/部分：source task rules, cue/target timing and response mapping differ; current E/S/R 48/128/256 | 部分：switch-minus-repeat concept is similar, but median/valid-trial/error handling and pure block boundary differ | RT device/input provenance only; no desktop/touch bonus | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |
| taskswitch · `switchCostAccuracy` (`taskswitch/1.0.0/1.0.0`) | cognitive flexibility · ratio · lower | ✅ | descriptive_sample（候选） | [Development of task switching and post-error-slowing in children](https://pmc.ncbi.nlm.nih.gov/articles/PMC2751760/)；accuracy/switch-cost construct lead | child source is not an exact population/protocol match | 不匹配：cue, task rules, response mapping, trial/block counts and preparation interval differ | 不足/部分：accuracy cost denominator and current quality threshold require exact source formula | input modality and device only recorded; no correction | **NOT ESTABLISHED** | NEEDS_PROTOCOL_MATCH |

## 5. Source-by-source findings

### 5.1 Existing repository anchors are provenance-only

当前 tree 中已有三个 literature set candidate：

| set | source/provenance fact | current status |
|---|---|---|
| `lit-reaction-rutter-2020-v1` | Rutter 2020、Passell 2021；原始 age slice 未映射到 K7–9/K10–12；原始 metric 与系统 `medianRtMs` 未完成等值审核 | `enabled=false`；`bands=[]`；`comparable=false`；`transformation=not_approved` |
| `lit-memory-woods-2011-v1` | Woods 2011 的 adaptive auditory Digit Span/mean span 不能直接作为当前 visual two-trial `maxSpan` | `enabled=false`；`bands=[]`；`comparable=false`；`transformation=not_approved` |
| `lit-stroop-forte-2024-v1` | Forte 2024 children table 是 120-trial mean/log-transform condition effect；当前是 short-form correct-trial median difference | `enabled=false`；`bands=[]`；`comparable=false`；`transformation=not_approved` |

这些对象是审计和 provenance notes，不是已经可解析的 `AssessmentReferenceSetDefinition`，也没有被本轮激活。内部 `lit-sim-k12-v0.2` 是固定种子 synthetic data，只用于开发/协议匹配验证，不是文献样本或中国学生常模。

### 5.2 RT device effect is a limitation, not a correction rule

[Passell et al., 2021](https://pubmed.ncbi.nlm.nih.gov/33954913/) 直接研究了不同个人数字设备对 cognitive test scores 的影响，说明 web cognitive testing 的设备差异会带来额外变异。它可以支持本项目把 device/input 作为 provenance 和 limitation，但不能推导：

- touch penalty；
- desktop bonus；
- browser-specific timing correction；
- device-specific norm switch；
- 把设备分类当作能力分层。

因此所有候选行都保持：`RECORD, DO NOT CORRECT`。

### 5.3 Construct-near children sources still need protocol lock

- [CPT normative epidemiological study](https://pubmed.ncbi.nlm.nih.gov/14561062/) 的儿童/青少年人群与 d′、omission、commission 指标很有价值，但 14-minute CPT、ISI 和 time-block 结构不能直接替换当前 CPT-X profile。
- [Children n-back normative study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4597481/) 有 7–13 岁人群、按 N 分层的 d′/accuracy 设计，但字母刺激、40 trials/level、response window 和中止规则必须与当前 exact protocol 对齐后才能谈 numeric comparability。
- [Kessels et al., 2000](https://www.tandfonline.com/doi/abs/10.1207/S15324826AN0704_8) 提供 Corsi 标准化/规范数据的来源线索，但 layout、呈现/复现规则、年龄人群和当前 digital scoring 仍需锁定。
- [van de Laar et al., 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3238363/) 说明不同年龄段的 stopping/SSRT 表现可比较研究，但 global/selective variants 和 SSD 算法差异阻止直接填当前 SST row。
- [Children task-switching study](https://pmc.ncbi.nlm.nih.gov/articles/PMC2751760/) 支持 switch cost 的发展研究方向，但 cue、任务规则、response mapping 和 preparation interval 的差异足以影响 cost 数值。

## 6. Population and age semantics

未来每条 reference entry 必须声明自己的 `population.match`：

- 文献只有 7–11 岁，就只覆盖 7–11 岁；
- 不做 6 岁、12 岁或其他年龄的 nearest-band fallback；
- 不做连续年龄插值；
- 不把 grade、primary language、country/region 缺失时的样本当作跨语言/跨地区常模；
- 不把 adult sample 的结果扩展成 K12 reference；
- 不以 synthetic band、产品 profile 名称或默认配置冒充参与者人口 context。

如果 source 只给总体样本统计量而没有可追溯的目标年龄切片，结果最多是 source lead 或 `descriptive_sample` 设计候选，不是当前 K12 numeric reference。

## 7. Reference admission checklist

单个 metric 下一轮要升级为 `READY_FOR_LITERATURE_BETA`，必须补齐：

1. exact `testType/engineVersion/scoringVersion` 和实际 profile/config；
2. source 原文表格/行、样本纳入排除和人口匹配；
3. stimulus、语言、duration/ISI/foreperiod、trial/block、response modality；
4. RT floor/trim、timeout/omission/error handling、adaptive/stopping rule；
5. 当前 scoring formula 与 source formula 的逐项 comparison；
6. 真实、可复核的 mean/SD、percentile table 或 threshold；
7. `limitations`、`disclaimer`、设备/输入 caveat；
8. shared Reference Core validation 和 non-overlapping population checks；
9. status 仍为 `DRAFT`，经过 review 后才可能讨论 ACTIVE，且不自动绑定到 session/report。

本轮没有任何一行完成全部条件。

## 8. Explicit non-actions

```text
AssessmentReferenceSet / Entry created: NO
ACTIVE literature reference: NO
Student/Parent report changed: NO
Teacher report changed: NO
Admin report changed: NO
FINAL runtime binding changed: NO
Reference applicability changed: NO
Norm Engine created: NO
continuous-age interpolation: NO
automatic norm fitting: NO
device correction or device-specific norm switch: NO
DB schema/migration: NO
```

**4.2 ✅ candidate audit/design complete. 4.3 NOT STARTED.**

**STOPPED — waiting for review.**
