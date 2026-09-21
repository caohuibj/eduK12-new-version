import type { CognitiveProfile } from '../cognitive.types'
import { COGNITIVE_TASK_PRESENTATIONS } from './generated/participant-presentations.generated'
import type {
  ResolvedCognitiveParticipantPresentationV1,
} from './participant-presentation.types'

export const resolveCognitiveTaskParticipantPresentation = (input: {
  testType: string
  engineVersion: string
  scoringVersion: string
  profile: CognitiveProfile | null
}): ResolvedCognitiveParticipantPresentationV1 | null => {
  const row = COGNITIVE_TASK_PRESENTATIONS.find((candidate) => candidate.testType === input.testType)
  if (!row) return null
  const task = row.presentation
  const protocol = input.profile && 'exactProfilePresentations' in task
    ? task.exactProfilePresentations.find((candidate) => (
        candidate.engineVersion === input.engineVersion
        && candidate.scoringVersion === input.scoringVersion
        && candidate.profile === input.profile
      ))?.presentation
    : undefined
  return {
    version: task.version,
    ...('experienceHeadlineMetric' in task ? { experienceHeadlineMetric: task.experienceHeadlineMetric } : {}),
    v2HiddenMetricKeys: 'v2HiddenMetricKeys' in task ? [...task.v2HiddenMetricKeys] : [],
    suppressPracticalTips: 'suppressPracticalTips' in task ? task.suppressPracticalTips : false,
    ...(protocol ? { protocol } : {}),
  }
}
