# Cognitive Library Pilot Inventory v2（COG-P1 Commit 1）

- 日期：2026-09-07
- 基线：main @ `8a05036`
- 性质：documentation only。本文是 Pilot Cognitive Library 的权威盘点（inventory v2），复用 Stage 0 源码事实，不引入新的 taxonomy / truth。
- 数据来源（全部为代码内权威源，本文不另立第二真值）：
  - Registry / metric / quality / report / profiles：`backend/src/modules/cognitive/cognitive.registry.ts` + `registry-definitions.ts`
  - v2 publication：`modules/cognitive/v2/registry.ts`（`defaultStatus`：非 fake 且 `recommendedForCreate=true` → PUBLISHED）
  - DB config status：`prisma/seeds/cognitive.ts`（13 PUBLISHED / 15 DRAFT，含 fake=PUBLISHED 的有意分层）
  - Domain / facet：`modules/cognitive-analysis/evidence-mapping.registry.ts` v1.0.0（唯一权威映射）+ `domain.registry.ts` v1.0.0（10 domain）
  - Golden 覆盖：`src/__tests__/cognitive/*scoring-golden*` + `server-version/cognitive-scoring-golden*.json`
  - 输入/设备字段：`modules/cognitive/schemas/*.trial.ts`
  - Reference：`modules/cognitive/reference.ts` + `reference-data/` + `assessment_reference_sets`（无 COGNITIVE 行）

## 1. 总口径

- 真实任务 24 个（fake 不进入产品 inventory）；registry entry 28 个（reaction/memory/stroop 各有 scoringVersion 1.0.0 与 1.1.0）。
- **v2 publication（定义层，权威）**：PUBLISHED 9 = reaction@1.1.0, memory@1.1.0, stroop@1.1.0, gonogo, cpt, nback, corsi, sst, taskswitch；其余 19 entry DRAFT。
- **DB config status（可用性层）**：PUBLISHED 13（上述 9 + fake + reaction/memory/stroop@1.0.0）。assignment 创建要求两层同时通过，实际可创建集合 = v2 的 9。
- **Domain/facet 权威映射（evidence-mapping v1.0.0）**：18/24 testType 有映射（reaction/memory/stroop 仅 1.1.0 版本被映射）；**无映射 6 个**：trailmaking、reversallearning、bart、wordlist、lexicaldecision、emotionrecognition（其 category 在 v1 10-domain 之外）→ 按 Pilot-first 规则允许 standalone：单任务报告 + Pilot Reference，暂不加入 domain aggregation，不为发布改 taxonomy。
- **Golden fixture 覆盖**：15/24 有冻结 golden JSON；缺 9 个：patterncompare, flanker, cardsort, digitbackward, picturesequence, pairedassociate, matrix, mentalrotation, tower（均有 scorer 正/负测试，无冻结 fixture）。
- **Reference 现状**：全部任务无用户可见参考。所有已提交 config `referenceMode='none'`；literature 三套锚（reaction/memory/stroop）全部 disabled（provenance-only）；simulated 数据在 tree 但仅 config 显式开启才可达；`referencePosition` 恒为 null；DB 无 COGNITIVE reference 行。
- **输入/设备采集现状**：25 个 trial schema 中仅 reaction（逐试次自报 `inputMode: pointer|touch|keyboard`）与 trailmaking（`pointerType: mouse|touch|pen|keyboard|unknown` + `deviceClass: desktop|tablet|phone|unknown`）有输入方式字段；其余 22 个任务 trial schema 无任何输入/设备字段。v2 trial envelope 对全部任务统一采集 `qualityEvents`（visibility_lost/window_blur/resume/runner_restart）。
- **scientificStatus**：全部 24 个任务 = `PILOT`（无任何任务具备 RESEARCH_GRADE 认证证据）。**scientificStatus 按 exact task identity（testType/engineVersion/scoringVersion）解析，不绑定 task family**：allowlist（`RESEARCH_GRADE_IDENTITIES`）当前为空，未来新 engine/scoring 版本天然回到 PILOT，不继承旧版本科研资格（review Fix 1）。

## 2. 总矩阵

