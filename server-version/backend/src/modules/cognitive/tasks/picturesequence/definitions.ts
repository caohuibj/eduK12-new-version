import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  SingleTaskReportDefinition,
  CognitiveProfileDefinition,
} from '../../cognitive.types'
import { metric } from '../task-definition-helpers'

export const picturesequenceRegistryMeta = {
  name: '图片序列学习',
  category: 'episodic_learning_memory',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: { profile: 'experience' as const, estimatedMinutes: [3, 5], configPatch: { itemCount: 6, learningRounds: 2, delayedEnabled: false, delayedDelayMs: 0 }, reportCaveats: ['体验档仅 6 项、2 轮，不进入综合分析。'] },
    standard: { profile: 'standard' as const, estimatedMinutes: [7, 10], configPatch: { itemCount: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 0 }, reportCaveats: ['正式档报告即时学习与顺序保持，不包含延迟指标。'] },
    research: { profile: 'research' as const, estimatedMinutes: [13, 17], configPatch: { itemCount: 15, learningRounds: 3, delayedEnabled: true, delayedDelayMs: 30000 }, reportCaveats: ['延迟阶段未完成时保持缺失，不以 0 代替。'] },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    adjacentPairScore: metric('adjacentPairScore', '相邻顺序得分', 'episodic_sequence_learning', 'ratio', 'higher_is_better', 'primary'),
    positionScore: metric('positionScore', '位置得分', 'episodic_sequence_learning', 'ratio', 'higher_is_better', 'primary'),
    learningGain: metric('learningGain', '学习增益', 'episodic_sequence_learning', 'ratio', 'signed', 'primary'),
    delayedRetention: metric('delayedRetention', '延迟保持变化', 'episodic_sequence_learning', 'ratio', 'signed', 'primary', { availableProfiles: ['research'] }),
    adjacentPairScoreByRound: metric('adjacentPairScoreByRound', '各轮相邻顺序得分', 'episodic_sequence_learning', 'map', 'descriptive', 'secondary', { valueType: 'array' }),
    positionScoreByRound: metric('positionScoreByRound', '各轮位置得分', 'episodic_sequence_learning', 'map', 'descriptive', 'secondary', { valueType: 'array' }),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '即时学习阶段是否包含有效排序。' },
    emptyResponse: { key: 'emptyResponse', label: '存在空排序', description: '至少一轮没有提交任何排序。' },
    incompleteResponse: { key: 'incompleteResponse', label: '排序未完成', description: '至少一轮即时学习没有完成全部项目排序。' },
    unchangedIncorrectOrder: { key: 'unchangedIncorrectOrder', label: '重复无效排序', description: '多轮重复完全相同且明显错误的排序。' },
    delayedStageIncomplete: { key: 'delayedStageIncomplete', label: '延迟阶段未完成', description: '科研档没有有效延迟阶段，延迟保持为缺失。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在切屏或超时中断。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '图片序列学习',
    headlineMetric: 'adjacentPairScore',
    primaryMetrics: ['adjacentPairScore', 'positionScore', 'learningGain', 'delayedRetention'],
    secondaryMetrics: ['adjacentPairScoreByRound', 'positionScoreByRound'],
    practicalTips: ['延迟保持只有在科研档延迟阶段实际完成时展示；缺失不等于低分。'],
    disclaimer: '使用内部自制场景刺激，只反映本次序列学习表现，不等同 NIH PSM、临床诊断或人口常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}
