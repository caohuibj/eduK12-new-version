import {
  FinalDraftStorageError,
  finalDraftStore,
  type FinalDraftMeta,
  type FinalDraftStore,
} from '../../services/persistence/finalDraftStore'

export const REQUIRED_VIDEO_POLICY_VERSION = 'required-full-view-v1' as const

export interface RequiredVideoCompletionIdentity {
  draftKey: string
  slotKey: string
  assetId: string
  contentHash: string
  policyVersion?: string
}

export interface RequiredVideoCompletionMarker {
  schemaVersion: 1
  policyVersion: string
  slotKey: string
  assetId: string
  contentHash: string
  completedAt: number
}

type RequiredVideoCompletionStore = Pick<FinalDraftStore, 'get' | 'setInstrumentMetadata'>

export const requiredVideoCompletionMetadataKey = (identity: RequiredVideoCompletionIdentity) => (
  `assessmentVideoCompletion:${identity.policyVersion ?? REQUIRED_VIDEO_POLICY_VERSION}:${identity.slotKey}:${identity.assetId}:${identity.contentHash}`
)

const markerFromMeta = (
  meta: FinalDraftMeta | null,
  identity: RequiredVideoCompletionIdentity,
): RequiredVideoCompletionMarker | null => {
  const value = meta?.instrumentMetadata?.[requiredVideoCompletionMetadataKey(identity)]
  if (!value || typeof value !== 'object') return null
  const marker = value as Partial<RequiredVideoCompletionMarker>
  const policyVersion = identity.policyVersion ?? REQUIRED_VIDEO_POLICY_VERSION
  if (
    marker.schemaVersion !== 1
    || marker.policyVersion !== policyVersion
    || marker.slotKey !== identity.slotKey
    || marker.assetId !== identity.assetId
    || marker.contentHash !== identity.contentHash
    || typeof marker.completedAt !== 'number'
  ) return null
  return marker as RequiredVideoCompletionMarker
}

export const readRequiredVideoCompletion = async (
  identity: RequiredVideoCompletionIdentity,
  store: RequiredVideoCompletionStore = finalDraftStore,
) => markerFromMeta(await store.get(identity.draftKey), identity)

export const markRequiredVideoComplete = async (
  identity: RequiredVideoCompletionIdentity,
  store: RequiredVideoCompletionStore = finalDraftStore,
): Promise<RequiredVideoCompletionMarker> => {
  const marker: RequiredVideoCompletionMarker = {
    schemaVersion: 1,
    policyVersion: identity.policyVersion ?? REQUIRED_VIDEO_POLICY_VERSION,
    slotKey: identity.slotKey,
    assetId: identity.assetId,
    contentHash: identity.contentHash,
    completedAt: Date.now(),
  }
  const next = await store.setInstrumentMetadata(identity.draftKey, {
    [requiredVideoCompletionMetadataKey(identity)]: marker,
  })
  if (!next) throw new FinalDraftStorageError('本地测评草稿不存在，无法保存视频观看完成状态')
  return marker
}
