import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), enqueue: vi.fn(), read: vi.fn(), save: vi.fn(), scope: vi.fn() }))
vi.mock('../../services/exportJobService', () => ({ enqueueExportJob: mocks.enqueue }))
vi.mock('../../modules/cognitive/assignment.service', () => ({ getAssignmentForTeacher: mocks.auth }))
vi.mock('../../modules/cognitive/export.service', () => ({ cognitiveExportService: { getCognitiveExportData: mocks.read, saveCognitiveExportFiles: mocks.save } }))
vi.mock('../../modules/composite/composite.service', () => ({ getExportContext: mocks.auth, isCompositeError: () => false }))
vi.mock('../../modules/composite/composite-export.service', () => ({ compositeExportService: { getExportData: mocks.read, saveExportFiles: mocks.save } }))
vi.mock('../../modules/composite/composite-export-projection', () => ({ resolveCompositeExportProjectionBinding: vi.fn().mockResolvedValue({ fingerprint: 'current' }) }))
vi.mock('../../modules/composite/composite-course-scope',()=>({assertCompositeCourseScope:mocks.scope}))
import { cognitiveController } from '../../modules/cognitive/cognitive.controller'
import { compositeExportController } from '../../modules/composite/composite-export.controller'
const response = () => { const r: any = {}; r.status = vi.fn(() => r); r.json = vi.fn(() => r); return r }
describe.each([['COGNITIVE', cognitiveController.exportData], ['COMPOSITE', compositeExportController.export]] as const)('%s durable enqueue HTTP', (type, handler) => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({_count:{items:0}}); mocks.enqueue.mockResolvedValue({ status: 'PROCESSING', artifacts: [{ id: 'artifact' }] }) })
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

it('rejects typed SAV before durable enqueue and does not decrypt answers',async()=>{
 vi.clearAllMocks();mocks.auth.mockResolvedValue({_count:{items:1}})
 const res=response()
 await compositeExportController.export({user:{userId:'owner',role:'TEACHER'},params:{id:'resource'},body:{detail:'full',format:'sav'},get:()=> 'typed-sav-request-key'} as any,res)
 expect(res.status).toHaveBeenCalledWith(400);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({message:expect.stringContaining('TYPED_FORM_SAV_NOT_SUPPORTED')}))
 expect(mocks.enqueue).not.toHaveBeenCalled();expect(mocks.read).not.toHaveBeenCalled()
})

 it('binds a course-scoped anonymized intent and rejects a revoked course binding before enqueue',async()=>{
  vi.clearAllMocks();mocks.auth.mockResolvedValue({_count:{items:0}});mocks.scope.mockResolvedValue({id:'00000000-0000-4000-8000-000000000001'})
  const request={user:{userId:'owner',role:'ADMIN'},params:{id:'resource'},body:{courseId:'00000000-0000-4000-8000-000000000001',format:'zip',anonymize:false},get:()=> 'course-export-intent-key'}
  await compositeExportController.export(request as any,response())
  expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({anonymized:true,options:expect.objectContaining({courseId:request.body.courseId,anonymize:true})}))
  mocks.enqueue.mockClear();mocks.scope.mockRejectedValueOnce(Object.assign(new Error('无权读取本课程'),{statusCode:403}))
  const rejected=response();await compositeExportController.export(request as any,rejected)
  expect(mocks.enqueue).not.toHaveBeenCalled();expect(rejected.status).toHaveBeenCalledWith(403)
 })
