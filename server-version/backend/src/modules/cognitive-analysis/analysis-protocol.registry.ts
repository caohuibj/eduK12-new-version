import { getCognitiveRegistryEntry } from '../cognitive/cognitive.registry'
import type {
  AnalysisProtocolDefinition,
  CognitiveAnalysisProfile,
  CognitiveProtocolSlotDefinition,
  ScaleProtocolSlotDefinition,
} from './cognitive-analysis.types'
import { COGNITIVE_DOMAIN_DEFINITION_VERSION, getCognitiveDomainDefinition } from './domain.registry'
import {
  COGNITIVE_EVIDENCE_MAPPING_VERSION,
  listCognitiveEvidenceMappings,
} from './evidence-mapping.registry'
import {
  COGNITIVE_RECOMMENDATION_RULE_VERSION,
  LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION,
} from './recommendation.registry'
import { getScaleDimensionEvidenceMapping } from './scale-evidence-mapping.registry'

const currentSlot = (
  key: string,
  label: string,
  position: number,
  testType: string,
  configVersion: string,
  scoringVersion: string,
  definitionVersion: string,
): CognitiveProtocolSlotDefinition => ({
  key,
  label,
  position,
  required: true,
  testType,
  configVersion,
  engineVersion: '1.0.0',
  scoringVersion,
  profileDefinitionVersion: definitionVersion,
  metricDefinitionVersion: definitionVersion,
  qualityDefinitionVersion: definitionVersion,
  reportDefinitionVersion: definitionVersion,
})

const futureSlot = (
  key: string,
  label: string,
  position: number,
  testType: string,
): CognitiveProtocolSlotDefinition => currentSlot(key, label, position, testType, '1.0.0', '1.0.0', '1.0.0')

const reaction = (position: number) => currentSlot('reaction', '简单反应', position, 'reaction', '1.1.0', '1.1.0', '1.1.0')
const cpt = (position: number) => currentSlot('cpt', '持续注意', position, 'cpt', '1.0.0', '1.0.0', '1.0.0')
const gonogo = (position: number) => currentSlot('gonogo', 'Go/No-Go', position, 'gonogo', '1.0.0', '1.0.0', '1.0.0')
const sst = (position: number) => currentSlot('sst', '停止信号', position, 'sst', '1.0.0', '1.0.0', '1.0.0')
const stroop = (position: number) => currentSlot('stroop', 'Stroop', position, 'stroop', '1.1.0', '1.1.0', '1.1.0')
const memory = (position: number) => currentSlot('memory', '数字顺背', position, 'memory', '1.1.0', '1.1.0', '1.1.0')
const corsi = (position: number) => currentSlot('corsi', 'Corsi', position, 'corsi', '1.0.0', '1.0.0', '1.0.0')
const nback = (position: number) => currentSlot('nback', 'N-Back', position, 'nback', '1.0.0', '1.0.0', '1.0.0')
const taskswitch = (position: number) => currentSlot('taskswitch', '任务切换', position, 'taskswitch', '1.0.0', '1.0.0', '1.0.0')

const adexiInhibition = (position: number): ScaleProtocolSlotDefinition => ({
  key: 'adexi_inhibition',
  label: 'ADEXI 抑制自评',
  position,
  required: true,
  mappingKey: 'adexi_v1.inhibition.response_inhibition.v1',
  mappingVersion: '1.0.0',
  expectedScaleCode: 'adexi_v1',
  expectedDimensionCode: 'inhibition',
  respondentType: 'participant_self_report',
  valueSelector: 'dimensionScore',
})

const profiles: CognitiveAnalysisProfile[] = ['standard', 'research']

