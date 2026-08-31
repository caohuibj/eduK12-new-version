import type { ReportPackageDefinition } from '../cognitive-analysis/report-package.registry'
import type {
  BundleCoreRuleDefinition,
  BundleEvidenceMappingDefinition,
  MentalHealthBundleDefinition,
  MentalHealthBundleScaleSlotDefinition,
} from './mental-health-bundle.types'
import {
  MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
  MENTAL_HEALTH_BUNDLE_EVIDENCE_MAPPING_VERSION,
  MENTAL_HEALTH_BUNDLE_RULESET_VERSION,
} from './mental-health-bundle.types'

const profiles = ['standard', 'research'] as const

const gate = (notes: string[], safetyGateRequired = false) => ({
  exactFormsVerified: false,
  rightsVerified: false,
  scoringAndReferenceVerified: false,
  chineseEvidenceVerified: false,
  safetyGateRequired,
  safetyGatePassed: !safetyGateRequired,
  notes,
})

const mapping = (
  slotKey: string,
  scaleCode: string,
  scoreKey: string,
  role: BundleEvidenceMappingDefinition['role'],
  construct: string,
  options: Partial<Pick<BundleEvidenceMappingDefinition, 'facet' | 'classificationCodes' | 'safetyTriggerCodes' | 'feedbackBlockKey' | 'direction'>> = {},
): BundleEvidenceMappingDefinition => ({
  mappingKey: `mental-health.${slotKey}.${scoreKey}.${role.toLowerCase()}`,
  mappingVersion: '1.0.0',
  scaleCode,
  scoreKey,
  role,
  construct,
  direction: 'descriptive',
  ...options,
})

const slot = (
  key: string,
  label: string,
  position: number,
  expectedScaleCode: string,
  respondentType: string,
  mappings: BundleEvidenceMappingDefinition[],
): MentalHealthBundleScaleSlotDefinition => ({
  key,
  label,
  position,
  required: true,
  expectedScaleCode,
  respondentType,
  mappings,
})

const feedback = (key: string, text: string) => ({
  key,
  text,
  audience: ['participant', 'teacher', 'researcher'] as Array<'participant' | 'teacher' | 'researcher'>,
})

const youthScaredTotal = mapping('youth.scared41', 'scared_41_child', 'total', 'PRIMARY', 'anxiety', {
  classificationCodes: ['NEGATIVE', 'POSITIVE'],
  feedbackBlockKey: 'youth.core',
})
const youthRcadsAnxiety = mapping('youth.rcads25', 'rcads_25_youth', 'anxiety_total', 'PRIMARY', 'anxiety', {
  classificationCodes: ['NORMAL', 'BORDERLINE', 'CLINICAL'],
  feedbackBlockKey: 'youth.core',
})
const youthWho5 = mapping('youth.who5', 'who5', 'total', 'PRIMARY', 'wellbeing', {
  classificationCodes: ['ADEQUATE', 'LOW'],
  direction: 'higher_is_better',
  feedbackBlockKey: 'youth.wellbeing',
})

const youthFacetMappings = [
  ['panic', 'panic'],
  ['somatic', 'somatic'],
  ['generalized', 'generalized_anxiety'],
  ['separation', 'separation_anxiety'],
  ['social', 'social_anxiety'],
  ['school_avoidance', 'school_avoidance'],
].map(([facet, scoreKey]) => mapping('youth.scared41', 'scared_41_child', scoreKey, 'FACET', 'anxiety', {
  facet,
  feedbackBlockKey: 'youth.facet',
}))

const youthContextMappings = [
  mapping('youth.rcads25', 'rcads_25_youth', 'depression_total', 'CONTEXT', 'related_mood', { feedbackBlockKey: 'youth.context' }),
  mapping('youth.rcads25', 'rcads_25_youth', 'internalizing_total', 'CONTEXT', 'internalizing', { feedbackBlockKey: 'youth.context' }),
]

