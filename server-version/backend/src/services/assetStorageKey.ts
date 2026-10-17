/** Logical IDs and their authorization never change when COS bytes are shared. */
export const assetStorageKey = (asset: { provider: string; objectKey: string; storageObjectKey?: string | null }): string => {
  if (asset.storageObjectKey && asset.provider !== 'cos') throw new Error('Shared storage requires COS')
  return asset.storageObjectKey || asset.objectKey
}
