import {
  getReportPackageDefinition,
  readFrozenReportPackageSnapshot,
} from '../cognitive-analysis'

/**
 * Package instances expose labels from their frozen definition.  A materialized
 * cognitive assignment is a shared wrapper and its live title is not allowed
 * to rewrite historical package presentation.
 */
export const getFrozenPackageSlotLabels = (composite: any): Map<number, string> => {
  if (!composite?.reportPackageKey || !composite?.reportPackageVersion) return new Map()

  let definition: any = null
  if (composite.reportPackageSnapshotEncrypted) {
    try {
      const snapshot = readFrozenReportPackageSnapshot(composite.reportPackageSnapshotEncrypted)
      if (
        snapshot.packageKey === composite.reportPackageKey
        && snapshot.packageVersion === composite.reportPackageVersion
      ) {
        definition = snapshot.packageDefinition
      }
    } catch {
      // Publish/copy reject malformed snapshots.  Drafts without a snapshot
      // still need the current registry definition for their preview labels.
    }
  }
  if (!definition) {
    try {
      definition = getReportPackageDefinition(composite.reportPackageKey, composite.reportPackageVersion) ?? null
    } catch {
      definition = null
    }
  }

  return new Map(
    (definition?.slots ?? [])
      .filter((slot: any) => Number.isInteger(slot.position) && typeof slot.label === 'string')
      .map((slot: any) => [slot.position, slot.label] as [number, string]),
  )
}

export const resolveCompositeItemLabel = (item: any, packageSlotLabels = new Map<number, string>()) =>
  packageSlotLabels.get(item.position)
  ?? item.scale?.name
  ?? item.cognitiveAssignment?.title
  ?? item.formLabel

export const resolveLibraryItemLabel = (item: any, packageSlotLabels = new Map<number, string>()) =>
  packageSlotLabels.get(item.position)
  ?? item.scale?.name
  ?? item.cognitiveAssignment?.config?.name
  ?? item.cognitiveAssignment?.title
  ?? item.formLabel
