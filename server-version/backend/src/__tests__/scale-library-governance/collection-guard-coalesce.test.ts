import { describe, expect, it, vi } from 'vitest'
import { assertScaleLibraryCollectionAllowed } from '../../modules/scale-library-governance/collection-guard'

describe('assertScaleLibraryCollectionAllowed SQL roundtrip coalescing', () => {
  it('returns immediately with zero queries when all id lists are empty', async () => {
    const tx = { $queryRaw: vi.fn() }
    await assertScaleLibraryCollectionAllowed(tx as never, [], [], [])
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it('executes 1 coalesced lock+ancestor query followed by 1 separate emergency-stop query', async () => {
    const sqls: string[] = []
    const tx = {
      $queryRaw: vi.fn(async (query: any) => {
        const sql = String(query?.sql ?? query?.strings?.join('?') ?? query)
        sqls.push(sql)
        if (sqls.length === 1) {
          return [{ seed_ids: ['rel-1'], release_ids: ['rel-0', 'rel-1'], truncated: false, locked_release_count: 2 }]
        }
        return []
      }),
    }

    await assertScaleLibraryCollectionAllowed(tx as never, ['rel-1'], ['scale-1'], ['draft-1'])

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
    expect(sqls[0]).toContain('locked_scales AS MATERIALIZED')
    expect(sqls[0]).toContain('locked_drafts AS MATERIALIZED')
    expect(sqls[0]).toContain('locked_releases AS MATERIALIZED')
    expect(sqls[0]).toContain('FOR SHARE')
    expect(sqls[1]).toContain('FROM scale_library_emergency_stops')
  })

  it('rejects incomplete dependency identity or truncation before emergency-stop check', async () => {
    const txMissing = {
      $queryRaw: vi.fn(async () => [{ seed_ids: ['rel-1', 'rel-missing'], release_ids: ['rel-1'], truncated: false }]),
    }
    await expect(assertScaleLibraryCollectionAllowed(txMissing as never, ['rel-1', 'rel-missing']))
      .rejects.toThrow('量表依赖身份不完整')
    expect(txMissing.$queryRaw).toHaveBeenCalledTimes(1)

    const txTruncated = {
      $queryRaw: vi.fn(async () => [{ seed_ids: ['rel-1'], release_ids: ['rel-1'], truncated: true }]),
    }
    await expect(assertScaleLibraryCollectionAllowed(txTruncated as never, ['rel-1']))
      .rejects.toThrow('量表依赖身份不完整')
    expect(txTruncated.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('rejects when an emergency stop matches on the second fresh-snapshot query', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ seed_ids: ['rel-1'], release_ids: ['rel-1'], truncated: false, locked_release_count: 1 }])
        .mockResolvedValueOnce([{ target_id: 'rel-1' }]),
    }
    await expect(assertScaleLibraryCollectionAllowed(tx as never, ['rel-1']))
      .rejects.toThrow('该量表版本已紧急停用')
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
  })
})
