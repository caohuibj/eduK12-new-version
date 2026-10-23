import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), canUseScale: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { scale: { findMany: mocks.findMany } } }))
vi.mock('../../services/materialGrant', () => ({ canUseScale: mocks.canUseScale }))
import { listQuestionnaireScaleResources } from '../../modules/questionnaire-product/scale-resources'

const actor = { userId: 'owner', role: UserRole.TEACHER }
const row = (id: string, creatorId = 'owner', libraryEntryId: string | null = null) => ({ id, creatorId, libraryEntryId,
  status: 'PUBLISHED', name: id, code: id, instrumentVersion: '1.0.0' })
beforeEach(() => { vi.resetAllMocks(); mocks.canUseScale.mockResolvedValue(false) })

describe('questionnaire scale selector', () => {
  it('reads selector and ownership fields without downloading complete definitions', async () => {
    mocks.findMany.mockResolvedValue([row('own')])
    expect(await listQuestionnaireScaleResources(actor)).toEqual([{ id: 'own', name: 'own', code: 'own', version: '1.0.0' }])
    expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith({ where: { status: 'PUBLISHED' }, orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, instrumentVersion: true, creatorId: true, status: true, libraryEntryId: true } })
    expect(mocks.canUseScale).not.toHaveBeenCalled()
  })

  it('rechecks governed ownership and other owners, retaining ordered permitted results', async () => {
    const rows = [row('own'), row('governed-own', 'owner', 'library-entry'), row('granted', 'other'), row('denied', 'other')]
    mocks.findMany.mockResolvedValue(rows); mocks.canUseScale.mockImplementation(async (_id, _role, scale) => scale.id === 'granted')
    expect((await listQuestionnaireScaleResources(actor)).map(v => v.id)).toEqual(['own', 'granted'])
    expect(mocks.canUseScale.mock.calls.map(v => v[2].id)).toEqual(['governed-own', 'granted', 'denied'])
  })

  it('does not retain grants across requests or infer a missing library identity', async () => {
    const unknown = { ...row('unknown'), libraryEntryId: undefined }
    mocks.findMany.mockResolvedValue([unknown, row('grant', 'other')])
    mocks.canUseScale.mockResolvedValue(true)
    expect(await listQuestionnaireScaleResources(actor)).toHaveLength(2)
    mocks.canUseScale.mockResolvedValue(false)
    expect(await listQuestionnaireScaleResources(actor)).toEqual([])
    expect(mocks.canUseScale).toHaveBeenCalledTimes(4)
  })
})
