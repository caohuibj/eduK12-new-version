import {beforeEach, describe, expect, it, vi} from 'vitest'
const mocks = vi.hoisted(() => ({db: {$queryRaw: vi.fn()}, tx: {$queryRaw: vi.fn()}, flags: {materialGrantsEnabled: true}}))
vi.mock('../../config/database', () => ({prisma: mocks.db}))
vi.mock('../../config', () => ({config: mocks.flags}))
import {hasMediaAssetGrant} from '../../services/workspaceMedia'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.flags.materialGrantsEnabled = true
  mocks.db.$queryRaw.mockResolvedValue([])
  mocks.tx.$queryRaw.mockResolvedValue([])
})
describe('exact media grant admission in parent transactions', () => {
  it('uses the supplied transaction and locks the exact asset/grant, never the author entire library', async () => {
    mocks.tx.$queryRaw.mockResolvedValue([{id: 'asset'}])
    expect(await hasMediaAssetGrant('teacher', 'asset', mocks.tx as never)).toBe(true)
    expect(mocks.db.$queryRaw).not.toHaveBeenCalled()
    const sql = mocks.tx.$queryRaw.mock.calls[0][0]
    expect(sql.sql).toContain('FOR SHARE OF a, g')
    expect(sql.sql).toContain('g.resource_id=a.id')
    expect(sql.sql).toContain("g.resource_type::text='MEDIA_ASSET'")
    expect(sql.sql).toContain("a.access_scope IN ('PRIVATE','PUBLIC')")
    expect(sql.sql).toContain('e.evidence_asset_id=a.id')
    expect(sql.values).toContain('teacher'); expect(sql.values).toContain('asset')
  })
  it('fails closed when the exact grant was revoked and leaves ordinary reads unlocked', async () => {
    expect(await hasMediaAssetGrant('teacher', 'asset', mocks.tx as never)).toBe(false)
    expect(await hasMediaAssetGrant('teacher', 'other-asset')).toBe(false)
    expect(mocks.db.$queryRaw.mock.calls[0][0].sql).not.toContain('FOR SHARE')
  })
  it('does not query or admit media when grants are disabled', async () => {
    mocks.flags.materialGrantsEnabled = false
    expect(await hasMediaAssetGrant('teacher', 'asset', mocks.tx as never)).toBe(false)
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
  })
})
