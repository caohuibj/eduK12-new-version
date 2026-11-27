import type { Request, Response } from 'express'
import { beforeEach, expect, it, vi } from 'vitest'
import { ownToolLicenseHandler } from '../../modules/tool-licensing/business.routes'
import type { ToolLicenseProduct } from '../../modules/tool-licensing/contracts'

const scopes = vi.hoisted(() => ({ license: vi.fn(), education: vi.fn(), author: vi.fn(), organization: vi.fn() }))
vi.mock('../../modules/tool-licensing/management', () => ({ readOwnToolLicense: scopes.license }))
vi.mock('../../modules/organization/educationProductAccess', () => ({ resolveEducationProductMemberScope: scopes.education }))
vi.mock('../../modules/education-tools/access', () => ({ resolveEducationToolAuthoringContext: scopes.author }))
vi.mock('../../modules/organization/access', () => ({ resolveOrganizationAccessContext: scopes.organization }))

const school = '00000000-0000-4000-8000-000000000011'
function view(product: ToolLicenseProduct, user: object, organizationId = school) {
  return new Promise<{ code: number; data: unknown }>((resolve, reject) => {
    const req = { user: { userId: 'owner', platformRole: 'STANDARD', ...user }, params: { organizationId }, query: { subjectId: 'different-user' } }
    const res = { setHeader: vi.fn(), status: () => res, json: resolve }
    ownToolLicenseHandler(product)(req as unknown as Request, res as unknown as Response, reject)
  })
}
beforeEach(() => {
  vi.resetAllMocks()
  scopes.license.mockResolvedValue({ license: null, enforcing: true })
})

it('binds Training and Survey reads to the current business account', async () => {
  await expect(view('TRAINING', { accountDomain: 'TRAINING', role: 'TEACHER', teacherApproved: true })).resolves.toMatchObject({ code: 0 })
  await expect(view('SURVEY', { accountDomain: 'SURVEY' })).resolves.toMatchObject({ code: 0 })
  expect(scopes.license.mock.calls).toEqual([['TRAINING', 'owner', 'owner'], ['SURVEY', 'owner', 'owner']])
  await expect(view('SURVEY', { accountDomain: 'TRAINING' })).resolves.toMatchObject({ code: -1 })
  await expect(view('TRAINING', { accountDomain: 'TRAINING', role: 'TEACHER', teacherApproved: false })).resolves.toMatchObject({ code: -1 })
  expect(scopes.license).toHaveBeenCalledTimes(2)
})

it('reads school licenses only with the matching current governance or authoring scope', async () => {
  scopes.organization.mockResolvedValueOnce({ canGovern: false }).mockResolvedValueOnce({ canGovern: true })
  scopes.author.mockResolvedValueOnce(null)
  await expect(view('SCHOOL', { accountDomain: 'SCHOOL' })).resolves.toMatchObject({ code: -1 })
  await expect(view('SCHOOL', { accountDomain: 'SCHOOL' })).resolves.toMatchObject({ code: 0 })
  scopes.education.mockResolvedValueOnce({ productAdmin: false }).mockResolvedValueOnce({ productAdmin: true })
  await expect(view('TEACHER', { accountDomain: 'SCHOOL' })).resolves.toMatchObject({ code: -1 })
  await expect(view('TEACHER', { accountDomain: 'SCHOOL' })).resolves.toMatchObject({ code: 0 })
  expect(scopes.education).toHaveBeenLastCalledWith({ organizationId: school, actorUserId: 'owner', product: 'HUITEACHER' })
  expect(scopes.license.mock.calls).toEqual([['SCHOOL', school, 'owner'], ['TEACHER', school, 'owner']])
})
