import {buildTrainingFlowUnits} from '../../modules/composite/training-flow-definition'
import {describe,it,expect,vi,beforeEach} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {draftEducationAssessmentEntry} from '../../modules/education-tools/assessment-resource.contract'
const mock=vi.hoisted(()=>({read:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentReleaseBatch:mock.read}))
import {readEducationAssessmentDeliveryIdentity} from '../../modules/education-tools/assessment-resource.repository'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function fixture(){
 const measurement={releaseId:id(5),contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}
 const source={kind:'COGNITIVE_CONFIG',id:id(8),ownerId:id(9),assignmentId:id(7)}
 const snapshot={schemaVersion:1,compositeId:id(4),units:[{itemId:id(6),family:'COGNITIVE',source,measurement}]}
 const origin={schemaVersion:1,adapterVersion:'1.0.0',resourceId:id(1),product:'TEACHER',organizationId:id(2),family:'COGNITIVE',sourceCompositeId:id(3),runtimeCompositeId:id(4),sourceSnapshotHash:'c'.repeat(64),runtimeSnapshotHash:canonicalHash(snapshot),runtimeDefinitionHash:canonicalHash(buildTrainingFlowUnits({items:[{id:id(6),type:'COGNITIVE',position:0,required:true,cognitiveAssignmentId:id(7)}]})),units:[{itemId:id(6),family:'COGNITIVE',measurement,references:[],report:null}]}
 const none={mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]}
 const disclosure={schemaVersion:1,policyKey:'synthetic',minimumRespondents:null,audiences:{RESPONDENT:none,SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}}
 const entry={...draftEducationAssessmentEntry({origin:{...origin,distribution:{actorId:id(9),grants:[{resourceId:id(3),grantId:id(10),version:1}]}},title:'Synthetic',disclosure}),releaseStatus:'PUBLISHED'}
 const row={id:id(1),product:'TEACHER',organization_id:id(2),family:'COGNITIVE',source_composite_id:id(3),runtime_composite_id:id(4),entry,entry_hash:canonicalHash(entry),status:'PUBLISHED',created_by_user_id:id(9),reviewed_by_user_id:id(10),reviewed_at:new Date(),published_by_user_id:id(10),published_at:new Date(),created_authority:{kind:'SYSTEM_ADMIN',actorId:id(9)},reviewed_authority:{kind:'SYSTEM_ADMIN',actorId:id(10)},published_authority:{kind:'SYSTEM_ADMIN',actorId:id(10)}}
 const runtime={id:id(4),createdBy:id(9),formSections:[],productKind:'ORGANIZATION_RESOURCE',status:'PUBLISHED',publicEnabled:false,copyable:false,courseId:null,trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot),items:[{id:id(6),type:'COGNITIVE',position:0,required:true,cognitiveAssignmentId:id(7),cognitiveAssignment:{configId:id(8),createdBy:id(9)}}]}
 const db={$queryRaw:vi.fn(async()=>[row]),compositeAssessment:{findUnique:vi.fn(async()=>runtime)}}
 const releases=new Map([[id(5),{...measurement,layer:'MEASUREMENT',family:'COGNITIVE',status:'PUBLISHED',content:{measurementHash:measurement.measurementHash}}]])
 mock.read.mockResolvedValue(releases)
 const input={resourceKey:entry.applicability.resourceKey,version:'1.0.0',purpose:'NEW_USE' as const}
 return {row,runtime,db,releases,input,read:()=>readEducationAssessmentDeliveryIdentity(db as never,input)}
}
beforeEach(()=>vi.clearAllMocks())
describe('education source identity reader is not admission',()=>{
 it('reads exact metadata and immutable runtime with one bounded release fetch',async()=>{
  const f=fixture();expect(await f.read()).toMatchObject({identityOnly:true,origin:{product:'TEACHER',organizationId:id(2)}})
  expect(mock.read).toHaveBeenCalledTimes(1);expect(mock.read).toHaveBeenCalledWith(f.db,[id(5)],true)
 })
 it.each(['DRAFT','REVIEWED'])('does not read %s as available',async status=>{
  const f=fixture();f.row.status=status;await expect(f.read()).rejects.toThrow('NOT_AVAILABLE');expect(mock.read).not.toHaveBeenCalled()
 })
 it('permits a retired exact source only for history',async()=>{
  const f=fixture();f.row.status='RETIRED';await expect(f.read()).rejects.toThrow('NOT_AVAILABLE')
  await expect(readEducationAssessmentDeliveryIdentity(f.db as never,{...f.input,purpose:'HISTORY'})).resolves.toMatchObject({identityOnly:true})
 })
 it('refuses mismatched runtime child, snapshot and original reviewer',async()=>{
  for(const change of [(f:ReturnType<typeof fixture>)=>{f.runtime.items[0].cognitiveAssignmentId=id(99)},(f:ReturnType<typeof fixture>)=>{f.runtime.trainingContentSnapshotHash='f'.repeat(64)},(f:ReturnType<typeof fixture>)=>{f.row.reviewed_by_user_id=f.row.created_by_user_id}]){
   const f=fixture();change(f);await expect(f.read()).rejects.toThrow()
  }
 })
 it('refuses new use of a retired measurement without fabricating a replacement',async()=>{
  const f=fixture();f.releases.get(id(5))!.status='RETIRED';await expect(f.read()).rejects.toThrow('CONTENT_IDENTITY')
 })
 it('does not accept a broad version or query for it',async()=>{
  const f=fixture();await expect(readEducationAssessmentDeliveryIdentity(f.db as never,{...f.input,version:'latest'})).rejects.toThrow('RESOURCE_IDENTITY')
  expect(f.db.$queryRaw).not.toHaveBeenCalled()
 })
})


