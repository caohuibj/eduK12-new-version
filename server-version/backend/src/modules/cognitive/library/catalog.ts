/**
 * COG-P1 Commit 3 — Cognitive Library Catalog Registry + authoritative joins.
 *
 * 规则（Pilot-first v2 指令 §10 / §取消4）：
 *  - 为全部 24 个真实 task 建立 catalog identity binding；fake 不进入产品 catalog。
 *  - catalog 通过 testType + engineVersion + scoringVersion 经 cognitive.registry
 *    解析权威任务身份；不维护第二份任务真值。
 *  - Domain/Facet 只能从 cognitive-analysis/evidence-mapping.registry 派生；
 *    无映射的 task 允许 standalone（返回空 domain 摘要），不为发布改 taxonomy。
 *  - build-time 校验：duplicate / orphan / invalid identity 直接抛错（fail-fast）。
 */

import type { RegistryEntry } from '../cognitive.types'
import {
  getCognitiveRegistryEntry,
  listCognitiveRegistryEntries,
  listCognitiveRegistryEntriesForType,
} from '../cognitive.registry'
import { listCognitiveEvidenceMappingsForTask } from '../../cognitive-analysis/evidence-mapping.registry'
import {
  RESEARCH_GRADE_IDENTITIES as COGNITIVE_RESEARCH_GRADE_IDENTITIES,
  resolveCognitiveScientificMaturity,
} from './scientific-maturity'
import type {
  CognitiveLibraryCatalogEntry,
  CognitiveScientificStatus,
} from './catalog-contract'
import { COGNITIVE_TASK_TYPES } from '../tasks/task-packages'

