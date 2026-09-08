# COG-P3 3.1：Scoring Plane 与 FINAL Payload Budget Inventory v1

状态：PR Draft · 3.1 ✅ · 3.2 ✅ · 3.3+ NOT STARTED

本文档是 COG-P3 的 Commit 3.1，仅做当前 scoring plane、FINAL payload 与 trial budget 的事实盘点。本文不改变生产行为、schema、scorer、数据库、hash、COS、Reference、Bundle 或 PR #54 优化逻辑。

## 1. 审计基线与结论

- 仓库：caohuibj/eduK12-new-version
- 基线：main 与 origin/main 均为 1ff8a745b90ffa21cefddef71a0779af446f5dc2
- COG-P2：PR #62 已以预期 head 154569fc... 合并，方式为 merge commit；merged_at=2026-09-08T07:18:52Z
- Registry：24 个真实 task type，另有 fake framework task；v2 registry 展开为 28 个 definition（reaction、memory、stroop 各有 1.0/1.1 两个版本）
- v2 audit：PASS；registryCount=28、publishedCount=9、draftCount=19、retiredCount=0；28 个 definition 均 scorerCovered=true，无 issues
- 当前 published v2 definition：reaction 1.1、memory 1.1、stroop 1.1、gonogo 1.0、cpt 1.0、nback 1.0、corsi 1.0、sst 1.0、taskswitch 1.0
- 现有 definition 的 references 数组均为空；这只表示当前 scoring plane 没有接入 metric-specific reference/Bundle 映射，不表示研究参考资料不存在。当前报告消费 scorer 输出的 metrics，reference/report package 不是本次 raw trial payload 的清理对象。
- 合并后工作区的 git diff --check 通过；本地 Compose 的 backend、worker、frontend、Postgres、Redis 均为可运行状态。

PR #62 的代码等价 head 已由 #407 全绿验证（backend、frontend、Docker/security、CodeQL）；合并 SHA 的直接 commit-status/API 查询没有返回 PR-triggered status。末次只含报告变化的检查 #409 因 self-hosted runner 上 PostgreSQL 5432 已被占用而在测试前失败，属于 runner 基础设施问题，不是 COG-P2 代码回归。

## 2. 当前 FINAL scoring path

frozen session response
  └─ CognitiveTaskProps(taskContext, trialIndex, onTrialComplete)
       └─ task Runner 产生 raw trial payload
            └─ v2 trial envelope（index / phase / timing / flags / quality / payload）
                 └─ FINAL submit
                      └─ strict FINAL API shell
                           └─ validateAndNormalizeTrials
                                └─ canonicalJsonBytes({ trials, administrationProvenance? })
                                     └─ FINAL_SUBMISSION_MAX_BYTES.cognitive
                                          └─ authoritative scorer
                                               └─ encrypted raw/result persistence

当前关键约束：

1. CognitiveTaskProps 只允许 Runner 通过 onTrialComplete(payload) 提交 raw trial；前端不得提交 score、payloadHash 或加密内容。taskContext 携带冻结的 configVersion、config、randomSeed、engine/scoring version，Runner 不得自行 regenerate seed。
2. v2 envelope 包含 schemaVersion=1、连续的 trialIndex、phase、可选 condition、performance timing、flags、最多 20 个 qualityEvents 与 task payload。服务端检查 index 从 0 连续、phase 已持久化、时间区间及 duration 一致性。
3. FINAL schema 的公共 request 还包含 recoveryToken；服务端核心字段为 submissionId、attemptEpoch、definitionHash、可选 contextSnapshotHash、trials 与可选 administrationProvenance。trials 当前是 1..1000 个 unknown，具体形状再由 Registry 的 task schema 校验。
4. unified-final-submit.service 在 scoring 前做 trial normalize、payload canonicalization、hash 与最终字节数检查；本盘点的 FINAL byte 使用与其无 provenance 分支一致的 canonical { trials: [...] } 形态。
5. 当前已有两层 byte protection：HTTP JSON parser 为 `express.json({ limit: '2mb' })`，Cognitive canonical FINAL 为 `FINAL_SUBMISSION_MAX_BYTES.cognitive = 1,572,864` bytes。3.2 不改变这两个数值，不新增 route parser 或通用 payload middleware。

## 3. 事实分类口径

以下分类按“数据的事实来源”而不是按“字段当前由谁填写”定义：

- clientObservedFacts（O）：浏览器实际观测到的用户行为或设备环境，例如 response、按键/点击时间、RT、未响应、interrupt、pointer type、泵数、移动序列、设备类别。此类字段是测量原始事实，不能因为它也能被校验就当作 server-derived。
- runtimeReconstructableFacts（R）：服务端可凭冻结的 definition/config/randomSeed、trial index、phase 和版本重建或 replay 的呈现/条件事实，例如 stimulus、trialType、rule、block、sequence、item identity、adaptive level、SSD 状态。当前仍可能保留它们，原因是 anti-tamper、实际呈现审计、历史版本重放和 scorer contract。
- serverDerivedFacts（D）：服务端从 O、R 和 frozen config 计算出来的事实，例如 correct、hit/miss、accuracy、d-prime、median RT、effect、slope、criterion、confusion matrix。D 不应进入 raw trial payload；当前 report metrics 属于 scorer/result 下游。

