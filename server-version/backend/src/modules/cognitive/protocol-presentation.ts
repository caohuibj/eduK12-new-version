import type { CognitiveProfile } from './cognitive.types'

export type CognitiveProtocolTier = 'PILOT' | 'RESEARCH_READY'

export interface CognitiveProtocolPresentationV1 {
  tier: CognitiveProtocolTier
  profileLabel: string
  participantConclusion: string
  reportCaveats: string[]
  showProductIndex?: boolean
}

const keyOf = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
  profile: CognitiveProfile,
): string => `${testType}/${engineVersion}/${scoringVersion}/${profile}`

/**
 * Product-facing protocol presentation for exact identities that have completed
 * publish-prep review. This is deliberately separate from Scientific Maturity:
 * a PILOT/RESEARCH_READY protocol tier describes measurement dose and report
 * interpretation strength, not the task identity's scientific-governance state.
 *
 * Unlisted identities retain the legacy experience/standard/research wording
 * until they complete their own publish-prep review.
 */
const REVIEWED_PROTOCOL_PRESENTATION = new Map<string, CognitiveProtocolPresentationV1>([
  [
    keyOf('patterncompare', '1.0.0', '1.0.0', 'standard'),
    {
      tier: 'PILOT',
      profileLabel: 'Pilot 版',
      participantConclusion: '本次 Pilot 短版结果提示你在本次图形比较任务中的速度与准确性表现；由于协议较短，应把结果作为初步任务表现参考。',
      reportCaveats: [
        'Pilot 短版采用 60 秒正式协议，提供最低限度但可解释的单次表现信息；速度、正确率与反应时间应结合阅读，短程结果可能存在较大波动。',
      ],
      showProductIndex: false,
    },
  ],
  [
    keyOf('patterncompare', '1.0.0', '1.0.0', 'research'),
    {
      tier: 'RESEARCH_READY',
      profileLabel: 'Research Ready 版',
      participantConclusion: '本次 Research Ready 完整协议显示你在本次图形比较任务中的速度与准确性表现；在数据质量达标时，这些指标可作为较稳定的单次任务证据。',
      reportCaveats: [
        'Research Ready 版采用 90 秒完整协议，以更多正式试次提高单次指标稳定性；结果仍只解释本次任务表现，不代表人口常模、年龄等级或诊断结论。',
      ],
      showProductIndex: false,
    },
  ],
])

export const resolveCognitiveProtocolPresentation = (input: {
  testType: string
  engineVersion: string
  scoringVersion: string
  profile: CognitiveProfile | null
}): CognitiveProtocolPresentationV1 | null => {
  if (!input.profile) return null
  return REVIEWED_PROTOCOL_PRESENTATION.get(keyOf(
    input.testType,
    input.engineVersion,
    input.scoringVersion,
    input.profile,
  )) ?? null
}