| testType | scoringVersion(s) | v2 pub | domain（evidence-mapping） | golden | 输入采集 | interaction family | RT敏感 | 细动作敏感 |
|---|---|---|---|---|---|---|---|---|
| reaction | 1.0.0 / 1.1.0 | 1.1.0 PUBLISHED | processing_speed + sustained_attention（仅1.1.0） | ✅ | inputMode 逐试次 | button_choice | high | low |
| memory | 1.0.0 / 1.1.0 | 1.1.0 PUBLISHED | working_memory/verbal_storage（仅1.1.0） | ✅ | 无 | keypad_sequence | low | low |
| stroop | 1.0.0 / 1.1.0 | 1.1.0 PUBLISHED | interference_control/semantic_interference（仅1.1.0） | ✅ | 无 | button_choice | high | low |
| gonogo | 1.0.0 | PUBLISHED | response_inhibition/action_withholding | ✅ | 无 | button_choice | high | low |
| cpt | 1.0.0 | PUBLISHED | sustained_attention + processing_speed + response_inhibition | ✅ | 无 | button_choice | high | low |
| nback | 1.0.0 | PUBLISHED | working_memory/updating | ✅ | 无 | button_choice | moderate | low |
| corsi | 1.0.0 | PUBLISHED | working_memory/visuospatial_storage | ✅ | 无 | click_sequence | low | low |
| sst | 1.0.0 | PUBLISHED | response_inhibition/action_cancellation | ✅ | 无 | button_choice | high | low |
| taskswitch | 1.0.0 | PUBLISHED | cognitive_flexibility/trial_switching | ✅ | 无 | button_choice | moderate | low |
| patterncompare | 1.0.0 | DRAFT | processing_speed/visual_comparison | ❌ | 无 | button_choice | high | moderate |
| flanker | 1.0.0 | DRAFT | interference_control/perceptual_interference | ❌ | 无 | button_choice | moderate | low |
| cardsort | 1.0.0 | DRAFT | cognitive_flexibility/rule_shifting | ❌ | 无 | button_choice | moderate | low |
| digitbackward | 1.0.0 | DRAFT | working_memory/verbal_manipulation | ❌ | 无 | keypad_sequence | low | low |
| picturesequence | 1.0.0 | DRAFT | episodic_learning_memory/sequence_learning | ❌ | 无 | item_ordering | low | low |
| pairedassociate | 1.0.0 | DRAFT | episodic_learning_memory/paired_learning | ❌ | 无 | position_selection | low | low |
| matrix | 1.0.0 | DRAFT | fluid_reasoning/rule_induction | ❌ | 无 | multi_option_selection | low | low |
| mentalrotation | 1.0.0 | DRAFT | visuospatial_reasoning/mental_rotation | ❌ | 无 | button_choice | moderate | low |
| tower | 1.0.0 | DRAFT | planning/look_ahead | ❌ | 无 | click_sequence | low | low |
| trailmaking | 1.0.0 | DRAFT | **无映射（standalone）** | ✅ | pointerType+deviceClass 逐试次 | click_sequence | moderate | high |
| reversallearning | 1.0.0 | DRAFT | **无映射（standalone）** | ✅ | 无 | button_choice | low | low |
| bart | 1.0.0 | DRAFT | **无映射（standalone）** | ✅ | 无 | incremental_button | low | low |
| wordlist | 1.0.0 | DRAFT | **无映射（standalone）** | ✅ | 无 | typed_recall | low | moderate |
| lexicaldecision | 1.0.0 | DRAFT | **无映射（standalone）** | ✅ | 无 | button_choice | high | low |
| emotionrecognition | 1.0.0 | DRAFT | **无映射（standalone）** | ✅ | 无 | multi_option_selection | low | low |

## 3. 逐任务明细

统一说明：`quality` 为 qualityDefinitions keys；`report` = reportDefinitionVersion；`golden` = 冻结 golden JSON；`ref` = 当前 reference 状态；scientificStatus 全部为 PILOT，下文不再重复。

