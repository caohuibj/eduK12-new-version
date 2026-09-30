import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), enqueue: vi.fn(), read: vi.fn(), save: vi.fn() }))
vi.mock('../../services/exportJobService', () => ({ enqueueExportJob: mocks.enqueue }))
vi.mock('../../modules/cognitive/assignment.service', () => ({ getAssignmentForTeacher: mocks.auth }))
vi.mock('../../modules/cognitive/export.service', () => ({ cognitiveExportService: { getCognitiveExportData: mocks.read, saveCognitiveExportFiles: mocks.save } }))
vi.mock('../../modules/composite/composite.service', () => ({ getExportContext: mocks.auth, isCompositeError: () => false }))
vi.mock('../../modules/composite/composite-export.service', () => ({ compositeExportService: { getExportData: mocks.read, saveExportFiles: mocks.save } }))
vi.mock('../../modules/composite/composite-export-projection', () => ({ resolveCompositeExportProjectionBinding: vi.fn().mockResolvedValue({ fingerprint: 'current' }) }))
import { cognitiveController } from '../../modules/cognitive/cognitive.controller'
import { compositeExportController } from '../../modules/composite/composite-export.controller'
const response = () => { const r: any = {}; r.status = vi.fn(() => r); r.json = vi.fn(() => r); return r }
describe.each([['COGNITIVE', cognitiveController.exportData], ['COMPOSITE', compositeExportController.export]] as const)('%s durable enqueue HTTP', (type, handler) => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({}); mocks.enqueue.mockResolvedValue({ status: 'PROCESSING', artifacts: [{ id: 'artifact' }] }) })
  it('persists teacher anonymization and request identity without reading/decrypting/serializing rows in API', async () => {
    const res = response()
    await handler({ user: { userId: 'owner', role: 'TEACHER' }, params: { id: 'resource' }, body: { detail: 'summary', format: 'csv', anonymize: false }, get: () => 'lost-response-key' } as any, res)
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ resourceType: type, createdBy: 'owner', anonymized: true, requestKey: 'lost-response-key' }))
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }))
  })
  it('does not create an intent after current ownership revocation', async () => {
    mocks.auth.mockRejectedValue(Object.assign(new Error('revoked'), { statusCode: 403 }))
    await handler({ user: { userId: 'owner', role: 'TEACHER' }, params: { id: 'resource' }, body: {}, get: () => 'lost-response-key' } as any, response())
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
})
