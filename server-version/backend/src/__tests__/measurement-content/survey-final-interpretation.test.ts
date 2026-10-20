import {describe,it,expect,vi,beforeEach} from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),decode:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
vi.mock('../../modules/survey/content-binding.service',()=>({decodeSurveyAttemptContentBinding:mocks.decode}))
import {interpretSurveyFinal,interpretSurveyContentBinding} from '../../modules/survey/final-interpretation.service'
import {interpretContentBinding} from '../../modules/measurement-content/final-interpretation'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
const digest='a'.repeat(64),scope={kind:'PRIVATE',ownerId:'owner',product:'SURVEY',resourceId:'project'}
const entry={scoreKey:'total',referenceKind:'descriptive_sample' as const,evidenceLevel:'local_pilot' as const,provenanceType:'local_observed' as const,
 instrumentVersion:'1',scoringVersion:'1',population:{},source:{citation:'shared source'},statistics:{mean:2}}
const measurement=()=>({releaseId:'m',contentHash:digest,layer:'MEASUREMENT',family:'SCALE',scope,status:'PUBLISHED',content:{instrumentVersion:'1',scoringVersion:'1',measurementHash:digest}})
const reference=()=>({releaseId:'r',contentHash:digest,layer:'REFERENCE',family:'SCALE',scope,status:'PUBLISHED',version:'1',content:{measurement:{releaseId:'m',contentHash:digest},entries:[{metricKey:'total',referenceKind:'descriptive_sample',definition:entry}]}})
const report=()=>({releaseId:'p',contentHash:digest,layer:'REPORT',family:'SCALE',scope,status:'PUBLISHED',content:{measurements:[{releaseId:'m',contentHash:digest}],generatorVersion:'DECLARATIVE_REPORT_V1',template:{title:'shared text'}}})
const binding=()=>({schemaVersion:1,projectId:'project',waveId:'wave',attemptId:'attempt',publicationId:'pub',definitionDigest:digest,populationContext:{},units:[{instrumentKey:'scale',measurement:{releaseId:'m',contentHash:digest,measurementHash:digest},
 references:[{metricKey:'total',referenceKind:'descriptive_sample',status:'SELECTED',releaseId:'r',contentHash:digest,entryKey:referenceEntryKey(entry)}],report:{releaseId:'p',contentHash:digest},reportAvailability:'AVAILABLE'}]})
const input=()=>({projectId:'project',waveId:'wave',attemptId:'attempt',publicationId:'pub',definitionDigest:digest,
 selectedSnapshot:{units:[{instrumentKey:'scale',sourceDigest:'source',scoringDigest:'scoring',measurementRelease:{releaseId:'m',contentHash:digest,measurementHash:digest}}]},calculated:{units:[{instrumentKey:'scale',kind:'SCALE',sourceDigest:'source',scoringDigest:'scoring',measurement:{quality:{status:'interpretable'},metrics:[{key:'total',value:5,status:'OK'}]}}]}} as any)
