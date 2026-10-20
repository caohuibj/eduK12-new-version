import {beforeEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({principal:vi.fn(),scope:vi.fn(),auth:vi.fn(),read:vi.fn(),save:vi.fn(),binding:vi.fn(),count:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{compositeAssessmentAttempt:{count:m.count}}}))
vi.mock('../../modules/organization/principal',()=>({loadCurrentPrincipal:m.principal}))
vi.mock('../../modules/composite/composite-course-scope',()=>({assertCompositeCourseScope:m.scope}))
vi.mock('../../modules/composite/composite.service',()=>({getExportContext:m.auth}))
vi.mock('../../modules/composite/composite-export.service',()=>({compositeExportService:{getExportData:m.read,saveExportFiles:m.save},teacherRelationalExportVisibility:async()=>({assignmentRef:null})}))
vi.mock('../../modules/composite/composite-export-projection',()=>({resolveCompositeExportProjectionBinding:m.binding,projectCompositeExportData:(data:unknown)=>data}))
vi.mock('../../modules/cognitive/assignment.service',()=>({getAssignmentForTeacher:vi.fn()}))
vi.mock('../../modules/cognitive/export.service',()=>({cognitiveExportService:{}}))
import {prepareAssessmentExport,revalidateAssessmentExport} from '../../services/assessmentExportWorker'
const courseId='00000000-0000-4000-8000-000000000001'
const claim=()=>({resourceType:'COMPOSITE',resourceId:'assessment',createdBy:'teacher',batchId:'00000000-0000-4000-8000-000000000002',generation:1,createdAt:new Date('2026-10-20T00:00:00Z'),options:{creatorRole:'TEACHER',anonymize:true,detail:'summary',courseId,projectionFingerprint:'current'}} as any)
beforeEach(()=>{vi.clearAllMocks();m.principal.mockResolvedValue({userId:'teacher',role:'TEACHER',isActive:true,isFrozen:false,expiresAt:null,teacherApproved:true,mustChangePassword:false});m.scope.mockResolvedValue({id:courseId});m.auth.mockResolvedValue({});m.binding.mockResolvedValue({fingerprint:'current'});m.read.mockResolvedValue({detail:'summary',fields:[],rows:[{A_attempt_id:'attempt'}]});m.save.mockResolvedValue({filePath:'/synthetic/file.zip'});m.count.mockResolvedValue(1)})
it('preserves the course boundary, cutoff and provenance through preparation and serialization',async()=>{
 const prepared=await prepareAssessmentExport(claim());await prepared.save('zip')
 expect(m.read).toHaveBeenCalledWith('assessment',expect.objectContaining({courseId,anonymize:true,dateRange:expect.objectContaining({end:'2026-10-20T00:00:00.000Z'})}))
 expect(prepared.provenance).toMatchObject({courseId,attemptIds:['attempt']})
 expect(m.save).toHaveBeenCalledWith('assessment',expect.objectContaining({courseId}), 'zip',expect.any(Object))
 await revalidateAssessmentExport(claim(),['attempt'])
 expect(m.count).toHaveBeenCalledWith({where:{AND:[{id:{in:['attempt']},compositeAssessmentId:'assessment',status:'COMPLETED',deliveryCourseId:courseId},{assignmentRef:null}]}})
})
it('fails closed if the course binding is revoked or exported rows leave its scope',async()=>{
 m.scope.mockRejectedValueOnce(new Error('course revoked'))
 await expect(prepareAssessmentExport(claim())).rejects.toThrow('course revoked');expect(m.read).not.toHaveBeenCalled()
 m.count.mockResolvedValueOnce(0)
 await expect(revalidateAssessmentExport(claim(),['attempt'])).rejects.toThrow('row authority revoked')
})