R 不是自动等于“可以删除”：只有在服务端能用相同历史版本、相同 seed、相同 phase、相同 adaptive state 完整 replay，并且不损失呈现审计和兼容能力时，才是后续 cleanup candidate。

## 4. 24 个真实 task 的逐项 payload inventory

证据组件统一位于：

- Runner：server-version/frontend/src/modules/cognitive/tasks/<task>/
- trial schema：server-version/backend/src/modules/cognitive/schemas/<task>.trial.ts
- scorer：server-version/backend/src/modules/cognitive/scoring/<task>.v1.ts；reaction、memory、stroop 的 published 1.1 另有对应 v1_1 实现
- 注册与版本桥接：server-version/backend/src/modules/cognitive/cognitive.registry.ts、registry-definitions.ts、v2/registry.ts

表中“candidate”只表示后续阶段的研究对象；本 Commit 不删除任何字段。

| task / 当前默认 definition | Runner · trial schema · scorer | payload 中的关键字段 | O / R / D 角色 | cleanup candidate 与风险 |
|---|---|---|---|---|
| reaction 1.1.0 PUBLISHED（兼有 1.0.0） | reaction/ReactionTask.tsx · reaction.trial.ts · reaction.v1_1.ts | foreperiodMs、rtMs、prematureCount、interrupted、inputMode | O=rtMs/prematureCount/interrupted/inputMode；R=foreperiodMs；D=valid/miss/RT metrics | foreperiodMs 是 replay anchor；KEEP，低清理收益 |
| memory 1.1.0 PUBLISHED（兼有 1.0.0） | memory/MemoryTask.tsx · memory.trial.ts · memory.v1_1.ts | length、trialWithinLevel、sequence[]、response[]、responseDurationMs、interrupted | O=response/duration/interrupted；R=length/trialWithinLevel/sequence；D=correct/maxSpan/levelsPassed | 自适应与 sequence replay；R 字段删除风险 HIGH，KEEP |
| stroop 1.1.0 PUBLISHED（兼有 1.0.0） | stroop/StroopTask.tsx · stroop.trial.ts · stroop.v1_1.ts | word、inkColor、response、rtMs、interrupted | O=response/rt/interrupted；R=word/inkColor；D=congruence/accuracy/effect | word/ink 可由 seed 重建但也是呈现证据；B 类，HIGH，KEEP |
| gonogo 1.0.0 PUBLISHED | gonogo/GonogoTask.tsx · gonogo.trial.ts · gonogo.v1.ts | trialType、responded、rtMs、interrupted | O=responded/rt/interrupted；R=trialType；D=hit/omission/commission/d-prime | trialType 是 replay/anti-tamper anchor；B 类，HIGH，KEEP |
| cpt 1.0.0 PUBLISHED | cpt/CptTask.tsx · cpt.trial.ts · cpt.v1.ts | blockIndex、stimulus、isTarget、responded、rtMs、interrupted | O=responded/rt/interrupted；R=blockIndex/stimulus/isTarget；D=hit/omission/commission/d-prime/RT slopes | 由 seed/config replay，但 scorer 逐项核对；B 类，HIGH，KEEP |
| nback 1.0.0 PUBLISHED | nback/NbackTask.tsx · nback.trial.ts · nback.v1.ts | blockIndex、nLevel、stimulus、target、responded、rtMs、interrupted | O=responded/rt/interrupted；R=blockIndex/nLevel/stimulus/target；D=d-prime by N/max reliable N/load cost | 多 level/block replay，且为研究高 payload；B 类，HIGH，KEEP |
| corsi 1.0.0 PUBLISHED | corsi/CorsiTask.tsx · corsi.trial.ts · corsi.v1.ts | spanLength、trialWithinLevel、sequence[]、response[]、responseDurationMs、interrupted | O=response/duration/interrupted；R=span/trial/sequence；D=correct/maxSpan/sequence error | 自适应 sequence replay；B 类，HIGH，KEEP |
| sst 1.0.0 PUBLISHED | sst/SstTask.tsx · sst.trial.ts · sst.v1.ts | trialType、goStimulus、response、rtMs、ssdMs、stopSignalPresented、interrupted | O=response/rt/interrupted；R=trialType/goStimulus/SSD state；D=SSRT/pRespondStop/go metrics | SSD adaptive state 不能丢；A+B 类，HIGH，KEEP |
| taskswitch 1.0.0 PUBLISHED | taskswitch/TaskswitchTask.tsx · taskswitch.trial.ts · taskswitch.v1.ts | blockIndex、taskRule、previousTaskRule、switchType、stimulus、response、rtMs、interrupted | O=response/rt/interrupted；R=block/rules/switch type/stimulus；D=switch/mixing costs | sequence/rule replay 与 anti-tamper；B 类，HIGH，KEEP |
| patterncompare 1.0.0 DRAFT | patterncompare/PatterncompareTask.tsx · patterncompare.trial.ts · patterncompare.v1.ts | leftPattern、rightPattern、response、rtMs、interrupted | O=response/rt/interrupted；R=left/right pattern；D=correct per minute/accuracy/lapse | deadline-driven 且呈现图形本身较大；B+D 类，HIGH，先只做 budget guard |
| flanker 1.0.0 DRAFT | flanker/FlankerTask.tsx · flanker.trial.ts · flanker.v1.ts | targetDirection、flankerDirection、response、rtMs、interrupted | O=response/rt/interrupted；R=target/flanker；D=congruence/accuracy/flanker effect | R 可 replay 但用于呈现审计；B 类，MEDIUM-HIGH，KEEP |
| cardsort 1.0.0 DRAFT | cardsort/CardsortTask.tsx · cardsort.trial.ts · cardsort.v1.ts | ruleCue、stimulusColor、stimulusShape、response、rtMs、interrupted | O=response/rt/interrupted；R=rule/cue/stimulus；D=switch cost/perseverative error/recovery | rule 与 stimulus 可 replay，删除会削弱旧版重放；B 类，HIGH，KEEP |
| digitbackward 1.0.0 DRAFT | digitbackward/DigitbackwardTask.tsx · digitbackward.trial.ts · digitbackward.v1.ts | spanLength、trialWithinLevel、sequence[]、response[]、responseDurationMs、interrupted | O=response/duration/interrupted；R=span/trial/sequence；D=correct/maxSpan/sequence distance | 自适应 sequence replay；B 类，HIGH，KEEP |
| picturesequence 1.0.0 DRAFT | picturesequence/PicturesequenceTask.tsx · picturesequence.trial.ts · picturesequence.v1.ts | phase、roundIndex、itemIds[]、responseOrder[]、responseDurationMs、interrupted | O=responseOrder/duration/interrupted；R=phase/round/itemIds/expected order；D=adjacent score/position score/learning/delayed retention | learning/delayed phase 与 asset identity 必须重放；A+B 类，HIGH，KEEP |
| pairedassociate 1.0.0 DRAFT | pairedassociate/PairedassociateTask.tsx · pairedassociate.trial.ts · pairedassociate.v1.ts | phase、roundIndex、responses[{itemId,selectedPosition}]、responseDurationMs、interrupted | O=selectedPosition/duration/interrupted；R=phase/round/itemId set；D=learning slope/criterion/immediate/delayed accuracy | phase/配对集/response mapping 是 replay anchor；A+B 类，HIGH，KEEP |
| matrix 1.0.0 DRAFT | matrix/MatrixTask.tsx · matrix.trial.ts · matrix.v1.ts | itemId、selectedOption、rtMs、interrupted | O=selectedOption/rt/interrupted；R=itemId/frozen item/rule family；D=accuracy/difficulty/RT/omission | item identity 可 replay但需兼容冻结题库；B 类，MEDIUM-HIGH，KEEP |
| mentalrotation 1.0.0 DRAFT | mentalrotation/MentalrotationTask.tsx · mentalrotation.trial.ts · mentalrotation.v1.ts | itemId、response、rtMs、interrupted | O=response/rt/interrupted；R=itemId/frozen angle/stimulus；D=accuracy/angle cost/RT/mirror error | asset/angle replay；B 类，MEDIUM-HIGH，KEEP |
| tower 1.0.0 DRAFT | tower/TowerTask.tsx · tower.trial.ts · tower.v1.ts | problemId、moves[{disk,from,to,atMs}]、gaveUp、interrupted | O=moves/atMs/gaveUp/interrupted；R=problemId/frozen problem constraints；D=minimum-move solve/excess moves/rule violations | variable trace 与最优解 replay；D 类，HIGH，不做语义删除 |
| trailmaking 1.0.0 DRAFT | trailmaking/TrailmakingTask.tsx · trailmaking.trial.ts · trailmaking.v1.ts | attempts[{targetId,atMs,pointerType}]、deviceClass、interrupted | O=attempts/deviceClass/interrupted；R=expected A/B target sequence；D=completion time/errors/set-shift cost | 原始点击轨迹是测量主体；D 类，HIGH，KEEP |
| reversallearning 1.0.0 DRAFT | reversallearning/ReversallearningTask.tsx · reversallearning.trial.ts · reversallearning.v1.ts | choice、rtMs、interrupted | O=choice/rt/interrupted；R=seeded choice/feedback state；D=acquisition/reversal accuracy/cost/perseveration | adaptive feedback sequence 需重放；A+B 类，HIGH，KEEP |
| bart 1.0.0 DRAFT | bart/BartTask.tsx · bart.trial.ts · bart.v1.ts | pumpCount、completed、cashedOut、interrupted | O=pumpCount/completed/cashedOut/interrupted；R=frozen explosion threshold（由 trial index/seed 定位）；D=adjusted pumps/explosions/cashouts | pump trace 的最小事实与爆裂阈值均影响评分；A+D 类，HIGH，KEEP |
| wordlist 1.0.0 DRAFT | wordlist/WordlistTask.tsx · wordlist.trial.ts · wordlist.v1.ts | listId、stimulusSetVersion、可选 phase、responses[]、responseDurationMs、interrupted | O=responses/duration/interrupted；R=listId/stimulusSetVersion/phase/expected list；D=immediate/learning/delayed accuracy/intrusions | list/version 在每 trial 重复；C 类可研究，但历史 asset identity 风险 HIGH，KEEP |
| lexicaldecision 1.0.0 DRAFT | lexicaldecision/LexicaldecisionTask.tsx · lexicaldecision.trial.ts · lexicaldecision.v1.ts | stimulusId、stimulusVersion、lexicality、wordLength、frequencyBand、pseudowordGeneratorVersion、response、rtMs、interrupted | O=response/rt/interrupted；R=stimulus identity/version/lexicality/length/frequency/generator；D=d-prime/lexicality effect/real-pseudo accuracy | identity/version metadata 重复；C+B 类，MEDIUM-HIGH，先保留 |
| emotionrecognition 1.0.0 DRAFT | emotionrecognition/EmotionrecognitionTask.tsx · emotionrecognition.trial.ts · emotionrecognition.v1.ts | stimulusId、stimulusVersion、responseEmotion、rtMs、interrupted | O=responseEmotion/rt/interrupted；R=stimulus identity/version/emotion label set；D=accuracy/balanced accuracy/confusion matrix | stimulus version 可 factor；C+B 类，MEDIUM，需保留旧 asset replay |