const CATALOG: Record<string, CognitiveLibraryCatalogEntry> = {
  reaction: {
    testType: 'reaction',
    educationalPurpose: '对简单视觉信号尽快做出反应，练习快速启动。',
    plainAbilityHint: '反应速度与稳定性',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '经典简单反应时范式；主要构念为加工速度（simple response）。',
    knownLimitations: [
      '成绩由感知-决策-动作链路速度决定，不等于学习能力或智力。',
      '提前反应与遗漏会改变指标解释，需结合质量标记阅读。',
    ],
    sourceNotes: ['简单反应时经典范式；Luce (1986) Response Times 综述。'],
    rightsProvenance: 'internal-generated（无外部刺激资产）',
  },
  memory: {
    testType: 'memory',
    educationalPurpose: '记住越来越长的数字序列，挑战短时记忆容量。',
    plainAbilityHint: '短时记忆容量',
    interactionFamily: 'keypad_sequence',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '数字广度顺背（forward digit span）；主要构念为言语短时存储。',
    knownLimitations: [
      'maxSpan 只描述本次任务容量，不是标准化记忆等级。',
      '与倒背任务分开解释，不合并记忆总分。',
    ],
    sourceNotes: ['Digit span 经典范式；Woods et al. (2011) J Clin Exp Neuropsychol。'],
    rightsProvenance: 'internal-generated',
  },
  stroop: {
    testType: 'stroop',
    educationalPurpose: '当颜色和文字含义"打架"时，快速说出正确的颜色。',
    plainAbilityHint: '冲突信息下的抗干扰表现',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '色词 Stroop 范式；主要构念为语义干扰控制；difference 指标须与条件准确率同读。',
    knownLimitations: [
      '阅读自动化与语言能力是已知混淆。',
      '短版本干扰效应不稳定，体验档仅供体验。',
    ],
    sourceNotes: ['Stroop (1935) J Exp Psychol；MacLeod (1991) 综述。'],
    rightsProvenance: 'internal-generated',
  },
  gonogo: {
    testType: 'gonogo',
    educationalPurpose: '见到 Go 快速按下，见到 No-Go 忍住不按。',
    plainAbilityHint: '该动才动的反应控制',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'Go/No-Go 范式；主要构念为反应抑制（action withholding）。',
    knownLimitations: [
      'Go RT 只解释速度-准确权衡，不能单独代表抑制能力。',
      'No-Go 试次比例影响误按率稳定性。',
    ],
    sourceNotes: ['Go/No-Go 经典范式；Wessel (2018) Psychophysiology 综述。'],
    rightsProvenance: 'internal-generated',
  },
  cpt: {
    testType: 'cpt',
    educationalPurpose: '长时间盯住屏幕，目标一出现就快速准确响应。',
    plainAbilityHint: '持续注意力',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'CPT-X 持续操作范式；主要构念为持续注意（辨别/遗漏/稳定性）。',
    knownLimitations: [
      '时长与负荷影响成绩，跨 profile 不可直接比较。',
      '遗漏与误报须与 d′ 同读。',
    ],
    sourceNotes: ['Rosvold et al. (1956) CPT 传统；Riccio et al. (2002) 综述。'],
    rightsProvenance: 'internal-generated',
  },
  nback: {
    testType: 'nback',
    educationalPurpose: '记住"刚才第 N 个"是什么，并实时判断匹配。',
    plainAbilityHint: '脑中实时更新信息的能力',
    interactionFamily: 'button_choice',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'N-Back 范式；主要构念为工作记忆更新；按 N 分层解释。',
    knownLimitations: [
      '不同 N 水平难度差异大，触顶/触底需质量标记提示。',
      'maxReliableN 不是标准化工作记忆等级。',
    ],
    sourceNotes: ['Kirchner (1958)；Owen et al. (2005) meta 分析。'],
    rightsProvenance: 'internal-generated',
  },
  corsi: {
    testType: 'corsi',
    educationalPurpose: '记住方块亮起的顺序，再按同样顺序点回来。',
    plainAbilityHint: '视空间记忆',
    interactionFamily: 'click_sequence',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'Corsi Block-Tapping 范式；主要构念为视空间短时存储。',
    knownLimitations: [
      '与数字广度分开解释，不合并记忆总分。',
      '屏幕布局差异会影响序列难度。',
    ],
    sourceNotes: ['Corsi (1972)；Kessels et al. (2000) 标准化讨论。'],
    rightsProvenance: 'internal-generated',
  },
  sst: {
    testType: 'sst',
    educationalPurpose: '快速响应，但听到停止信号时要立刻"刹车"。',
    plainAbilityHint: '动作的停止控制',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '停止信号任务；主要构念为动作取消（SSRT 估计）。',
    knownLimitations: [
      'SSRT 为模型估计，依赖 p(respond|stop) 处于合理区间。',
      '策略性减慢会由质量标记提示。',
    ],
    sourceNotes: ['Logan & Cowan (1984) race model。'],
    rightsProvenance: 'internal-generated',
  },
  taskswitch: {
    testType: 'taskswitch',
    educationalPurpose: '按照提示在不同任务规则之间快速切换。',
    plainAbilityHint: '任务切换的灵活性',
    interactionFamily: 'button_choice',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '线索化任务转换范式；主要构念为试次级转换代价（difference 指标）。',
    knownLimitations: [
      '转换代价必须与 switch/repeat 准确率同屏阅读。',
      'mixing cost 仅科研档估计。',
    ],
    sourceNotes: ['Monsell (2003) 综述。'],
    rightsProvenance: 'internal-generated',
  },
  patterncompare: {
    testType: 'patterncompare',
    educationalPurpose: '在有限时间里快速判断两个图形是不是一样。',
    plainAbilityHint: '图形快速比较的速度',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'moderate',
    adminScientificNotes: 'Pattern Comparison 加工速度范式；内部自制几何刺激。',
    knownLimitations: [
      '速度指标必须与准确率同读，快速猜测会虚高速度。',
      '限时设计对设备与输入方式敏感。',
    ],
    sourceNotes: ['Salthouse (1996) 加工速度传统（Pattern Comparison 类任务）。'],
    rightsProvenance: 'internal-generated（几何图形生成器）',
  },
  flanker: {
    testType: 'flanker',
    educationalPurpose: '忽略两边箭头的干扰，只判断中间箭头的方向。',
    plainAbilityHint: '干扰中的方向判断',
    interactionFamily: 'button_choice',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'Eriksen Flanker 范式；主要构念为知觉干扰控制。',
    knownLimitations: [
      '干扰效应须与两条件准确率同读。',
      '与 Stroop/SST 构念部分重叠，宜作三角互证而非替代。',
    ],
    sourceNotes: ['Eriksen & Eriksen (1974)。'],
    rightsProvenance: 'internal-generated',
  },
  cardsort: {
    testType: 'cardsort',
    educationalPurpose: '按不断变化的规则把卡片分到正确的一边。',
    plainAbilityHint: '规则切换与坚持',
    interactionFamily: 'button_choice',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '双规则显式转换分类范式；主要构念为规则转换与持续性错误。',
    knownLimitations: [
      '持续性错误由冻结规则推导，不等同临床卡片分类测验。',
      '与 Task Switching 部分指标重叠。',
    ],
    sourceNotes: ['Grant & Berg (1948) WCST 传统（本实现为显式规则变体）。'],
    rightsProvenance: 'internal-generated',
  },
  digitbackward: {
    testType: 'digitbackward',
    educationalPurpose: '把看到的数字倒着顺序回忆出来。',
    plainAbilityHint: '数字的倒序操作',
    interactionFamily: 'keypad_sequence',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'Backward digit span；主要构念为工作记忆操纵（verbal manipulation）。',
    knownLimitations: [
      '与顺背分开呈现，不合并为完整工作记忆。',
      '结果不是 Wechsler 分数或常模。',
    ],
    sourceNotes: ['Backward span 经典范式（公开文献描述）。'],
    rightsProvenance: 'internal-generated',
  },
  picturesequence: {
    testType: 'picturesequence',
    educationalPurpose: '记住一组图片事件的发生顺序并还原。',
    plainAbilityHint: '事件顺序的记忆',
    interactionFamily: 'item_ordering',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '图片序列学习；主要构念为序列学习与顺序保持；延迟仅科研档。',
    knownLimitations: [
      '延迟保持缺失不等于低分。',
      '项目内容的文化适宜性与理解度需 pilot 审查。',
    ],
    sourceNotes: ['序列学习与顺序记忆范式（内部设计）。'],
    rightsProvenance: 'internal-generated 场景刺激',
  },
  pairedassociate: {
    testType: 'pairedassociate',
    educationalPurpose: '记住每个图形对应的位置，越学越快。',
    plainAbilityHint: '图形-位置的配对学习',
    interactionFamily: 'position_selection',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '图形-位置配对学习；主要构念为联想学习（learning slope / trials to criterion）。',
    knownLimitations: [
      '延迟正确率缺失不按 0 计。',
      '内部非语言配对刺激，不等同 CANTAB PAL。',
    ],
    sourceNotes: ['Paired-associate learning 经典范式（内部实现）。'],
    rightsProvenance: 'internal-generated',
  },
  matrix: {
    testType: 'matrix',
    educationalPurpose: '找出图形排列的规律，选出合适的答案。',
    plainAbilityHint: '图形规律推理',
    interactionFamily: 'multi_option_selection',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '内部生成矩阵推理题库；主要构念为规则归纳（fluid reasoning 任务表现）。',
    knownLimitations: [
      '正确率不换算 IQ、不与 Raven 等价。',
      '题库唯一解与难度标签依赖冻结生成器版本。',
    ],
    sourceNotes: ['Matrix reasoning 范式传统（内部题库）。'],
    rightsProvenance: 'internal-generated（SVG 生成器）',
  },
  mentalrotation: {
    testType: 'mentalrotation',
    educationalPurpose: '判断两个图形是不是同一个（只是转了个角度）。',
    plainAbilityHint: '头脑中的空间旋转',
    interactionFamily: 'button_choice',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '心理旋转范式；主要构念为 mental rotation（angle cost）。',
    knownLimitations: [
      '角度代价只在小/大角度都有足够正确反应时解释。',
      '不代表完整空间智力。',
    ],
    sourceNotes: ['Shepard & Metzler (1971)。'],
    rightsProvenance: 'internal-generated（SVG 生成器）',
  },
  tower: {
    testType: 'tower',
    educationalPurpose: '动脑筋用最少的步数把圆盘挪到目标位置。',
    plainAbilityHint: '做计划与提前思考',
    interactionFamily: 'click_sequence',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '塔式规划（Tower of London 类）；主要构念为规划与前瞻；solver 校验最短路径。',
    knownLimitations: [
      '解题比例、额外步数与规则违反应分开阅读。',
      '不做计划能力等级判断。',
    ],
    sourceNotes: ['Shallice (1982) Tower of London 传统（内部实现）。'],
    rightsProvenance: 'internal-generated',
  },
  trailmaking: {
    testType: 'trailmaking',
    educationalPurpose: '按顺序尽快找到并连接下一个目标。',
    plainAbilityHint: '视觉搜索与顺序连接',
    interactionFamily: 'click_sequence',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'high',
    adminScientificNotes: 'Trail Making 类视觉搜索 + 集合转换；v1 taxonomy 无对应 domain，standalone 报告。',
    knownLimitations: [
      '完成时间受设备、指针方式与动作速度影响，不做设备校正。',
      '总时间不解释为纯执行功能。',
    ],
    sourceNotes: ['Reitan (1958) TMT 传统（内部逐步点击实现）。'],
    rightsProvenance: 'internal-generated',
  },
  reversallearning: {
    testType: 'reversallearning',
    educationalPurpose: '根据反馈学会哪边更"划算"，并在规则反转后重新学习。',
    plainAbilityHint: '根据反馈调整选择',
    interactionFamily: 'button_choice',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '概率反转学习；v1 taxonomy 无对应 domain，standalone；强化学习建模留待科研。',
    knownLimitations: [
      '不作人格、风险偏好或决策能力判断。',
      '未达 criterion 时指标解释受限。',
    ],
    sourceNotes: ['Reversal learning 经典范式（内部实现）。'],
    rightsProvenance: 'internal-generated',
  },
  bart: {
    testType: 'bart',
    educationalPurpose: '给气球一点点打气赚奖励，吹爆就没有了。',
    plainAbilityHint: '逐步决策的描述性观察',
    interactionFamily: 'incremental_button',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'BART 泵压范式；v1 taxonomy 无对应 domain，standalone；仅描述性指标。',
    knownLimitations: [
      '不作风险偏好、冲动性或人格判断。',
      '奖励框架与任务熟悉度影响行为。',
    ],
    sourceNotes: ['Lejuez et al. (2002) BART。'],
    rightsProvenance: 'internal-generated',
  },
  wordlist: {
    testType: 'wordlist',
    educationalPurpose: '记住一组词语，然后凭记忆打出来。',
    plainAbilityHint: '词语记忆',
    interactionFamily: 'typed_recall',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'moderate',
    adminScientificNotes: '中文词表自由回忆；v1 taxonomy 无对应 domain，standalone；词库不可跨语言共享参考。',
    knownLimitations: [
      '词频与教育暴露影响成绩，不能跨语言/地区直接比较。',
      '输入归一化只清理格式/空白/标点与英文大小写。',
    ],
    sourceNotes: ['自由回忆范式（内部中文词库 chinese-wordlist-v1.0.0）。'],
    rightsProvenance: 'internal-generated 冻结词库',
  },
  lexicaldecision: {
    testType: 'lexicaldecision',
    educationalPurpose: '尽快判断屏幕上的字符串是不是真词。',
    plainAbilityHint: '词汇识别的速度与准确性',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '中文词汇判断；v1 taxonomy 无对应 domain，standalone；与语言/结晶领域分开解释。',
    knownLimitations: [
      '高度依赖语言、词频与阅读暴露。',
      '词库与伪词生成器处于 DRAFT 审查阶段。',
    ],
    sourceNotes: ['Meyer & Schvaneveldt (1971) lexical decision 传统。'],
    rightsProvenance: 'internal-generated 冻结词库 + 伪词生成器',
  },
  emotionrecognition: {
    testType: 'emotionrecognition',
    educationalPurpose: '看图片里人物的表情，选出对应的情绪。',
    plainAbilityHint: '表情的情绪分类（描述性）',
    interactionFamily: 'multi_option_selection',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '六类情绪面孔分类；v1 taxonomy 无对应 domain，standalone；内部合成面孔。',
    knownLimitations: [
      '合成面孔的文化与年龄适宜性需 pilot 审查。',
      '不作情绪能力、共情、人格或临床判断。',
    ],
    sourceNotes: ['基本情绪分类传统（Ekman 六类，内部合成刺激）。'],
    rightsProvenance: 'internal AI-synthetic faces（emotion-faces-ai-zh-v1.0.0）',
  },
}

