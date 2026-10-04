import { expect, it, vi } from 'vitest'
import { loadGovernancePages } from '../loadGovernancePages'
it('loads a second page without truncating governance history', async () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: 'row-' + i }))
  const load = vi.fn(async (page: number) => ({
    list: rows.slice((page - 1) * 100, page * 100),
    total: 101,
    page,
    pageSize: 100,
  }))
  expect(await loadGovernancePages(load, new AbortController().signal)).toEqual(
    rows,
  )
  expect(load).toHaveBeenCalledTimes(2)
})
it.each(['total', 'duplicates', 'short-page'])(
  'reports incomplete or changing data instead of silently accepting it: %s',
  async (condition) => {
    const first = Array.from({ length: 100 }, (_, i) => ({ id: 'row-' + i }))
    const load = vi.fn(async (page: number) =>
      page === 1
        ? { list: first, total: 101, page, pageSize: 100 }
        : {
            list:
              condition === 'short-page'
                ? []
                : [{ id: condition === 'duplicates' ? 'row-0' : 'row-100' }],
            total: condition === 'total' ? 102 : 101,
            page,
            pageSize: 100,
          },
    )
    await expect(
      loadGovernancePages(load, new AbortController().signal),
    ).rejects.toThrow(/组织数据已变化/)
  },
)
it('stops paging when the organization page has been left', async () => {
  const controller = new AbortController()
  const load = vi.fn(async (page: number) => {
    controller.abort()
    return {
      list: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })),
      total: 101,
      page,
      pageSize: 100,
    }
  })
  await expect(
    loadGovernancePages(load, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(load).toHaveBeenCalledTimes(1)
})