### 4.1 fake framework task

fake 不是 24 个真实测量 task。其 schema 只有 correct、rtMs，Runner 为 fake/FakeTask.tsx，scorer 为 scoring/fake.v1.ts。它用于 framework contract/audit smoke coverage，不用于本次真实 task budget 结论；correct 是客户端送入的测试字段，不能被当作真实任务的科学测量事实。

## 5. 计数、配置上限与全局 FINAL 上限

标准与研究 profile 来自 registry-definitions.ts 的 profile patch；seed identity 来自 prisma/seeds/cognitive.ts。标准→研究是当前 Runner 在 profile 正常完成时的 intended trial count，patterncompare 是明确标注的测量场景，不是固定 runtime count。

| task | configVersion / 标准→研究 intended count | task/config 可推导上限 | 当前 FINAL absolute ceiling |
|---|---|---:|---:|
| reaction | 1.1.0 / 20→60 | 无 task total 上限，受全局 1000 | 1000 |
| memory | 1.1.0 / 12→14，2 trials/level | 2 × (maxLength - startLength + 1)，当前最多 20 | 1000 |
| stroop | 1.1.0 / 40→96 | 无 task total 上限，受全局 1000 | 1000 |
| gonogo | 1.0.0 / 120→240 | config totalTrials 最大 400 | 1000 |
| cpt | 1.0.0 / 180→360 | config 最大 480 | 1000 |
| nback | 1.0.0 / 100→360 | 3 levels × 80 trials × 6 blocks = 1440，实际仍受 FINAL 1000 | 1000 |
| corsi | 1.0.0 / 12→14，2 trials/level | 2 × (maxSpan - startSpan + 1)，当前最多 16 | 1000 |
| sst | 1.0.0 / 96→200 | config 最大 320 | 1000 |
| taskswitch | 1.0.0 / 128→256 | config 最大 400 | 1000 |
| patterncompare | 1.0.0 / 60 秒场景→90 秒场景；测量 60→180 envelopes | duration 10–180 秒；没有固定 task count | 1000 |
| flanker | 1.0.0 / 80→160 | config 最大 400 | 1000 |
| cardsort | 1.0.0 / 72→144 | config 最大 400 | 1000 |
| digitbackward | 1.0.0 / 12→14，2 trials/level | 2 × (maxSpan - startSpan + 1)，当前最多 16 | 1000 |
| picturesequence | 1.0.0 / 3→4（learning + optional delayed） | learning 3 + delayed 1，最多 4 | 1000 |
| pairedassociate | 1.0.0 / 3→5（learning + optional delayed） | learning 4 + delayed 1，最多 5 | 1000 |
| matrix | 1.0.0 / 16→24 | itemCount 最大 24 | 1000 |
| mentalrotation | 1.0.0 / 40→80 | itemCount 最大 80 | 1000 |
| tower | 1.0.0 / 10→18 | problemCount 最大 18 | 1000 |
| trailmaking | 1.0.0 / 24→48（A+B target steps） | A 24 + B 24，最多 48 | 1000 |
| reversallearning | 1.0.0 / 120→240（acquisition + reversal） | config 最大 240 | 1000 |
| bart | 1.0.0 / 30→50 | balloonCount 最大 50 | 1000 |
| wordlist | 1.0.0 / 3→6（learning + optional delayed） | learning 5 + delayed 1，最多 6 | 1000 |
| lexicaldecision | 1.0.0 / 100→200 | itemCount 最大 200 | 1000 |
| emotionrecognition | 1.0.0 / 60→120 | itemCount 最大 120 | 1000 |