/** catalog 身份键重复在 Record 层面不可能；此处断言防止将来改为数组/多键结构时退化。 */
const CATALOG_TEST_TYPES = Object.keys(CATALOG)
if (new Set(CATALOG_TEST_TYPES).size !== CATALOG_TEST_TYPES.length) {
  throw new Error('Duplicate cognitive library catalog testType')
}
if (CATALOG_TEST_TYPES.includes('fake')) {
  throw new Error('fake must not appear in the product cognitive library catalog')
}

/** build-time 校验：catalog 与 registry 身份必须互相对应（fail-fast）。 */
export const validateCatalogIntegrity = (): void => {
  const generatedProductTypes = COGNITIVE_TASK_TYPES.filter((testType) => testType !== 'fake')
  if (
    generatedProductTypes.length !== CATALOG_TEST_TYPES.length
    || generatedProductTypes.some((testType) => !CATALOG[testType])
  ) {
    throw new Error('Generated Cognitive task projection does not match product catalog')
  }
  for (const testType of CATALOG_TEST_TYPES) {
    if (listCognitiveRegistryEntriesForType(testType).length === 0) {
      throw new Error(`Cognitive library catalog entry has no registry identity: ${testType}`)
    }
  }
  for (const entry of listAllRegistryTestTypes()) {
    if (entry === 'fake') continue
    if (!CATALOG[entry]) {
      throw new Error(`Orphan cognitive registry task without catalog entry: ${entry}`)
    }
  }
}

