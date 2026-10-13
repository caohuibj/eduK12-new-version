import type { Request } from 'express'

export class ListCursorError extends Error {}
export type ListCursor = { at: string; id: string }
/** Keyset paging keeps database work independent from the requested page number. */
export function listPage(query: Request['query']) {
  for (const value of [query.pageSize, query.page]) if (value !== undefined && (typeof value !== 'string' || !/^\d+$/.test(value))) throw new ListCursorError('分页参数无效')
  const size = query.pageSize === undefined ? 20 : Number(query.pageSize)
  if (!Number.isSafeInteger(size) || size < 1 || size > 100) throw new ListCursorError('每页数量必须为 1–100')
  const page = query.page === undefined ? 1 : Number(query.page)
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * size > 20_000) throw new ListCursorError('分页范围过大，请使用游标')
  if (query.cursor !== undefined && page !== 1) throw new ListCursorError('请勿混用分页方式')
  let cursor: ListCursor | undefined
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== 'string' || query.cursor.length > 512) throw new ListCursorError('分页游标无效')
    try {
      const value = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))
      if (typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at)) || new Date(value.at).toISOString() !== value.at
        || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)) throw new Error()
      cursor = { at: value.at, id: value.id }
    } catch { throw new ListCursorError('分页游标无效') }
  }
  return { size, cursor, offset: (page - 1) * size, page }
}
export function cursorWhere(field: 'createdAt' | 'joinedAt', cursor?: ListCursor) {
  return cursor ? { OR: [{ [field]: { lt: new Date(cursor.at) } }, { [field]: new Date(cursor.at), id: { lt: cursor.id } }] } : {}
}
export function listPageResult<T extends { id: string }>(rows: T[], size: number, field: 'createdAt' | 'joinedAt', total?: number) {
  const list = rows.slice(0, size), last = list.at(-1)
  const hasMore = rows.length > size
  const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ at: (last as T & Record<string, Date>)[field].toISOString(), id: last.id })).toString('base64url') : null
  return { list, ...(total === undefined ? {} : { total }), pageSize: size, hasMore, nextCursor }
}