补充配置身份盘点：

- reaction、memory、stroop 的 seed 中同时存在 1.0 internal-pilot 与 1.1 published；其 scorer/version identity 不可在 cleanup 中合并。
- 固定总数 task 的 config 上限来自对应 config schema；adaptive task 的停止条件由 Runner 与 scorer 共同约束。memory、corsi、digitbackward 在失败 level 后可提前停止，不能简单把 maxTrials 当作必达 count。
- picturesequence、pairedassociate、wordlist 的 phase/learning/delayed 配置决定 envelope 数量；当前标准 seed 未启用 delayed，research profile 启用 delayed。
- patterncompare 以 deadline 驱动；本次 60/180 的 trial 数只用于 byte scenario，不能写回 task contract。
- 当前 finalCognitiveSubmitSchema 与 validateAndNormalizeTrials 对所有 task 的绝对数组上限都是 1000。它是保护性上限，不是每个 task 的科学完成数。

## 6. Payload byte measurement

### 6.1 方法

测量在现有可运行 backend container 内进行，使用编译后的 v2 registry 与 canonicalJsonBytes，只读执行，不安装依赖、不改代码、不写数据库。

对每个 definition：

1. 按对应 trial schema 构造确定性的、field-complete、schema-valid synthetic payload；数组字段填到该 task 的代表性 profile 长度。
2. 生成 v2 envelope，包含 schemaVersion、trialIndex、phase、performance timestamps、duration、flags、qualityEvents 与 payload。
3. 记录单个 payload 的 canonical bytes、单个 envelope 的 canonical bytes，以及 canonical { trials: [...] } 的 FINAL bytes。
4. 标准/研究列使用上表 count；patterncompare 使用 60/180 trial 的显式场景。样本不含真实参与者数据。

