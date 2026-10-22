import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: vi.fn(), findScale: vi.fn(), listScales: vi.fn() }))
vi.mock('../../config/database', () => {
  const prisma = { $queryRaw: mocks.query, scale: { findUnique: mocks.findScale, findMany: mocks.listScales } }
  return { prisma: { ...prisma, $transaction: (work: any) => work(prisma) } }
})
import { UserRole } from '@prisma/client'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  registerDescriptiveResource, transitionDescriptiveResource, readPublishedRegisteredResource,
  resolveReleasedRelationalEntry, resolveHistoricalRelationalEntry, assertRegisteredResourceUse,
  listReleasedRegisteredResourcePage, listRegisteredResources, listRegistrationCandidates,
} from '../../modules/assessment-run/registeredResources'
const admin = { userId: 'system-admin', platformRole: 'SYSTEM_ADMIN' }
const privateKey = 'private-scale:SCHOOL:version:STUDENT:SELF'
const denied = { code: 'RESOURCE_PRIVATE_LANE_REQUIRED' }
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue([]); mocks.listScales.mockResolvedValue([]) })
const sql = () => { const query = mocks.query.mock.calls[mocks.query.mock.calls.length - 1][0]; return (query.strings ?? query).join(' ') as string }

describe('Private education resource isolation from legacy registration', () => {
  it('refuses converting a private wrapper into legacy registration even for a system administrator', async () => {
    mocks.findScale.mockResolvedValue({ id: 'scale', code: 'education-private-scale:version' })
    await expect(registerDescriptiveResource(admin, 'scale')).rejects.toMatchObject(denied)
  })
  it.each([
    { resource_key: privateKey, entry: {} },
    { resource_key: 'custom-scale:forged:INDIVIDUAL', entry: { privateOrigin: {} } },
  ])('rejects private namespace or origin on direct published reads and all legacy transitions: $resource_key', async row => {
    mocks.query.mockResolvedValue([{ ...row, id: 'resource', status: 'PUBLISHED' }])
    await expect(readPublishedRegisteredResource(admin, 'resource')).rejects.toMatchObject(denied)
    for (const action of ['review', 'publish', 'retire'] as const)
      await expect(transitionDescriptiveResource(admin, 'resource', action)).rejects.toMatchObject(denied)
  })
  it('does not fall through generic use or historical/resolved entry lookup for the private namespace', async () => {
    const ref = { resourceKind: 'SCALE', resourceKey: privateKey, resourceVersion: '1.0.0' }
    await expect(resolveReleasedRelationalEntry(ref)).rejects.toMatchObject(denied)
    await expect(resolveHistoricalRelationalEntry(ref)).rejects.toMatchObject(denied)
    await expect(assertRegisteredResourceUse({ family: 'SCALE', key: privateKey, version: '1.0.0' }, 'author')).rejects.toMatchObject(denied)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('also rejects a private origin disguised as a legacy key in resolved reads', async () => {
    mocks.query.mockResolvedValue([{ resource_key: 'custom-scale:forged:INDIVIDUAL', entry: { privateOrigin: {} } }])
    const ref = { resourceKind: 'SCALE', resourceKey: 'custom-scale:forged:INDIVIDUAL', resourceVersion: '1.0.0' }
    await expect(resolveReleasedRelationalEntry(ref)).rejects.toMatchObject(denied)
    await expect(resolveHistoricalRelationalEntry(ref)).rejects.toMatchObject(denied)
  })
  it('filters private namespace and origin before pagination in both legacy directories', async () => {
    await listReleasedRegisteredResourcePage('admin', UserRole.ADMIN)
    let query = sql()
    expect(query).toContain("resource.resource_key NOT LIKE 'private-scale:%'")
    expect(query).toContain("NOT (resource.entry ? 'privateOrigin')")
    expect(query.indexOf("'privateOrigin'")).toBeLessThan(query.indexOf('LIMIT'))
    await listRegisteredResources(admin)
    query = sql()
    expect(query).toContain("resource_key NOT LIKE 'private-scale:%'")
    expect(query).toContain("NOT (entry ? 'privateOrigin')")
    expect(query.indexOf("'privateOrigin'")).toBeLessThan(query.indexOf('LIMIT'))
  })
  it('does not offer private wrappers as legacy registration candidates', async () => {
    await listRegistrationCandidates(admin)
    expect(mocks.listScales).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      NOT: { code: { startsWith: 'education-private-scale:' } },
    }) }))
  })
  it('rejects private origin hidden behind a legacy teacher key before a license can authorize it', async () => {
    const key = 'teacher-scale:11111111-1111-4111-8111-111111111111:INDIVIDUAL'
    const entry = { privateOrigin: {}, applicability: { resourceKind: 'SCALE', resourceKey: key, resourceVersion: '1.0.0',
      analysisMode: 'INDIVIDUAL_ONLY', subjectRoles: ['TEACHER'], respondentRoles: ['TEACHER'] },
      resultDisclosure: { audiences: { ORGANIZATION: { mode: 'NONE' } } } }
    mocks.query.mockResolvedValueOnce([{ domain: 'SCHOOL', schoolCourseId: null, teacherEventId: 'event' }])
      .mockResolvedValueOnce([{ entry, entryHash: canonicalHash(entry), scaleStatus: 'PUBLISHED', scaleHash: 'hash', definitionHash: 'hash',
        reviewedByUserId: 'independent-reviewer', reviewedAt: new Date(), publishedAt: new Date(),
        createdByUserId: 'registration-author', scaleCreatorId: 'scale-author' }])
    await expect(assertRegisteredResourceUse({ family: 'SCALE', key, version: '1.0.0' }, 'author', undefined, false,
      { organizationId: 'organization', runId: 'run' })).rejects.toMatchObject({ code: 'HUITEACHER_SCALE_RELEASE_INVALID' })
    expect(mocks.query).toHaveBeenCalledTimes(2)
  })

})
