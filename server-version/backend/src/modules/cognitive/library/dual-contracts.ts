/**
 * COG-P1 Commit 4 — Dual Contract Inventory（Scoring Contract + Research Capture 声明）。
 *
 * 规则（Pilot-first v2 指令 §11）：
 *  - 本文件只做逐 task 的两类数据 contract 声明/盘点，不修改 trial payload、scorer、
 *    DB schema，不新增 FINAL payload，不增加在线 CPU。
 *  - headline / primary / secondary / quality 全部从 cognitive.registry 派生（不复制真值）；
 *    bundleEligible 只能由 evidence-mapping.registry 派生；
 *    referenceEligible 是面向 COG-P4 的声明意图（Pilot Reference 配置对象），
 *    不代表当前存在任何 reference。
 *  - Research Capture 建议仅用于 COG-P2/P3/P5 的权威实施清单；
 *    当前系统只采集/归档，不做在线分析。
 */

import {
  listCatalogTestTypes,
  requireCatalogForIdentity,
} from './catalog'
import { listCognitiveEvidenceMappingsForTask } from '../../cognitive-analysis/evidence-mapping.registry'

export interface CognitiveScoringContractDeclaration {
  testType: string
  /** scoring 真正需要的原始事实（来自 trial schema / 冻结 config / seed）。 */
  requiredRawFacts: string[]
  /** 面向 COG-P4 Pilot Reference 的声明意图；必须 ⊆ metricDefinitions keys。 */
  referenceEligibleMetricKeys: string[]
}

export interface CognitiveResearchCaptureDeclaration {
  testType: string
  /** 未来科研离线分析建议保存的原始事实（当前不新增任何在线采集）。 */
  suggestedFacts: string[]
}

