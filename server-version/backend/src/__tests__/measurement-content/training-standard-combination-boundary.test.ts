import {describe,expect,it,vi} from 'vitest'
import {prepareRelease} from '../../modules/measurement-content/release'
import type {StoredRelease} from '../../modules/measurement-content/repository'
import {trainingContentSnapshotSchema} from '../../modules/composite/training-content-binding'
import {validateTrainingReferenceRelease} from '../../modules/composite/training-reference-selection'
import {validateTrainingReportPointer} from '../../modules/composite/training-report-selection'
import {DECLARATIVE_REPORT_GENERATOR} from '../../modules/measurement-content/report-renderer'
import {combinationFixture} from './standard-combination.fixture'

const id='30000000-0000-4000-8000-000000000001'
function context(){
  const {row,measurement}=combinationFixture(),unit={itemId:'40000000-0000-4000-8000-000000000001',family:'SCALE' as const,
    source:{kind:'SCALE' as const,id:'scale',ownerId:'teacher'},measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash,measurementHash:measurement.layer==='MEASUREMENT'?measurement.content.measurementHash:''}}
  const db={$queryRaw:vi.fn(async():Promise<unknown[]>=>{throw new Error('unexpected database read')}),$executeRaw:vi.fn(async()=>{throw new Error('unexpected write')})}
  return {row,measurement,unit,db}
}
const stored=(raw:unknown):StoredRelease=>({...prepareRelease(raw),releaseId:id,status:'PUBLISHED',publishedBy:'system',publishedAt:new Date('2026-10-25T00:00:00Z')})

describe('current Training consumers do not borrow Survey approval or PRIVATE scope',()=>{
  it('does not treat a combination id as the existing V1 Scale/config/SJT source contract',()=>{
    const c=context(),snapshot={schemaVersion:1,compositeId:'composite',units:[{...c.unit,
      source:{kind:'STANDARD_COMBINATION',id:c.row.id,combinationHash:c.row.combination_hash}}]}
    expect(trainingContentSnapshotSchema.safeParse(snapshot).success).toBe(false)
    expect(trainingContentSnapshotSchema.safeParse({...snapshot,units:[{...c.unit,source:{...c.unit.source,combinationHash:c.row.combination_hash}}]}).success).toBe(false)
  })
  it.each(['theoretical_range','descriptive_sample','criterion_threshold'] as const)(
    'a PLATFORM %s parameter snapshot is not a formal normative publication just because its Survey combo is approved',async referenceKind=>{
      const c=context(),entry={scoreKey:'effort',referenceKind,instrumentVersion:'1.0.0',scoringVersion:'survey-research-v1',population:{description:'Synthetic scope only'}}
      const release=stored({layer:'REFERENCE',family:'SCALE',key:'synthetic-parameters',version:'P1',scope:{kind:'PLATFORM',ownerId:'system'},
        provenance:{surveyApprovedTriplet:c.row.combination_hash},assetRefs:[],sourceReleaseId:null,
        content:{projectionVersion:1,measurement:{releaseId:c.measurement.releaseId,contentHash:c.measurement.contentHash},
          entries:[{metricKey:'effort',referenceKind,definition:entry}],evidence:{synthetic:true}}})
      await expect(validateTrainingReferenceRelease(c.db as never,{unit:c.unit,ownerId:'teacher',compositeId:'composite',releaseId:id,
        purpose:'NEW_BINDING',releases:new Map([[id,release]])})).rejects.toThrow('FORMAL_REFERENCE_RELEASE_NOT_ELIGIBLE')
      expect(c.db.$queryRaw).not.toHaveBeenCalled();expect(c.db.$executeRaw).not.toHaveBeenCalled()
    })
  it('does not admit a Survey private parameter copy to the Training owner/composite',async()=>{
    const c=context(),referenceKind='theoretical_range',release=stored({layer:'REFERENCE',family:'SCALE',key:'synthetic-private-parameters',version:'P1',
      scope:{kind:'PRIVATE',product:'SURVEY',ownerId:'teacher',resourceId:'composite'},provenance:{surveyApprovedTriplet:c.row.combination_hash},assetRefs:[],sourceReleaseId:null,
      content:{projectionVersion:1,measurement:{releaseId:c.measurement.releaseId,contentHash:c.measurement.contentHash},
        entries:[{metricKey:'effort',referenceKind,definition:{scoreKey:'effort',referenceKind,instrumentVersion:'1.0.0',scoringVersion:'survey-research-v1',population:{description:'Synthetic'}}}],evidence:{}}})
    await expect(validateTrainingReferenceRelease(c.db as never,{unit:c.unit,ownerId:'teacher',compositeId:'composite',releaseId:id,
      purpose:'NEW_BINDING',releases:new Map([[id,release]])})).rejects.toThrow('CONTENT_TRAINING_REFERENCE_SCOPE_DENIED')
    expect(c.db.$queryRaw).not.toHaveBeenCalled();expect(c.db.$executeRaw).not.toHaveBeenCalled()
  })
  it.each(['SURVEY','PLATFORM'] as const)('does not treat a %s report pointer as an existing Training private report binding',async product=>{
    const c=context(),scope=product==='PLATFORM'?{kind:'PLATFORM',ownerId:'system'}:{kind:'PRIVATE',product,ownerId:'teacher',resourceId:'composite'}
    if(product==='PLATFORM')c.db.$queryRaw.mockImplementationOnce(async()=>[])
    const report=stored({layer:'REPORT',family:'SCALE',key:'synthetic-report',version:'R1',scope,provenance:{surveyApprovedTriplet:c.row.combination_hash},assetRefs:[],sourceReleaseId:null,
      content:{projectionVersion:1,measurements:[{releaseId:c.measurement.releaseId,contentHash:c.measurement.contentHash}],metricKeys:['effort'],
        audience:'researcher',language:'zh-CN',generatorVersion:DECLARATIVE_REPORT_GENERATOR,
        template:{title:'Synthetic',blocks:[{type:'METRIC',metricKey:'effort',label:'Synthetic',display:'RAW'}],limitations:[],disclaimer:'Synthetic only'}}})
    await expect(validateTrainingReportPointer(c.db as never,{unit:c.unit,compositeId:'composite',ownerId:'teacher',reportReleaseId:id,
      publication:true,releases:new Map([[id,report],[c.measurement.releaseId,c.measurement]])})).rejects.toThrow(product==='PLATFORM'?'CONTENT_EDUCATION_SCOPE_DENIED':'CONTENT_TRAINING_REPORT_SELECTION_INVALID')
    if(product==='PLATFORM'){
      expect(c.db.$queryRaw).toHaveBeenCalledTimes(1)
      expect((c.db.$queryRaw.mock.calls[0] as unknown as [{sql:string}])[0].sql).toContain('FROM education_assessment_deliveries WHERE runtime_composite_id=')
    }else expect(c.db.$queryRaw).not.toHaveBeenCalled()
    expect(c.db.$executeRaw).not.toHaveBeenCalled()
  })
})