const draftProtocol = (
  key: string,
  name: string,
  description: string,
  standardMinutes: [number, number],
  researchMinutes: [number, number],
  cognitiveSlots: CognitiveProtocolSlotDefinition[],
  outputDomains: AnalysisProtocolDefinition['outputDomains'],
): AnalysisProtocolDefinition => ({
  key,
  version: '1.0.0',
  status: 'DRAFT',
  name,
  description,
  recommendedForCreate: false,
  profiles,
  estimatedMinutes: { standard: standardMinutes, research: researchMinutes },
  cognitiveSlots,
  scaleSlots: [],
  outputDomains,
  domainDefinitionVersion: COGNITIVE_DOMAIN_DEFINITION_VERSION,
  evidenceMappingVersion: COGNITIVE_EVIDENCE_MAPPING_VERSION,
  // PR7 cognitive-only protocols retain their historical no-recommendation
  // contract. New package semantics opt into the PR11 rules explicitly below.
  recommendationRuleVersion: LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION,
  disabledReason: 'Round 2 核心任务、分析引擎与发布 Gate 尚未全部完成',
})

const PROTOCOLS: AnalysisProtocolDefinition[] = [
  draftProtocol(
    'attention_stability_v1',
    '注意与稳定性',
    '由简单反应、持续注意和视觉比较任务形成受控证据画像。',
    [10, 15],
    [20, 30],
    [reaction(0), cpt(1), futureSlot('patterncompare', '图形模式比较', 2, 'patterncompare')],
    ['processing_speed', 'sustained_attention'],
  ),
  draftProtocol(
    'inhibitory_control_v1',
    '抑制与干扰控制',
    '区分动作克制、动作停止和干扰控制，不形成单一抑制总分。',
    [18, 25],
    [35, 50],
    [gonogo(0), sst(1), stroop(2), futureSlot('flanker', 'Flanker', 3, 'flanker')],
    ['response_inhibition', 'interference_control'],
  ),
  {
    key: 'inhibitory_control_multisource_v1',
    version: '1.0.0',
    status: 'DRAFT',
    name: '抑制控制跨来源画像',
    description: '由 Go/No-Go 行为任务与 ADEXI 学员自评共同呈现抑制控制的描述性证据，不按学员年龄或身份限制作答。',
    recommendedForCreate: false,
    profiles,
    estimatedMinutes: { standard: [8, 15], research: [10, 20] },
    cognitiveSlots: [gonogo(0)],
    scaleSlots: [adexiInhibition(1)],
    outputDomains: ['response_inhibition'],
    domainDefinitionVersion: COGNITIVE_DOMAIN_DEFINITION_VERSION,
    evidenceMappingVersion: COGNITIVE_EVIDENCE_MAPPING_VERSION,
    // This package is still DRAFT. PR11 changes its recommendation semantics
    // in-place only while it remains unpublished; bump the protocol/package
    // version before changing status to PUBLISHED.
    recommendationRuleVersion: COGNITIVE_RECOMMENDATION_RULE_VERSION,
    disabledReason: 'ADEXI 量表已取得使用授权；适用人群与发布材料仍需完成项目审核，PR10 保持 DRAFT。',
  },
  draftProtocol(
    'working_memory_v1',
    '工作记忆分面',
    '分别呈现言语保持、言语操作、视空间保持和更新。',
    [18, 25],
    [35, 50],
    [
      memory(0),
      futureSlot('digitbackward', '数字倒背', 1, 'digitbackward'),
      corsi(2),
      nback(3),
    ],
    ['working_memory'],
  ),
  draftProtocol(
    'executive_control_v1',
    '执行控制分面',
    '呈现更新、停止、试次切换、规则转换和计划分面，不形成执行总分。',
    [25, 35],
    [50, 75],
    [
      nback(0),
      sst(1),
      taskswitch(2),
      futureSlot('cardsort', '规则卡片分类', 3, 'cardsort'),
      futureSlot('tower', '塔式规划', 4, 'tower'),
    ],
    ['working_memory', 'response_inhibition', 'cognitive_flexibility', 'planning'],
  ),
  draftProtocol(
    'learning_reasoning_v1',
    '学习与推理',
    '分开呈现情景学习、流体推理和视空间推理。',
    [25, 35],
    [45, 70],
    [
      futureSlot('picturesequence', '图片序列学习', 0, 'picturesequence'),
      futureSlot('pairedassociate', '配对学习', 1, 'pairedassociate'),
      futureSlot('matrix', '矩阵推理', 2, 'matrix'),
      futureSlot('mentalrotation', '心理旋转', 3, 'mentalrotation'),
    ],
    ['episodic_learning_memory', 'fluid_reasoning', 'visuospatial_reasoning'],
  ),
  draftProtocol(
    'k12_core_profile_v1',
    'K12 核心认知画像',
    '按固定十任务电池覆盖主要 K12 认知领域，不形成综合认知分。',
    [40, 55],
    [80, 120],
    [
      futureSlot('patterncompare', '图形模式比较', 0, 'patterncompare'),
      cpt(1),
      futureSlot('flanker', 'Flanker', 2, 'flanker'),
      gonogo(3),
      nback(4),
      futureSlot('digitbackward', '数字倒背', 5, 'digitbackward'),
      futureSlot('cardsort', '规则卡片分类', 6, 'cardsort'),
      futureSlot('picturesequence', '图片序列学习', 7, 'picturesequence'),
      futureSlot('matrix', '矩阵推理', 8, 'matrix'),
      futureSlot('tower', '塔式规划', 9, 'tower'),
    ],
    [
      'processing_speed',
      'sustained_attention',
      'response_inhibition',
      'interference_control',
      'working_memory',
      'cognitive_flexibility',
      'episodic_learning_memory',
      'fluid_reasoning',
      'planning',
    ],
  ),
]