const youthCoreRules = (): BundleCoreRuleDefinition[] => {
  const rules: BundleCoreRuleDefinition[] = []
  const scared = ['NEGATIVE', 'POSITIVE']
  const anxiety = ['NORMAL', 'BORDERLINE', 'CLINICAL']
  const wellbeing = ['ADEQUATE', 'LOW']
  for (const scaredClass of scared) {
    for (const anxietyClass of anxiety) {
      for (const wellbeingClass of wellbeing) {
        const primarySignalCount = Number(scaredClass === 'POSITIVE') + Number(anxietyClass === 'CLINICAL')
        const mainSignal = primarySignalCount > 0
        const outcomeCode = wellbeingClass === 'LOW'
          ? (mainSignal ? 'CONCERN_WITH_LOW_WELLBEING' : 'MIXED_RESULTS')
          : primarySignalCount === 2
            ? 'STRONG_CONVERGENCE'
            : primarySignalCount === 1
              ? 'MIXED_RESULTS'
              : 'LOW_CONCERN'
        rules.push({
          ruleId: `youth-anxiety.core.${scaredClass.toLowerCase()}.${anxietyClass.toLowerCase()}.${wellbeingClass.toLowerCase()}`,
          ruleVersion: '1.0.0',
          requiredEvidence: [
            { mappingKey: youthScaredTotal.mappingKey, classification: scaredClass },
            { mappingKey: youthRcadsAnxiety.mappingKey, classification: anxietyClass },
            { mappingKey: youthWho5.mappingKey, classification: wellbeingClass },
          ],
          outcomeCode: outcomeCode as BundleCoreRuleDefinition['outcomeCode'],
          actionTier: outcomeCode === 'LOW_CONCERN' ? 'NONE' : outcomeCode === 'MIXED_RESULTS' ? 'DISCUSS' : 'FOLLOW_UP',
          feedbackBlockKey: wellbeingClass === 'LOW' ? 'youth.low-wellbeing' : 'youth.core',
        })
      }
    }
  }
  return rules
}

const youthDefinition: MentalHealthBundleDefinition = {
  key: 'youth_anxiety_comprehensive_v1',
  version: '1.0.0',
  status: 'DRAFT',
  category: 'youth_self',
  name: 'Youth Anxiety Comprehensive Self-Report',
  description: 'SCARED-41 Child、RCADS-25 Youth 与 WHO-5 的确定性综合描述包。',
  subjectPopulation: 'youth',
  respondentType: 'participant_self_report',
  construct: 'youth_anxiety_and_wellbeing',
  purpose: '在不合并量表分数的前提下呈现焦虑相关来源的一致性、分面与整体福祉上下文。',
  estimatedMinutes: { standard: [15, 25], research: [20, 35] },
  profiles: [...profiles],
  scaleSlots: [
    slot('youth.scared41', 'SCARED-41 Child', 0, 'scared_41_child', 'participant_self_report', [youthScaredTotal, ...youthFacetMappings]),
    slot('youth.rcads25', 'RCADS-25 Youth', 1, 'rcads_25_youth', 'participant_self_report', [youthRcadsAnxiety, ...youthContextMappings]),
    slot('youth.who5', 'WHO-5', 2, 'who5', 'participant_self_report', [youthWho5]),
  ],
  ruleSetKey: 'YouthAnxietyBundleRuleSetV1',
  ruleSetVersion: MENTAL_HEALTH_BUNDLE_RULESET_VERSION,
  reportDefinitionVersion: 'mental-health-bundle-report-v1.0.0',
  evidenceMappingVersion: MENTAL_HEALTH_BUNDLE_EVIDENCE_MAPPING_VERSION,
  coreRules: youthCoreRules(),
  facetRules: youthFacetMappings.map((item) => ({ ruleId: `${item.mappingKey}.facet`, ruleVersion: '1.0.0', mappingKey: item.mappingKey, feedbackBlockKey: item.feedbackBlockKey ?? 'youth.facet' })),
  contextRules: youthContextMappings.map((item) => ({ ruleId: `${item.mappingKey}.context`, ruleVersion: '1.0.0', mappingKey: item.mappingKey, feedbackBlockKey: item.feedbackBlockKey ?? 'youth.context' })),
  feedbackBlocks: [
    feedback('youth.core', '不同预先指定来源在本次测评中提供了需要结合近期情境理解的描述性信息。'),
    feedback('youth.low-wellbeing', '焦虑相关信息与较低整体福祉同时出现，建议优先结合近期压力与支持资源进行人工了解。'),
    feedback('youth.wellbeing', 'WHO-5 仅作为整体福祉上下文保留，不改变其他量表的原始解释。'),
    feedback('youth.facet', '该分面作为焦虑相关描述信息保留，不单独构成结论。'),
    feedback('youth.context', '该相关主题作为上下文信息保留，不自动等同于核心焦虑结论。'),
  ],
  publicationGate: gate([
    '必须锁定中文/实际使用版本、施测对象、计分与参考解释来源后才可发布。',
    '当前仓库不内置第三方问卷题目内容，未通过 rights/scientific gate。',
  ]),
  limitations: [
    'Bundle 不计算跨量表平均、总分、标准化指数或诊断结论。',
    'CORE 组合只使用预先登记的分类代码；未命中时 fail closed。',
    'Scale standalone result 与 Bundle aggregate result 必须同时保留。',
  ],
  disabledReason: 'SCARED/RCADS/WHO-5 的 exact form、中文证据、计分参考与使用权利尚未完成项目 Gate。',
}