const listAllRegistryTestTypes = (): string[] => {
  const all = new Set<string>()
  for (const registryEntry of listCognitiveRegistryEntries()) all.add(registryEntry.testType)
  return [...all]
}

validateCatalogIntegrity()

export const listCatalogTestTypes = (): string[] => [...CATALOG_TEST_TYPES]

export const getCatalogEntry = (testType: string): CognitiveLibraryCatalogEntry | undefined =>
  CATALOG[testType]

/** 全部 24 个真实任务的 catalog 条目（fake 天然不在内）。 */
export const listProductCatalogEntries = (): CognitiveLibraryCatalogEntry[] =>
  CATALOG_TEST_TYPES.map((testType) => CATALOG[testType])

/**
 * 权威身份 join：catalog 条目必须经 cognitive.registry 的
 * testType + engineVersion + scoringVersion 定位到具体 registry entry。
 */
export const resolveCatalogForIdentity = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): { catalog: CognitiveLibraryCatalogEntry; registry: RegistryEntry<unknown, unknown> } | undefined => {
  const catalog = CATALOG[testType]
  const registry = getCognitiveRegistryEntry(testType, engineVersion, scoringVersion)
  if (!catalog || !registry) return undefined
  return { catalog, registry }
}

export const requireCatalogForIdentity = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): { catalog: CognitiveLibraryCatalogEntry; registry: RegistryEntry<unknown, unknown> } => {
  const resolved = resolveCatalogForIdentity(testType, engineVersion, scoringVersion)
  if (!resolved) {
    throw new Error(
      `No cognitive library catalog identity for ${testType}/${engineVersion}/${scoringVersion}`,
    )
  }
  return resolved
}