### Reaction（简单反应时）— processing_speed
- identity：reaction / engine 1.0.0 / scoring 1.0.0（v2 DRAFT，DB PUBLISHED）与 1.1.0（v2 PUBLISHED，DB PUBLISHED）
- profiles（1.1.0）：experience 8 / standard 20 / research 60 trials
- domain（evidence-mapping，仅 1.1.0）：processing_speed/simple_response（medianRtMs primary）；sustained_attention/response_stability（rtICV）、omission_control（missRate）supporting
- headline：medianRtMs；primary：medianRtMs, rtICV, missRate；supporting：meanRtMs, sdRtMs, fastestRtMs, prematureCount, validTrialCount, totalTrials
- quality：interpretable, insufficientValidTrials, highMissRate, interrupted（1.1.0 增 excessivePremature, extremeRtPattern）
- interaction：button_choice；RT 敏感 high（速度即任务）；细动作 low
- 输入采集：逐试次自报 `inputMode`（pointer|touch|keyboard）；无 deviceClass
- Scoring Contract 原始事实：foreperiodMs、rtMs（perf 时钟）、premature/timeout 标记、interrupted、inputMode
- Research Capture 建议：完整 foreperiod 序列与分布、逐试次 inputMode、device class、visibility 中断事件
- golden ✅（round1-scoring-golden）；report 1.0.0/1.1.0；ref：无（literature 锚 Rutter-2020 存在但 disabled）

### Memory（数字广度顺背）— working_memory
- identity：memory / 1.0.0（v2 DRAFT，DB PUBLISHED）与 1.1.0（v2 PUBLISHED）
- profiles（1.1.0）：startLength=3，maxLength experience 6 / standard 8 / research 9
- domain（仅 1.1.0）：working_memory/verbal_storage（maxSpan, totalCorrectTrials primary）
- headline：maxSpan；primary（1.1.0）：maxSpan, totalCorrectTrials；supporting：levelsPassed, firstTryPassCount, medianResponseDurationMs, trialCount；quality 角色：interruptedCount, perseverativeTrialCount
- quality：interpretable, interrupted（1.1.0 增 insufficientCompletedLevels, invalidSequencePattern）
- interaction：keypad_sequence；RT 敏感 low；细动作 low（数字键入）
- 输入采集：无
- Scoring Contract 原始事实：逐级序列（呈现序 + 作答序）、层级终止原因、interrupted
- Research Capture 建议：逐级作答时序、重试/首过模式、键盘输入事件、visibility
- golden ✅；report 1.0.0/1.1.0；ref：无（literature 锚 Woods-2011 存在但 disabled）

### Stroop（色词 Stroop）— inhibitory_control
- identity：stroop / 1.0.0（v2 DRAFT，DB PUBLISHED）与 1.1.0（v2 PUBLISHED）
- profiles（1.1.0）：experience 16 / standard 40 / research 96 trials（congruentRatio 0.5）
- domain（仅 1.1.0）：interference_control/semantic_interference（stroopEffectMs, incongruentAccuracy primary；errorCost supporting）
- headline：stroopEffectMs；primary：stroopEffectMs, incongruentAccuracy, errorCost；supporting：accuracy, congruentAccuracy, medianRtCongruent, medianRtIncongruent, timeoutCount
- quality：interpretable, insufficientValidCongruentRt, insufficientValidIncongruentRt, interrupted（1.1.0 增 lowAccuracy）
- interaction：button_choice；RT 敏感 high（difference 指标，须与条件准确率同读）；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：逐试次 condition（congruent/incongruent）、正确性、有效 RT、timeout
- Research Capture 建议：逐试次刺激-反应映射、色词组合、RT 全分布、visibility
- golden ✅；report 1.0.0/1.1.0；ref：无（literature 锚 Forte-2024 存在但 disabled）

### Go/No-Go — response_inhibition
- identity：gonogo / 1.0.0（v2 PUBLISHED）
- profiles：experience 40 / standard 120 / research 240 trials（nogoRatio 0.25）
- domain：response_inhibition/action_withholding（commissionRate, dPrime primary）
- headline：commissionRate；primary：commissionRate, dPrime；supporting：goMedianRtMs, hitRate, omissionRate, commissionErrors, goTrialCount, nogoTrialCount
- quality：interpretable, insufficientNoGoTrials, excessiveOmissions, extremeCommissionRate, interrupted
- interaction：button_choice；RT 敏感 high；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：go/nogo 条件、正确性、RT、遗漏/误按
- Research Capture 建议：逐试次 ISI、RT 全分布、commission 前置试次上下文、visibility
- golden ✅；report 1.0.0；ref：无