const parentScared = mapping('parent.scared', 'scared_parent', 'total', 'PRIMARY', 'child_anxiety_observation', {
  classificationCodes: ['LOW', 'ELEVATED'],
  feedbackBlockKey: 'parent.core',
})
const parentRcads = mapping('parent.rcads', 'rcads_25_caregiver', 'anxiety_total', 'PRIMARY', 'child_anxiety_observation', {
  classificationCodes: ['NORMAL', 'ELEVATED'],
  feedbackBlockKey: 'parent.core',
})
const parentFacetMappings = [
  mapping('parent.scared', 'scared_parent', 'panic', 'FACET', 'child_anxiety_observation', { facet: 'panic', feedbackBlockKey: 'parent.facet' }),
  mapping('parent.scared', 'scared_parent', 'social', 'FACET', 'child_anxiety_observation', { facet: 'social', feedbackBlockKey: 'parent.facet' }),
  mapping('parent.rcads', 'rcads_25_caregiver', 'depression_total', 'CONTEXT', 'related_mood', { feedbackBlockKey: 'parent.context' }),
]
const parentDefinition: MentalHealthBundleDefinition = {
  key: 'parent_anxiety_observer_v1',
  version: '1.0.0',
  status: 'DRAFT',
  category: 'parent_caregiver',
  name: 'Parent Anxiety Observer Bundle',
  description: '家长/照护者自评的确定性儿童焦虑相关描述包。',
  subjectPopulation: 'youth',
  respondentType: 'parent_report',
  construct: 'child_anxiety_observation',
  purpose: '保留家长观察来源的核心、分面与相关上下文，不把观察结果转写成诊断。',
  estimatedMinutes: { standard: [10, 20], research: [15, 25] },
  profiles: [...profiles],
  scaleSlots: [
    slot('parent.scared', 'SCARED Parent', 0, 'scared_parent', 'parent_report', [parentScared, ...parentFacetMappings.slice(0, 2)]),
    slot('parent.rcads', 'RCADS-25 Caregiver', 1, 'rcads_25_caregiver', 'parent_report', [parentRcads, parentFacetMappings[2]]),
  ],
  ruleSetKey: 'ParentAnxietyBundleRuleSetV1',
  ruleSetVersion: MENTAL_HEALTH_BUNDLE_RULESET_VERSION,
  reportDefinitionVersion: 'mental-health-bundle-report-v1.0.0',
  evidenceMappingVersion: MENTAL_HEALTH_BUNDLE_EVIDENCE_MAPPING_VERSION,
  coreRules: [
    { ruleId: 'parent-anxiety.core.low-normal', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: parentScared.mappingKey, classification: 'LOW' }, { mappingKey: parentRcads.mappingKey, classification: 'NORMAL' }], outcomeCode: 'LOW_CONCERN', actionTier: 'NONE', feedbackBlockKey: 'parent.low' },
    { ruleId: 'parent-anxiety.core.elevated-elevated', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: parentScared.mappingKey, classification: 'ELEVATED' }, { mappingKey: parentRcads.mappingKey, classification: 'ELEVATED' }], outcomeCode: 'CONSISTENT_SIGNAL', actionTier: 'FOLLOW_UP', feedbackBlockKey: 'parent.core' },
    { ruleId: 'parent-anxiety.core.mismatch', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: parentScared.mappingKey, classification: 'LOW' }, { mappingKey: parentRcads.mappingKey, classification: 'ELEVATED' }], outcomeCode: 'MIXED_RESULTS', actionTier: 'DISCUSS', feedbackBlockKey: 'parent.mixed' },
    { ruleId: 'parent-anxiety.core.mismatch-reverse', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: parentScared.mappingKey, classification: 'ELEVATED' }, { mappingKey: parentRcads.mappingKey, classification: 'NORMAL' }], outcomeCode: 'MIXED_RESULTS', actionTier: 'DISCUSS', feedbackBlockKey: 'parent.mixed' },
  ],
  facetRules: parentFacetMappings.slice(0, 2).map((item) => ({ ruleId: `${item.mappingKey}.facet`, ruleVersion: '1.0.0', mappingKey: item.mappingKey, feedbackBlockKey: 'parent.facet' })),
  contextRules: [parentFacetMappings[2]].map((item) => ({ ruleId: `${item.mappingKey}.context`, ruleVersion: '1.0.0', mappingKey: item.mappingKey, feedbackBlockKey: 'parent.context' })),
  feedbackBlocks: [
    feedback('parent.low', '本次家长观察来源未显示明确的共同关注信号。'),
    feedback('parent.core', '两个预先指定的家长观察来源呈现一致的需要关注信号。'),
    feedback('parent.mixed', '家长观察来源的结果不完全一致，建议结合具体情境和时间变化进行沟通。'),
    feedback('parent.facet', '该观察分面仅作为描述信息保留。'),
    feedback('parent.context', '该相关主题作为上下文保留，不自动等同于焦虑结论。'),
  ],
  publicationGate: gate(['必须完成家长版 exact form、中文证据与版权/授权审核。']),
  limitations: ['同一个体的自评与他评目前只保留 subject/respondent/episode 兼容字段，不在本 Bundle 内自动综合。'],
  disabledReason: '家长版 exact form、中文证据与使用授权尚未完成。',
}

