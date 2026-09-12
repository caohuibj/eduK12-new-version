import { describe, expect, it } from 'vitest'
import type { FinalDraftMeta } from '../../../services/persistence/finalDraftStore'
import { REQUIRED_VIDEO_POLICY_VERSION, requiredVideoCompletionMetadataKey } from '../../assessment-media/required-video-completion'
import {
  hasScaleRequiredVideoCompletion,
  scaleRequiredVideoCompletionIdentity,
  scaleRequiredVideoSlotKey,
} from '../reference-journey-video'

const draftMeta = (): FinalDraftMeta => ({
  draftKey: 'scale:attempt-1',
  instrument: 'scale',
  attemptId: 'attempt-1',
  attemptEpoch: 1,
  definitionHash: 'definition-hash',
  contextSnapshotHash: null,
  deliveryMode: 'final_only',
  submissionId: 'submission-1',
  status: 'DRAFT',
  createdAt: 1,
  updatedAt: 1,
})

const item = (contentHash = 'a'.repeat(64)) => ({
  itemCode: 'item-1',
  video: {
    schemaVersion: 1,
    video: {
      assetId: 'video-1',
      contentHash,
      mimeType: 'video/mp4',
    },
  },
})

describe('Scale reference journey required-video policy', () => {
  it('uses a stable per-item slot inside the frozen draft identity', () => {
    const identity = scaleRequiredVideoCompletionIdentity('scale:attempt-1', item())
    expect(scaleRequiredVideoSlotKey('item-1')).toBe('scale-item:item-1:video')
    expect(identity).toEqual({
      draftKey: 'scale:attempt-1',
      slotKey: 'scale-item:item-1:video',
      assetId: 'video-1',
      contentHash: 'a'.repeat(64),
    })
  })

  it('fails closed without a matching completion marker and accepts the exact frozen asset marker', () => {
    const meta = draftMeta()
    const identity = scaleRequiredVideoCompletionIdentity(meta.draftKey, item())!
    expect(hasScaleRequiredVideoCompletion(meta, meta.draftKey, item())).toBe(false)

    const marker = {
      schemaVersion: 1 as const,
      policyVersion: REQUIRED_VIDEO_POLICY_VERSION,
      slotKey: identity.slotKey,
      assetId: identity.assetId,
      contentHash: identity.contentHash,
      completedAt: 10,
    }
    meta.instrumentMetadata = {
      [requiredVideoCompletionMetadataKey(identity)]: marker,
    }
    expect(hasScaleRequiredVideoCompletion(meta, meta.draftKey, item())).toBe(true)
    expect(hasScaleRequiredVideoCompletion(meta, meta.draftKey, item('b'.repeat(64)))).toBe(false)
  })

  it('does not impose a video requirement on items without a valid assessment video presentation', () => {
    const meta = draftMeta()
    expect(hasScaleRequiredVideoCompletion(meta, meta.draftKey, { itemCode: 'text-only' })).toBe(true)
  })
})