因此：

- payloadBytes 是一个已 parse 的 task payload 大小；
- envelopeBytes 是 payload 加 v2 envelope wrapper 的大小；
- finalBytes 对齐 unified-final-submit.service 的 scoring payload size guard 形态；
- finalBytes 不包含 URL 中的 sessionId、route-specific fixed request fields、recoveryToken，也不包含可选的 session-level administrationProvenance。这些固定字段不会改变 task-by-task 相对排序，但应在后续 request-level budget 中另行测量；
- 这是 field-complete synthetic upper-ish scenario，不是压缩承诺，也不是对所有随机 stimulus 的数学最大值。可变 trace 与字符串长度仍需在 3.2 设计中保守设限。

### 6.2 结果（canonical JSON bytes）

| task | 单 payload | 单 envelope | 标准 FINAL | 研究 FINAL |
|---|---:|---:|---:|---:|
| reaction 1.1 | 93 | 273 | 5,608 | 16,868 |
| memory 1.1 | 117 | 297 | 3,768 | 4,426 |
| stroop 1.1 | 79 | 259 | 10,668 | 25,712 |
| gonogo | 70 | 250 | 30,748 | 61,708 |
| cpt | 95 | 275 | 51,412 | 103,036 |
| nback | 104 | 284 | 29,288 | 105,988 |
| corsi | 121 | 301 | 3,816 | 4,482 |
| sst | 127 | 307 | 30,392 | 63,538 |
| taskswitch | 143 | 323 | 43,556 | 87,332 |
| patterncompare（60/180 场景） | 193 | 373 | 22,868 | 68,908 |
| flanker | 101 | 281 | 23,208 | 46,588 |
| cardsort | 115 | 295 | 21,848 | 43,852 |
| digitbackward | 117 | 297 | 3,768 | 4,426 |
| picturesequence | 375 / 441 | 559 / 625 | 1,700 | 2,526 |
| pairedassociate | 599 / 851 | 783 / 1,035 | 2,372 | 5,206 |
| matrix | 72 | 252 | 4,148 | 6,228 |
| mentalrotation | 74 | 254 | 10,468 | 21,008 |
| tower | 455 / 770 | 635 / 950 | 6,418 | 17,232 |
| trailmaking | 1,354 / 2,674 | 1,534 / 2,854 | 36,996 | 137,364 |
| reversallearning | 48 | 228 | 28,468 | 57,148 |
| bart | 69 | 249 | 7,698 | 12,838 |
| wordlist | 237 / 261 | 421 / 445 | 1,286 | 2,708 |
| lexicaldecision | 242 | 422 | 43,088 | 86,388 |
| emotionrecognition | 146 | 326 | 20,048 | 40,228 |

