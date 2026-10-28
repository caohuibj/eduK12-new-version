/**
 * COG-P1 Commit 4（review 修订后）— Dual Contract Inventory。
 *
 * 规则（Pilot-first v2 指令 §11 + PR #60 review Fix 2/3/4）：
 *  - 本文件只做逐 task 的两类数据 contract 声明/盘点，不修改 trial payload、scorer、
 *    DB schema，不新增 FINAL payload，不增加在线 CPU。
 *  - referenceEligible **只从 authoritative v2 TaskDefinition 派生**
 *    （metrics[key].referenceEligible，v2/registry.ts:61 计算、publication gate 消费）；
 *    本文件不再人工维护第二份 eligibility truth。
 *  - headline / primary / secondary / quality 从 cognitive.registry 派生；
 *    bundleEligible 只能由 evidence-mapping.registry 派生。
 *  - raw facts 按 boundary 分三类（Fix 3）：
 *      clientObservedFacts       客户端真正必须记录、无法由 frozen runtime 重建
 *      runtimeReconstructableFacts 可由 randomSeed/frozen config/protocol 重建
 *      serverDerivedFacts        必须由 authoritative scorer 推导，永不为客户端真值
 *    P1 只做分类，不删除字段；实际瘦身在 COG-P3。
 *  - research capture 区分 current/future（Fix 4）：
 *      currentlyAvailableFacts   当前 raw payload / envelope / frozen runtime 已能获得
 *      futureCaptureFacts        当前未可靠记录、未来科研值得新增（COG-P2/P5 最小必要）
 *  - Research Capture 建议仅用于 COG-P2/P3/P5 的权威实施清单；
 *    当前系统只采集/归档，不做在线分析。
 */

import {
  listCatalogTestTypes,
  requireCatalogForIdentity,
} from './catalog'
import { listCognitiveEvidenceMappingsForTask } from '../../cognitive-analysis/evidence-mapping.registry'
import { getCognitiveV2TaskDefinition } from '../v2/registry'

export interface CognitiveScoringContractDeclaration {
  testType: string
  /** 客户端真正必须记录的行为事实（不能由 frozen runtime 重建）。 */
  clientObservedFacts: string[]
  /** 可由 randomSeed / frozen config / trialIndex / stimulusSetVersion / protocol 重建的事实。 */
  runtimeReconstructableFacts: string[]
  /** 必须由 authoritative scorer 推导的事实（correctness/quality/score 等）。 */
  serverDerivedFacts: string[]
}

export interface CognitiveResearchCaptureDeclaration {
  testType: string
  /** 当前 raw payload / envelope / frozen runtime 已能获得的事实。 */
  currentlyAvailableFacts: string[]
  /** 当前未可靠记录、未来科研值得新增的采集（COG-P2/P5 按最小必要原则）。 */
  futureCaptureFacts: string[]
}

