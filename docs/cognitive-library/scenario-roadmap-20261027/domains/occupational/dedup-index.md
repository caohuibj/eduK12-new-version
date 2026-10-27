# 职业信息采样：固定基线去重索引

基线a0130ea6603d7e37fd4f900d8694b5b7d490c51e；2026-10-27静态源码核验。此索引不把历史PASS当当前验收，不授权开发其他任务。

## 24旧项目：实际代码去重

从固定认知提交读取generated/catalog.ts列出的24项目；每项读取semantics.ts中的协议/指标及前端实际交互路径（下表截取blob前12位便于阅读，可由固定提交精确解析），未把fake夹具计数。该深度用于辨别任务家族与交互，不是完整功能/科学审计。未看到完整IST、两阶段知觉信心、时间选择或单方/互惠分配已实现；邻近任务按下列代码区别，不因名称相近重复开发。

| 稳定项目 | 源码任务/指标观察 | 已读证据路径及blob |
| --- | --- | --- |
| reaction | 刺激后首反应；medianRtMs, rtICV, missRate | `server-version/backend/src/modules/cognitive/tasks/reaction/semantics.ts` `cd87641dc127`；`ReactionFrameTask.tsx` `a8bac2e39835` |
| memory | 顺序数字广度；maxSpan, levelsPassed, firstTryPassCount | `server-version/backend/src/modules/cognitive/tasks/memory/semantics.ts` `877d816c030c`；`MemoryTask.tsx` `318b6c89ecaf` |
| stroop | 字色冲突；stroopEffectMs, errorCost, incongruentAccuracy | `server-version/backend/src/modules/cognitive/tasks/stroop/semantics.ts` `a4c0fe38dda9`；`StroopTask.tsx` `2de896bad159` |
| gonogo | Go/No-Go；commissionRate, dPrime, goMedianRtMs | `server-version/backend/src/modules/cognitive/tasks/gonogo/semantics.ts` `e359344f807a`；`GonogoFrameTask.tsx` `b4a692e931fd` |
| cpt | X目标持续作业；dPrime, omissionRate, commissionRate | `server-version/backend/src/modules/cognitive/tasks/cpt/semantics.ts` `d11fd9082006`；`CptFrameTask.tsx` `5eab10db1dd3` |
| nback | N-back匹配；dPrimeByN, maxReliableN, hitRateByN | `server-version/backend/src/modules/cognitive/tasks/nback/semantics.ts` `35e0a0638b5f`；`NbackTask.tsx` `78b51a348f59` |
| corsi | 空间序列广度；maxSpan, totalCorrectTrials, firstTryPassCount | `server-version/backend/src/modules/cognitive/tasks/corsi/semantics.ts` `1884d454cd27`；`CorsiTask.tsx` `e6fa2f235456` |
| sst | 停止信号；ssrtMs, pRespondStop, goMedianRtMs | `server-version/backend/src/modules/cognitive/tasks/sst/semantics.ts` `47f001ca10ca`；`SstTask.tsx` `27f9f7ae9b29` |
| taskswitch | 奇偶/大小规则切换；switchCostRtMs, switchCostAccuracy, medianRtSwitch | `server-version/backend/src/modules/cognitive/tasks/taskswitch/semantics.ts` `5bbde5520eba`；`TaskswitchTask.tsx` `a4ddc98e7cd0` |
| patterncompare | 图形同异；correctPerMinute, accuracy, medianCorrectRtMs | `server-version/backend/src/modules/cognitive/tasks/patterncompare/semantics.ts` `a7e140e6d618`；`PatterncompareTask.tsx` `f0033ffaee4d` |
| flanker | 中央箭头侧翼冲突；flankerEffectMs, incongruentAccuracy, congruentAccuracy | `server-version/backend/src/modules/cognitive/tasks/flanker/semantics.ts` `94f16f5928ab`；`FlankerTask.tsx` `733649ae65b0` |
| cardsort | 颜色/形状分类；switchCostRtMs, switchCostAccuracy, perseverativeErrorRate | `server-version/backend/src/modules/cognitive/tasks/cardsort/semantics.ts` `24822baef9ff`；`CardsortTask.tsx` `d72617fb7a73` |
| digitbackward | 数字倒背；maxSpan, totalCorrectTrials, sequenceDistance | `server-version/backend/src/modules/cognitive/tasks/digitbackward/semantics.ts` `35b252f9b55b`；`DigitbackwardTask.tsx` `e8d480138934` |
| picturesequence | 图像顺序重建；adjacentPairScore, positionScore, learningGain | `server-version/backend/src/modules/cognitive/tasks/picturesequence/semantics.ts` `ba9b47529c60`；`PicturesequenceTask.tsx` `28e9d855000e` |
| pairedassociate | 图形位置联结；correctByTrial, learningSlope, trialsToCriterion | `server-version/backend/src/modules/cognitive/tasks/pairedassociate/semantics.ts` `84dfb5c45cde`；`PairedassociateTask.tsx` `3759019e4fd5` |
| matrix | 矩阵规则推理；accuracy, accuracyByRuleFamily, reachedDifficulty | `server-version/backend/src/modules/cognitive/tasks/matrix/semantics.ts` `4f857c3895a7`；`MatrixTask.tsx` `4f83306216db` |
| mentalrotation | 角度/镜像判断；accuracy, angleCost, medianCorrectRtMs | `server-version/backend/src/modules/cognitive/tasks/mentalrotation/semantics.ts` `327a2d6b8a35`；`MentalrotationTask.tsx` `9dbe1406e708` |
| tower | 塔式规划；minimumMoveSolveRate, excessMoves, solveRate | `server-version/backend/src/modules/cognitive/tasks/tower/semantics.ts` `9892d03003aa`；`TowerTask.tsx` `c3b200c56197` |
| trailmaking | 数字/字母连线；completionTimeMs, errorCount, setShiftCostMs | `server-version/backend/src/modules/cognitive/tasks/trailmaking/semantics.ts` `6efb2e0bc740`；`TrailmakingTask.tsx` `7128ab2edb84` |
| reversallearning | 固定习得/反转阶段反馈；acquisitionAccuracy, reversalAccuracy, reversalCost | `server-version/backend/src/modules/cognitive/tasks/reversallearning/semantics.ts` `c99d6ee309ca`；`ReversallearningTask.tsx` `63975a993606` |
| bart | 泵压、爆破与兑现；adjustedPumps, explosionCount, cashoutCount | `server-version/backend/src/modules/cognitive/tasks/bart/semantics.ts` `06e99fe795e5`；`BartTask.tsx` `462a35b5e031` |
| wordlist | 词表学习/回忆；immediateAccuracy, learningGain, delayedRecallAccuracy | `server-version/backend/src/modules/cognitive/tasks/wordlist/semantics.ts` `365fc067bbd4`；`WordlistTask.tsx` `e10eabb17a52` |
| lexicaldecision | 词/伪词分类；dPrime, lexicalityEffectMs, accuracyReal | `server-version/backend/src/modules/cognitive/tasks/lexicaldecision/semantics.ts` `e39c13bbf135`；`LexicaldecisionTask.tsx` `fc1f3f335df5` |
| emotionrecognition | 六类情绪面孔分类；accuracy, balancedAccuracy, accuracyByEmotion | `server-version/backend/src/modules/cognitive/tasks/emotionrecognition/semantics.ts` `52ac3ae5e051`；`EmotionrecognitionTask.tsx` `48c023ff8163` |