注意：picturesequence、pairedassociate、tower 的两种单 payload/envelope 数值分别对应标准/研究样本中的不同数组或 item size；其他 task 的单 trial 大小在本测量场景中保持不变。

### 6.3 Largest payloads

- 标准场景最大：cpt 51,412 bytes；taskswitch 43,556；lexicaldecision 43,088
- 研究场景最大：nback 105,988 bytes；cpt 103,036；taskswitch 87,332；lexicaldecision 86,388
- 本次 24 个代表性研究场景均低于 FINAL_SUBMISSION_MAX_BYTES.cognitive = 1536 × 1024 = 1,572,864 bytes
- 这不证明 global 1000 trials 或任意大字符串/variable trace 一定低于 byte cap；当前没有实现 cleanup，也没有把代表性样本当作安全上限

## 7. Cleanup classes 与逐项风险结论

| class | 含义 | 典型字段/任务 | 风险 |
|---|---|---|---|
| A KEEP-OBSERVED | 用户原始行为、响应时间、设备/轨迹事实 | 所有 task 的 response/RT/interrupt；trailmaking attempts；tower moves；bart pumpCount | HIGH：删除会改变 measurement |
| B REPLAY-DUPLICATE | 可由 seed/config/definition replay 的呈现或条件字段 | cpt、gonogo、stroop、flanker、cardsort、taskswitch、nback 的 condition/stimulus；adaptive sequence | MEDIUM-HIGH 到 HIGH：当前 scorer、anti-tamper、历史重放依赖 |
| C IDENTITY-REPEAT | 每个 trial 重复发送的 list/asset/version/generator identity | wordlist list/version、lexical stimulus/version/generator、emotion stimulus/version | MEDIUM-HIGH：可考虑 envelope/session factor，但必须保留旧版本 replay |
| D VARIABLE-TRACE | 变长数组或 deadline/interaction trace | trailmaking attempts、tower moves、wordlist responses、paired responses、patterncompare count | HIGH：先做 max/byte guard，不做语义删除 |
| E SERVER-DERIVED | 应只存在于 scorer/result/report | correct、accuracy、RT summary、effect、slope、d-prime、confusion matrix、research-only metrics | 当前无 raw cleanup；应继续保持在 server result |

逐项结论：

- 24 个真实 task 均至少包含 A 类或必须保留的 replay anchor；因此 `Immediate safe semantic cleanup candidates = 0`。
- B/C 类 replay-duplicate / identity-repeat candidates exist，但在没有 exact-replay proof 的情况下，没有任何候选足以支持 semantic deletion；因此 `safe immediate deletion = 0`，而 `potential future factorization candidates != 0`。
- B 类覆盖 reaction、memory、stroop、gonogo、cpt、nback、corsi、sst、taskswitch、patterncompare、flanker、cardsort、digitbackward、picturesequence、pairedassociate、matrix、mentalrotation、reversallearning；它们的候选字段不能在没有 historical exact-replay fixtures 的情况下删除。
- C 类覆盖 wordlist、lexicaldecision、emotionrecognition；候选方向是把稳定 identity 从每个 trial 提升为 session/phase-level context，而不是丢掉 identity。
- D 类覆盖 patterncompare、tower、trailmaking、wordlist、pairedassociate，以及带 sequence/response arrays 的 memory/corsi/digitbackward；后续应先测 request-level byte worst case 和 early rejection。
- 高风险 exact-replay/adaptive task：cpt、nback、sst、taskswitch、memory、corsi、digitbackward、picturesequence、pairedassociate、reversallearning、tower、bart。3.3–3.5 应最后处理这些任务，或明确 KEEP。
- 所有 report 中的 research-only metrics（例如 cpt block slope、nback load cost、taskswitch mixing cost、wordlist recallByRound、lexical frequency-band accuracy、emotion confusionMatrix、corsi sequenceErrorDistance）都是 scorer/report 输出，不是当前 trial payload cleanup 候选。

## 8. Scorer 与 report metric inventory

下表记录当前默认 definition 的 primary/detail/research-only 输出；它们是 D 类 server-derived facts。references=[] 不影响这些 scorer metric 的存在。