### CPT-X（连续执行任务）— sustained_attention
- identity：cpt / 1.0.0（v2 PUBLISHED）
- profiles：experience 60（1 block）/ standard 180（3 blocks）/ research 360（6 blocks），targetRatio 0.2
- domain：sustained_attention/target_discrimination（dPrime）、omission_control（omissionRate）、response_stability（rtICV）primary；processing_speed/simple_response（hitMedianRtMs）与 response_inhibition/action_withholding（commissionRate）supporting
- headline：dPrime；primary：dPrime, omissionRate, commissionRate, rtICV；supporting：hitMedianRtMs, hitRtSdMs, perseverationRate, targetCount, hitCount；research_only：blockSlopeRt, blockSlopeOmission
- quality：interpretable, insufficientTargets, highOmissionRate, highPerseverationRate, interrupted
- interaction：button_choice；RT 敏感 high（ICV 为 primary）；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：目标/非目标条件、命中/误报/遗漏、命中 RT、block 结构
- Research Capture 建议：逐 block RT 分布、vigilance decrement 轨迹、极短反应原始值、visibility
- golden ✅；report 1.0.0；ref：无

### N-Back（工作记忆更新）— working_memory
- identity：nback / 1.0.0（v2 PUBLISHED）
- profiles：experience [1-back]×30 / standard [1,2]×(40,60) / research [1,2,3]×60（各 2 blocks）
- domain：working_memory/updating（dPrimeByN, maxReliableN primary；loadCostDPrime supporting）
- headline：maxReliableN；primary：dPrimeByN, maxReliableN；supporting：hitRateByN, falseAlarmRateByN, medianRtByN, loadCostDPrime
- quality：interpretable, insufficientTargetsByN, ceilingOrFloorByN, excessiveOmissions, interrupted
- interaction：button_choice；RT 敏感 moderate；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：N 水平、目标/非目标、命中/误报、按 N 分层
- Research Capture 建议：逐 N 逐 trial 响应矩阵、RT 分布、负荷效应轨迹、visibility
- golden ✅；report 1.0.0；ref：无

### Corsi（视空间广度）— working_memory
- identity：corsi / 1.0.0（v2 PUBLISHED）
- profiles：startSpan 3，maxLength experience 6 / standard 8 / research 9（科研档连续一整级失败即终止）
- domain：working_memory/visuospatial_storage（maxSpan, totalCorrectTrials primary；sequenceErrorDistance supporting）
- headline：maxSpan；primary：maxSpan, totalCorrectTrials；supporting：firstTryPassCount, medianResponseDurationMs, trialCount；research_only：sequenceErrorDistance
- quality：interpretable, insufficientCompletedLevels, invalidBlockSequence, interrupted
- interaction：click_sequence（方块序列复现）；RT 敏感 low；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：呈现序列、作答序列、层级推进/终止
- Research Capture 建议：逐级作答时序、错误位置距离分布、visibility
- golden ✅；report 1.0.0；ref：无

### SST（停止信号任务）— response_inhibition
- identity：sst / 1.0.0（v2 PUBLISHED）
- profiles：experience 40 / standard 96 / research 200 trials
- domain：response_inhibition/action_cancellation（ssrtMs, pRespondStop primary）
- headline：ssrtMs；primary：ssrtMs, pRespondStop；supporting：goMedianRtMs, goOmissionRate, goChoiceErrorRate, meanSsdMs, unsuccessfulStopRtMs
- quality：interpretable, insufficientStopTrials, pRespondStopOutOfRange, highGoOmission, strategicSlowingSuspected, interrupted
- interaction：button_choice（go 选择 + stop 取消）；RT 敏感 high（SSRT 估计）；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：go/stop 条件、SSD 阶梯轨迹、成功/失败 stop、go RT
- Research Capture 建议：完整 SSD 阶梯、失败 stop RT 分布、策略性减慢迹象、visibility
- golden ✅；report 1.0.0；ref：无

### Task Switching（任务转换）— cognitive_flexibility
- identity：taskswitch / 1.0.0（v2 PUBLISHED）
- profiles：experience 48（2 blocks）/ standard 128（4 blocks）/ research 256（8 blocks + pure blocks）
- domain：cognitive_flexibility/trial_switching（switchCostRtMs, switchCostAccuracy primary）
- headline：switchCostRtMs；primary：switchCostRtMs, switchCostAccuracy；supporting：medianRtSwitch, medianRtRepeat, accuracySwitch, accuracyRepeat；research_only：mixingCost
- quality：interpretable, insufficientSwitchTrials, insufficientRepeatTrials, lowAccuracy, interrupted
- interaction：button_choice（线索化规则选择）；RT 敏感 moderate（difference 指标）；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：cue/规则、switch/repeat 条件、正确性、有效 RT
- Research Capture 建议：逐试次 cue-stimulus 间隔、switch 序列结构、RT 分布、visibility
- golden ✅；report 1.0.0；ref：无