BART泵压/爆破不同于努力执行和时间等待；反转学习记录习得/反转反馈，不是主动揭25格后判断；情绪识别只是分类，不等同资源分配/信任。patterncompare是直接同异，不含判断后信心。其余记忆/推理/注意项目只跨引用；不为职业场景另复制runner。

## 11已有研发候选：实际内容协议存在

以下只按任务项目计数，不按profile/历史版本计数；全部是已有候选，不是本轮新增。内容代码存在不等于当前产品接入、已发布或重新验收成功。协议目录为`server-version/backend/src/modules/cognitive/content-candidates/<项目>/protocol.ts`。

| 项目 | 当前代码research/experience | 去重/状态观察 | protocol blob |
| --- | --- | --- | --- |
| mot | 45/9 | 动态追踪；暂停WIP不动 | `32987c9be7e7dadba6203f2553698ca5af975a75` |
| enumeration | 100/25 | 短时点数判断 | `705f5d36c2b5d221d1098ecc3aaefd5a38200350` |
| continuous-recognition | 见冻结协议，不重定次数 | 连续再认，素材边界保留 | `fc64e6933c74ac7056943f4aa37a590584bf177e` |
| ant | 288/48 | 线索×侧翼；暂停WIP不动 | `d829e002ee9beb635d0ca60ac45e0c6b9ce059e1` |
| precision-working-memory | 400/40 | 颜色提示空间位置再现 | `3fae7ed35f7671f02ec35a0ec17e1631d85a35b9` |
| balloon-effort | 72/18 | 努力×收益×概率；直接复用 | `281f01035ecf3417471be69e3e40141c3568666f` |
| gradcpt | 300/100 | 源码短版100，不能沿旧Notion150草案 | `1d5cc5a48ba12f46320e5a3e7f2be592ad559dbf` |
| attentional-blink | 200/50 | 快速流双目标 | `9ac92177804e3ce2e8f2590057f0c8371b36e472` |
| visual-search | 180/36 | 先搜索后定位 | `11780dfe9a73fe587bfe9128975536144bd9cbe7` |
| dual-arrow | 300/60 | 单双通道同时反应 | `c58c2645f177c72cbd6811fd5bee6f8857a81ecf` |
| horizon-exploration | 320/40 | 强制4次后自由1/6；直接复用 | `24e555335cef0e4b53c390a541da7893d561e49b` |

Horizon/气球努力相关protocol与README直接定向审读；其他候选读协议定义/参数和既有候选说明，不在这里重审所有状态机或授权它们。现有ANT旧README顶部仍有早期“未开发”描述，而实际protocol/scorer/candidate已存在，当前登记以实际代码＋后续交接为准；不据旧文字把它再当新开发。心与花原owner归属保留，SART/PVT跨领域引用，不写其内容。
