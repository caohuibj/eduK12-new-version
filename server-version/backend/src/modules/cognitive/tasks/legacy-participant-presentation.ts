import type { CognitiveProfile } from '../cognitive.types'
import type {
  CognitiveProtocolPresentationV1,
  ResolvedCognitiveParticipantPresentationV1,
} from './participant-presentation.types'

const legacyBehavior: Record<string, Partial<ResolvedCognitiveParticipantPresentationV1>> = {
  memory: { suppressPracticalTips: true },
  stroop: { experienceHeadlineMetric: 'incongruentAccuracy', suppressPracticalTips: true },
  nback: { experienceHeadlineMetric: 'dPrimeByN' },
  sst: { experienceHeadlineMetric: 'pRespondStop' },
  matrix: { v2HiddenMetricKeys: ['reachedDifficulty'] },
}

const legacyProtocol = new Map<string, CognitiveProtocolPresentationV1>([
  ['patterncompare/1.0.0/1.0.0/standard', {"tier":"PILOT","profileLabel":"Pilot 版","participantConclusion":"本次 Pilot 短版结果提示你在本次图形比较任务中的速度与准确性表现；由于协议较短，应把结果作为初步任务表现参考。","reportCaveats":["Pilot 短版采用 60 秒正式协议，提供最低限度但可解释的单次表现信息；速度、正确率与反应时间应结合阅读，短程结果可能存在较大波动。"],"showProductIndex":false}],
  ['patterncompare/1.0.0/1.0.0/research', {"tier":"RESEARCH_READY","profileLabel":"Research Ready 版","participantConclusion":"本次 Research Ready 完整协议显示你在本次图形比较任务中的速度与准确性表现；在数据质量达标时，这些指标可作为较稳定的单次任务证据。","reportCaveats":["Research Ready 版采用 90 秒完整协议，以更多正式试次提高单次指标稳定性；结果仍只解释本次任务表现，不代表人口常模、年龄等级或诊断结论。"],"showProductIndex":false}],
  ['flanker/1.0.0/1.0.0/standard', {"tier":"PILOT","profileLabel":"Pilot 版","participantConclusion":"本次 Pilot 短版结果提示你在本次箭头干扰任务中，中央目标方向受到两侧干扰时的反应差异；由于试次数较少，应把干扰效应与两种条件的正确率一起作为初步任务表现参考。","reportCaveats":["Pilot 版采用 80 个严格平衡的正式试次，提供最低限度但可解释的单次干扰信息；干扰反应时间差可能仍有较大波动，不能单独解释为稳定的抑制控制能力。"],"showProductIndex":false}],
  ['flanker/1.0.0/1.0.0/research', {"tier":"RESEARCH_READY","profileLabel":"Research Ready 版","participantConclusion":"本次 Research Ready 完整协议显示你在本次箭头干扰任务中的干扰反应时间差和条件正确率；在数据质量达标时，160 个平衡试次可提供较稳定的单次任务证据。","reportCaveats":["Research Ready 版采用 160 个严格平衡的正式试次，以更多一致与不一致条件观察提高单次指标稳定性；结果仍只解释本次任务表现，不代表人口常模、年龄等级、诊断或稳定人格/能力结论。"],"showProductIndex":false}],
])

export const resolveLegacyCognitiveParticipantPresentation = (input: {
  testType: string
  engineVersion: string
  scoringVersion: string
  profile: CognitiveProfile | null
  frozenProtocol?: {
    protocolTier?: 'PILOT' | 'RESEARCH_READY'
    profileLabel?: string
    participantConclusion?: string
    protocolShowProductIndex?: boolean
    reportCaveats?: string[]
  } | null
}): ResolvedCognitiveParticipantPresentationV1 | null => {
  const behavior = legacyBehavior[input.testType]
  const frozen = input.frozenProtocol
  const frozenProtocol = frozen?.protocolTier && frozen.profileLabel && frozen.participantConclusion
    ? {
        tier: frozen.protocolTier,
        profileLabel: frozen.profileLabel,
        participantConclusion: frozen.participantConclusion,
        reportCaveats: frozen.reportCaveats ?? [],
        ...(frozen.protocolShowProductIndex === undefined ? {} : { showProductIndex: frozen.protocolShowProductIndex }),
      }
    : undefined
  const staticProtocol = input.profile
    ? legacyProtocol.get(`${input.testType}/${input.engineVersion}/${input.scoringVersion}/${input.profile}`)
    : undefined
  const protocol = frozenProtocol ?? staticProtocol
  if (!behavior && !protocol) return null
  return {
    version: 'legacy-v1',
    ...(behavior?.experienceHeadlineMetric ? { experienceHeadlineMetric: behavior.experienceHeadlineMetric } : {}),
    v2HiddenMetricKeys: behavior?.v2HiddenMetricKeys ? [...behavior.v2HiddenMetricKeys] : [],
    suppressPracticalTips: behavior?.suppressPracticalTips ?? false,
    ...(protocol ? { protocol } : {}),
  }
}
