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