### Pattern Comparison（图形模式比较）— processing_speed
- identity：patterncompare / 1.0.0（v2 DRAFT）
- profiles：限时 experience 30s / standard 60s / research 90s
- domain：processing_speed/visual_comparison（correctPerMinute, medianCorrectRtMs primary）
- headline：correctPerMinute；primary：correctPerMinute, accuracy, medianCorrectRtMs；supporting：lapseRate, correctCount, completedTrialCount
- quality：interpretable, insufficientCompletedTrials, lowAccuracy, excessiveLapses, constantResponse, interrupted
- interaction：button_choice（同/异判断）；RT 敏感 high；细动作 moderate（限时内高频点击）
- 输入采集：无
- Scoring Contract 原始事实：逐题正确性、有效 RT、未反应、生成刺激身份（seed 可重建）
- Research Capture 建议：逐题刺激对 seed/形状参数、RT 全分布、lapse 时点、visibility
- golden ❌（scorer 正/负测试已有）；report 1.0.0；ref：无

### Flanker（箭头干扰）— interference_control
- identity：flanker / 1.0.0（v2 DRAFT）
- profiles：experience 24 / standard 80 / research 160 trials
- domain：interference_control/perceptual_interference（flankerEffectMs, incongruentAccuracy primary；errorCost supporting）
- headline：flankerEffectMs；primary：flankerEffectMs, incongruentAccuracy, congruentAccuracy, errorCost；supporting：accuracy, medianRtCongruent, medianRtIncongruent, omissionRate
- quality：interpretable, insufficientCongruentTrials, insufficientIncongruentTrials, lowAccuracy, excessiveOmissions, constantResponse, interrupted
- interaction：button_choice（方向判断）；RT 敏感 moderate（difference 指标）；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：一致/不一致条件、方向正确性、有效 RT、遗漏
- Research Capture 建议：flanker 结构参数、RT 全分布、条件间序列效应、visibility
- golden ❌；report 1.0.0；ref：无

### Card Sort（规则卡片分类）— cognitive_flexibility
- identity：cardsort / 1.0.0（v2 DRAFT）
- profiles：experience 24（2 blocks）/ standard 72（3 blocks）/ research 144（6 blocks）
- domain：cognitive_flexibility/rule_shifting（switchCostRtMs, perseverativeErrorRate primary；postSwitchRecovery supporting）
- headline：switchCostRtMs；primary：switchCostRtMs, switchCostAccuracy, perseverativeErrorRate, postSwitchRecovery；supporting：accuracySwitch, accuracyRepeat, medianRtSwitch, medianRtRepeat, overallAccuracy, omissionRate, perseverativeErrorCount
- quality：interpretable, insufficientSwitchTrials, insufficientRepeatTrials, lowAccuracy, excessiveOmissions, constantResponse, interrupted
- interaction：button_choice（按线索规则二选一）；RT 敏感 moderate；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：冻结规则序、实际响应、规则转换点、持续性错误推导依据
- Research Capture 建议：规则切换前后试次轨迹、错误类型分解、RT 分布、visibility
- golden ❌；report 1.0.0；ref：无

### Digit Backward（数字倒背）— working_memory
- identity：digitbackward / 1.0.0（v2 DRAFT）
- profiles：startSpan 2，maxLength experience 4 / standard 7 / research 8
- domain：working_memory/verbal_manipulation（maxSpan, totalCorrectTrials primary；sequenceDistance supporting）
- headline：maxSpan；primary：maxSpan, totalCorrectTrials；supporting：sequenceDistance, medianResponseDurationMs, completedLevelCount
- quality：interpretable, insufficientCompletedLevels, constantResponse, interrupted
- interaction：keypad_sequence（倒序键入）；RT 敏感 low；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：逐级呈现序 + 倒序作答序、层级终止
- Research Capture 建议：作答时序、错误位距分布、重复模式、visibility
- golden ❌；report 1.0.0；ref：无