const teacherSdhq = mapping('teacher.sdq', 'sdq_teacher', 'total_difficulties', 'PRIMARY', 'broad_school_observation', {
  classificationCodes: ['TYPICAL', 'ELEVATED'],
  feedbackBlockKey: 'teacher.core',
})
const teacherPsc = mapping('teacher.psc17', 'psc17_teacher', 'attention', 'PRIMARY', 'broad_school_observation', {
  classificationCodes: ['TYPICAL', 'ELEVATED'],
  feedbackBlockKey: 'teacher.core',
})
const teacherFacet = mapping('teacher.sdq', 'sdq_teacher', 'conduct', 'FACET', 'broad_school_observation', { facet: 'conduct', feedbackBlockKey: 'teacher.facet' })
const teacherContext = mapping('teacher.sdq', 'sdq_teacher', 'emotional', 'CONTEXT', 'emotional_context', { facet: 'emotional', feedbackBlockKey: 'teacher.context' })
const teacherDefinition: MentalHealthBundleDefinition = {
  key: 'teacher_broad_mental_health_v1',
  version: '1.0.0',
  status: 'DRAFT',
  category: 'teacher',
  name: 'Teacher Broad Mental Health Bundle',
  description: '教师观察来源的 broad mental-health 描述包，保留弱兼容边界。',
  subjectPopulation: 'youth',
  respondentType: 'teacher_report',
  construct: 'broad_school_observation',
  purpose: '按明确登记的相邻行为构念呈现教师观察，禁止把情绪/内化与注意/外化自动等同。',
  estimatedMinutes: { standard: [8, 15], research: [12, 20] },
  profiles: [...profiles],
  scaleSlots: [
    slot('teacher.sdq', 'SDQ Teacher', 0, 'sdq_teacher', 'teacher_report', [teacherSdhq, teacherFacet, teacherContext]),
    slot('teacher.psc17', 'PSC-17 Teacher', 1, 'psc17_teacher', 'teacher_report', [teacherPsc]),
  ],
  ruleSetKey: 'TeacherBroadMentalHealthRuleSetV1',
  ruleSetVersion: MENTAL_HEALTH_BUNDLE_RULESET_VERSION,
  reportDefinitionVersion: 'mental-health-bundle-report-v1.0.0',
  evidenceMappingVersion: MENTAL_HEALTH_BUNDLE_EVIDENCE_MAPPING_VERSION,
  coreRules: [
    { ruleId: 'teacher-broad.core.typical-typical', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: teacherSdhq.mappingKey, classification: 'TYPICAL' }, { mappingKey: teacherPsc.mappingKey, classification: 'TYPICAL' }], outcomeCode: 'LOW_CONCERN', actionTier: 'NONE', feedbackBlockKey: 'teacher.low' },
    { ruleId: 'teacher-broad.core.elevated-elevated', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: teacherSdhq.mappingKey, classification: 'ELEVATED' }, { mappingKey: teacherPsc.mappingKey, classification: 'ELEVATED' }], outcomeCode: 'CONSISTENT_SIGNAL', actionTier: 'DISCUSS', feedbackBlockKey: 'teacher.core' },
    { ruleId: 'teacher-broad.core.mixed-1', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: teacherSdhq.mappingKey, classification: 'TYPICAL' }, { mappingKey: teacherPsc.mappingKey, classification: 'ELEVATED' }], outcomeCode: 'MIXED_RESULTS', actionTier: 'DISCUSS', feedbackBlockKey: 'teacher.mixed' },
    { ruleId: 'teacher-broad.core.mixed-2', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: teacherSdhq.mappingKey, classification: 'ELEVATED' }, { mappingKey: teacherPsc.mappingKey, classification: 'TYPICAL' }], outcomeCode: 'MIXED_RESULTS', actionTier: 'DISCUSS', feedbackBlockKey: 'teacher.mixed' },
  ],
  facetRules: [{ ruleId: 'teacher-broad.facet.conduct', ruleVersion: '1.0.0', mappingKey: teacherFacet.mappingKey, feedbackBlockKey: 'teacher.facet' }],
  contextRules: [{ ruleId: 'teacher-broad.context.emotional', ruleVersion: '1.0.0', mappingKey: teacherContext.mappingKey, feedbackBlockKey: 'teacher.context' }],
  feedbackBlocks: [
    feedback('teacher.low', '本次教师观察来源未显示明确的共同关注信号。'),
    feedback('teacher.core', '两个预先指定的教师观察来源呈现一致的需要关注信号。'),
    feedback('teacher.mixed', '教师观察来源存在差异，建议回到具体课堂情境和行为表现进行沟通。'),
    feedback('teacher.facet', '该行为分面作为学校情境中的描述信息保留。'),
    feedback('teacher.context', '情绪/内化信息不自动等同于注意或外化结论。'),
  ],
  publicationGate: gate(['当前仅保留研究/草案边界；教师版 exact form、中文研究证据与许可需另行审核。']),
  limitations: ['SDQ emotional/internalizing 不自动映射为 attention/externalizing；相邻构念只通过显式 mapping 进入 Bundle。'],
  disabledReason: '教师版量表的中文研究 form、证据和授权尚未完成。',
}