const protocolKey = (protocol: AnalysisProtocolDefinition): string => `${protocol.key}/${protocol.version}`

export const validateAnalysisProtocolDefinitions = (
  protocols: AnalysisProtocolDefinition[],
): void => {
  const keys = new Set<string>()
  const evidenceMappings = listCognitiveEvidenceMappings()
  for (const protocol of protocols) {
    const key = protocolKey(protocol)
    if (keys.has(key)) throw new Error(`Duplicate analysis protocol: ${key}`)
    keys.add(key)
    if (protocol.recommendedForCreate && protocol.status !== 'PUBLISHED') {
      throw new Error(`Only PUBLISHED analysis protocol can be recommended: ${key}`)
    }
    if (
      protocol.domainDefinitionVersion !== COGNITIVE_DOMAIN_DEFINITION_VERSION ||
      protocol.evidenceMappingVersion !== COGNITIVE_EVIDENCE_MAPPING_VERSION ||
      ![
        COGNITIVE_RECOMMENDATION_RULE_VERSION,
        LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION,
      ].includes(protocol.recommendationRuleVersion)
    ) {
      throw new Error(`Analysis protocol registry version mismatch: ${key}`)
    }
    if (protocol.recommendationRuleVersion === COGNITIVE_RECOMMENDATION_RULE_VERSION && protocol.scaleSlots.length === 0) {
      throw new Error(`Current recommendation rules require a multi-source protocol: ${key}`)
    }
    if (
      protocol.status === 'PUBLISHED'
      && protocol.recommendationRuleVersion === COGNITIVE_RECOMMENDATION_RULE_VERSION
      && protocol.version === '1.0.0'
    ) {
      throw new Error(`Published protocol with PR11 recommendation rules must bump protocol version: ${key}`)
    }
    if (
      protocol.profiles.length === 0 ||
      (protocol.profiles as string[]).some((profile) => profile === 'experience')
    ) {
      throw new Error(`Analysis protocol must only allow standard/research profiles: ${key}`)
    }
    if (protocol.cognitiveSlots.length === 0) throw new Error(`Analysis protocol has no cognitive slots: ${key}`)
    for (const profile of protocol.profiles) {
      const [minimum, maximum] = protocol.estimatedMinutes[profile]
      if (minimum <= 0 || maximum < minimum) {
        throw new Error(`Invalid analysis protocol estimated minutes: ${key}/${profile}`)
      }
    }

    const slotKeys = new Set<string>()
    const slotTypes = new Set<string>()
    const positions = new Set<number>()
    for (const slot of protocol.cognitiveSlots) {
      if (slotKeys.has(slot.key)) throw new Error(`Duplicate analysis protocol slot key: ${key}/${slot.key}`)
      if (slotTypes.has(slot.testType)) throw new Error(`Duplicate analysis protocol task: ${key}/${slot.testType}`)
      if (positions.has(slot.position)) throw new Error(`Duplicate analysis protocol position: ${key}/${slot.position}`)
      slotKeys.add(slot.key)
      slotTypes.add(slot.testType)
      positions.add(slot.position)

      if (protocol.status === 'PUBLISHED') {
        const entry = getCognitiveRegistryEntry(slot.testType, slot.engineVersion, slot.scoringVersion)
        if (!entry) throw new Error(`PUBLISHED analysis protocol has unresolved task: ${key}/${slot.testType}`)
        if (
          entry.profileDefinitionVersion !== slot.profileDefinitionVersion ||
          entry.metricDefinitionVersion !== slot.metricDefinitionVersion ||
          entry.qualityDefinitionVersion !== slot.qualityDefinitionVersion ||
          entry.reportDefinitionVersion !== slot.reportDefinitionVersion
        ) {
          throw new Error(`PUBLISHED analysis protocol task definition mismatch: ${key}/${slot.testType}`)
        }
      }
    }

    for (const slot of protocol.scaleSlots) {
      if (slotKeys.has(slot.key)) throw new Error(`Duplicate analysis protocol slot key: ${key}/${slot.key}`)
      if (positions.has(slot.position)) throw new Error(`Duplicate analysis protocol position: ${key}/${slot.position}`)
      if (!slot.mappingKey || !slot.mappingVersion || !slot.expectedScaleCode || !slot.expectedDimensionCode) {
        throw new Error(`Scale analysis protocol slot mapping is incomplete: ${key}/${slot.key}`)
      }
      if (slot.respondentType !== 'participant_self_report' || slot.valueSelector !== 'dimensionScore') {
        throw new Error(`Scale analysis protocol slot respondent/value selector is invalid: ${key}/${slot.key}`)
      }
      const mapping = getScaleDimensionEvidenceMapping(slot.mappingKey, slot.mappingVersion)
      if (
        !mapping
        || mapping.scaleCode !== slot.expectedScaleCode
        || mapping.dimensionCode !== slot.expectedDimensionCode
        || mapping.respondentType !== slot.respondentType
        || mapping.valueSelector !== slot.valueSelector
      ) {
        throw new Error(`Scale analysis protocol slot mapping is unresolved: ${key}/${slot.key}`)
      }
      slotKeys.add(slot.key)
      positions.add(slot.position)
    }

    for (const domainKey of protocol.outputDomains) {
      if (!getCognitiveDomainDefinition(domainKey)) {
        throw new Error(`Unknown analysis protocol output domain: ${key}/${domainKey}`)
      }
      if (protocol.status === 'PUBLISHED') {
        const hasEvidence = evidenceMappings.some(
          (mapping) => mapping.domain === domainKey && slotTypes.has(mapping.testType),
        )
        if (!hasEvidence) {
          throw new Error(`PUBLISHED analysis protocol output has no evidence mapping: ${key}/${domainKey}`)
        }
      }
    }
  }
}

validateAnalysisProtocolDefinitions(PROTOCOLS)

const BY_KEY = new Map(PROTOCOLS.map((protocol) => [protocolKey(protocol), protocol]))

const cloneProtocol = (protocol: AnalysisProtocolDefinition): AnalysisProtocolDefinition => ({
  ...protocol,
  profiles: [...protocol.profiles],
  estimatedMinutes: {
    standard: [...protocol.estimatedMinutes.standard],
    research: [...protocol.estimatedMinutes.research],
  },
  cognitiveSlots: protocol.cognitiveSlots.map((slot) => ({ ...slot })),
  scaleSlots: protocol.scaleSlots.map((slot) => ({ ...slot })),
  outputDomains: [...protocol.outputDomains],
})

export const listAnalysisProtocolDefinitions = (): AnalysisProtocolDefinition[] =>
  PROTOCOLS.map(cloneProtocol)

export const getAnalysisProtocolDefinition = (
  key: string,
  version: string,
): AnalysisProtocolDefinition | undefined => {
  const protocol = BY_KEY.get(`${key}/${version}`)
  return protocol ? cloneProtocol(protocol) : undefined
}