const SCORING_DECLARATIONS: Record<string, CognitiveScoringContractDeclaration> = {
  reaction: {
    testType: 'reaction',
    requiredRawFacts: ['foreperiodMs', 'rtMs', 'premature/timeout flags', 'interrupted', 'inputMode（自报）'],
    referenceEligibleMetricKeys: ['medianRtMs'],
  },
  memory: {
    testType: 'memory',
    requiredRawFacts: ['逐级呈现序列（seed 可重建）', '键入作答序列', '层级通过/终止原因', 'interrupted'],
    referenceEligibleMetricKeys: ['maxSpan'],
  },
  stroop: {
    testType: 'stroop',
    requiredRawFacts: ['congruent/incongruent 条件', '颜色选择与正确性', 'rtMs + timeout', 'interrupted'],
    referenceEligibleMetricKeys: ['medianRtCongruent', 'medianRtIncongruent'],
  },
  gonogo: {
    testType: 'gonogo',
    requiredRawFacts: ['go/nogo 条件', '响应有无与正确性', 'go rtMs', 'interrupted'],
    referenceEligibleMetricKeys: ['commissionRate', 'goMedianRtMs'],
  },
  cpt: {
    testType: 'cpt',
    requiredRawFacts: ['target/nontarget 条件', 'hit/false alarm/omission 结果', 'hit rtMs', 'block 序号', 'premature 标记', 'interrupted'],
    referenceEligibleMetricKeys: ['dPrime', 'omissionRate', 'hitMedianRtMs'],
  },
  nback: {
    testType: 'nback',
    requiredRawFacts: ['N 水平', '按 N 的 target/nontarget', '匹配响应与正确性', 'rtMs', 'interrupted'],
    referenceEligibleMetricKeys: ['dPrimeByN'],
  },
  corsi: {
    testType: 'corsi',
    requiredRawFacts: ['呈现方块序列（seed 可重建）', '点击作答序列', '层级推进/终止', 'interrupted'],
    referenceEligibleMetricKeys: ['maxSpan', 'totalCorrectTrials'],
  },
  sst: {
    testType: 'sst',
    requiredRawFacts: ['go/stop 条件', 'stop 试次 SSD', 'stop 成功/失败 + rtMs', 'go 正确性 + rtMs', 'interrupted'],
    referenceEligibleMetricKeys: ['ssrtMs', 'goMedianRtMs'],
  },
  taskswitch: {
    testType: 'taskswitch',
    requiredRawFacts: ['cue/规则 + switch/repeat 条件', '响应正确性', '有效 rtMs', 'block 结构（pure blocks 科研档）', 'interrupted'],
    referenceEligibleMetricKeys: ['medianRtSwitch', 'medianRtRepeat'],
  },
  patterncompare: {
    testType: 'patterncompare',
    requiredRawFacts: ['刺激对身份（seed 可重建）', 'same/different 响应与正确性', 'rtMs / lapse', '限时内完成题数', 'interrupted'],
    referenceEligibleMetricKeys: ['correctPerMinute', 'medianCorrectRtMs'],
  },
  flanker: {
    testType: 'flanker',
    requiredRawFacts: ['congruent/incongruent 条件', '方向响应与正确性', '有效 rtMs', 'omission', 'interrupted'],
    referenceEligibleMetricKeys: ['medianRtCongruent', 'medianRtIncongruent'],
  },
  cardsort: {
    testType: 'cardsort',
    requiredRawFacts: ['冻结规则序', '实际规则响应', 'switch/repeat 条件', '持续性错误推导事实', 'rtMs', 'interrupted'],
    referenceEligibleMetricKeys: ['medianRtSwitch', 'medianRtRepeat'],
  },
  digitbackward: {
    testType: 'digitbackward',
    requiredRawFacts: ['呈现数字序列', '倒序键入作答', '层级结果', 'interrupted'],
    referenceEligibleMetricKeys: ['maxSpan', 'sequenceDistance'],
  },
  picturesequence: {
    testType: 'picturesequence',
    requiredRawFacts: ['项目集身份（seed 可重建）', '逐轮排序提交', '延迟阶段有效性', 'interrupted'],
    referenceEligibleMetricKeys: ['adjacentPairScore', 'positionScore'],
  },
  pairedassociate: {
    testType: 'pairedassociate',
    requiredRawFacts: ['配对呈现（逐轮）', '逐对位置响应', 'criterion 计数', '延迟阶段有效性', 'interrupted'],
    referenceEligibleMetricKeys: ['immediateAccuracy', 'learningSlope'],
  },
  matrix: {
    testType: 'matrix',
    requiredRawFacts: ['题目身份 + 规则族 + 难度（生成器 seed）', '所选选项与正确性', 'omission', 'interrupted'],
    referenceEligibleMetricKeys: ['accuracy'],
  },
  mentalrotation: {
    testType: 'mentalrotation',
    requiredRawFacts: ['角度条件', 'same/mirror 真值', '响应与正确性', 'rtMs', 'interrupted'],
    referenceEligibleMetricKeys: ['accuracy', 'medianCorrectRtMs'],
  },
  tower: {
    testType: 'tower',
    requiredRawFacts: ['题目最短步数（solver）', '逐步移动序列', '规则违反', 'first-move latency', 'interrupted'],
    referenceEligibleMetricKeys: ['minimumMoveSolveRate', 'excessMoves'],
  },
  trailmaking: {
    testType: 'trailmaking',
    requiredRawFacts: ['目标序列（A/B）', '逐步正确性 + 时间戳', 'pointerType + deviceClass（自报）', '时限', 'interrupted'],
    referenceEligibleMetricKeys: ['partACompletionTimeMs', 'meanCorrectStepTimeMs'],
  },
  reversallearning: {
    testType: 'reversallearning',
    requiredRawFacts: ['阶段（acquisition/reversal）', '逐试次 reward roll（replay contract）', '选择 + 反馈结果', 'criterion 连对计数', 'rtMs', 'interrupted'],
    referenceEligibleMetricKeys: ['acquisitionAccuracy', 'reversalAccuracy'],
  },
  bart: {
    testType: 'bart',
    requiredRawFacts: ['冻结爆破阈值（服务端）', '逐 balloon 泵压序列', 'explosion/cashout 结果', 'interrupted'],
    referenceEligibleMetricKeys: ['adjustedPumps'],
  },
  wordlist: {
    testType: 'wordlist',
    requiredRawFacts: ['词表身份（冻结词库 + seed）', '逐轮归一化输入', '侵入/重复判定', '延迟阶段有效性', 'interrupted'],
    referenceEligibleMetricKeys: ['immediateAccuracy'],
  },
  lexicaldecision: {
    testType: 'lexicaldecision',
    requiredRawFacts: ['词/伪词身份 + 词频带', 'word/nonword 响应与正确性', 'rtMs', 'interrupted'],
    referenceEligibleMetricKeys: ['dPrime', 'medianRtReal', 'medianRtPseudo'],
  },
  emotionrecognition: {
    testType: 'emotionrecognition',
    requiredRawFacts: ['面孔身份（合成集版本）', '目标情绪', '所选情绪', 'rtMs', 'interrupted'],
    referenceEligibleMetricKeys: ['balancedAccuracy'],
  },
}