const adultPhq = mapping('adult.phq9', 'phq9', 'total', 'PRIMARY', 'adult_depression', {
  classificationCodes: ['MINIMAL', 'MILD', 'MODERATE', 'SEVERE'],
  feedbackBlockKey: 'adult.core',
})
const adultSafety = mapping('adult.phq9', 'phq9', 'self_harm', 'SAFETY', 'safety', {
  classificationCodes: ['ABSENT', 'PRESENT'],
  safetyTriggerCodes: ['PRESENT'],
  feedbackBlockKey: 'adult.safety',
})
const adultStress = mapping('adult.pss10', 'pss10', 'total', 'CONTEXT', 'stress_context', { classificationCodes: ['LOW', 'ELEVATED'], feedbackBlockKey: 'adult.context' })
const adultWellbeing = mapping('adult.who5', 'who5', 'total', 'SUPPORTING', 'wellbeing', { classificationCodes: ['ADEQUATE', 'LOW'], direction: 'higher_is_better', feedbackBlockKey: 'adult.wellbeing' })
const adultDefinition: MentalHealthBundleDefinition = {
  key: 'adult_depression_context_v1',
  version: '1.0.0',
  status: 'DRAFT',
  category: 'adult_self',
  name: 'Adult Depression Context Bundle',
  description: 'PHQ-9、PSS-10 与 WHO-5 的成人自评确定性描述包。',
  subjectPopulation: 'adult',
  respondentType: 'participant_self_report',
  construct: 'adult_depression_context',
  purpose: '保留抑郁相关主构念、压力上下文、福祉支持信息与安全门禁。',
  estimatedMinutes: { standard: [10, 20], research: [15, 30] },
  profiles: [...profiles],
  scaleSlots: [
    slot('adult.phq9', 'PHQ-9', 0, 'phq9', 'participant_self_report', [adultPhq, adultSafety]),
    slot('adult.pss10', 'PSS-10', 1, 'pss10', 'participant_self_report', [adultStress]),
    slot('adult.who5', 'WHO-5', 2, 'who5', 'participant_self_report', [adultWellbeing]),
  ],
  ruleSetKey: 'AdultDepressionBundleRuleSetV1',
  ruleSetVersion: MENTAL_HEALTH_BUNDLE_RULESET_VERSION,
  reportDefinitionVersion: 'mental-health-bundle-report-v1.0.0',
  evidenceMappingVersion: MENTAL_HEALTH_BUNDLE_EVIDENCE_MAPPING_VERSION,
  coreRules: [
    { ruleId: 'adult-depression.core.minimal-adequate', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: adultPhq.mappingKey, classification: 'MINIMAL' }, { mappingKey: adultWellbeing.mappingKey, classification: 'ADEQUATE' }], outcomeCode: 'LOW_CONCERN', actionTier: 'NONE', feedbackBlockKey: 'adult.low' },
    { ruleId: 'adult-depression.core.moderate-low', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: adultPhq.mappingKey, classification: 'MODERATE' }, { mappingKey: adultWellbeing.mappingKey, classification: 'LOW' }], outcomeCode: 'CONCERN_WITH_LOW_WELLBEING', actionTier: 'FOLLOW_UP', feedbackBlockKey: 'adult.low-wellbeing' },
    { ruleId: 'adult-depression.core.severe-adequate', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: adultPhq.mappingKey, classification: 'SEVERE' }, { mappingKey: adultWellbeing.mappingKey, classification: 'ADEQUATE' }], outcomeCode: 'CONSISTENT_SIGNAL', actionTier: 'FOLLOW_UP', feedbackBlockKey: 'adult.core' },
    { ruleId: 'adult-depression.core.mild-any', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: adultPhq.mappingKey, classification: 'MILD' }, { mappingKey: adultWellbeing.mappingKey, classification: 'ADEQUATE' }], outcomeCode: 'MIXED_RESULTS', actionTier: 'DISCUSS', feedbackBlockKey: 'adult.mixed' },
    { ruleId: 'adult-depression.core.mild-low', ruleVersion: '1.0.0', requiredEvidence: [{ mappingKey: adultPhq.mappingKey, classification: 'MILD' }, { mappingKey: adultWellbeing.mappingKey, classification: 'LOW' }], outcomeCode: 'CONCERN_WITH_LOW_WELLBEING', actionTier: 'FOLLOW_UP', feedbackBlockKey: 'adult.low-wellbeing' },
  ],
  facetRules: [],
  contextRules: [{ ruleId: 'adult-depression.context.stress', ruleVersion: '1.0.0', mappingKey: adultStress.mappingKey, feedbackBlockKey: 'adult.context' }],
  feedbackBlocks: [
    feedback('adult.low', '本次成人自评未显示明确的共同关注信号。'),
    feedback('adult.core', '本次主构念来源呈现一致的需要关注信号。'),
    feedback('adult.mixed', '本次结果需要结合实际困扰、时间变化和生活情境进一步理解。'),
    feedback('adult.low-wellbeing', '主构念信息与较低整体福祉同时出现，建议优先获得合适的人工支持。'),
    feedback('adult.context', '压力信息作为上下文保留，不自动证明或解释主构念。'),
    feedback('adult.wellbeing', 'WHO-5 作为福祉上下文保留，不改变 PHQ-9 原始结果。'),
    feedback('adult.safety', '安全信号只进入受控的安全流程，不在普通报告中展开。'),
  ],
  publicationGate: gate([
    'PHQ-9 的 safety item 必须先完成信号映射、升级流程、审计/RBAC、资源与 E2E gate。',
    '当前第三方 form、中文证据、参考解释与权利未完成。',
  ], true),
  limitations: [
    'PHQ-9/PSS-10/WHO-5 不形成单一 Mental Health Index。',
    '安全门禁优先于普通规则；未完成安全 gate 不得发布该 Bundle。',
  ],
  disabledReason: '成人抑郁包必须先完成 safety foundation 及 exact form/rights/scientific gate。',
}