const SCORING_DECLARATIONS: Record<string, CognitiveScoringContractDeclaration> = {
  reaction: {
    testType: 'reaction',
    clientObservedFacts: ['raw rtMs', '响应有无（按/未按）', 'inputMode（自报，COG-P2 前为粗粒度）', 'interrupted'],
    runtimeReconstructableFacts: ['foreperiodMs（seed/config 可权威重建）'],
    serverDerivedFacts: ['premature/timeout 分类', 'valid/invalid RT 判定', 'metrics（medianRtMs/rtICV 等）', 'quality flags'],
  },
  memory: {
    testType: 'memory',
    clientObservedFacts: ['逐级键入的作答序列', 'interrupted'],
    runtimeReconstructableFacts: ['逐级呈现数字序列（seed/config）'],
    serverDerivedFacts: ['层级通过/终止判定', 'metrics（maxSpan/totalCorrectTrials 等）', 'quality flags'],
  },
  stroop: {
    testType: 'stroop',
    clientObservedFacts: ['颜色选择响应', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['逐试次 congruent/incongruent 条件', '色词刺激映射（seed）', '正确应答（冻结刺激决定）'],
    serverDerivedFacts: ['correct/incorrect 判定', '条件 RT/accuracy', 'stroopEffectMs', 'quality flags'],
  },
  gonogo: {
    testType: 'gonogo',
    clientObservedFacts: ['按压与否（响应有无）', 'go raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['go/nogo 条件序列（seed/config）'],
    serverDerivedFacts: ['hit/omission/commission 判定', 'metrics（commissionRate/dPrime 等）', 'quality flags'],
  },
  cpt: {
    testType: 'cpt',
    clientObservedFacts: ['响应有无', 'hit raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['target/nontarget 条件与 block 结构（seed/config）'],
    serverDerivedFacts: ['hit/false alarm/omission 判定', 'metrics（dPrime/omissionRate/rtICV 等）', 'quality flags'],
  },
  nback: {
    testType: 'nback',
    clientObservedFacts: ['匹配按键响应', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['N 水平与 target/nontarget 序列（seed/config）'],
    serverDerivedFacts: ['按 N 命中/误报判定', 'metrics（dPrimeByN/maxReliableN 等）', 'quality flags'],
  },
  corsi: {
    testType: 'corsi',
    clientObservedFacts: ['点击的方块序列', 'interrupted'],
    runtimeReconstructableFacts: ['呈现方块序列（seed）', 'span 层级结构'],
    serverDerivedFacts: ['序列正误判定', 'metrics（maxSpan/totalCorrectTrials 等）', 'quality flags'],
  },
  sst: {
    testType: 'sst',
    clientObservedFacts: ['go 响应与 raw RT', 'stop 试次响应有无', 'interrupted'],
    runtimeReconstructableFacts: ['go/stop 条件与 SSD 阶梯（冻结 staircase 规则重建）'],
    serverDerivedFacts: ['stop 成功/失败判定', 'SSRT 估计', 'quality flags'],
  },
  taskswitch: {
    testType: 'taskswitch',
    clientObservedFacts: ['方向/规则响应', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['cue/规则与 switch/repeat 条件序列（seed/config）'],
    serverDerivedFacts: ['正确性判定', 'switch cost 计算', 'quality flags'],
  },
  patterncompare: {
    testType: 'patterncompare',
    clientObservedFacts: ['same/different 选择', 'raw RT / lapse（未响应）', 'interrupted'],
    runtimeReconstructableFacts: ['刺激对身份与正确应答（seed 生成器）'],
    serverDerivedFacts: ['正确性判定', 'metrics（correctPerMinute/accuracy 等）', 'quality flags'],
  },
  flanker: {
    testType: 'flanker',
    clientObservedFacts: ['方向响应', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['congruent/incongruent 条件序列与正确方向（seed）'],
    serverDerivedFacts: ['正确性判定', 'metrics（flankerEffectMs 等）', 'quality flags'],
  },
  cardsort: {
    testType: 'cardsort',
    clientObservedFacts: ['分类选择（实际按下的规则键）', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['冻结规则序（config）'],
    serverDerivedFacts: ['规则转换点与 switch/repeat 分类', '持续性错误推导', 'metrics/quality'],
  },
  digitbackward: {
    testType: 'digitbackward',
    clientObservedFacts: ['倒序键入序列', 'interrupted'],
    runtimeReconstructableFacts: ['呈现数字序列（seed）'],
    serverDerivedFacts: ['序列正误与层级判定', 'metrics（maxSpan/sequenceDistance 等）', 'quality flags'],
  },
  picturesequence: {
    testType: 'picturesequence',
    clientObservedFacts: ['逐轮排序提交（实际顺序）', '延迟阶段是否完成', 'interrupted'],
    runtimeReconstructableFacts: ['项目集身份与目标顺序（seed）'],
    serverDerivedFacts: ['相邻对/位置得分计算', 'learningGain', 'quality flags'],
  },
  pairedassociate: {
    testType: 'pairedassociate',
    clientObservedFacts: ['每对选择的位置', 'interrupted'],
    runtimeReconstructableFacts: ['配对-位置真值与呈现轮次（seed/config）'],
    serverDerivedFacts: ['对错判定', 'metrics（learningSlope/trialsToCriterion 等）', 'quality flags'],
  },
  matrix: {
    testType: 'matrix',
    clientObservedFacts: ['所选选项', '作答时长（不限时）', 'interrupted'],
    runtimeReconstructableFacts: ['题目身份/规则族/难度与唯一正确选项（生成器 seed）'],
    serverDerivedFacts: ['正确性判定', 'metrics（accuracy/accuracyByRuleFamily 等）', 'quality flags'],
  },
  mentalrotation: {
    testType: 'mentalrotation',
    clientObservedFacts: ['same/mirror 响应', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['角度条件与刺激真值（seed）'],
    serverDerivedFacts: ['正确性判定', 'metrics（angleCost/accuracy 等）', 'quality flags'],
  },
  tower: {
    testType: 'tower',
    clientObservedFacts: ['逐步移动序列', '首步前时延', 'interrupted'],
    runtimeReconstructableFacts: ['题目初始/目标布局与最短步数（solver + seed）'],
    serverDerivedFacts: ['规则违反判定', 'metrics（excessMoves/minimumMoveSolveRate 等）', 'quality flags'],
  },
  trailmaking: {
    testType: 'trailmaking',
    clientObservedFacts: ['逐步点击的目标与顺序（含错误尝试）', '逐步时间戳', 'pointerType/deviceClass（自报）', 'interrupted'],
    runtimeReconstructableFacts: ['目标序列布局（seed）'],
    serverDerivedFacts: ['步骤正误判定', 'metrics（completionTimeMs/setShiftCostMs 等）', 'quality flags'],
  },
  reversallearning: {
    testType: 'reversallearning',
    clientObservedFacts: ['每试次二选一选择', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['reward roll 序列（replay contract，冻结概率不下发）', '阶段结构'],
    serverDerivedFacts: ['win/loss 反馈结果', '阶段正确率与 criterion 判定', 'metrics/quality'],
  },
  bart: {
    testType: 'bart',
    clientObservedFacts: ['逐次泵压行为', 'cashout 时机', 'interrupted'],
    runtimeReconstructableFacts: ['冻结爆破阈值（服务端持有，未下发）'],
    serverDerivedFacts: ['explosion/cashout 结果判定', 'metrics（adjustedPumps 等）', 'quality flags'],
  },
  wordlist: {
    testType: 'wordlist',
    clientObservedFacts: ['键入的回忆内容', '作答时序', 'interrupted'],
    runtimeReconstructableFacts: ['词表身份与目标词序（冻结词库 + seed）'],
    serverDerivedFacts: ['归一化匹配/侵入/重复判定', 'metrics（immediateAccuracy/learningGain 等）', 'quality flags'],
  },
  lexicaldecision: {
    testType: 'lexicaldecision',
    clientObservedFacts: ['word/nonword 响应', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['词/伪词身份与词频带（冻结词库 + seed）', '正确应答'],
    serverDerivedFacts: ['正确性判定', 'metrics（dPrime/lexicalityEffectMs 等）', 'quality flags'],
  },
  emotionrecognition: {
    testType: 'emotionrecognition',
    clientObservedFacts: ['所选情绪', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['面孔身份与目标情绪（合成集 + seed）', '正确应答'],
    serverDerivedFacts: ['正确性判定', 'metrics（balancedAccuracy/confusionMatrix）', 'quality flags'],
  },
  numberline: {
    testType: 'numberline',
    clientObservedFacts: ['线上点击位置比例（responsePosition）', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['逐试次目标数（seed/config 分层序列）', '数字线端点（frozen config）'],
    serverDerivedFacts: ['估计值/绝对误差/符号误差换算', 'metrics（paePercent/biasPercent/withinTenRate）', 'quality flags'],
  },
  arithverify: {
    testType: 'arithverify',
    clientObservedFacts: ['对/错判断响应', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['操作数与呈现结果（seed/config）', '等式真伪（由操作数权威推导）'],
    serverDerivedFacts: ['等式真伪与正确性判定', 'metrics（accuracy/medianRtMs/problemSizeSlopeMs）', 'quality flags'],
  },
  sizecongruity: {
    testType: 'sizecongruity',
    clientObservedFacts: ['左/右侧判断响应', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['数字对与字号条件（seed/config）', '数值较大侧（由数字权威推导）'],
    serverDerivedFacts: ['较大侧与一致性条件判定', 'metrics（sizeCongruityEffectMs/条件RT与正确率）', 'quality flags'],
  },
  delaydiscount: {
    testType: 'delaydiscount',
    clientObservedFacts: ['now/later 选择', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['延迟带与延后全额（frozen config）', '每步即时金额（二分轨迹可由选择权威复核）'],
    serverDerivedFacts: ['二分轨迹校验与无差异点', 'metrics（aucDelayDiscounting/laterChoiceRate）', 'quality flags'],
  },
  gamblingdeck: {
    testType: 'gamblingdeck',
    clientObservedFacts: ['箱选择（A-D）', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['每箱计划内位置（由选择序列权威推导）', '奖惩计划（scoringVersion 钉死）'],
    serverDerivedFacts: ['逐试次净结果', 'metrics（advantageousChoiceRate/netScore/blockTrendSlope/deckChoiceRates）', 'quality flags'],
  },
  symbolmatch: {
    testType: 'symbolmatch',
    clientObservedFacts: ['数字选择', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['符号序列（seed/config 均匀生成）', '符号-数字映射（frozen config）'],
    serverDerivedFacts: ['正确性判定', 'metrics（accuracy/medianRtMs）', 'quality flags'],
  },
  runningspan: {
    testType: 'runningspan',
    clientObservedFacts: ['按序回忆的字母序列', '回忆用时', 'interrupted'],
    runtimeReconstructableFacts: ['呈现序列（seed/config）与呈现时序（frozen config）'],
    serverDerivedFacts: ['目标窗口与串行正确性', 'metrics（runningSpanAccuracy/intrusionRate）', 'quality flags'],
  },
  sentencecheck: {
    testType: 'sentencecheck',
    clientObservedFacts: ['相符/不相符判断', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['形状/颜色事实（seed/config）', '句式模板（frozen config 模板结构）'],
    serverDerivedFacts: ['陈述真伪与正确性判定', 'metrics（accuracy/negationPenaltyMs）', 'quality flags'],
  },
  lineangle: {
    testType: 'lineangle',
    clientObservedFacts: ['选项角度选择', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['目标与选项角度（seed/config）'],
    serverDerivedFacts: ['选项合法性与正确性判定', 'metrics（accuracy/medianRtMs）', 'quality flags'],
  },
  seqlearn: {
    testType: 'seqlearn',
    clientObservedFacts: ['位置按键选择', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['冻结重复序列与随机块位置（config）', '模式块位置（由序列权威推导）'],
    serverDerivedFacts: ['模式块位置校验与正确性', 'metrics（srtPatternAdvantageMs/条件RT）', 'quality flags'],
  },
  timecopy: {
    testType: 'timecopy',
    clientObservedFacts: ['复制起止按键时长', 'interrupted'],
    runtimeReconstructableFacts: ['目标间隔（seed/config 分层序列）', '复制时长上限（frozen config）'],
    serverDerivedFacts: ['相对误差与方向偏差', 'metrics（meanAbsErrorRatio/biasRatio/withinTwentyRate）', 'quality flags'],
  },
  sharegame: {
    testType: 'sharegame',
    clientObservedFacts: ['各轮给出点数', '决策用时', 'interrupted'],
    runtimeReconstructableFacts: ['各轮禀赋（frozen config）'],
    serverDerivedFacts: ['给出合法性与偏好指标（givingRate/equalSplitCount/generousRate）', 'quality flags'],
  },
  letternumseries: {
    testType: 'letternumseries',
    clientObservedFacts: ['两段按序回忆输入', '回忆用时', 'interrupted'],
    runtimeReconstructableFacts: ['呈现序列（seed/config）与呈现时序（frozen config）'],
    serverDerivedFacts: ['字母序/数字序串行正确性', 'metrics（overallAccuracy/lettersAccuracy/digitsAccuracy）', 'quality flags'],
  },
  wordanalogy: {
    testType: 'wordanalogy',
    clientObservedFacts: ['选项选择', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['题目内容与正确项（frozen bank + seed 抽题顺序）'],
    serverDerivedFacts: ['正确性判定', 'metrics（accuracy/medianRtMs）', 'quality flags'],
  },
  wordmeaning: {
    testType: 'wordmeaning',
    clientObservedFacts: ['选项选择', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['题目内容与正确项（frozen bank + seed 抽题顺序）'],
    serverDerivedFacts: ['正确性判定', 'metrics（accuracy/medianRtMs）', 'quality flags'],
  },
  semanticfluency: {
    testType: 'semanticfluency',
    clientObservedFacts: ['自由输入的词序列', '输入用时', 'interrupted'],
    runtimeReconstructableFacts: ['类别轮次（seed/config）', '词库与归一化口径（frozen bank）'],
    serverDerivedFacts: ['归一化匹配/去重/侵入判定', 'metrics（uniqueValidPerTrial/intrusionRate）', 'quality flags'],
  },
  wordproblem: {
    testType: 'wordproblem',
    clientObservedFacts: ['选项选择', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['题目内容与正确项（frozen bank + seed 抽题顺序）'],
    serverDerivedFacts: ['正确性判定', 'metrics（accuracy/medianRtMs）', 'quality flags'],
  },
  icarmatrix: {
    testType: 'icarmatrix',
    clientObservedFacts: ['选项选择', 'raw RT', 'interrupted'],
    runtimeReconstructableFacts: ['题目内容与正确项（冻结题库前 8 题 + seed 生成器重建）'],
    serverDerivedFacts: ['正确性判定', 'metrics（accuracy/medianRtMs）', 'quality flags'],
  },
  cancellation: {
    testType: 'cancellation',
    clientObservedFacts: ['最终选中的格子集合', '扫描用时', 'interrupted'],
    runtimeReconstructableFacts: ['符号网格与目标集（seed+scan 重建）'],
    serverDerivedFacts: ['命中/漏报/误报求交判定', 'metrics（hitRate/falseAlarmRate）', 'quality flags'],
  },
}

// 当前通用事实（所有任务一致）：完整加密 trial payload、v2 trial envelope qualityEvents、
// randomSeed + frozen config + 五族版本号；任务特有事实单独列出。
const COMMON_CURRENT_CAPTURE = [
  '完整加密 trial payload（服务端留存）',
  'trial envelope qualityEvents（visibility_lost/window_blur/resume/runner_restart）',
  'randomSeed + frozen config + 版本族（engine/scoring/metric/quality/report）',
]

const RESEARCH_CAPTURE_DECLARATIONS: Record<string, CognitiveResearchCaptureDeclaration> = {
  reaction: {
    testType: 'reaction',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次 rtMs/foreperiodMs/inputMode 自报'],
    futureCaptureFacts: ['真实 input modality（事件级区分 mouse/touch/keyboard）', 'device class provenance', 'viewport/dpr', '更细粒度 visibility-resume 序列'],
  },
  memory: {
    testType: 'memory',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['逐级作答按键时序', '真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  stroop: {
    testType: 'stroop',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['响应侧与按键映射事实', '真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  gonogo: {
    testType: 'gonogo',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  cpt: {
    testType: 'cpt',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality（CPT 同时接受 click 与 keyboard，当前不留痕）', 'device provenance', 'viewport/dpr'],
  },
  nback: {
    testType: 'nback',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  corsi: {
    testType: 'corsi',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['逐块点击事件粒度', 'device/pointer provenance', 'viewport/dpr'],
  },
  sst: {
    testType: 'sst',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  taskswitch: {
    testType: 'taskswitch',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  patterncompare: {
    testType: 'patterncompare',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  flanker: {
    testType: 'flanker',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  cardsort: {
    testType: 'cardsort',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  digitbackward: {
    testType: 'digitbackward',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['逐级键入时序', '真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  picturesequence: {
    testType: 'picturesequence',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['逐项拖/点中间态', '实际延迟间隔时长', 'device provenance', 'viewport/dpr'],
  },
  pairedassociate: {
    testType: 'pairedassociate',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['位置选择事件粒度', '实际延迟间隔时长', 'device provenance', 'viewport/dpr'],
  },
  matrix: {
    testType: 'matrix',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['选项排除/改选行为', 'device provenance', 'viewport/dpr'],
  },
  mentalrotation: {
    testType: 'mentalrotation',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  tower: {
    testType: 'tower',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['移动事件粒度与回撤序列核验', 'device/pointer provenance', 'viewport/dpr'],
  },
  trailmaking: {
    testType: 'trailmaking',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次 pointerType/deviceClass 自报（当前最全）'],
    futureCaptureFacts: ['指针事件粒度（per-response modality）', 'viewport/屏幕事实', '更细粒度 visibility 序列'],
  },
  reversallearning: {
    testType: 'reversallearning',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  bart: {
    testType: 'bart',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['泵压间隔事件粒度（payload 有序列，间隔为离线派生）', 'device provenance', 'viewport/dpr'],
  },
  wordlist: {
    testType: 'wordlist',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['逐词键入时序', '输入法中间态', 'device/keyboard provenance'],
  },
  lexicaldecision: {
    testType: 'lexicaldecision',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  emotionrecognition: {
    testType: 'emotionrecognition',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  numberline: {
    testType: 'numberline',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次 responsePosition 与 raw RT'],
    futureCaptureFacts: ['输入通道区分（touch/mouse/keyboard 定位）', 'device provenance', 'viewport/dpr'],
  },
  arithverify: {
    testType: 'arithverify',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次响应与 raw RT'],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  sizecongruity: {
    testType: 'sizecongruity',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次响应与 raw RT'],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  delaydiscount: {
    testType: 'delaydiscount',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次选择与轨迹金额'],
    futureCaptureFacts: ['真实激励（真实货币/积分兑换）', 'device provenance', 'viewport/dpr'],
  },
  gamblingdeck: {
    testType: 'gamblingdeck',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次箱选择'],
    futureCaptureFacts: ['选择前犹豫内的指针轨迹', '真实激励', 'device provenance', 'viewport/dpr'],
  },
  symbolmatch: {
    testType: 'symbolmatch',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次响应与 raw RT'],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  runningspan: {
    testType: 'runningspan',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次回忆序列与用时'],
    futureCaptureFacts: ['逐字母回忆选择时序', '真实 input modality', 'device provenance'],
  },
  sentencecheck: {
    testType: 'sentencecheck',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次响应与 raw RT'],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  lineangle: {
    testType: 'lineangle',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次响应与 raw RT'],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  seqlearn: {
    testType: 'seqlearn',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次响应与 raw RT'],
    futureCaptureFacts: ['显性觉察自评', '真实 input modality', 'device provenance'],
  },
  timecopy: {
    testType: 'timecopy',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次复制时长'],
    futureCaptureFacts: ['策略自评（默数/节律）', 'device provenance', 'viewport/dpr'],
  },
  sharegame: {
    testType: 'sharegame',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐轮给出点数与用时'],
    futureCaptureFacts: ['真实接收者与真实激励', '真实 input modality', '决策前犹豫内指针轨迹', 'device provenance', 'viewport/dpr'],
  },
  letternumseries: {
    testType: 'letternumseries',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次两段回忆输入与用时'],
    futureCaptureFacts: ['逐项回忆选择时序', '真实 input modality', 'device provenance'],
  },
  wordanalogy: {
    testType: 'wordanalogy',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次响应与 raw RT'],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  wordmeaning: {
    testType: 'wordmeaning',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次响应与 raw RT'],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  semanticfluency: {
    testType: 'semanticfluency',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐词输入序列与用时'],
    futureCaptureFacts: ['逐词输入间隔时序', '输入法中间态', 'device/keyboard provenance'],
  },
  wordproblem: {
    testType: 'wordproblem',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次响应与 raw RT'],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  icarmatrix: {
    testType: 'icarmatrix',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐试次响应与 raw RT'],
    futureCaptureFacts: ['真实 input modality', 'device provenance', 'viewport/dpr'],
  },
  cancellation: {
    testType: 'cancellation',
    currentlyAvailableFacts: [...COMMON_CURRENT_CAPTURE, '逐轮选中格子集与用时'],
    futureCaptureFacts: ['逐格点击时序', '真实 input modality', 'device provenance'],
  },
}

const validateDualContractDeclarations = (): void => {
  const catalogTestTypes = listCatalogTestTypes()
  if (SCORING_DECLARATIONS.fake || RESEARCH_CAPTURE_DECLARATIONS.fake) {
    throw new Error('fake must not have cognitive library dual-contract declarations')
  }
  for (const testType of catalogTestTypes) {
    const scoring = SCORING_DECLARATIONS[testType]
    const capture = RESEARCH_CAPTURE_DECLARATIONS[testType]
    if (!scoring) {
      throw new Error(`Missing cognitive library scoring contract declaration: ${testType}`)
    }
    if (!capture) {
      throw new Error(`Missing cognitive library research capture declaration: ${testType}`)
    }
    // Review Fix 3/4：三类 raw facts 与两类 capture 事实均不得为空。
    for (const [name, list] of [
      ['clientObservedFacts', scoring.clientObservedFacts],
      ['runtimeReconstructableFacts', scoring.runtimeReconstructableFacts],
      ['serverDerivedFacts', scoring.serverDerivedFacts],
      ['currentlyAvailableFacts', capture.currentlyAvailableFacts],
      ['futureCaptureFacts', capture.futureCaptureFacts],
    ] as const) {
      if (list.length === 0) {
        throw new Error(`Cognitive library declaration ${name} must not be empty: ${testType}`)
      }
    }
  }
  if (Object.keys(SCORING_DECLARATIONS).length !== catalogTestTypes.length) {
    throw new Error('Cognitive library scoring contract declarations must cover exactly the catalog')
  }
  if (Object.keys(RESEARCH_CAPTURE_DECLARATIONS).length !== catalogTestTypes.length) {
    throw new Error('Cognitive library research capture declarations must cover exactly the catalog')
  }
}

validateDualContractDeclarations()

export interface DerivedCognitiveScoringContract {
  testType: string
  engineVersion: string
  scoringVersion: string
  metricDefinitionVersion: string
  headlineMetricKey: string | null
  primaryMetricKeys: string[]
  secondaryMetricKeys: string[]
  qualityKeys: string[]
  /** 只从 authoritative v2 TaskDefinition 派生（metrics[key].referenceEligible === true）。 */
  referenceEligibleMetricKeys: string[]
  /** 只从 authoritative evidence mapping 派生。 */
  bundleEligibleMetricKeys: string[]
}

/**
 * 从权威源派生单个任务版本的 scoring contract：
 *  - headline/primary/secondary ← registry reportDefinition
 *  - quality ← registry qualityDefinitions
 *  - referenceEligible ← v2 TaskDefinition（read-only getCognitiveV2TaskDefinition，
 *    不复制 v2 adapter 的 eligibility 计算规则）
 *  - bundleEligible ← evidence-mapping.registry
 */
export const deriveCognitiveScoringContract = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): DerivedCognitiveScoringContract => {
  const { registry } = requireCatalogForIdentity(testType, engineVersion, scoringVersion)
  const metricKeys = new Set(Object.keys(registry.metricDefinitions))

  const headlineMetricKey = registry.reportDefinition.headlineMetric ?? null
  if (headlineMetricKey && !metricKeys.has(headlineMetricKey)) {
    throw new Error(`Cognitive library headline metric not defined: ${testType}/${headlineMetricKey}`)
  }
  for (const key of registry.reportDefinition.primaryMetrics) {
    if (!metricKeys.has(key)) {
      throw new Error(`Cognitive library primary metric not defined: ${testType}/${key}`)
    }
  }
  for (const key of registry.reportDefinition.secondaryMetrics) {
    if (!metricKeys.has(key)) {
      throw new Error(`Cognitive library secondary metric not defined: ${testType}/${key}`)
    }
  }

  const v2Definition = getCognitiveV2TaskDefinition(testType, engineVersion, scoringVersion)
  if (!v2Definition) {
    throw new Error(
      `No authoritative v2 task definition for ${testType}/${engineVersion}/${scoringVersion}`,
    )
  }
  const referenceEligibleMetricKeys = Object.entries(v2Definition.metrics)
    .filter(([, metric]) => metric.referenceEligible === true)
    .map(([key]) => key)

  const bundleEligibleMetricKeys = [
    ...new Set(
      listCognitiveEvidenceMappingsForTask(testType, engineVersion, scoringVersion).map(
        (mapping) => mapping.metricKey,
      ),
    ),
  ]

  return {
    testType,
    engineVersion,
    scoringVersion,
    metricDefinitionVersion: registry.metricDefinitionVersion,
    headlineMetricKey,
    primaryMetricKeys: [...registry.reportDefinition.primaryMetrics],
    secondaryMetricKeys: [...registry.reportDefinition.secondaryMetrics],
    qualityKeys: Object.keys(registry.qualityDefinitions),
    referenceEligibleMetricKeys,
    bundleEligibleMetricKeys,
  }
}

export const getScoringContractDeclaration = (
  testType: string,
): CognitiveScoringContractDeclaration | undefined => SCORING_DECLARATIONS[testType]

export const getResearchCaptureDeclaration = (
  testType: string,
): CognitiveResearchCaptureDeclaration | undefined => RESEARCH_CAPTURE_DECLARATIONS[testType]

export const listScoringContractDeclarations = (): CognitiveScoringContractDeclaration[] =>
  listCatalogTestTypes().map((testType) => {
    const declaration = SCORING_DECLARATIONS[testType]
    if (!declaration) {
      throw new Error(`Missing cognitive library scoring contract declaration: ${testType}`)
    }
    return declaration
  })

export const listResearchCaptureDeclarations = (): CognitiveResearchCaptureDeclaration[] =>
  listCatalogTestTypes().map((testType) => {
    const declaration = RESEARCH_CAPTURE_DECLARATIONS[testType]
    if (!declaration) {
      throw new Error(`Missing cognitive library research capture declaration: ${testType}`)
    }
    return declaration
  })