const RESEARCH_CAPTURE_DECLARATIONS: Record<string, CognitiveResearchCaptureDeclaration> = {
  reaction: {
    testType: 'reaction',
    suggestedFacts: ['完整 foreperiod 序列', '逐试次 inputMode 事件', 'device class（未来 provenance）', 'visibility 中断事件', '原始 RT 分布'],
  },
  memory: { testType: 'memory', suggestedFacts: ['逐级作答时序', '复述/停顿模式', '键入事件', 'visibility 事件'] },
  stroop: { testType: 'stroop', suggestedFacts: ['逐试次色词映射', '完整 RT 分布', '响应侧平衡', 'visibility 事件'] },
  gonogo: { testType: 'gonogo', suggestedFacts: ['ISI 分布', '错误后减慢事实', '完整 RT 分布', 'visibility 事件'] },
  cpt: { testType: 'cpt', suggestedFacts: ['逐 block RT 分布', 'vigilance decrement 轨迹', '极短反应原始值', 'visibility 事件'] },
  nback: { testType: 'nback', suggestedFacts: ['按 N 逐 trial 响应矩阵', '完整 RT 分布', 'lure 试次', 'visibility 事件'] },
  corsi: { testType: 'corsi', suggestedFacts: ['逐级作答时序', '错误位距分布', 'visibility 事件'] },
  sst: { testType: 'sst', suggestedFacts: ['完整 SSD 阶梯', '失败 stop RT 分布', '策略性减慢迹象', 'visibility 事件'] },
  taskswitch: { testType: 'taskswitch', suggestedFacts: ['cue-stimulus 间隔', 'switch 序列结构', '完整 RT 分布', 'visibility 事件'] },
  patterncompare: { testType: 'patterncompare', suggestedFacts: ['刺激对生成参数', '完整 RT 分布', 'lapse 时点', 'visibility 事件'] },
  flanker: { testType: 'flanker', suggestedFacts: ['flanker 结构参数', '完整 RT 分布', '序列效应', 'visibility 事件'] },
  cardsort: { testType: 'cardsort', suggestedFacts: ['规则切换轨迹', '错误类型分解', '完整 RT 分布', 'visibility 事件'] },
  digitbackward: { testType: 'digitbackward', suggestedFacts: ['作答时序', '错误位距模式', '键入事件', 'visibility 事件'] },
  picturesequence: { testType: 'picturesequence', suggestedFacts: ['逐轮排序轨迹', '修改行为', '实际延迟间隔', 'visibility 事件'] },
  pairedassociate: { testType: 'pairedassociate', suggestedFacts: ['逐对学习轨迹', '位置偏差模式', '实际延迟间隔', 'visibility 事件'] },
  matrix: { testType: 'matrix', suggestedFacts: ['逐题作答时长', '选项排除行为', '规则族×难度正确率', 'visibility 事件'] },
  mentalrotation: { testType: 'mentalrotation', suggestedFacts: ['角度×RT 轨迹', '镜像错误模式', '响应侧平衡', 'visibility 事件'] },
  tower: { testType: 'tower', suggestedFacts: ['首步前思考时长分布', '回撤/改步行为', '完整移动轨迹', 'visibility 事件'] },
  trailmaking: { testType: 'trailmaking', suggestedFacts: ['完整逐步轨迹（含错误尝试目标）', '指针事件粒度', 'viewport/屏幕事实', 'visibility 事件'] },
  reversallearning: { testType: 'reversallearning', suggestedFacts: ['反馈后选择轨迹', 'win-stay/lose-shift 事实', '完整 RT 分布', 'visibility 事件'] },
  bart: { testType: 'bart', suggestedFacts: ['逐次泵压间隔', '现金化时机', '爆炸后行为', 'visibility 事件'] },
  wordlist: { testType: 'wordlist', suggestedFacts: ['逐词召回时序', '语义聚类事实', '输入法中间态', 'visibility 事件'] },
  lexicaldecision: { testType: 'lexicaldecision', suggestedFacts: ['词频带×RT 分布', '词长效应', '伪词生成器参数', 'visibility 事件'] },
  emotionrecognition: { testType: 'emotionrecognition', suggestedFacts: ['混淆矩阵轨迹', '类别级偏差事实', '完整 RT 分布', 'visibility 事件'] },
}

