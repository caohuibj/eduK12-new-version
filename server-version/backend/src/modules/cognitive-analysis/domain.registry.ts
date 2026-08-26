import type { CognitiveDomainDefinition, CognitiveDomainKey } from './cognitive-analysis.types'

const COGNITIVE_DOMAIN_DEFINITION_V1_VERSION = '1.0.0'
export const COGNITIVE_DOMAIN_DEFINITION_VERSION = COGNITIVE_DOMAIN_DEFINITION_V1_VERSION

const DEFINITIONS_V1: CognitiveDomainDefinition[] = [
  {
    key: 'processing_speed',
    label: '加工速度',
    description: '在明确规则下完成简单反应或视觉比较的速度。',
    facets: [
      { key: 'simple_response', label: '简单反应' },
      { key: 'visual_comparison', label: '视觉比较' },
    ],
  },
  {
    key: 'sustained_attention',
    label: '持续注意与稳定性',
    description: '在连续任务中维持辨别、减少遗漏并保持反应稳定。',
    facets: [
      { key: 'target_discrimination', label: '目标辨别' },
      { key: 'omission_control', label: '遗漏控制' },
      { key: 'response_stability', label: '反应稳定性' },
    ],
  },
  {
    key: 'response_inhibition',
    label: '反应抑制',
    description: '抑制已准备或优势动作反应。',
    facets: [
      { key: 'action_withholding', label: '动作克制' },
      { key: 'action_cancellation', label: '动作停止' },
    ],
  },
  {
    key: 'interference_control',
    label: '干扰控制',
    description: '在冲突信息存在时维持目标规则。',
    facets: [
      { key: 'semantic_interference', label: '语义干扰' },
      { key: 'perceptual_interference', label: '知觉干扰' },
    ],
  },
  {
    key: 'working_memory',
    label: '工作记忆',
    description: '短时保持、操作和更新信息。',
    facets: [
      { key: 'verbal_storage', label: '言语保持' },
      { key: 'verbal_manipulation', label: '言语操作' },
      { key: 'visuospatial_storage', label: '视空间保持' },
      { key: 'updating', label: '更新' },
    ],
  },
  {
    key: 'cognitive_flexibility',
    label: '认知灵活性',
    description: '在不同规则或任务集合之间进行切换。',
    facets: [
      { key: 'trial_switching', label: '试次切换' },
      { key: 'rule_shifting', label: '规则转换' },
    ],
  },
  {
    key: 'episodic_learning_memory',
    label: '情景学习与记忆',
    description: '学习并保持事件顺序或项目之间的配对关系。',
    facets: [
      { key: 'sequence_learning', label: '序列学习' },
      { key: 'paired_learning', label: '配对学习' },
    ],
  },
  {
    key: 'fluid_reasoning',
    label: '流体推理',
    description: '从新异图形关系中归纳规则。',
    facets: [{ key: 'rule_induction', label: '规则归纳' }],
  },
  {
    key: 'visuospatial_reasoning',
    label: '视空间推理',
    description: '在心理表征中判断空间变换。',
    facets: [{ key: 'mental_rotation', label: '心理旋转' }],
  },
  {
    key: 'planning',
    label: '计划',
    description: '在规则约束下预先组织达到目标所需的步骤。',
    facets: [{ key: 'look_ahead', label: '前瞻计划' }],
  },
]

export const validateDomainDefinitions = (definitions: CognitiveDomainDefinition[]): void => {
  const keys = new Set<string>()
  for (const definition of definitions) {
    if (keys.has(definition.key)) throw new Error(`Duplicate cognitive domain: ${definition.key}`)
    keys.add(definition.key)
    if (definition.facets.length === 0) throw new Error(`Cognitive domain has no facets: ${definition.key}`)
    const facetKeys = new Set<string>()
    for (const facet of definition.facets) {
      if (facetKeys.has(facet.key)) {
        throw new Error(`Duplicate cognitive domain facet: ${definition.key}/${facet.key}`)
      }
      facetKeys.add(facet.key)
    }
  }
}

validateDomainDefinitions(DEFINITIONS_V1)

const DEFINITIONS_BY_VERSION = new Map<string, CognitiveDomainDefinition[]>([
  [COGNITIVE_DOMAIN_DEFINITION_V1_VERSION, DEFINITIONS_V1],
])

const BY_VERSION_AND_KEY = new Map<string, Map<CognitiveDomainKey, CognitiveDomainDefinition>>(
  [...DEFINITIONS_BY_VERSION].map(([version, definitions]) => [
    version,
    new Map(definitions.map((definition) => [definition.key, definition])),
  ]),
)

const cloneDomain = (definition: CognitiveDomainDefinition): CognitiveDomainDefinition => ({
  ...definition,
  facets: definition.facets.map((facet) => ({ ...facet })),
})

export const hasCognitiveDomainDefinitionVersion = (version: string): boolean =>
  DEFINITIONS_BY_VERSION.has(version)

export const listCognitiveDomainDefinitions = (
  version = COGNITIVE_DOMAIN_DEFINITION_VERSION,
): CognitiveDomainDefinition[] =>
  (DEFINITIONS_BY_VERSION.get(version) ?? []).map(cloneDomain)

export const getCognitiveDomainDefinition = (
  key: CognitiveDomainKey,
  version = COGNITIVE_DOMAIN_DEFINITION_VERSION,
): CognitiveDomainDefinition | undefined => {
  const definition = BY_VERSION_AND_KEY.get(version)?.get(key)
  return definition ? cloneDomain(definition) : undefined
}
