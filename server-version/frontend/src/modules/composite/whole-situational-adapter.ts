import type { ApiResponse } from '../../types'
import type { AssessmentVideoCapabilitySources } from '../assessment-media/types'
import type { SituationalFinalSubmitPayload, SituationalRunnerClient } from '../situational/api'
import type { SituationalAttemptResponse } from '../situational/types'
import type { WholeV2LockedSituationalUnit, WholeV2SituationalTemplateUnit } from './whole-v2.types'

const ok = <T,>(data: T): ApiResponse<T> => ({ code: 0, message: '成功', data })

export interface WholeSituationalAdapterOptions {
  slot: WholeV2SituationalTemplateUnit
  parentAttemptId: string
  attemptEpoch: number
  alreadyLocked?: boolean
  loadSlotImage: (slotKey: string, assetId: string) => Promise<Blob>
  issueSlotVideo: (slotKey: string, videoKey: string) => Promise<ApiResponse<AssessmentVideoCapabilitySources>>
  onLockUnit: (unit: Omit<WholeV2LockedSituationalUnit, 'lockedAt' | 'payloadHash'>) => Promise<void>
}

/** Zero-child-attempt SituationalRunnerClient adapter for WholeCompositeV2Runner.
 * Serves the frozen V1/V2 branching SJT definition directly from the whole template,
 * routes images/videos via /slots/:slotKey/*, and monotonically locks responses into
 * the parent attempt's checkpoint on completion. */
export function createWholeSituationalRunnerClient(options: WholeSituationalAdapterOptions): SituationalRunnerClient {
  const { slot, parentAttemptId, attemptEpoch, loadSlotImage, issueSlotVideo, onLockUnit } = options
  let completed = Boolean(options.alreadyLocked)
  const startedAt = new Date().toISOString()

  const buildAttemptResponse = (): SituationalAttemptResponse => {
    const now = new Date().toISOString()
    return {
      attemptId: slot.slotKey,
      feedbackDeferred: true,
      attempt: {
        id: slot.slotKey,
        compositeAttemptId: parentAttemptId,
        instrumentKey: slot.instrumentKey,
        instrumentVersion: slot.instrumentVersion,
        attemptNo: 1,
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch,
        progress: completed ? 100 : 0,
        definitionHash: slot.definitionHash,
        compiledRuntimeHash: slot.compiledRuntimeHash,
        scorerKey: slot.scorerKey,
        scoringVersion: slot.scoringVersion,
        submissionId: null,
        submissionPayloadHash: null,
        submittedAt: completed ? now : null,
        startedAt,
        completedAt: completed ? now : null,
        totalTime: null,
        createdAt: startedAt,
        updatedAt: now,
      },
      instrument: {
        title: slot.title,
        key: slot.instrumentKey,
        version: slot.instrumentVersion,
        releaseStatus: 'PUBLISHED',
        scienceMaturity: 'RESEARCH_READY',
        definitionHash: slot.definitionHash,
        compiledRuntimeHash: slot.compiledRuntimeHash,
        scorerKey: slot.scorerKey,
        scoringVersion: slot.scoringVersion,
        frozenAt: startedAt,
        sampling: slot.definition.sampling,
        definition: slot.definition,
        report: {
          reportVersion: '1.0.0',
          primaryMetricKeys: [],
          metricOrder: [],
          interpretations: [],
          limitations: [],
          disclaimer: '',
        },
        referencePolicy: { type: 'none' },
        runtimeCapabilities: {
          standalone: false,
          embedded: true,
          aggregateEligible: true,
          collectionFacts: false,
          supported: true,
        },
      },
    }
  }

  return {
    start: async () => {
      throw new Error('整卷模式情境化模块由冻结发布计划直接启动')
    },
    resume: async () => ok(buildAttemptResponse()),
    result: async () => ok(buildAttemptResponse()),
    loadAsset: (_attemptId, assetId) => loadSlotImage(slot.slotKey, assetId),
    loadVideoSources: (_attemptId, sceneKey) => issueSlotVideo(slot.slotKey, sceneKey),
    submit: async (_attemptId, payload: SituationalFinalSubmitPayload) => {
      const responseMap: Record<string, unknown> = {}
      let totalTimeMs = 0
      for (const item of payload.responses) {
        const key = `${item.sceneKey}:${item.channelKey}`
        if (item.responseValue !== undefined) {
          responseMap[key] = item.responseValue
        }
        if (typeof item.responseTimeMs === 'number' && Number.isFinite(item.responseTimeMs)) {
          totalTimeMs += item.responseTimeMs
        }
      }
      await onLockUnit({
        unitType: 'SITUATIONAL',
        itemId: slot.itemId,
        responses: responseMap,
        ...(payload.researchCapture?.events?.length
          ? { researchEvents: payload.researchCapture.events }
          : {}),
        ...(totalTimeMs > 0 ? { totalTimeMs } : {}),
      })
      completed = true
      return ok(buildAttemptResponse())
    },
  }
}
