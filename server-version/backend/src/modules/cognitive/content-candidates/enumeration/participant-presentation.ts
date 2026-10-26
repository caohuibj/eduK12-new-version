import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { ENUMERATION_RECIPE_IDENTITY } from './protocol'
/**
 * 仅呈现层：不参与序列生成、刺激、scorer、configHash 或 definitionHash。
 * presentationVersion 0.1.0 与冻结 config 中已声明但此前从未实现的版本号对齐；
 * 历史会话的冻结报告没有 presentationVersion，因此不会被追溯改写。
 */
export function createEnumerationParticipantPresentation(): CognitiveParticipantPresentationV1 {
  return {
    schemaVersion: 1,
    presentationVersion: '0.1.0',
    testType: ENUMERATION_RECIPE_IDENTITY.testType,
    engineVersion: ENUMERATION_RECIPE_IDENTITY.engineVersion,
    scoringVersion: ENUMERATION_RECIPE_IDENTITY.scoringVersion,
    title: '这次的点数判断记录',
    metrics: {
      correctTrialCount: { label: '判断正确次数',
        explanation: '在你报出数量、并被纳入计算的次数里，有几次和屏幕上的点数完全一样。' },
      includedTrialCount: { label: '纳入作答次数',
        explanation: '本次真正进入计算的次数；中途离开、被打断或没有作答的次数不计入。' },
      overReportedTrialCount: { label: '点数偏多次数',
        explanation: '你报出的数量比实际点数多的次数。' },
      underReportedTrialCount: { label: '点数偏少次数',
        explanation: '你报出的数量比实际点数少的次数。' },
      byQuantity: { label: '各点数的作答记录',
        explanation: '按每次实际出现的点数分开看，方便发现哪一档更容易多报或少报。' },
      signedMeanError: { label: '平均点数偏差',
        explanation: '把每次「你的答案减实际点数」求平均；正数表示整体偏多，负数表示整体偏少。' },
      meanAbsoluteError: { label: '平均绝对偏差',
        explanation: '不看方向，只看平均差了几个点，用来描述偏差幅度。' },
    },
    hiddenMetrics: [],
    singleHiddenMetrics: [],
    disclaimer: '仅描述本次作答；无适用常模，不提供排名、能力等级或诊断结论。',
    suppressTips: false,
    practicalTips: ['把设备放稳，减少通知干扰，并保持观看位置。'],
    protocols: {},
  }
}
