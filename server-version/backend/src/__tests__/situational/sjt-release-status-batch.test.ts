import { beforeEach, expect, it, vi } from 'vitest'
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { sjtAuthorRelease: { findMany } } }))
import { projectSjtReleaseStatuses } from '../../modules/situational/authoring/service'
const row = (key: string, version = '1', scoringVersion = 'author-key-sum-v1') => ({
  attemptId: key + version, instrument: { key, version, scoringVersion, releaseStatus: 'PUBLISHED' },
})
beforeEach(() => findMany.mockReset())
it('batches exact uploaded versions, preserves order and builtins, and treats missing releases as retired', async () => {
  const builtin = row('builtin', '1', 'golden-v1')
  const rows = [row('a'), builtin, row('a'), row('a', '2'), row('missing', '1', 'sjt-online-v1')]
  findMany.mockResolvedValue([{ instrumentKey: 'a', instrumentVersion: '1', status: 'PUBLISHED' },
    { instrumentKey: 'a', instrumentVersion: '2', status: 'RETIRED' }])
  const result = await projectSjtReleaseStatuses(rows)
  expect(findMany).toHaveBeenCalledTimes(1)
  expect(findMany).toHaveBeenCalledWith({ where: { OR: [
    { instrumentKey: 'a', instrumentVersion: '1' }, { instrumentKey: 'a', instrumentVersion: '2' },
    { instrumentKey: 'missing', instrumentVersion: '1' }] }, select: { instrumentKey: true, instrumentVersion: true, status: true } })
  expect(result.map(r => r.attemptId)).toEqual(rows.map(r => r.attemptId))
  expect(result.map(r => r.instrument.releaseStatus)).toEqual(['PUBLISHED', 'PUBLISHED', 'PUBLISHED', 'RETIRED', 'RETIRED'])
  expect(result[1]).toBe(builtin)
  expect(rows[4]!.instrument.releaseStatus).toBe('PUBLISHED')
})
it('does not query for builtin-only or empty history', async () => {
  const rows = [row('builtin', '1', 'golden-v1')]
  expect(await projectSjtReleaseStatuses(rows)).toBe(rows)
  expect(await projectSjtReleaseStatuses([])).toEqual([])
  expect(findMany).not.toHaveBeenCalled()
})