const validateDualContractDeclarations = (): void => {
  const catalogTestTypes = listCatalogTestTypes()
  if (SCORING_DECLARATIONS.fake || RESEARCH_CAPTURE_DECLARATIONS.fake) {
    throw new Error('fake must not have cognitive library dual-contract declarations')
  }
  for (const testType of catalogTestTypes) {
    if (!SCORING_DECLARATIONS[testType]) {
      throw new Error(`Missing cognitive library scoring contract declaration: ${testType}`)
    }
    if (!RESEARCH_CAPTURE_DECLARATIONS[testType]) {
      throw new Error(`Missing cognitive library research capture declaration: ${testType}`)
    }
  }
  const scoringKeys = Object.keys(SCORING_DECLARATIONS)
  const captureKeys = Object.keys(RESEARCH_CAPTURE_DECLARATIONS)
  if (scoringKeys.length !== catalogTestTypes.length) {
    throw new Error('Cognitive library scoring contract declarations must cover exactly the catalog')
  }
  if (captureKeys.length !== catalogTestTypes.length) {
    throw new Error('Cognitive library research capture declarations must cover exactly the catalog')
  }
  // 宽松的导入期校验：声明的 referenceEligible key 至少在任务的某个已注册版本中存在。
  // 严格逐版本校验在 deriveCognitiveScoringContract 中执行。
  for (const testType of scoringKeys) {
    const declared = SCORING_DECLARATIONS[testType]
    if (new Set(declared.referenceEligibleMetricKeys).size !== declared.referenceEligibleMetricKeys.length) {
      throw new Error(`Duplicate referenceEligible metric key declaration: ${testType}`)
    }
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
  referenceEligibleMetricKeys: string[]
  bundleEligibleMetricKeys: string[]
}

/**
 * 从权威源派生单个任务版本的 scoring contract：
 *  - headline/primary/secondary ← registry reportDefinition
 *  - quality ← registry qualityDefinitions
 *  - referenceEligible ← 本文件声明（逐版本校验 ⊆ metricDefinitions）
 *  - bundleEligible ← evidence-mapping.registry（唯一权威 task→domain 映射）
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

  const declaration = SCORING_DECLARATIONS[testType]
  if (!declaration) {
    throw new Error(`Missing cognitive library scoring contract declaration: ${testType}`)
  }
  for (const key of declaration.referenceEligibleMetricKeys) {
    if (!metricKeys.has(key)) {
      throw new Error(
        `Cognitive library referenceEligible metric not defined for ${testType}/${engineVersion}/${scoringVersion}: ${key}`,
      )
    }
  }

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
    referenceEligibleMetricKeys: [...declaration.referenceEligibleMetricKeys],
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
