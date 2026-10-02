export interface LegacyMissingReference {
  source_table: string
  source_id: string
  field: string
  reference: string
  available_alternatives?: Array<{ cos_key?: string; field?: string }>
}
export interface RewritePlanEntry { table: string; id: string; field: string; from: string; to: string }
export interface LoadedRewrite { byRow: Map<string, RewritePlanEntry[]>; plan: RewritePlanEntry[] }

export function buildRewriteMap(references: LegacyMissingReference[], legacyCosDomain: string): LoadedRewrite {
  const domain = new URL(legacyCosDomain)
  if (domain.protocol !== 'https:') throw new Error('Legacy asset domain must use HTTPS')
  const byRow = new Map<string, RewritePlanEntry[]>(), plan: RewritePlanEntry[] = []
  for (const ref of references) {
    const key = ref.available_alternatives?.find(value => value.cos_key)?.cos_key
    if (!key || key.startsWith('backups/')) throw new Error('Audited URL has no allowed replacement')
    if (!/^videos\.\d+\.url$/.test(ref.field)) throw new Error('Unsupported audited URL field')
    const entry = { table: ref.source_table, id: ref.source_id, field: ref.field, from: ref.reference, to: legacyCosDomain.replace(/\/$/, '') + '/' + key.replace(/^\//, '') }
    const rowKey = ref.source_table + ':' + ref.source_id
    byRow.set(rowKey, [...(byRow.get(rowKey) ?? []), entry]); plan.push(entry)
  }
  return { byRow, plan }
}
export function applyRewrites(loaded: LoadedRewrite, table: string, legacyId: string, column: unknown): { value: unknown; applied: RewritePlanEntry[] } {
  const entries = loaded.byRow.get(table + ':' + legacyId) ?? []
  if (!entries.length) return { value: column, applied: [] }
  const value = structuredClone(column), applied: RewritePlanEntry[] = []
  if (!Array.isArray(value)) throw new Error('Audited video column is not an array')
  for (const entry of entries) {
    const index = Number(entry.field.split('.')[1])
    const target = value[index] as { url?: string } | undefined
    if (!target || target.url !== entry.from) throw new Error('Audited URL does not match its source field')
    target.url = entry.to
    applied.push(entry)
  }
  return { value, applied }
}