| task | primary metrics | detail / research-only metrics |
|---|---|---|
| reaction | medianRtMs、rtICV、missRate | mean/sd/fastest RT、prematureCount、validTrialCount |
| memory | maxSpan、totalCorrectTrials | interruptedCount、perseverativeTrialCount、levelsPassed、firstTryPassCount、medianResponseDurationMs、trialCount |
| stroop | stroopEffectMs、errorCost、incongruentAccuracy | accuracy、congruentAccuracy、median congruent/incongruent RT、timeoutCount |
| gonogo | commissionRate、dPrime | goMedianRtMs、hitRate、omissionRate、commissionErrors |
| cpt | dPrime、omissionRate、commissionRate、rtICV | hitMedianRtMs、hitRtSdMs、perseverationRate；research：blockSlopeRt/blockSlopeOmission |
| nback | dPrimeByN、maxReliableN | hitRateByN、falseAlarmRateByN、medianRtByN、loadCostDPrime |
| corsi | maxSpan、totalCorrectTrials | firstTryPassCount、medianResponseDurationMs；research：sequenceErrorDistance |
| sst | ssrtMs、pRespondStop | goMedianRtMs、goOmissionRate、goChoiceErrorRate、meanSsdMs、unsuccessfulStopRtMs |
| taskswitch | switchCostRtMs、switchCostAccuracy | median/accuracy switch/repeat；research：mixingCost |
| patterncompare | correctPerMinute、accuracy、medianCorrectRtMs | lapseRate、correctCount、completedTrialCount |
| flanker | flankerEffectMs、incongruentAccuracy、congruentAccuracy、errorCost | accuracy、median congruent/incongruent RT、omissionRate |
| cardsort | switchCostRtMs、switchCostAccuracy、perseverativeErrorRate、postSwitchRecovery | accuracy/median RT switch/repeat、overallAccuracy |
| digitbackward | maxSpan、totalCorrectTrials | sequenceDistance、medianResponseDurationMs、completedLevelCount |
| picturesequence | adjacentPairScore、positionScore、learningGain、delayedRetention | adjacentPairScoreByRound、positionScoreByRound |
| pairedassociate | correctByTrial、learningSlope、trialsToCriterion、immediateAccuracy、delayedAccuracy | 无额外 detail metric |
| matrix | accuracy、accuracyByRuleFamily | reachedDifficulty、medianRtMs、omissionRate |
| mentalrotation | accuracy、angleCost、medianCorrectRtMs | mirrorErrorRate、omissionRate |
| tower | minimumMoveSolveRate、excessMoves、ruleViolations | solveRate、firstMoveLatencyMs、noAttemptRate |
| trailmaking | completionTimeMs、errorCount、setShiftCostMs | A/B completion time、meanCorrectStepTimeMs、completedStepCount、errorRate、omissionRate |
| reversallearning | acquisitionAccuracy、reversalAccuracy、reversalCost、perseverativeErrorCount | acquisition/reversal criterion trials、feedbackWinRate、omissionRate、medianRtMs、validResponseCount |
| bart | adjustedPumps、explosionCount、cashoutCount | meanPumpsAllCompleted、cashoutRate、completedBalloonCount、omissionRate |
| wordlist | immediateAccuracy、learningGain、delayedRecallAccuracy | totalImmediateCorrect、intrusionCount、duplicateResponseCount、omissionRate、medianResponseDurationMs；research：recallByRound |
| lexicaldecision | dPrime、lexicalityEffectMs、accuracyReal、accuracyPseudo | medianRtReal/Pseudo、omissionRate、validResponseCount；research：accuracyByFrequencyBand |
| emotionrecognition | accuracy、balancedAccuracy | medianRtMs、omissionRate、validResponseCount；research：accuracyByEmotion/confusionMatrix |

## 9. 3.2 Bounded FINAL Admission 的设计边界

3.2 已按“按 exact definition 与 validated frozen config 计算 maxTrials”的 contract 落地，而不是把所有 task 继续视为同一种固定 count：

1. 保留当前 1000 作为 absolute safety ceiling，并在 deep parse、canonicalization、加密和 scorer 前做廉价的 array-length/phase/variable-trace guard。
2. 对 fixed-count task 从 frozen config 取得 exact/maximum count；对 memory、corsi、digitbackward 使用 adaptive level formula；对 picturesequence、pairedassociate、wordlist 使用 phase-aware upper bound；对 patterncompare 使用 duration 与最大可接受 trial guard。
3. 任何 per-task max 必须绑定 definitionHash、configVersion、engineVersion、scoringVersion 与 profile，不能把新版本规则 retroactively 应用于历史 submission。
4. 先加拒绝路径与 exact replay fixtures，再讨论 B/C 类重复字段是否可从 trial envelope factor 到 session/phase context。原始 O 类、variable trace 与 adaptive state 不应因省字节而删除。
5. 本 Commit 保持既有 canonical byte guard、provenance/replay hash 分支和 request 固定字段不变；新增测试覆盖 1000-array count rejection 与现有 Cognitive byte budget 守护。代表性 measurement 不被当作 per-task byte ceiling。

