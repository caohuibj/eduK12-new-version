import {describe,it,expect,vi,beforeEach} from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),decode:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
vi.mock('../../modules/survey/content-binding.service',()=>({decodeSurveyAttemptContentBinding:mocks.decode}))
import {interpretSurveyFinal} from '../../modules/survey/final-interpretation.service'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
const digest='a'.repeat(64),scope={kind:'PRIVATE',ownerId:'owner',product:'SURVEY',resourceId:'project'}
const entry={scoreKey:'total',referenceKind:'descriptive_sample' as const,evidenceLevel:'local_pilot' as const,provenanceType:'local_observed' as const,
 instrumentVersion:'1',scoringVersion:'1',population:{},source:{citation:'shared source'},statistics:{mean:2}}
const measurement=()=>({releaseId:'m',contentHash:digest,layer:'MEASUREMENT',family:'SCALE',scope,status:'PUBLISHED',content:{instrumentVersion:'1',scoringVersion:'1',measurementHash:digest}})
const reference=()=>({releaseId:'r',contentHash:digest,layer:'REFERENCE',family:'SCALE',scope,status:'PUBLISHED',version:'1',content:{measurement:{releaseId:'m',contentHash:digest},entries:[{metricKey:'total',referenceKind:'descriptive_sample',definition:entry}]}})
const report=()=>({releaseId:'p',contentHash:digest,layer:'REPORT',family:'SCALE',scope,status:'PUBLISHED',content:{measurements:[{releaseId:'m',contentHash:digest}],generatorVersion:'DECLARATIVE_REPORT_V1',template:{title:'shared text'}}})
const binding=()=>({populationContext:{},units:[{instrumentKey:'scale',measurement:{releaseId:'m',contentHash:digest,measurementHash:digest},
 references:[{metricKey:'total',referenceKind:'descriptive_sample',status:'SELECTED',releaseId:'r',contentHash:digest,entryKey:referenceEntryKey(entry)}],report:{releaseId:'p',contentHash:digest},reportAvailability:'AVAILABLE'}]})
const input=()=>({projectId:'project',waveId:'wave',attemptId:'attempt',publicationId:'pub',definitionDigest:digest,
 selectedSnapshot:{units:[{measurementRelease:{releaseId:'m',contentHash:digest,measurementHash:digest}}]},calculated:{units:[{instrumentKey:'scale',kind:'SCALE',measurement:{quality:{status:'interpretable'},metrics:[{key:'total',value:5,status:'OK'}]}}]}} as any)
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