it('requires the exact product, owner and audience for a bound private report',async()=>{
 for(const bad of ['none','product','owner','audience']){
  const f=fixture(),reportPointer={releaseId:id(11),contentHash:'e'.repeat(64)}
  Object.assign(f.runtime.trainingContentSnapshot.units[0],{report:reportPointer})
  f.runtime.trainingContentSnapshotHash=canonicalHash(f.runtime.trainingContentSnapshot)
  f.row.entry.educationOrigin.runtimeSnapshotHash=f.runtime.trainingContentSnapshotHash
  f.row.entry.educationOrigin.units[0].report=reportPointer
  f.row.entry.educationOriginHash=canonicalHash(f.row.entry.educationOrigin);f.row.entry_hash=canonicalHash(f.row.entry)
  const report={...reportPointer,layer:'REPORT',family:'COGNITIVE',status:'PUBLISHED',
   scope:{kind:'PRIVATE',product:bad==='product'?'TRAINING':'TEACHER',resourceId:id(4),ownerId:bad==='owner'?id(99):id(9)},
   content:{measurements:[{releaseId:id(5),contentHash:'a'.repeat(64)}],audience:bad==='audience'?'student':'teacher'}}
  const releases=new Map<string,unknown>(f.releases);releases.set(id(11),report);mock.read.mockResolvedValue(releases)
  if(bad==='none')await expect(f.read()).resolves.toMatchObject({identityOnly:true})
  else await expect(f.read()).rejects.toThrow('REPORT_IDENTITY')
 }
})
it('rejects a parameter pointer absent from the frozen runtime selection',async()=>{
 const f=fixture();f.row.entry.educationOrigin.units[0].references=[{releaseId:id(12),contentHash:'f'.repeat(64)}]
 f.row.entry.educationOriginHash=canonicalHash(f.row.entry.educationOrigin);f.row.entry_hash=canonicalHash(f.row.entry)
 await expect(f.read()).rejects.toThrow('REFERENCE_IDENTITY')
})

it('rejects a changed required flag or unit order even when content pointers still match',async()=>{
 for(const change of [(f:ReturnType<typeof fixture>)=>{f.runtime.items[0].required=false},(f:ReturnType<typeof fixture>)=>{f.runtime.items[0].position=2}]){const f=fixture();change(f);await expect(f.read()).rejects.toThrow()}
})


it('supports an actual Form-only BUNDLE without fake measurement or report pointers',async()=>{
 const f=fixture()
 const form={id:id(21),type:'FORM',position:0,required:true,formSectionId:id(22),formType:'TEXT',formLabel:'Synthetic only',formOptions:null,formSectionPosition:0}
 const runtime={...f.runtime,items:[form],formSections:[{id:id(22),title:'Synthetic form',position:0,items:[form]}],trainingContentSnapshot:{schemaVersion:1,compositeId:id(4),units:[]}}
 runtime.trainingContentSnapshotHash=canonicalHash(runtime.trainingContentSnapshot)
 const origin={...f.row.entry.educationOrigin,family:'BUNDLE',units:[],runtimeSnapshotHash:runtime.trainingContentSnapshotHash,runtimeDefinitionHash:canonicalHash(buildTrainingFlowUnits(runtime))}
 const entry={...draftEducationAssessmentEntry({origin,title:'Synthetic Form Bundle',disclosure:f.row.entry.resultDisclosure}),releaseStatus:'PUBLISHED'}
 f.row.family='BUNDLE';f.row.entry=entry;f.row.entry_hash=canonicalHash(entry)
 f.db.compositeAssessment.findUnique.mockResolvedValue(runtime as never);f.releases.clear()
 await expect(f.read()).resolves.toMatchObject({identityOnly:true,origin:{family:'BUNDLE',units:[]}})
 runtime.items=[];runtime.formSections=[]
 f.row.entry.educationOrigin.runtimeDefinitionHash=canonicalHash(buildTrainingFlowUnits(runtime))
 f.row.entry.educationOriginHash=canonicalHash(f.row.entry.educationOrigin);f.row.entry_hash=canonicalHash(f.row.entry)
 await expect(f.read()).rejects.toThrow('RUNTIME_DEFINITION')
})

it('binds the distribution actor to the original creator and actual runtime owner',async()=>{
 for(const target of ['actor','owner']){
  const f=fixture()
  if(target==='actor'){f.row.entry.educationOrigin.distribution.actorId=id(99);f.row.entry.educationOriginHash=canonicalHash(f.row.entry.educationOrigin);f.row.entry_hash=canonicalHash(f.row.entry)}
  else f.runtime.createdBy=id(99)
  await expect(f.read()).rejects.toThrow('RUNTIME_IDENTITY')
 }
})
