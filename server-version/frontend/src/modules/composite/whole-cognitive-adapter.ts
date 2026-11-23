import type { ApiResponse } from '../../types'
import type { AssessmentVideoCapabilitySources } from '../assessment-media/types'
import type { CognitiveSessionApi } from '../cognitive/api'
import type { CognitiveSession } from '../cognitive/types'
import type { WholeV2CognitiveTemplateUnit, WholeV2LockedCognitiveUnit } from './whole-v2.types'

const ok = <T,>(data: T): ApiResponse<T> => ({ code: 0, message: '成功', data })

export interface WholeCognitiveAdapterOptions {
  slot: WholeV2CognitiveTemplateUnit
  randomSeed: string
  attemptEpoch: number
  alreadyLocked?: boolean
  loadSlotImage: (slotKey: string, assetId: string) => Promise<Blob>
  issueSlotVideo: (slotKey: string, videoKey: string) => Promise<ApiResponse<AssessmentVideoCapabilitySources>>
  onLockUnit: (unit: Omit<WholeV2LockedCognitiveUnit, 'lockedAt' | 'payloadHash'>) => Promise<void>
}

/** Zero-child-session CognitiveSessionApi adapter for WholeCompositeV2Runner.
 * Serves the frozen Cognitive definition + server-issued randomSeed directly from the
 * whole template, routes images/videos via /slots/:slotKey/*, and monotonically locks
 * completed trials into the parent attempt's checkpoint before advancing. */
export function createWholeCognitiveSessionApi(options: WholeCognitiveAdapterOptions): CognitiveSessionApi {
  const { slot, randomSeed, attemptEpoch, loadSlotImage, issueSlotVideo, onLockUnit } = options
  let completed = Boolean(options.alreadyLocked)

  const buildSession = (): CognitiveSession => ({
    sessionId: slot.slotKey,
    assignmentId: slot.itemId,
    testType: slot.testType,
    attemptNo: 1,
    attemptEpoch,
    deliveryMode: 'FINAL_ONLY',
    definitionHash: slot.definitionHash,
    contextSnapshotHash: null,
    status: completed ? 'COMPLETED' : 'IN_PROGRESS',
    configVersion: slot.configVersion,
    engineVersion: slot.engineVersion,
    scoringVersion: slot.scoringVersion,
    protocolSignature: slot.protocolSignature,
    protocol: slot.protocol,
    ...(slot.presentation ? { presentation: slot.presentation } : {}),
    config: slot.config,
    randomSeed,
    profile: slot.profile,
    feedbackDeferred: true,
  })

  return {
    getSession: async () => ok(buildSession()),
    loadAsset: (_sessionId, assetId) => loadSlotImage(slot.slotKey, assetId),
    issueVideoCapabilities: (_sessionId, videoKey) => issueSlotVideo(slot.slotKey, videoKey),
    appendTrial: async () => {
      throw new Error('整卷模式认知测验仅支持完成后一次性锁定提交')
    },
    completeSession: async () => {
      throw new Error('整卷模式认知测验仅支持完成后一次性锁定提交')
    },
    submitFinal: async (_sessionId, input) => {
      await onLockUnit({
        unitType: 'COGNITIVE',
        itemId: slot.itemId,
        randomSeed,
        trials: input.trials,
        ...(input.administrationProvenance
          ? { summaryMeta: { administrationProvenance: input.administrationProvenance } }
          : {}),
      })
      completed = true
      return ok({
        completed: true,
        feedbackDeferred: true,
        replayed: false,
      })
    },
  }
}
