import {validateTrainingReferenceRelease} from '../../modules/composite/training-reference-selection'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import {prepareRelease} from '../../modules/measurement-content/release'
import type {StoredRelease} from '../../modules/measurement-content/repository'
const m=vi.hoisted(()=>({source:vi.fn()}))
vi.mock('../../modules/education-tools/assessment-resource.repository',()=>({readEducationAssessmentDeliveryIdentity:m.source}))
import {validateTrainingReportPointer} from '../../modules/composite/training-report-selection'
import {assertEducationRuntimeContentScope} from '../../modules/composite/education-content-scope'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const measurement={releaseId:id(2),contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}
function fixture(){
 const release={...prepareRelease({layer:'REPORT',family:'COGNITIVE',key:'synthetic',version:'1.0.0',scope:{kind:'PRIVATE',product:'TEACHER',ownerId:id(3),resourceId:id(4)},assetRefs:[],sourceReleaseId:null,provenance:{},content:{projectionVersion:1,measurements:[{releaseId:measurement.releaseId,contentHash:measurement.contentHash}],metricKeys:['latency'],audience:'teacher',language:'zh-CN',generatorVersion:'DECLARATIVE_REPORT_V1',template:{blocks:[{type:'TEXT',text:'Synthetic only'}],limitations:[]}}}),releaseId:id(5),status:'PUBLISHED',publishedBy:id(3),publishedAt:new Date()} as StoredRelease
 const unit={itemId:id(6),family:'COGNITIVE' as const,source:{kind:'COGNITIVE_CONFIG' as const,id:id(7),ownerId:id(3),assignmentId:id(8)},measurement,report:{releaseId:release.releaseId,contentHash:release.contentHash}}
 const source={runtime:{id:id(4),createdBy:id(3)},origin:{product:'TEACHER',units:[{...unit,references:[]}]},releases:new Map([[release.releaseId,release]])}
 m.source.mockResolvedValue(source)
 const db={$queryRaw:vi.fn(async()=>[{id:id(9),product:'TEACHER',organization_id:id(10)}])}
 return {release,source,unit,db,input:{compositeId:id(4),ownerId:id(3),unit,release}}
}
beforeEach(()=>vi.clearAllMocks())
describe('education C/P/R scope adapter',()=>{
 it('accepts only the exact persisted education runtime and report pointer',async()=>{
  const f=fixture();await expect(assertEducationRuntimeContentScope(f.db as never,f.input)).resolves.toBe(f.source)
  expect(m.source).toHaveBeenCalledWith(f.db,{resourceKey:`education-assessment:TEACHER:${id(10)}:${id(9)}`,version:'1.0.0',purpose:'HISTORY'})
 })
 it.each(['product','ownerId','resourceId'])('refuses mismatched %s before querying',async field=>{
  const f=fixture();Object.assign(f.release.scope,{[field]:field==='product'?'TRAINING':id(99)})
  await expect(assertEducationRuntimeContentScope(f.db as never,f.input)).rejects.toThrow('SCOPE_DENIED');expect(f.db.$queryRaw).not.toHaveBeenCalled()
 })
 it('rejects a fabricated source flag or changed child pointer',async()=>{
  const f=fixture();f.unit.itemId=id(99)
  await expect(assertEducationRuntimeContentScope(f.db as never,f.input)).rejects.toThrow('SCOPE_DENIED')
 })
 it('rejects cached content modification even if its release ID and claimed hash stay the same',async()=>{
  const f=fixture(),changed=structuredClone(f.release)
  if(changed.layer!=='REPORT')throw Error('fixture')
  changed.content.template.blocks=[{type:'TEXT',text:'Modified without publication'}]
  await expect(assertEducationRuntimeContentScope(f.db as never,{...f.input,release:changed})).rejects.toThrow('SCOPE_DENIED')
 })
})


it('accepts a bound platform report only for a real education runtime',async()=>{
 const f=fixture(),release={...f.release,scope:{kind:'PLATFORM' as const}}
 f.source.releases.set(release.releaseId,release)
 await expect(assertEducationRuntimeContentScope(f.db as never,{...f.input,release})).resolves.toBe(f.source)
 f.db.$queryRaw.mockResolvedValue([])
 await expect(assertEducationRuntimeContentScope(f.db as never,{...f.input,release})).rejects.toThrow('SCOPE_DENIED')
})
it('connects the report selector to verified education scope without falling back to Training',async()=>{
 const f=fixture()
 f.source.releases.set(measurement.releaseId,{releaseId:measurement.releaseId,layer:'MEASUREMENT',family:'COGNITIVE',contentHash:measurement.contentHash,content:{metrics:[{metricKey:'latency'}]}} as StoredRelease)
 await expect(validateTrainingReportPointer(f.db as never,{unit:f.unit,compositeId:id(4),ownerId:id(3),reportReleaseId:f.release.releaseId,contentHash:f.release.contentHash,publication:true,releases:f.source.releases})).resolves.toEqual({releaseId:f.release.releaseId,contentHash:f.release.contentHash})
})


it('connects a private education reference to the existing selector without turning it into a platform norm',async()=>{
 const f=fixture(),reference={...prepareRelease({layer:'REFERENCE',family:'COGNITIVE',key:'synthetic-reference',version:'1.0.0',scope:{kind:'PRIVATE',product:'TEACHER',ownerId:id(3),resourceId:id(4)},assetRefs:[],sourceReleaseId:null,provenance:{},content:{projectionVersion:1,measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash},entries:[{metricKey:'latency',referenceKind:'theoretical_range',definition:{scoreKey:'latency',referenceKind:'theoretical_range',instrumentVersion:'1.0.0',scoringVersion:'1.0.0',population:{description:'Synthetic only'}}}],evidence:{synthetic:true}}}),releaseId:id(12),status:'PUBLISHED',publishedBy:id(3),publishedAt:new Date()} as StoredRelease
 Object.assign(f.source.origin.units[0],{references:[{releaseId:reference.releaseId,contentHash:reference.contentHash}]})
 f.source.releases.set(reference.releaseId,reference)
 const result=await validateTrainingReferenceRelease(f.db as never,{unit:f.unit,ownerId:id(3),compositeId:id(4),releaseId:reference.releaseId,contentHash:reference.contentHash,purpose:'HISTORY',releases:f.source.releases})
 expect(result).toMatchObject({releaseId:reference.releaseId,contentHash:reference.contentHash,measurementReleaseId:measurement.releaseId})
 expect(result.entries[0].referenceKind).toBe('theoretical_range')
})
