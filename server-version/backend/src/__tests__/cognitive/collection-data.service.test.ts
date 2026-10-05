import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '../../types'
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), source: vi.fn(), items: vi.fn(), count: vi.fn(), reports: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  cognitiveAssignment: { findUnique: mocks.source }, compositeAssessmentItem: { findMany: mocks.items },
  cognitiveSession: { count: mocks.count, findMany: mocks.reports },
} }))
vi.mock('../../modules/cognitive/assignment.service', () => ({ getAssignmentForTeacher: mocks.authorize }))
import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { listCognitiveCollections, requireCognitiveCollection } from '../../modules/cognitive/collection-data.service'
import { listProfessionalReports } from '../../modules/cognitive/professional-report.service'

const actor = { userId: 'teacher-1', role: UserRole.TEACHER, assignmentId: 'source-1' }
let report: string
beforeEach(() => {
  vi.clearAllMocks()
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  report = encryptCognitivePayload({ reportVersion: 'v1', quality: { minimum: 12 } })
  mocks.authorize.mockResolvedValue({ id: actor.assignmentId, title: '任务', listedStandalone: true })
  mocks.source.mockResolvedValue({ configId: 'config-1', profile: 'standard', profileDefinitionVersion: 'p1', resolvedConfigHash: 'hash-1', resolvedReportSnapshotEncrypted: report })
  mocks.items.mockResolvedValue([{ cognitiveAssignmentId: 'wrapper-1', cognitiveAssignment: { resolvedReportSnapshotEncrypted: report }, compositeAssessment: { id: 'collection-1', name: '问卷' } }])
  mocks.count.mockResolvedValue(1)
  mocks.reports.mockResolvedValue([])
})
describe('owned same-version cognitive collection scopes', () => {
  it('uses immutable task/report identity and excludes other owners, organization and package scopes', async () => {
    expect(await listCognitiveCollections(actor)).toEqual([{ id: 'collection-1', name: '问卷', assignmentIds: ['wrapper-1'], completedCount: 1 }])
    const query = mocks.items.mock.calls[0][0]
    expect(query.where.compositeAssessment.is).toEqual({ createdBy: actor.userId, productKind: 'QUESTIONNAIRE', reportPackageKey: null })
    expect(query.where.cognitiveAssignment.is).toMatchObject({ createdBy: actor.userId, listedStandalone: false, configId: 'config-1', resolvedConfigHash: 'hash-1', profile: 'standard', profileDefinitionVersion: 'p1' })
    expect(query.where.cognitiveAssignment.is).not.toHaveProperty('title')
    expect(mocks.count).toHaveBeenCalledWith({ where: { assignmentId: 'wrapper-1', status: 'COMPLETED', compositeAttempt: { is: { compositeAssessmentId: 'collection-1', assignmentRef: null } } } })
  })
  it('rejects identical task names with a different frozen report contract', async () => {
    mocks.items.mockResolvedValue([{ cognitiveAssignmentId: 'wrapper-1', cognitiveAssignment: { resolvedReportSnapshotEncrypted: encryptCognitivePayload({ reportVersion: 'v2' }) }, compositeAssessment: { id: 'collection-1', name: '任务' } }])
    expect(await listCognitiveCollections(actor)).toEqual([])
    expect(mocks.count).not.toHaveBeenCalled()
  })
  it('does not infer a contract for missing historical freeze or grant source access', async () => {
    mocks.source.mockResolvedValue({ configId: 'config-1' })
    expect(await listCognitiveCollections(actor)).toEqual([])
    expect(mocks.items).not.toHaveBeenCalled()
    mocks.authorize.mockRejectedValue(new Error('Forbidden'))
    await expect(listCognitiveCollections(actor)).rejects.toThrow('Forbidden')
  })
  it('rechecks the scope for reading and filters report sessions to the selected owned ordinary collection', async () => {
    await listProfessionalReports({ ...actor, offset: 0, collectionId: 'collection-1' })
    expect(mocks.reports.mock.calls[0][0].where).toEqual({ assignmentId: { in: ['wrapper-1'] }, status: 'COMPLETED', compositeAttempt: { is: { compositeAssessmentId: 'collection-1', assignmentRef: null } } })
    await expect(requireCognitiveCollection({ ...actor, collectionId: 'unrelated' })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('deduplicates shared bindings and combines matching repeated units in one collection', async () => {
    const first = { cognitiveAssignmentId: 'wrapper-1', cognitiveAssignment: { resolvedReportSnapshotEncrypted: report }, compositeAssessment: { id: 'collection-1', name: '问卷' } }
    mocks.items.mockResolvedValue([first, first, { ...first, cognitiveAssignmentId: 'wrapper-2' }])
    const list = await listCognitiveCollections(actor)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ assignmentIds: ['wrapper-1', 'wrapper-2'], completedCount: 2 })
  })
})