/**
 * @deprecated Compatibility view for catalog-era callers. It owns no state;
 * add/delete/has operate on COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.
 */
export const RESEARCH_GRADE_IDENTITIES = COGNITIVE_RESEARCH_GRADE_IDENTITIES

/**
 * @deprecated Compatibility resolver. Scientific maturity is now owned by
 * scientific-maturity.ts and remains exact-identity scoped.
 */
export const resolveScientificStatus = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): CognitiveScientificStatus => {
  requireCatalogForIdentity(testType, engineVersion, scoringVersion)
  return resolveCognitiveScientificMaturity(testType, engineVersion, scoringVersion)
}

export interface CognitiveCatalogDomainFacetSummary {
  domain: string
  facets: Array<{
    facet: string
    primaryMetricKeys: string[]
    supportingMetricKeys: string[]
  }>
}

/**
 * Domain/Facet 摘要：只能由 evidence-mapping.registry 派生（§取消4）。
 * 无映射任务（standalone）返回 []，允许单任务报告 / Pilot Reference，
 * 暂不加入 domain aggregation。
 */
export const deriveCatalogDomainSummary = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): CognitiveCatalogDomainFacetSummary[] => {
  const mappings = listCognitiveEvidenceMappingsForTask(testType, engineVersion, scoringVersion)
  const byDomain = new Map<string, CognitiveCatalogDomainFacetSummary>()
  for (const mapping of mappings) {
    let summary = byDomain.get(mapping.domain)
    if (!summary) {
      summary = { domain: mapping.domain, facets: [] }
      byDomain.set(mapping.domain, summary)
    }
    let facet = summary.facets.find((candidate) => candidate.facet === mapping.facet)
    if (!facet) {
      facet = { facet: mapping.facet, primaryMetricKeys: [], supportingMetricKeys: [] }
      summary.facets.push(facet)
    }
    if (mapping.role === 'primary') facet.primaryMetricKeys.push(mapping.metricKey)
    else facet.supportingMetricKeys.push(mapping.metricKey)
  }
  return [...byDomain.values()]
}

export type { CognitiveScientificStatus }
