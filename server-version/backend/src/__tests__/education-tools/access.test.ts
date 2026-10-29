import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveEducationToolAuthoringCapabilities, resolveEducationToolAuthoringContext } from '../../modules/education-tools/access'
import { resolveEducationProductMemberScope } from '../../modules/organization/educationProductAccess'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { $queryRaw: mocks.query } }))
const input = () => ({ principal: { userId: 'actor', accountDomain: 'SCHOOL' as const }, organizationId: 'school', entry: 'SCHOOL' as const })
const row = { organizationId: 'school', organizationName: 'Private school name', membershipId: 'member', orgRole: 'MEMBER', productAdmin: false }
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue([row]) })

describe('education tool authoring capability contract', () => {
  it.each([['SCHOOL', 'HUISCHOOL'], ['TEACHER', 'HUITEACHER']] as const)('maps %s to its own product in one current authority query', async (entry, product) => {
    mocks.query.mockResolvedValue([{ ...row, productAdmin: entry === 'TEACHER' }])
    expect(await resolveEducationToolAuthoringContext({ ...input(), entry })).toEqual({
      entry, product, organizationId: 'school', membershipId: 'member', ownerUserId: 'actor',
      defaultVisibility: 'AUTHOR_PRIVATE', authorableToolKinds: ['SCALE', 'FORM', 'COMPOSITION'],
    })
    expect(mocks.query).toHaveBeenCalledTimes(1)
    const query = mocks.query.mock.calls[0][0]
    expect(query.values).toContain(product)
    if (entry === 'SCHOOL') {
      expect(query.sql).toContain('persona."membership_id"=m."id"')
      expect(query.sql).toContain('capability."membership_id"=m."id"')
      expect(query.sql).toContain('professional_deny."permission"=\'PSYCHOLOGY_STAFF\'')
    } else {
      expect(query.sql).not.toContain('organization_persona_grants')
      expect(query.sql).not.toContain('organization_capability_grants')
      expect(query.sql).toContain('grant_row."membership_id"=m."id"')
      expect(query.sql).toContain('denied_admin."permission"')
    }
    expect(query.values).toContain('school')
    expect(query.values).toContain('actor')
  })
  it('rejects a Teacher member without this school product-admin grant, including a psychology author', async () => {
    expect(await resolveEducationToolAuthoringCapabilities({ ...input(), entry: 'TEACHER' })).toEqual({
      canAuthor: false, authorableToolKinds: [],
    })
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })
  it('rechecks Teacher administration on the next request instead of caching an allowed hint', async () => {
    mocks.query.mockResolvedValueOnce([{ ...row, productAdmin: true }]).mockResolvedValueOnce([row])
    expect((await resolveEducationToolAuthoringCapabilities({ ...input(), entry: 'TEACHER' })).canAuthor).toBe(true)
    expect((await resolveEducationToolAuthoringCapabilities({ ...input(), entry: 'TEACHER' })).canAuthor).toBe(false)
    expect(mocks.query).toHaveBeenCalledTimes(2)
  })
  it('leaves existing member queries free of new professional restrictions', async () => {
    await resolveEducationProductMemberScope({ actorUserId: 'actor', organizationId: 'school', product: 'HUITEACHER' })
    const query = mocks.query.mock.calls[0][0]
    expect(query.sql).not.toContain('organization_persona_grants')
    expect(query.sql).not.toContain('organization_capability_grants')
  })
  it('rejects foreign account domains and invalid runtime entries before querying', async () => {
    for (const accountDomain of ['TRAINING', 'SURVEY', 'LEGACY', undefined] as const) {
      expect(await resolveEducationToolAuthoringContext({ ...input(), principal: { userId: 'actor', accountDomain } })).toBeNull()
    }
    expect(await resolveEducationToolAuthoringContext({ ...input(), entry: 'toString' as never })).toBeNull()
    expect(await resolveEducationToolAuthoringContext({ ...input(), organizationId: '' })).toBeNull()
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('returns no school details or broader permissions in navigation hints', async () => {
    expect(await resolveEducationToolAuthoringCapabilities(input())).toEqual({ canAuthor: true, authorableToolKinds: ['SCALE', 'FORM', 'COMPOSITION'] })
    mocks.query.mockResolvedValue([])
    expect(await resolveEducationToolAuthoringCapabilities(input())).toEqual({ canAuthor: false, authorableToolKinds: [] })
  })
  it('uses the supplied transaction and never falls back to the global connection', async () => {
    const query = vi.fn().mockResolvedValue([])
    expect(await resolveEducationToolAuthoringContext(input(), { $queryRaw: query } as never)).toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('does not turn database errors into an allowed capability', async () => {
    mocks.query.mockRejectedValue(new Error('database unavailable'))
    await expect(resolveEducationToolAuthoringContext(input())).rejects.toThrow('database unavailable')
  })
})
