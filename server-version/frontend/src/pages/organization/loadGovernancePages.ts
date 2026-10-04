import type { Paged } from '../../api/organizations'
/** Selectors and history tables need all pages, never a silently truncated list. */
export async function loadGovernancePages<T extends { id: string }>(
  load: (page: number) => Promise<Paged<T>>,
  signal: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [],
    ids = new Set<string>()
  let total: number | undefined, pageSize: number | undefined
  for (let page = 1; ; page++) {
    if (signal.aborted) throw new DOMException('页面已离开', 'AbortError')
    const next = await load(page)
    if (signal.aborted) throw new DOMException('页面已离开', 'AbortError')
    total ??= next.total
    pageSize ??= next.pageSize
    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize <= 0 ||
      next.total !== total ||
      next.page !== page ||
      next.pageSize !== pageSize ||
      next.list.length !== Math.min(pageSize, total - rows.length)
    )
      throw new Error('组织数据已变化或加载不完整，请重新加载')
    for (const row of next.list) {
      if (ids.has(row.id)) throw new Error('组织数据已变化，请重新加载')
      ids.add(row.id)
      rows.push(row)
    }
    if (rows.length === total) return rows
  }
}
