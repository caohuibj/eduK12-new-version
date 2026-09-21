import type { DeviceInputProvenanceV1 } from '../device-input-provenance'
import type { ScaleAnswer } from '../scale-scoring'
import type { ScaleResultV2 } from '../scale-result'
import { projectExternalDeviceProvenance, projectExternalScaleAnswer } from './serialization'
import { projectScaleResult } from './scale-result.projector'
import type { ScaleProjectionContext } from './types'

const timeValue = (value: unknown): string | null => {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : null
}

const scaleMetadata = (scale: any, result?: ScaleResultV2 | null) => {
  const instrument = result?.instrument
  if (!scale && !instrument) return undefined
  return {
    id: scale?.id ?? instrument?.scaleId,
    code: scale?.code ?? instrument?.code,
    name: scale?.name ?? instrument?.name,
    ...(scale?.description !== undefined ? { description: scale.description } : {}),
    ...(scale?.instruction !== undefined ? { instruction: scale.instruction } : {}),
    ...(scale?.estimatedTime !== undefined ? { estimatedTime: scale.estimatedTime } : {}),
    instrumentVersion: scale?.instrumentVersion ?? instrument?.instrumentVersion,
    ...(scale?.instrumentClass !== undefined ? { instrumentClass: scale.instrumentClass } : {}),
  }
}

const attemptBase = (assessment: any, result?: ScaleResultV2 | null) => ({
  id: assessment?.id,
  status: assessment?.status,
  scaleId: assessment?.scaleId,
  progress: assessment?.progress ?? 0,
  startedAt: timeValue(assessment?.startedAt),
  completedAt: timeValue(assessment?.completedAt),
  totalTime: typeof assessment?.totalTime === 'number' ? assessment.totalTime : null,
  ...(typeof assessment?.answersRevision === 'number' ? { answersRevision: assessment.answersRevision } : {}),
  ...(typeof assessment?.attemptEpoch === 'number' ? { attemptEpoch: assessment.attemptEpoch } : {}),
  ...(assessment?.deliveryMode ? { deliveryMode: assessment.deliveryMode } : {}),
  ...(assessment?.runtimeGeneration ? { runtimeGeneration: assessment.runtimeGeneration } : {}),
  ...(typeof assessment?.submissionId === 'string' ? { submissionId: assessment.submissionId } : {}),
  ...(assessment?.questionnaireAssessmentId ? { questionnaireAssessmentId: assessment.questionnaireAssessmentId } : {}),
  ...(assessment?.compositeAttemptId ? { compositeAttemptId: assessment.compositeAttemptId } : {}),
  ...(assessment?.user && typeof assessment.user === 'object' ? {
    user: {
      id: assessment.user.id,
      username: assessment.user.username,
      nickname: assessment.user.nickname,
    },
  } : {}),
  ...(scaleMetadata(assessment?.scale, result) ? { scale: scaleMetadata(assessment?.scale, result) } : {}),
})

export const projectScaleAttemptForResume = (input: {
  assessment: any
  answers: ScaleAnswer[]
  deviceInputProvenance?: DeviceInputProvenanceV1
  includeAnswers: boolean
  decryptError?: boolean
}) => ({
  ...attemptBase(input.assessment),
  ...(input.includeAnswers ? { answers: input.answers.map(projectExternalScaleAnswer) } : {}),
  ...(input.includeAnswers && input.deviceInputProvenance
    ? { deviceInputProvenance: projectExternalDeviceProvenance(input.deviceInputProvenance) }
    : {}),
  ...(input.decryptError ? { decryptError: true } : {}),
})

export const projectScaleCompletedResponse = (input: {
  assessment: any
  result: ScaleResultV2 | null
  context: ScaleProjectionContext
  decryptError?: boolean
}) => {
  const scale = scaleMetadata(input.assessment?.scale, input.result)
  const instrument = {
    scaleId: scale?.id ?? input.result?.instrument.scaleId ?? input.assessment?.scaleId ?? 'unknown',
    code: scale?.code ?? input.result?.instrument.code ?? 'unknown',
    name: scale?.name ?? input.result?.instrument.name ?? '量表',
    instrumentVersion: scale?.instrumentVersion ?? input.result?.instrument.instrumentVersion ?? 'unknown',
  }
  const report = projectScaleResult({
    result: input.result,
    instrument,
    completedAt: input.assessment?.completedAt,
    totalTime: input.assessment?.totalTime,
    context: input.context,
    decryptError: input.decryptError,
  })
  return {
    ...attemptBase(input.assessment, input.result),
    report,
    // External completed responses are report-first. Returning a ScaleResultV2
    // compatibility alias would require reconstructing raw-answer-bearing
    // internal item scores, which violates FULL_REPORT(rawAnswers=false).
    result: null,
    ...(input.decryptError ? { decryptError: true } : {}),
  }
}