const tx=()=>({$queryRaw:vi.fn().mockResolvedValue([{cipher:'encrypted',hash:digest,owner_id:'owner'}])})
beforeEach(()=>{vi.clearAllMocks();mocks.decode.mockReturnValue(binding());mocks.get.mockImplementation(async(_tx,id)=>id==='m'?measurement():id==='r'?reference():report())})
describe('FINAL consumes fixed raw-score facts and START choices',()=>{
 it('stores compact personal interpretation without template, source, or normative arrays',async()=>{
  const result=await interpretSurveyFinal(tx() as never,input())
  expect(result!.units[0].references[0]).toMatchObject({status:'AVAILABLE',values:{meanDifference:3}})
  expect(result!.units[0].report).toEqual({status:'READY',generatorVersion:'DECLARATIVE_REPORT_V1'})
  expect(JSON.stringify(result)).not.toMatch(/shared text|shared source|statistics|percentileTable/)
  expect(mocks.get.mock.calls.every(c=>c[2]===true)).toBe(true)
 })
 it('distinguishes not selected, unavailable and revoked without changing facts',async()=>{
  const original=input();const before=JSON.stringify(original.calculated)
  const b=binding();b.units[0].references=[];delete (b.units[0] as any).report;mocks.decode.mockReturnValue(b)
  expect((await interpretSurveyFinal(tx() as never,original))!.units[0].status).toBe('NOT_SELECTED')
  mocks.decode.mockReturnValue(binding());mocks.get.mockImplementation(async(_tx,id)=>id==='m'?{...measurement(),status:'REVOKED'}:report())
  const result=await interpretSurveyFinal(tx() as never,original)
  expect(result!.units[0]).toMatchObject({status:'REVOKED',reason:'MEASUREMENT_REVOKED',report:{status:'REVOKED'}})
  expect(JSON.stringify(original.calculated)).toBe(before)
 })
 it('reference/report revocation suppresses only their new outputs',async()=>{
  mocks.get.mockImplementation(async(_tx,id)=>id==='m'?measurement():id==='r'?{...reference(),status:'REVOKED'}:{...report(),status:'REVOKED'})
  const result=await interpretSurveyFinal(tx() as never,input())
  expect(result!.units[0].references[0]).toMatchObject({status:'REVOKED',reason:'REFERENCE_REVOKED'})
  expect(result!.units[0].report.status).toBe('REVOKED')
 })
 it('never reselects an unavailable START slot',async()=>{
  const b=binding();b.units[0].references=[{metricKey:'total',referenceKind:'descriptive_sample',status:'UNAVAILABLE',reason:'MISSING_CONTEXT'} as any];mocks.decode.mockReturnValue(b)
  const result=await interpretSurveyFinal(tx() as never,input());expect(result!.units[0].references[0]).toMatchObject({status:'UNAVAILABLE',reason:'MISSING_CONTEXT'})
  expect(mocks.get.mock.calls.map(c=>c[1])).not.toContain('r')
 })
 it('retains already selected superseded/retired versions',async()=>{
  mocks.get.mockImplementation(async(_tx,id)=>({... (id==='m'?measurement():id==='r'?reference():report()),status:'RETIRED'}))
  expect((await interpretSurveyFinal(tx() as never,input()))!.units[0].references[0].status).toBe('AVAILABLE')
 })
 it('does not derive interpretation for invalid/missing quality or nonfinite metrics',async()=>{
  for(const quality of ['limited','invalid','RECORDED']){const i=input();i.calculated.units[0].measurement.quality.status=quality
   expect((await interpretSurveyFinal(tx() as never,i))!.units[0].references[0]).toMatchObject({status:'UNAVAILABLE',reason:'QUALITY_UNAVAILABLE'})}
  const i=input();i.calculated.units[0].measurement.metrics[0].value=Infinity
  expect((await interpretSurveyFinal(tx() as never,i))!.units[0].references[0].status).toBe('UNAVAILABLE')
 })
 it('rejects changed content identity or scope',async()=>{
  for(const bad of [{...measurement(),contentHash:'b'.repeat(64)},{...measurement(),scope:{...scope,resourceId:'other'}}]){
   mocks.get.mockResolvedValue(bad);await expect(interpretSurveyFinal(tx() as never,input())).rejects.toMatchObject({statusCode:409})}
 })
 it('leaves double-null legacy and FORM-only data without invented interpretation',async()=>{
  mocks.decode.mockReturnValue(null);expect(await interpretSurveyFinal(tx() as never,input())).toBeUndefined()
  const i=input();i.selectedSnapshot.units=[{kind:'FORM'}];const db=tx();expect(await interpretSurveyFinal(db as never,i)).toBeUndefined();expect(db.$queryRaw).not.toHaveBeenCalled()
 })
})


