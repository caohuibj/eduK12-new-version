export type ReferenceSelection = { schemaVersion: 1; units: Array<{ itemId: string; choices: Array<{ releaseId: string; entryKey: string; priority: number }> }> }
export type ReportSelection = { schemaVersion: 1; units: Array<{ itemId: string; reportReleaseId: string }> }
export type Kind = 'reference' | 'report'
export type Selection = ReferenceSelection | ReportSelection | null
export type Pending = { actorId: string; compositeId: string; kind: Kind; revision: number; selection: Selection; uncertain: boolean }
export const selectionKey = (releaseId: string, entryKey: string) => JSON.stringify([releaseId, entryKey])
export const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
export function validSelection(value: unknown, kind: Kind): value is Selection {
  if (value === null) return true
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.units) || value.units.length > 1000) return false
  const items = new Set<string>()
  let count = 0
  return value.units.every((unit: unknown) => {
    if (!record(unit) || typeof unit.itemId !== 'string' || !unit.itemId || items.has(unit.itemId)) return false
    items.add(unit.itemId)
    if (kind === 'report') return typeof unit.reportReleaseId === 'string' && !!unit.reportReleaseId
    if (!Array.isArray(unit.choices) || unit.choices.length > 100 || (count += unit.choices.length) > 1000) return false
    const choices = new Set<string>()
    return unit.choices.every((choice: unknown) => {
      if (!record(choice) || typeof choice.releaseId !== 'string' || !choice.releaseId || typeof choice.entryKey !== 'string' || !choice.entryKey || !Number.isSafeInteger(choice.priority)) return false
      const key = selectionKey(choice.releaseId, choice.entryKey)
      if (choices.has(key)) return false
      choices.add(key)
      return true
    })
  })
}
export function savedPending(key: string, actorId: string, compositeId: string): Pending | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) || 'null')
    return record(value) && value.actorId === actorId && value.compositeId === compositeId && ['reference', 'report'].includes(value.kind)
      && Number.isSafeInteger(value.revision) && value.revision >= 0 && validSelection(value.selection, value.kind)
      ? { actorId, compositeId, kind: value.kind, revision: value.revision, selection: value.selection, uncertain: true } : null
  } catch { return null }
}
export const hasPendingTrainingContentSelection = (actorId:string,compositeId:string) =>
  Boolean(savedPending('training-content-selection:'+JSON.stringify([actorId,compositeId]),actorId,compositeId))