### Picture Sequence（图片序列学习）— episodic_learning_memory
- identity：picturesequence / 1.0.0（v2 DRAFT）
- profiles：experience 6 项×2 轮 / standard 12×3 / research 15×3 + delayed 30s
- domain：episodic_learning_memory/sequence_learning（adjacentPairScore, learningGain primary；delayedRetention supporting）
- headline：adjacentPairScore；primary：adjacentPairScore, positionScore, learningGain, delayedRetention（research）；supporting：adjacentPairScoreByRound, positionScoreByRound
- quality：interpretable, emptyResponse, incompleteResponse, unchangedIncorrectOrder, delayedStageIncomplete, interrupted
- interaction：item_ordering（排序拖/点）；RT 敏感 low；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：逐轮排序提交、项目身份（seed 可重建）、延迟阶段有效性
- Research Capture 建议：逐轮逐项排序轨迹、修改行为、延迟间隔实际时长、visibility
- golden ❌；report 1.0.0；ref：无

### Paired Associate（图形—位置配对学习）— episodic_learning_memory
- identity：pairedassociate / 1.0.0（v2 DRAFT）
- profiles：experience 6 对×2 轮 / standard 12×3 / research 18×4 + delayed 30s
- domain：episodic_learning_memory/paired_learning（learningSlope, trialsToCriterion primary；delayedAccuracy supporting）
- headline：immediateAccuracy；primary：correctByTrial, learningSlope, trialsToCriterion, immediateAccuracy, delayedAccuracy（research）
- quality：interpretable, excessiveOmissions, constantPositionResponse, delayedStageIncomplete, interrupted
- interaction：position_selection（网格位置选择）；RT 敏感 low；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：配对-位置映射、逐轮正确性、标准达成
- Research Capture 建议：逐对学习轨迹、位置偏差模式、延迟间隔、visibility
- golden ❌；report 1.0.0；ref：无

### Matrix（矩阵规则推理）— fluid_reasoning
- identity：matrix / 1.0.0（v2 DRAFT）
- profiles：experience 6 / standard 16 / research 24 题（三规则族 + 难度）
- domain：fluid_reasoning/rule_induction（accuracy, accuracyByRuleFamily primary；reachedDifficulty, medianRtMs supporting）
- headline：accuracy；primary：accuracy, accuracyByRuleFamily；supporting：reachedDifficulty, medianRtMs, omissionRate
- quality：interpretable, constantResponse, excessiveOmissions, interrupted
- interaction：multi_option_selection（选题，不限时）；RT 敏感 low；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：题目身份（生成器 seed）、规则族/难度、所选选项、唯一解校验
- Research Capture 建议：逐题作答时长、选项排除行为、规则族×难度正确率、visibility
- golden ❌；report 1.0.0；ref：无

### Mental Rotation（心理旋转）— visuospatial_reasoning
- identity：mentalrotation / 1.0.0（v2 DRAFT）
- profiles：experience 12 / standard 40 / research 80 trials（角度/镜像/图形族平衡）
- domain：visuospatial_reasoning/mental_rotation（accuracy, angleCost primary；medianCorrectRtMs supporting）
- headline：accuracy；primary：accuracy, angleCost, medianCorrectRtMs；supporting：mirrorErrorRate, omissionRate
- quality：interpretable, constantResponse, insufficientAngleCoverage, excessiveOmissions, lowAccuracy, interrupted
- interaction：button_choice（相同/镜像判断）；RT 敏感 moderate（angle cost）；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：角度条件、same/mirror 真值、响应侧、图形族（seed 可重建）
- Research Capture 建议：角度×RT 线性轨迹、镜像错误模式、响应侧平衡、visibility
- golden ❌；report 1.0.0；ref：无

### Tower（塔式规划）— planning
- identity：tower / 1.0.0（v2 DRAFT）
- profiles：experience 4 / standard 10 / research 18 题（三档最短路径难度；solver 校验）
- domain：planning/look_ahead（minimumMoveSolveRate, excessMoves primary；firstMoveLatencyMs, ruleViolations supporting）
- headline：minimumMoveSolveRate；primary：minimumMoveSolveRate, excessMoves, ruleViolations；supporting：solveRate, firstMoveLatencyMs, noAttemptRate
- quality：interpretable, excessiveRuleViolations, insufficientAttemptedProblems, interrupted
- interaction：click_sequence（逐步移动圆盘）；RT 敏感 low；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：题目最短步数（solver）、逐步移动序列、规则违反
- Research Capture 建议：首步前思考时长的完整分布、回撤/改步行为、逐题移动轨迹、visibility
- golden ❌；report 1.0.0；ref：无

