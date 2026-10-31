import { proofreadRegistryMeta as legacy } from './definitions.v1'
import { metric } from '../../task-primitives'

export const proofreadRegistryMeta = {
  ...legacy,
  recommendedForCreate: true,
  randomizationAlgorithmVersion: 'proofread-sequence-v1.1.0',
  profileDefinitionVersion: '1.1.0',
  profiles: {
    experience: { ...legacy.profiles.experience, estimatedMinutes: [2, 6] as [number, number], reportCaveats: ['18 道正式题；短程结果稳定性未验证。时长为估计，非实测。'] },
    standard: { ...legacy.profiles.standard, estimatedMinutes: [3, 9] as [number, number], reportCaveats: ['30 道正式题；只描述本次表现，无同龄常模。时长为估计，非实测。'] },
    research: { ...legacy.profiles.research, estimatedMinutes: [4, 11] as [number, number], reportCaveats: ['36 道正式题；与短程协议使用同一原创题池，不宣称等值或验证效度。时长为估计，非实测。'] },
  },
  metricDefinitionVersion: '1.1.0',
  metricDefinitions: { ...legacy.metricDefinitions,
    answeredCount: metric('answeredCount', '已作答题数', 'verbal_reasoning', 'count', 'descriptive', 'secondary'),
    correctCount: metric('correctCount', '答对题数', 'verbal_reasoning', 'count', 'higher_is_better', 'secondary'),
  },
  qualityDefinitionVersion: '1.1.0',
  qualityDefinitions: { ...legacy.qualityDefinitions,
    interpretable: { key: 'interpretable', label: '有可解释作答', description: '至少有一道正式题有回应；零正确仍是实际表现，不能当成缺失。' },
    noResponses: { key: 'noResponses', label: '全部未回应', description: '所有正式题均超时，不能解释为能力零分。' },
  },
  reportDefinitionVersion: '1.1.0',
  reportDefinition: { ...legacy.reportDefinition, showProductIndex: false,
    secondaryMetrics: ['correctCount', 'answeredCount', 'errorCount', 'timeoutCount', 'validRtCount'],
  },
}