import {compileFrozenResearchUnit,surveyMeasurementReleaseInput,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {verifySurveyFinalPublication} from '../../modules/survey/final.compute'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {prepareRelease} from '../../modules/measurement-content/release'
import {cognitiveParentUnit} from '../../modules/survey/measurement.result'
import {parseFrozenSurveyCognitive} from '../../modules/survey/cognitive.definition'

const scaleDefinition={schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',responseOptions:[
 {optionKey:'yes',label:'Yes',score:3},{optionKey:'no',label:'No',score:0}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
 items:[{itemKey:'one',prompt:'Question',required:true,reverse:false,dimensionKeys:['total']}]}
const sjtDefinition={schemaVersion:1,respondentType:'student_self_report',scenarioKey:'classroom',title:'Scene',stimulus:'Discuss with classmates.',
 author:'Researcher',sourceNote:'Local authored',licenseStatus:'self_authored',redistribution:'allowed',metrics:[{metricKey:'effort',label:'Effort',direction:'descriptive'}],
 questions:[{questionKey:'first',prompt:'What first?',options:[{optionKey:'try',label:'Try',contributions:{effort:2}},{optionKey:'wait',label:'Wait',contributions:{effort:0}}]},
 {questionKey:'second',prompt:'What next?',options:[{optionKey:'talk',label:'Talk',contributions:{effort:2}},{optionKey:'leave',label:'Leave',contributions:{effort:0}}]}]}
function realComputed(kind:'SCALE'|'SJT'|'COGNITIVE',quality='interpretable'){
 const unit=compileFrozenResearchUnit({id:'draft',instrumentKey:'tool',kind,title:'Test',revision:1,definition:kind==='SCALE'?scaleDefinition:kind==='SJT'?sjtDefinition:
  {schemaVersion:1,templateKey:'gonogo-software-frame-v1',feedback:{mode:'GENERAL'}}})
 const release={...prepareRelease(surveyMeasurementReleaseInput(unit,'owner','project')),releaseId:'m',status:'PUBLISHED'}
 if(release.layer!=='MEASUREMENT')throw new Error('measurement required')
 unit.measurementRelease={releaseId:'m',contentHash:release.contentHash,measurementHash:release.content.measurementHash}
 const snapshot={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'project',waveId:'wave',collectionMode:'SINGLE_UNLINKED',consentVersion:1,
  linkageNoticeConfirmed:false,consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',units:[unit]} as ResearchFrozenPublication
 let children
 if(kind==='COGNITIVE'){
  const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition)
  const parent=cognitiveParentUnit(unit,{reference:{slotKey:'tool',epoch:1,resultId:'result',resultHash:digest,measurementDigest:frozen.measurementDigest},
   result:{engineVersion:'1.0.0',scoringVersion:release.content.scoringVersion,protocolSignature:digest,
    metrics:{hitRate:.9,goMedianRtMs:320},quality:{state:quality,flags:{}}}} as any)
  children=new Map([['tool',parent]])
 }
 const calculated=verifySurveyFinalPublication(snapshot,canonicalHash(snapshot))!.compute({tool:kind==='SCALE'?{one:'yes'}:kind==='SJT'?{first:'try',second:'talk'}:{}},null,[], 'FINAL',undefined,children)
 const key=kind==='SCALE'?'total':kind==='SJT'?'effort':'hitRate'
 const e={...entry,scoreKey:key,instrumentVersion:release.content.instrumentVersion,scoringVersion:release.content.scoringVersion}
 const r={...reference(),family:kind,content:{measurement:{releaseId:'m',contentHash:release.contentHash},entries:[{metricKey:key,referenceKind:'descriptive_sample',definition:e}]}}
 mocks.get.mockImplementation(async(_tx,id)=>id==='m'?release:r)
 mocks.decode.mockReturnValue({...binding(),populationContext:{},units:[{instrumentKey:'tool',measurement:unit.measurementRelease,references:[{
  metricKey:key,referenceKind:'descriptive_sample',status:'SELECTED',releaseId:'r',contentHash:r.contentHash,entryKey:referenceEntryKey(e)}]}]})
 return {projectId:'project',waveId:'wave',attemptId:'attempt',publicationId:'pub',definitionDigest:calculated.definitionDigest,selectedSnapshot:snapshot,calculated}
}
describe('real compiler and compute outputs reach interpretation',()=>{
 it.each(['SCALE','SJT','COGNITIVE'] as const)('interprets actual %s stored-score structure without rescoring',async kind=>{
  const i=realComputed(kind),before=JSON.stringify(i.calculated)
  if(kind!=='COGNITIVE')expect(i.calculated.units[0].measurement).toBeUndefined()
  const interpreted=await interpretSurveyFinal(tx() as never,i)
  expect(interpreted!.units[0].references[0].status).toBe('AVAILABLE')
  expect(JSON.stringify(i.calculated)).toBe(before)
 })
 it.each(['limited','invalid'])('preserves actual cognitive %s quality through compute',async quality=>{
  const result=await interpretSurveyFinal(tx() as never,realComputed('COGNITIVE',quality))
  expect(result!.units[0].references[0]).toMatchObject({status:'UNAVAILABLE',reason:'QUALITY_UNAVAILABLE'})
 })
 it('rejects a result from another frozen scorer source instead of assigning the selected release identity',async()=>{
  const i=realComputed('SCALE');i.calculated.units[0].scoringDigest='other'
  await expect(interpretSurveyFinal(tx() as never,i)).rejects.toMatchObject({statusCode:409})
 })
})


describe('neutral interpretation core and Survey scope boundary',()=>{
 it('preserves the complete original receipt hash and identical numeric output with neutral input',async()=>{
  const original=binding()
  const facts={notExecuted:false,quality:'interpretable',metrics:[{key:'total',value:5,status:'OK'}]}
  const readRelease=vi.fn(async(id:string)=>id==='m'?measurement():id==='r'?reference():report())
  const shared=await interpretContentBinding({binding:{units:original.units,populationContext:{} } as any,
    contentBindingHash:canonicalHash(original),readRelease:readRelease as any,readFacts:()=>facts})
  const survey=await interpretSurveyContentBinding(tx() as never,{binding:original as any,ownerId:'owner',readFacts:()=>facts})
  expect(shared).toEqual(survey)
  expect(shared.contentBindingHash).toBe(canonicalHash(original))
  expect(shared.contentBindingHash).not.toBe(canonicalHash({units:original.units,populationContext:{}}))
  expect(readRelease.mock.calls.map(call=>call[0])).toEqual(['m','r','p'])
 })
 it.each([{...scope,product:'TRAINING'},{...scope,ownerId:'other'},{...scope,kind:'PLATFORM'}])('keeps Survey scope enforcement on prelocked cached releases: %o',async(badScope)=>{
  const releases=new Map([['m',{...measurement(),scope:badScope}]])
  await expect(interpretSurveyContentBinding(tx() as never,{binding:binding() as any,ownerId:'owner',releases:releases as any,
    readFacts:()=>({notExecuted:false,quality:'interpretable',metrics:[]})})).rejects.toMatchObject({statusCode:409})
  expect(mocks.get).not.toHaveBeenCalled()
 })
})