### Trail Making（视觉搜索）— standalone（无 domain 映射）
- identity：trailmaking / 1.0.0（v2 DRAFT；golden ✅ pr12）
- profiles：experience A 12 步 / standard A+B 各 12 / research A+B 各 24
- domain：无 evidence-mapping 映射（visual_search_set_shifting 在 v1 10-domain 之外）→ standalone；headline completionTimeMs；primary：completionTimeMs, errorCount, setShiftCostMs（standard+research）；supporting：partA/BCompletionTimeMs, meanCorrectStepTimeMs, completedStepCount, errorRate, omissionRate
- quality：interpretable, insufficientCompletedSteps, excessiveErrors, timeLimitReached, deviceInfoIncomplete, mixedPointerType, interrupted
- interaction：click_sequence（按序连接目标）；RT 敏感 moderate；细动作 high（指针精度 + 视觉搜索）
- 输入采集：**当前最全**——逐试次 `pointerType`（mouse|touch|pen|keyboard|unknown）+ `deviceClass`（desktop|tablet|phone|unknown），scorer 派生 deviceInfoIncomplete/mixedPointerType
- Scoring Contract 原始事实：目标序列、逐步正确性、逐步用时、指针/设备自报
- Research Capture 建议：完整逐步轨迹（含错误尝试目标）、指针事件粒度、屏幕/viewport、visibility
- ref：无；report 1.0.0

### Reversal Learning（概率反转学习）— standalone（无 domain 映射）
- identity：reversallearning / 1.0.0（v2 DRAFT；golden ✅ pr12）
- profiles：experience 40（20+20）/ standard 120（60+60）/ research 240（120+120）
- domain：无映射（decision_learning 在 v1 之外）→ standalone；headline reversalAccuracy；primary：acquisitionAccuracy, reversalAccuracy, reversalCost, perseverativeErrorCount；supporting：trialsToAcquisitionCriterion, trialsToReversalCriterion, feedbackWinRate, omissionRate, medianRtMs, validResponseCount
- quality：interpretable, insufficientAcquisitionTrials, insufficientReversalTrials, lowAccuracy, excessiveOmissions, constantChoice, noAcquisitionCriterion, noReversalCriterion, interrupted
- interaction：button_choice（二选一 + 反馈）；RT 敏感 low；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：阶段（acquisition/reversal）、概率 roll（replay contract，冻结概率不下发）、连续正确计数
- Research Capture 建议：逐试次反馈后选择轨迹、win-stay/lose-shift、RT 分布、visibility
- ref：无；report 1.0.0

### BART（泵压任务）— standalone（无 domain 映射）
- identity：bart / 1.0.0（v2 DRAFT；golden ✅ pr12）
- profiles：experience 10 / standard 30 / research 50 balloons
- domain：无映射（risk_taking 在 v1 之外）→ standalone；headline adjustedPumps；primary：adjustedPumps, explosionCount, cashoutCount；supporting：meanPumpsAllCompleted, cashoutRate, completedBalloonCount, omissionRate；showProductIndex=false
- quality：interpretable, insufficientCompletedBalloons, insufficientCashoutBalloons, excessiveOmissions, constantPumpPattern, invalidOutcome, interrupted
- interaction：incremental_button（泵压/现金化）；RT 敏感 low；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：冻结爆破阈值（服务端）、逐 balloon 泵压序、现金化状态
- Research Capture 建议：逐 balloon 泵压节奏（间隔序列）、现金化时机、爆炸后行为、visibility
- ref：无；report 1.0.0

### Word List（中文词表自由回忆）— standalone（无 domain 映射）
- identity：wordlist / 1.0.0（v2 DRAFT；golden ✅ pr13）
- profiles：experience 8 词×2 轮 / standard 12×3 / research 15×5 + delayed
- domain：无映射（language_learning 在 v1 之外）→ standalone；headline immediateAccuracy；primary：immediateAccuracy, learningGain, delayedRecallAccuracy（research）；supporting：totalImmediateCorrect, intrusionCount, duplicateResponseCount, omissionRate, medianResponseDurationMs
- quality：interpretable, emptyImmediateRecall, excessiveOmissions, excessiveIntrusions, repeatedResponsePattern, delayedStageIncomplete, interrupted
- interaction：typed_recall（键盘自由回忆）；RT 敏感 low；细动作 moderate（输入吞吐影响回忆量）
- 输入采集：无
- Scoring Contract 原始事实：词表身份（chinese-wordlist-v1.0.0 冻结词库、seed 抽样）、归一化输入、侵入词判定
- Research Capture 建议：逐词召回时序、语义聚类模式、输入法中间态、visibility
- ref：无；report 1.0.0

