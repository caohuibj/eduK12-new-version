import {assertPrivateScaleRunWorkflow} from '../../modules/assessment-run/educationPrivateScaleContext'
import {readPrivateScaleRuntimeResource} from '../../modules/education-tools/private-tool.runtime-resources'
import {privateScaleResourceEntry} from '../../modules/education-tools/private-tool.runtime-policy'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
vi.mock('../../modules/assessment-run/educationPrivateScaleContext',()=>({assertPrivateScaleRunWorkflow:vi.fn()}))
vi.mock('../../modules/education-tools/private-tool.runtime-resources',()=>({readPrivateScaleRuntimeResource:vi.fn()}))
import {lockAndAssertCampusActivityEditor} from '../../modules/campus/activity.service'
import {describe,it,expect,vi,beforeEach} from 'vitest'
import {assertEducationRunLibraryResources} from '../../modules/assessment-run/educationLibraryContext'
import {readEducationLibraryUse} from '../../modules/scale-library-governance/education-use'
import {lockEducationLibraryOrganization,readEducationLibraryRegisteredSource} from '../../modules/scale-library-governance/education-runtime-resources'
import {assertCurrentRunManagerBoundary} from '../../modules/assessment-run/resourceBoundary'
vi.mock('../../modules/scale-library-governance/education-use',()=>({readEducationLibraryUse:vi.fn()}))
vi.mock('../../modules/scale-library-governance/education-runtime-resources',()=>({assertEducationLibraryReadCommitted:vi.fn(),lockEducationLibraryOrganization:vi.fn(),readEducationLibraryRegisteredSource:vi.fn()}))
vi.mock('../../modules/assessment-run/resourceBoundary',()=>({assertCurrentRunManagerBoundary:vi.fn()}))
vi.mock('../../modules/campus/activity.service',()=>({lockAndAssertCampusActivityEditor:vi.fn()}))
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const origin=(n:number)=>({schemaVersion:1,adapterVersion:'1.0.0',entryId:uuid(n),product:'TEACHER',releaseId:uuid(100+n),contentHash:'a'.repeat(64),approvedSnapshotHash:'b'.repeat(64),sourceDefinitionHash:'c'.repeat(64),applicabilityHash:'d'.repeat(64),variantKey:'TEACHER:SELF',dependencies:[]})
const ref=(n:number)=>({family:'SCALE',key:`library-scale:${uuid(n)}:TEACHER:TEACHER:SELF`,version:'1.0.0'})
const input={organizationId:uuid(50),runId:uuid(51),actorUserId:uuid(52),purpose:'PUBLISH' as const,resources:[ref(2),ref(1)]}
function db(domain='SCHOOL'){return {$queryRaw:vi.fn(async(query:any)=>{
 const sql=query.strings.join('')
 if(sql.includes('SELECT o.product_domain'))return [{domain,schoolCourseId:null,teacherEventId:uuid(53)}]
 if(sql.includes("entry->'libraryOrigin'")){const key=query.values.find((v:any)=>typeof v==='string'&&v.startsWith('library-scale:'));return [{origin:origin(key===ref(1).key?1:2)}]}
 if(sql.includes('SELECT status FROM huiteacher_evaluation_events'))return [{status:'OPEN'}]
 throw new Error('unanticipated query')
})} as any}
beforeEach(()=>vi.resetAllMocks())
describe('server-owned education library workflow context',()=>{
 it('selects all issuers before org, rechecks only those grants, and uses the same tx for manager checks',async()=>{
  const tx=db(),trace:string[]=[]
  vi.mocked(readEducationLibraryUse).mockImplementation(async(_tx,context,options)=>{
   const n=context.entryId===uuid(1)?1:2
   trace.push(options?`recheck${n}`:`select${n}`)
   if(options)expect(options.onlyGrantId).toBe(uuid(200+n))
   return {grantId:uuid(200+n)} as any
  })
  vi.mocked(lockEducationLibraryOrganization).mockImplementation(async()=>{trace.push('org')})
  vi.mocked(readEducationLibraryRegisteredSource).mockResolvedValue({variantKey:'TEACHER:SELF',resourceEntry:{applicability:{subjectRoles:['TEACHER']}}} as any)
  await assertEducationRunLibraryResources(tx,input)
  expect(trace).toEqual(['select1','select2','org','recheck1','recheck2'])
  expect(assertCurrentRunManagerBoundary).toHaveBeenCalledWith(expect.objectContaining({actorUserId:input.actorUserId}),tx)
 })
 it('does not replace the selected grant after org governance changes',async()=>{
  vi.mocked(readEducationLibraryUse).mockImplementation(async(_tx,_context,options)=>{
   if(options)throw new Error('current selected grant revoked')
   return {grantId:uuid(201)} as any
  })
  await expect(assertEducationRunLibraryResources(db(),{...input,resources:[ref(1)]})).rejects.toThrow('current selected grant revoked')
  expect(readEducationLibraryUse).toHaveBeenCalledTimes(2)
  expect(readEducationLibraryRegisteredSource).not.toHaveBeenCalled()
 })
 it('rejects library resource use in a noneducation run without taking education locks',async()=>{
  await expect(assertEducationRunLibraryResources(db('TRAINING'),input)).rejects.toThrow('EXPLICIT_WORKFLOW_REQUIRED')
  expect(lockEducationLibraryOrganization).not.toHaveBeenCalled()
 })
 it('rejects a teacher-population variant in the School edit and publication guards',async()=>{
  const schoolOrigin={...origin(1),product:'SCHOOL'}
  const schoolRef={...ref(1),key:`library-scale:${uuid(1)}:SCHOOL:TEACHER:SELF`}
  const tx={user:{findUnique:vi.fn().mockResolvedValue({id:input.actorUserId,accountDomain:'SCHOOL',role:'TEACHER'})},
   $queryRaw:vi.fn(async(query:any)=>{
    const sql=query.strings.join('')
    if(sql.includes('SELECT o.product_domain'))return [{domain:'SCHOOL',schoolCourseId:uuid(54),teacherEventId:null}]
    if(sql.includes("entry->'libraryOrigin'"))return [{origin:schoolOrigin}]
    throw new Error('unanticipated School query')
   })} as any
  vi.mocked(readEducationLibraryUse).mockResolvedValue({grantId:uuid(201)} as any)
  vi.mocked(readEducationLibraryRegisteredSource).mockResolvedValue({variantKey:'TEACHER:SELF',resourceEntry:{applicability:{subjectRoles:['TEACHER']}}} as any)
  for(const purpose of ['EDIT','PUBLISH'] as const){
   vi.mocked(lockAndAssertCampusActivityEditor).mockResolvedValue({activity:{status:purpose==='EDIT'?'DRAFT':'OPEN'}} as any)
   await expect(assertEducationRunLibraryResources(tx,{...input,purpose,resources:[schoolRef]})).rejects.toThrow('WORKFLOW_RESPONSE_MODE_UNSUPPORTED')
  }
 })
 it('checks private ownership after all public issuers and current workflow without adding issuer locks',async()=>{
  const trace:string[]=[]
  vi.mocked(readEducationLibraryUse).mockImplementation(async(_tx,_c,options)=>{trace.push(options?'recheck':'issuer');return {grantId:uuid(201)} as any})
  vi.mocked(lockEducationLibraryOrganization).mockImplementation(async()=>{trace.push('org')})
  vi.mocked(readEducationLibraryRegisteredSource).mockResolvedValue({variantKey:'TEACHER:SELF',resourceEntry:{applicability:{subjectRoles:['TEACHER']}}} as any)
  const context={entry:'TEACHER' as const,organizationId:input.organizationId,principal:{userId:input.actorUserId,accountDomain:'SCHOOL' as const}}
  vi.mocked(assertPrivateScaleRunWorkflow).mockImplementation(async()=>{trace.push('owner');return {context} as any})
  const definition=compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic',required:true,reverse:false,dimensionKeys:['total']}]})
  const entry=privateScaleResourceEntry({schemaVersion:1,adapterVersion:'1.0.0',kind:'AUTHOR_PRIVATE',entry:'TEACHER',organizationId:input.organizationId,ownerUserId:input.actorUserId,toolId:uuid(70),versionId:uuid(71),contentHash:'a'.repeat(64),definitionHash:'b'.repeat(64),releaseId:uuid(72),releaseHash:'c'.repeat(64),variantKey:'TEACHER:SELF'},'Synthetic',definition,uuid(73))
  vi.mocked(readPrivateScaleRuntimeResource).mockImplementation(async()=>{trace.push('private');return {resourceEntry:entry} as any})
  const tx=db(),key=entry.applicability.resourceKey
  const result=await assertEducationRunLibraryResources(tx,{...input,resources:[{family:'SCALE',key,version:'1.0.0'},ref(1)]})
  expect(trace).toEqual(['issuer','org','recheck','owner','private'])
  expect(result?.privateResourcePolicies.get(key)?.key).toBe(key)
  expect(readPrivateScaleRuntimeResource).toHaveBeenCalledWith(tx,{key,version:'1.0.0',purpose:'NEW_USE',context})
 })
 it('cannot turn private ownership into public grants or skip a current author failure',async()=>{
  vi.mocked(assertPrivateScaleRunWorkflow).mockResolvedValue({context:{}} as any)
  vi.mocked(readPrivateScaleRuntimeResource).mockRejectedValue(new Error('PRIVATE_TOOL_AUTHOR_REQUIRED'))
  await expect(assertEducationRunLibraryResources(db(),{...input,resources:[{family:'SCALE',key:'private-scale:fixed',version:'1.0.0'}]})).rejects.toThrow('AUTHOR_REQUIRED')
  expect(readEducationLibraryUse).not.toHaveBeenCalled()
 })
 it('rejects private namespace outside the education workflow or on a different resource family',async()=>{
  await expect(assertEducationRunLibraryResources(db('TRAINING'),{...input,resources:[{family:'SCALE',key:'private-scale:fixed',version:'1.0.0'}]})).rejects.toThrow('EXPLICIT_WORKFLOW_REQUIRED')
  await expect(assertEducationRunLibraryResources(db(),{...input,resources:[{family:'FORM',key:'private-scale:fixed',version:'1.0.0'}]})).rejects.toThrow('RESOURCE_INVALID')
  expect(readPrivateScaleRuntimeResource).not.toHaveBeenCalled()
 })
 it('preserves noneducation legacy Scale without introducing library authority',async()=>{
  await expect(assertEducationRunLibraryResources(db('TRAINING'),{...input,resources:[{family:'SCALE',key:'custom-scale:old',version:'1.0.0'}]})).resolves.toBeNull()
  expect(readEducationLibraryUse).not.toHaveBeenCalled()
 })
})
