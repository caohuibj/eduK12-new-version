import { beforeEach, describe, expect, it, vi } from 'vitest'
const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../client', () => ({ default: transport }))
import { relationalApi } from '../relational'
beforeEach(() => { vi.clearAllMocks(); transport.get.mockResolvedValue({ data: { list: [] } }); transport.post.mockResolvedValue({ data: {} }) })
describe('registered relational HTTP contract', () => {
  it('discovers the catalog and tasks using the server registration prefix', async () => {
    expect(await relationalApi.catalog()).toEqual([])
    expect(await relationalApi.tasks()).toEqual([])
    expect(transport.get.mock.calls.map(call => call[0])).toEqual(['/relational-assessments/catalog', '/relational-assessments/tasks'])
  })
  it('preserves encoded task identity and business payload on authenticated mutations', async () => {
    await relationalApi.acceptConsent('task/id')
    await relationalApi.start('task/id')
    expect(transport.post.mock.calls.map(call => call[0])).toEqual(['/relational-assessments/assignments/task%2Fid/consent/accept', '/relational-assessments/assignments/task%2Fid/start'])
  })
})