const definitions: MentalHealthBundleDefinition[] = [youthDefinition, adultDefinition, parentDefinition, teacherDefinition]

export const validateMentalHealthBundleDefinitions = (items: MentalHealthBundleDefinition[]): void => {
  const keys = new Set<string>()
  for (const definition of items) {
    const resourceId = `${definition.key}@${definition.version}`
    if (keys.has(resourceId)) throw new Error(`Duplicate mental health Bundle: ${resourceId}`)
    keys.add(resourceId)
    if (definition.scaleSlots.length === 0) throw new Error(`Mental health Bundle has no Scale slots: ${resourceId}`)
    if (definition.coreRules.length === 0) throw new Error(`Mental health Bundle has no CORE rules: ${resourceId}`)
    const positions = new Set<number>()
    const mappings = new Set<string>()
    const mappingsByKey = new Map<string, BundleEvidenceMappingDefinition>()
    let hasSafetyMapping = false
    for (const item of definition.scaleSlots) {
      if (positions.has(item.position)) throw new Error(`Duplicate Bundle slot position: ${resourceId}/${item.position}`)
      positions.add(item.position)
      if (item.mappings.length === 0) throw new Error(`Bundle slot has no mappings: ${resourceId}/${item.key}`)
      for (const entry of item.mappings) {
        if (!entry.mappingKey || !entry.mappingVersion || !entry.scoreKey) {
          throw new Error(`Bundle mapping is incomplete: ${resourceId}/${item.key}`)
        }
        if (mappings.has(entry.mappingKey)) throw new Error(`Duplicate Bundle mapping: ${resourceId}/${entry.mappingKey}`)
        mappings.add(entry.mappingKey)
        mappingsByKey.set(entry.mappingKey, entry)
        if (entry.scaleCode !== item.expectedScaleCode) throw new Error(`Bundle mapping scale mismatch: ${resourceId}/${entry.mappingKey}`)
        if (entry.classificationCodes && new Set(entry.classificationCodes).size !== entry.classificationCodes.length) {
          throw new Error(`Duplicate Bundle classification code: ${resourceId}/${entry.mappingKey}`)
        }
        if (entry.role === 'SAFETY') {
          hasSafetyMapping = true
          if (!entry.safetyTriggerCodes?.length) {
            throw new Error(`SAFETY mapping has no trigger codes: ${resourceId}/${entry.mappingKey}`)
          }
          if (entry.classificationCodes && entry.safetyTriggerCodes.some((code) => !entry.classificationCodes?.includes(code))) {
            throw new Error(`SAFETY trigger code is not declared by its mapping: ${resourceId}/${entry.mappingKey}`)
          }
        }
      }
    }
    if (definition.status === 'PUBLISHED') {
      if (
        !definition.publicationGate.exactFormsVerified
        || !definition.publicationGate.rightsVerified
        || !definition.publicationGate.scoringAndReferenceVerified
        || !definition.publicationGate.chineseEvidenceVerified
        || hasSafetyMapping && !definition.publicationGate.safetyGateRequired
        || definition.publicationGate.safetyGateRequired && !definition.publicationGate.safetyGatePassed
      ) {
        throw new Error(`Published mental health Bundle has not passed publication gate: ${resourceId}`)
      }
    }
    for (const rule of definition.coreRules) {
      for (const required of rule.requiredEvidence) {
        if (!mappings.has(required.mappingKey)) throw new Error(`Bundle rule references unknown mapping: ${resourceId}/${required.mappingKey}`)
        const mapping = mappingsByKey.get(required.mappingKey)
        if (mapping?.classificationCodes && !mapping.classificationCodes.includes(required.classification)) {
          throw new Error(`Bundle rule classification is not declared by its mapping: ${resourceId}/${required.mappingKey}`)
        }
      }
    }
  }
}