运行时使用 `finalSubmission.maxTrials(config)`；profile 不成为额外 runtime identity，因为 profile patch 已经进入 frozen config。本 Commit 不新增 DB 字段、profile max table、第二 registry、配置文件、schema、scorer 或 per-task byte ceiling。

推荐优先级：

3.2  per-task count/byte guard
  ├─ 3.3 低风险 identity/context factorization（先有 historical replay fixtures）
  ├─ 3.4 server-derived/raw boundary cleanup
  └─ 3.5 report/reference/Bundle consumer audit 后的 metric payload cleanup
       └─ 3.6/3.7 再做高风险 adaptive/exact-replay 与全面验证

### 9.1 本 Commit 已实现的 admission contract

- `TaskDefinition<TConfig, TTrial>` 增加纯函数 `finalSubmission.maxTrials(config)`；v2 registry 为现有 24 个真实 task 和 fake framework task 适配 version-scoped resolver。
- fixed-count 使用冻结配置的 resolved `trialCount` / `totalTrials` / `itemCount` / `problemCount` / `balloonCount`；memory、corsi、digitbackward 使用 `trialsPerLevel × reachable levels`；picturesequence、pairedassociate、wordlist 使用 learning maximum 加 optional delayed maximum。
- patterncompare 没有 protocol-defined count，保持 `1000` global fallback；不是根据“正常答题速度”猜上限。
- `COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS = 1000` 仍是最后安全上限。派生值超过 1000 的科学配置在 `createSessionConfigSnapshot` freeze gate 以 400 拒绝，不用 `Math.min` 静默截断；当前有效 N-back research profile 为 360，合法 oversized fixture（80×5×3）为 1200 并在 freeze 阶段拒绝。3.1 记录的 N-back schema theoretical maximum 1440 保持不变。
- unified `prepareRuntime` 从已加载 snapshot/config 解析 exact definition，先做 O(1) `input.trials.length` rejection，再进入 per-trial Zod parse、canonicalization、hash、byte guard 和 scorer；无新增 DB query、async 或 persistence path。
- 超限沿用 `InstrumentFinalSubmitError` 的 `SUBMISSION_PAYLOAD_CONFLICT / 400` family，消息包含 `submitted trial count exceeds frozen task limit`。认证与 public recovery 入口均复用 unified service。
- variable trace 的既有 schema/config bounds 保持不变；本 Commit 不删除 replay/identity 字段，不做 B/C factorization，不做语义 cleanup。
- canonical payload/hash、submissionId/replay semantics、scorer、report、Reference、Bundle、COS、frontend 和 PR #54 均未改变；compiled runtime hash 也未因 admission contract 改变。

历史兼容性只读检查：本地 Postgres 中 16 条已完成 `CognitiveRawSubmission` 全部按新 definition/frozen config 成功解析，`trialCount > newly-derived max` 为 0。

## 10. 本 Commit 的变更范围

- 修改：server-version/docs/cognitive-scoring-plane-budget-v1.md；v2 TaskDefinition/types、registry/publication gate、session snapshot freeze、trial normalizer、unified FINAL prepareRuntime
- 新增测试：server-version/backend/src/__tests__/cognitive/final-submission-budget.test.ts；扩展 instrument-final PostgreSQL integration 与 v2 contract fixture
- 未修改：production Runner、CognitiveTaskProps、useCognitiveSession、FINAL API/schema、trial envelope、compiled/frozen config shape、scorer、DB、canonical hash、COS、Reference、Bundle、PR #54 相关优化
- 未执行：3.3+ cleanup/factorization、schema cleanup、scorer cleanup、数据库迁移、K6/capacity/load test、PR #67 merge/Ready for Review

## 11. 验证与 review gate

- backend TypeScript build：PASS
- FINAL budget resolver + v2 contract/registry/draft tests：39/39 PASS；published golden：10/10 PASS
- instrument-final PostgreSQL integration：12/12 PASS（认证/public over-limit、无 raw/trial 写入、replay/idempotency）
- broader cognitive focused run：56 test files PASS、1 skipped；唯一剩余失败是 Windows working-tree CRLF 与既有 source-inspection 测试 LF 字面量断言不一致，非行为回归
- cognitive:audit：PASS；registry/scorer coverage 28/28，issues=[]
- historical compatibility：16/16 completed raw submissions checked，over-derived-max=0
- synthetic schema parse + canonical byte measurement：24 个真实 task，标准/研究代表性场景；原始 measured bytes 未修改
- git diff --check：通过
- PR 状态：保持 Draft
- 3.1：✅
- 3.2：✅
- 3.3+：NOT STARTED

STOPPED — waiting for review
