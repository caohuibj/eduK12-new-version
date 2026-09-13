import { describe, expect, it } from 'vitest'
import {
  REQUIRED_VIDEO_POLICY_VERSION,
  requiredVideoCompletionMetadataKey,
  type RequiredVideoCompletionIdentity,
} from '../../../modules/assessment-media/required-video-completion'
import { createFinalDraftMeta, type FinalDraftMeta } from '../../../services/persistence/finalDraftStore'
import {
  assertFormItemRequiredVideosComplete,
  assertScaleRequiredVideosComplete,
  formOptionVideoSlotKey,
  scaleItemVideoSlotKey,
} from '../requiredViewing'

const videoPresentation = (assetId: string, contentHash: string) => ({
  schemaVersion: 1 as const,
  video: {
    assetId,
    contentHash,
    mimeType: 'video/mp4' as const,
  },
})

const baseMeta = (): FinalDraftMeta => createFinalDraftMeta({
  draftKey: 'questionnaire-form-section:qa-1:section-1',
  instrument: 'questionnaire-form-section',
  attemptId: 'qa-1',
  attemptEpoch: 1,
  definitionHash: 'definition-1',
  contextSnapshotHash: null,
  deliveryMode: 'final_only',
  submissionId: 'submission-123456',
})

const withCompletion = (meta: FinalDraftMeta, identity: RequiredVideoCompletionIdentity): FinalDraftMeta => ({
  ...meta,
  instrumentMetadata: {
    ...(meta.instrumentMetadata ?? {}),
    [requiredVideoCompletionMetadataKey(identity)]: {
      schemaVersion: 1,
      policyVersion: REQUIRED_VIDEO_POLICY_VERSION,
      slotKey: identity.slotKey,
      assetId: identity.assetId,
      contentHash: identity.contentHash,
      completedAt: 123,
    },
  },
})

describe('Questionnaire required-viewing identities', () => {
  it('requires every declared Form option video before sealing', () => {
    const hashA = 'a'.repeat(64)
    const hashB = 'b'.repeat(64)
    const options = [
      { value: 'a', label: '选项 A', video: videoPresentation('video-a', hashA) },
      { value: 'b', label: '选项 B', video: videoPresentation('video-b', hashB) },
    ]
    const draftKey = 'questionnaire-form-section:qa-1:section-1'
    const firstIdentity = {
      draftKey,
      slotKey: formOptionVideoSlotKey('item-1', 0),
      assetId: 'video-a',
      contentHash: hashA,
    }
    const secondIdentity = {
      draftKey,
      slotKey: formOptionVideoSlotKey('item-1', 1),
      assetId: 'video-b',
      contentHash: hashB,
    }

    const oneComplete = withCompletion(baseMeta(), firstIdentity)
    expect(() => assertFormItemRequiredVideosComplete({ meta: oneComplete, draftKey, itemId: 'item-1', options }))
      .toThrow('完整观看全部选项视频')

    const allComplete = withCompletion(oneComplete, secondIdentity)
    expect(() => assertFormItemRequiredVideosComplete({ meta: allComplete, draftKey, itemId: 'item-1', options }))
      .not.toThrow()
  })

  it('binds embedded Scale completion to the exact frozen item slot and asset hash', () => {
    const draftKey = 'questionnaire-scale:scale-assessment-1'
    const contentHash = 'c'.repeat(64)
    const items = [{
      itemCode: 'item-1',
      video: videoPresentation('scale-video', contentHash),
    }]
    const identity = {
      draftKey,
      slotKey: scaleItemVideoSlotKey('item-1'),
      assetId: 'scale-video',
      contentHash,
    }

    expect(() => assertScaleRequiredVideosComplete({ meta: baseMeta(), draftKey, items }))
      .toThrow('完整观看视频')

    const completed = withCompletion(baseMeta(), identity)
    expect(() => assertScaleRequiredVideosComplete({ meta: completed, draftKey, items }))
      .not.toThrow()

    const changedItems = [{
      itemCode: 'item-1',
      video: videoPresentation('scale-video', 'd'.repeat(64)),
    }]
    expect(() => assertScaleRequiredVideosComplete({ meta: completed, draftKey, items: changedItems }))
      .toThrow('完整观看视频')
  })
})