### Lexical Decision（中文词汇判断）— standalone（无 domain 映射）
- identity：lexicaldecision / 1.0.0（v2 DRAFT；golden ✅ pr13）
- profiles：experience 40 / standard 100 / research 200 trials
- domain：无映射（language_decision 在 v1 之外）→ standalone；headline dPrime；primary：dPrime, lexicalityEffectMs, accuracyReal, accuracyPseudo；supporting：medianRtReal, medianRtPseudo, omissionRate, validResponseCount；research_only：accuracyByFrequencyBand
- quality：interpretable, insufficientRealWords, insufficientPseudoWords, lowAccuracy, excessiveOmissions, constantResponse, interrupted
- interaction：button_choice（真/伪词判断）；RT 敏感 high；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：词/伪词身份（冻结词库 + 伪词生成器版本）、词频带、正确性、RT
- Research Capture 建议：词频带×RT 分布、词长效应、伪词生成参数、visibility
- ref：无；report 1.0.0

### Emotion Recognition（六类情绪面孔分类）— standalone（无 domain 映射）
- identity：emotionrecognition / 1.0.0（v2 DRAFT；golden ✅ pr13）
- profiles：experience 24 / standard 60 / research 120 trials（六类严格平衡，20 组内部合成身份）
- domain：无映射（emotion_classification 在 v1 之外）→ standalone；headline balancedAccuracy；primary：accuracy, balancedAccuracy；supporting：medianRtMs, omissionRate, validResponseCount；research_only：accuracyByEmotion, confusionMatrix
- quality：interpretable, insufficientPerCategory, lowAccuracy, excessiveOmissions, constantResponse, interrupted
- interaction：multi_option_selection（六选一）；RT 敏感 low；细动作 low
- 输入采集：无
- Scoring Contract 原始事实：面孔身份（emotion-faces-ai-zh-v1.0.0 合成资产）、目标情绪、所选情绪
- Research Capture 建议：混淆矩阵轨迹、特定类别系统偏差、反应时分布、visibility
- ref：无；report 1.0.0

## 4. 与 COG-P2/P3/P5 的衔接

- **COG-P2（Device & Input Provenance V1）**：本 inventory 的「输入采集」列 + RT/细动作敏感度即为 2.1 审计基线。注意（review §6）：interaction family 与 rtSensitivity/fineMotorSensitivity 只是 **COG-P2 的 provisional audit hint**，不是正式 scientific evidence。已确认缺口：除 reaction/trailmaking 外 22 个任务无输入方式字段；CPT 等 RT-sensitive 任务同时接受 click 与 keyboard 但不留痕（与 reaction 的自报模式不一致）。原则：RECORD, DO NOT CORRECT。
- **COG-P3（Scoring Plane Slimming）**：权威的逐任务 raw-fact 分类在 `modules/cognitive/library/dual-contracts.ts`，按 boundary 分为 **clientObservedFacts（客户端必须记录）/ runtimeReconstructableFacts（seed/config/protocol 可重建）/ serverDerivedFacts（authoritative scorer 派生，永不为客户端真值）** 三类；headline/primary/supporting/quality 划分从 registry 派生。§3 逐任务块中的「Scoring Contract 原始事实」为分类前的清单库存，仅作对照参考。9 个无 golden 任务需先补 golden 才能安全瘦身。
- **COG-P5（Research Capture → COS）**：capture contract（`dual-contracts.ts`）已区分 **currentlyAvailableFacts（现有 raw payload/envelope/frozen runtime 已能获得）与 futureCaptureFacts（当前未采集、未来科研值得新增）**。**COG-P5 同时包括 storage migration 与 research-capture enrichment：现有 raw payload 中已经存在的事实只做迁移；当前未采集的科研事实由 COG-P2/P5 按最小必要原则新增。**
- **状态词汇口径（review §9）**：Product status = `DRAFT / PUBLISHED / RETIRED`（v2 publication，工程层）；Scientific maturity = `PILOT / RESEARCH_GRADE`（exact identity scoped，evidence 层，二者独立）；Reference = 复用既有 Reference Core（本 inventory 不建立第二套 reference status）；Research capture = current captured facts + future capture enrichment（见上）。
- 本 inventory 不引入第二套 domain/版本/参考真值；全部字段可由 §0 所列权威源程序化再导出。