validateMentalHealthBundleDefinitions(definitions)

const cloneDefinition = (definition: MentalHealthBundleDefinition): MentalHealthBundleDefinition => JSON.parse(JSON.stringify(definition)) as MentalHealthBundleDefinition

export const listMentalHealthBundleDefinitions = (): MentalHealthBundleDefinition[] => definitions.map(cloneDefinition)

export const getMentalHealthBundleDefinition = (key: string, version: string): MentalHealthBundleDefinition | undefined => {
  const definition = definitions.find((item) => item.key === key && item.version === version)
  return definition ? cloneDefinition(definition) : undefined
}

export interface MentalHealthBundleReportPackageDefinition extends ReportPackageDefinition {
  analysisEngineKey: typeof MENTAL_HEALTH_ANALYSIS_ENGINE_KEY
  bundleDefinition: MentalHealthBundleDefinition
}

const packageFromDefinition = (definition: MentalHealthBundleDefinition): MentalHealthBundleReportPackageDefinition => {
  const frozenDefinition = cloneDefinition(definition)
  return {
    analysisEngineKey: MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
    bundleDefinition: frozenDefinition,
    key: frozenDefinition.key,
    version: frozenDefinition.version,
    status: frozenDefinition.status,
    name: frozenDefinition.name,
    description: frozenDefinition.description,
    profiles: [...frozenDefinition.profiles],
    estimatedMinutes: {
      standard: [...frozenDefinition.estimatedMinutes.standard],
      research: [...frozenDefinition.estimatedMinutes.research],
    },
    slots: frozenDefinition.scaleSlots.map((item) => ({
      key: item.key,
      label: item.label,
      position: item.position,
      required: true as const,
      mappingKey: item.mappings[0]?.mappingKey ?? `${item.key}.missing`,
      mappingVersion: item.mappings[0]?.mappingVersion ?? '1.0.0',
      expectedScaleCode: item.expectedScaleCode,
      expectedDimensionCode: item.mappings[0]?.scoreKey ?? 'missing',
      respondentType: item.respondentType,
      valueSelector: 'score' as const,
      evidenceMappings: item.mappings.map((mapping) => ({ ...mapping })),
      expectedInstrumentVersion: item.expectedInstrumentVersion,
    })),
    analysisProtocolKey: frozenDefinition.ruleSetKey,
    analysisProtocolVersion: frozenDefinition.ruleSetVersion,
    reportDefinitionVersion: frozenDefinition.reportDefinitionVersion,
    audience: ['participant', 'teacher', 'researcher'],
    disabledReason: frozenDefinition.disabledReason,
  }
}

export const listMentalHealthBundleReportPackages = (): MentalHealthBundleReportPackageDefinition[] => definitions.map(packageFromDefinition)

export const getMentalHealthBundleReportPackage = (key: string, version: string): MentalHealthBundleReportPackageDefinition | undefined => {
  const definition = getMentalHealthBundleDefinition(key, version)
  return definition ? packageFromDefinition(definition) : undefined
}

export const isMentalHealthBundlePackage = (
  value: { analysisEngineKey?: string; bundleDefinition?: unknown } | null | undefined,
): value is MentalHealthBundleReportPackageDefinition => (
  value?.analysisEngineKey === MENTAL_HEALTH_ANALYSIS_ENGINE_KEY && Boolean(value.bundleDefinition)
)
