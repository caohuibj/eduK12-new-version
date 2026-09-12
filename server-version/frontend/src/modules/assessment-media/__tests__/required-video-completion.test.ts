import { describe, expect, it, vi } from 'vitest'
import {
  REQUIRED_VIDEO_POLICY_VERSION,
  markRequiredVideoComplete,
  readRequiredVideoCompletion,
  requiredVideoCompletionMetadataKey,
} from '../required-video-completion'
import type { FinalDraftMeta } from '../../../services/persistence/finalDraftStore'

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

describe('required video completion markers', () => {
  it('persists only the stable attempt/slot/asset identity and reuses it on later reads', async () => {
    let meta = draftMeta()
    const store = {
      get: vi.fn(async () => meta),
      setInstrumentMetadata: vi.fn(async (_draftKey: string, metadata: Record<string, unknown>) => {
        meta = {
          ...meta,
          instrumentMetadata: { ...(meta.instrumentMetadata ?? {}), ...metadata },
        }
        return meta
      }),
    }
    const identity = {
      draftKey: meta.draftKey,
      slotKey: 'scale-item:item-1:video',
      assetId: 'video-1',
      contentHash: 'a'.repeat(64),
    }

    const marker = await markRequiredVideoComplete(identity, store)
    expect(marker.policyVersion).toBe(REQUIRED_VIDEO_POLICY_VERSION)
    expect(marker.slotKey).toBe(identity.slotKey)
    expect(meta.instrumentMetadata?.[requiredVideoCompletionMetadataKey(identity)]).toEqual(marker)
    expect(JSON.stringify(meta.instrumentMetadata)).not.toContain('currentTime')
    expect(await readRequiredVideoCompletion(identity, store)).toEqual(marker)
  })

  it('does not reuse a marker for a different slot, asset hash, or viewing-policy version', async () => {
    let meta = draftMeta()
    const store = {
      get: vi.fn(async () => meta),
      setInstrumentMetadata: vi.fn(async (_draftKey: string, metadata: Record<string, unknown>) => {
        meta = { ...meta, instrumentMetadata: { ...(meta.instrumentMetadata ?? {}), ...metadata } }
        return meta
      }),
    }
    const identity = {
      draftKey: meta.draftKey,
      slotKey: 'scale-item:item-1:video',
      assetId: 'video-1',
      contentHash: 'a'.repeat(64),
    }
    await markRequiredVideoComplete(identity, store)

    expect(await readRequiredVideoCompletion({ ...identity, slotKey: 'scale-item:item-2:video' }, store)).toBeNull()
    expect(await readRequiredVideoCompletion({ ...identity, contentHash: 'b'.repeat(64) }, store)).toBeNull()
    expect(await readRequiredVideoCompletion({ ...identity, policyVersion: 'required-full-view-v1' }, store)).not.toBeNull()
  })

  it('fails closed when the draft is missing and the completion marker cannot be written', async () => {
    const store = {
      get: vi.fn(async () => null),
      setInstrumentMetadata: vi.fn(async () => null),
    }
    await expect(markRequiredVideoComplete({
      draftKey: 'missing',
      slotKey: 'slot-1',
      assetId: 'video-1',
      contentHash: 'a'.repeat(64),
    }, store)).rejects.toMatchObject({ code: 'FINAL_DRAFT_STORAGE_ERROR' })
  })
})
