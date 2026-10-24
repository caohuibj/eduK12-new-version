import {describe,it,expect,vi,beforeEach} from 'vitest'
const mocks=vi.hoisted(()=>({source:vi.fn(),auth:vi.fn(),get:vi.fn(),transaction:vi.fn(),project:vi.fn(),final:vi.fn(),systemAuth:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/survey/analytics.source',()=>({loadSurveySource:mocks.source}))
vi.mock('../../modules/survey/builder.service',()=>({authorizedProject:mocks.auth,SurveyBuilderError:class extends Error{statusCode=403}}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
vi.mock('../../modules/survey/system-data-authority',()=>({assertSystemSurveyDataAudit:mocks.systemAuth}))
import {readSurveyStoredReport,listSurveyStoredReports} from '../../modules/survey/report-results.service'
const hash='a'.repeat(64),scope={kind:'PRIVATE',ownerId:'owner',product:'SURVEY',resourceId:'project'}
const pointer={releaseId:'m',contentHash:hash,measurementHash:hash}
const template={schemaVersion:1,title:'Frozen report',blocks:[{type:'TEXT',text:'Saved statement'},{type:'METRIC',metricKey:'total',display:'RAW'},{type:'REFERENCE_BAND',metricKey:'total',referenceKind:'criterion_threshold',bandKey:'high',text:'Frozen band text'}],limitations:[]}
const measurement=()=>({releaseId:'m',contentHash:hash,status:'PUBLISHED',scope,layer:'MEASUREMENT',family:'SCALE',content:{measurementHash:hash,metrics:[{metricKey:'total',unit:'points'}]}})
const report=()=>({releaseId:'p',contentHash:hash,status:'PUBLISHED',scope,layer:'REPORT',family:'SCALE',content:{generatorVersion:'DECLARATIVE_REPORT_V1',measurements:[{releaseId:'m',contentHash:hash}],metricKeys:['total'],audience:'student',template}})
const reference=()=>({releaseId:'r',contentHash:hash,status:'PUBLISHED',scope,layer:'REFERENCE',family:'SCALE',content:{measurement:{releaseId:'m',contentHash:hash}}})
const source=()=>({projectId:'project',sourceRevision:5,completeAttempts:1,interpretations:[{attemptId:'attempt',sourceFinalHash:hash,
 binding:{units:[{instrumentKey:'scale',measurement:pointer,references:[{metricKey:'total',referenceKind:'criterion_threshold',status:'SELECTED',releaseId:'r',contentHash:hash,entryKey:hash}],report:{releaseId:'p',contentHash:hash}}]},
 interpretation:{contentBindingHash:hash,units:[{instrumentKey:'scale',references:[{metricKey:'total',referenceKind:'criterion_threshold',status:'AVAILABLE',values:{bandKey:'high'}}],report:{status:'READY',generatorVersion:'DECLARATIVE_REPORT_V1'}}]}}],
 scores:[{attemptId:'attempt',measurement:{instrumentKey:'scale',scoreKey:'total'},value:3,status:'calculated',quality:{status:'interpretable'}},
 {attemptId:'attempt',measurement:{instrumentKey:'scale',scoreKey:'secret'},value:999,status:'calculated',quality:{status:'interpretable'}}]})
const input={projectId:'project',waveId:'wave',finalId:'final',instrumentKey:'scale'}
beforeEach(()=>{
 vi.clearAllMocks();mocks.systemAuth.mockResolvedValue('owner');mocks.source.mockResolvedValue(source());mocks.auth.mockResolvedValue({id:'project'});mocks.project.mockResolvedValue({revision:5});mocks.final.mockResolvedValue({resultsHash:hash})
 mocks.transaction.mockImplementation(async fn=>fn({surveyProject:{findUnique:mocks.project},surveyWaveFinal:{findFirst:mocks.final}}))
 mocks.get.mockImplementation(async(_tx,id)=>id==='m'?measurement():id==='p'?report():reference())
})
describe('researcher reads a report from saved FINAL interpretation',()=>{
 it('uses an exact final reader and only declared metric/reference facts',async()=>{
  const result=await readSurveyStoredReport('owner',input)
  expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({finalId:'final',maxFinals:1,selectRaw:false,includeInterpretation:true,includeAttendance:false}))
  expect(result).toMatchObject({accessAudience:'researcher',intendedAudience:'student',interpretationSemantics:'SAVED_AT_FINAL_NO_RECALCULATION'})
  expect(result.report.blocks).toContainEqual(expect.objectContaining({type:'METRIC',metricKey:'total',value:3}))
  expect(result.report.blocks).toContainEqual(expect.objectContaining({type:'REFERENCE_BAND',text:'Frozen band text'}))
  expect(JSON.stringify(result)).not.toContain('999');expect(mocks.auth).toHaveBeenCalledTimes(1)
 })
 it('keeps saved reference values with separate current lifecycle notices, without selecting another reference',async()=>{
  mocks.get.mockImplementation(async(_tx,id)=>id==='m'?{...measurement(),status:'RETIRED'}:id==='p'?report():{...reference(),status:'REVOKED'})
  const result=await readSurveyStoredReport('owner',input)
  expect(result.lifecycleNotices).toContainEqual({layer:'REFERENCE',releaseId:'r',status:'REVOKED'})
  expect(result.report.blocks).toContainEqual(expect.objectContaining({type:'REFERENCE_BAND',text:'Frozen band text'}))
  expect(mocks.get).toHaveBeenCalledTimes(3)
 })
 it('rejects a revoked template instead of claiming READY was an existing rendered artifact',async()=>{
  mocks.get.mockImplementation(async(_tx,id)=>id==='m'?measurement():{...report(),status:'REVOKED'})
  await expect(readSurveyStoredReport('owner',input)).rejects.toMatchObject({statusCode:409})
  mocks.get.mockImplementation(async(_tx,id)=>id==='m'?{...measurement(),status:'REVOKED'}:report())
  await expect(readSurveyStoredReport('owner',input)).rejects.toMatchObject({statusCode:409})
 })
 it('rejects current source revision/hash drift and current authorization failure',async()=>{
  mocks.project.mockResolvedValue({revision:6});await expect(readSurveyStoredReport('owner',input)).rejects.toMatchObject({statusCode:409});expect(mocks.get).not.toHaveBeenCalled()
  mocks.project.mockResolvedValue({revision:5});mocks.final.mockResolvedValue(null);await expect(readSurveyStoredReport('owner',input)).rejects.toMatchObject({statusCode:409})
  mocks.auth.mockRejectedValue(new Error('authorization denied'));await expect(readSurveyStoredReport('owner',input)).rejects.toThrow('authorization denied')
 })
 it('rejects foreign template scope and generator/measurement mismatch',async()=>{
  for(const r of [{...report(),scope:{...scope,resourceId:'foreign'}},{...report(),content:{...report().content,generatorVersion:'other'}}]){
   mocks.get.mockImplementation(async(_tx,id)=>id==='m'?measurement():r);await expect(readSurveyStoredReport('owner',input)).rejects.toMatchObject({statusCode:409})}
 })
 it('does not invent a report for legacy or unselected FINAL',async()=>{
  mocks.source.mockResolvedValue({...source(),interpretations:[{interpretation:null,binding:null}]});await expect(readSurveyStoredReport('owner',input)).rejects.toMatchObject({statusCode:404})
  const s=source();s.interpretations[0].interpretation.units[0].report.status='NOT_SELECTED';mocks.source.mockResolvedValue(s)
  await expect(readSurveyStoredReport('owner',input)).rejects.toMatchObject({statusCode:409});expect(mocks.get).not.toHaveBeenCalled()
 })
 it('hides values and band prose for invalid authoritative metric quality',async()=>{
  const s=source();s.scores[0].quality.status='invalid';mocks.source.mockResolvedValue(s)
  const result=await readSurveyStoredReport('owner',input)
  expect(result.report.blocks).toContainEqual(expect.objectContaining({type:'METRIC',value:null,status:'INVALID'}))
  expect(result.report.blocks.some((block:any)=>block.type==='REFERENCE_BAND')).toBe(false)
 })
})

describe('bounded saved report pointer index',()=>{
 it('uses one verified source projection and never fetches per-row releases or templates',async()=>{
  const s=source() as any;s.interpretations[0]={...s.interpretations[0],finalId:'final',projectId:'project',waveId:'wave',sourceVerified:true,researchCode:'R1',completedAt:'2026-10-20T00:00:00Z'}
  s.nextFinalCursor={id:'next',completedAt:'2026-10-20T00:00:00Z'};mocks.source.mockResolvedValue(s)
  const result=await listSurveyStoredReports('owner',{projectId:'project',waveId:'wave',afterId:'before'})
  expect(result).toMatchObject({nextAfterId:'next',list:[{finalId:'final',attemptCode:'R1',reports:[{instrumentKey:'scale',status:'READY',reportRelease:{releaseId:'p'}}]}]})
  expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({maxFinals:25,pageMode:true,stableIdCursor:true,selectScore:false,selectRaw:false,includeInterpretation:true,afterFinal:{id:'before',completedAt:new Date(0)}}))
  expect(mocks.get).not.toHaveBeenCalled();expect(mocks.transaction).not.toHaveBeenCalled()
  expect(JSON.stringify(result)).not.toMatch(/Frozen report|Frozen band text|scores/)
 })
 it('refuses incomplete or foreign reader identities',async()=>{
  await expect(listSurveyStoredReports('owner',{projectId:'project',waveId:'wave'})).rejects.toMatchObject({statusCode:409})
  mocks.source.mockResolvedValue({...source(),interpretations:[]});await expect(listSurveyStoredReports('owner',{projectId:'project',waveId:'wave'})).rejects.toMatchObject({statusCode:409})
 })
})

describe('audited system report uses the original private owner scope',()=>{
 it('checks its audit receipt and renders only saved declared facts without owner impersonation',async()=>{
  const systemAccess={auditId:'scoped-receipt',proof:{tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'system-session'}}
  const result=await readSurveyStoredReport('system',{...input,systemAccess})
  expect(mocks.systemAuth).toHaveBeenCalledWith(expect.anything(),'system','project',systemAccess)
  expect(mocks.auth).not.toHaveBeenCalled()
  expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({actorUserId:'system',systemAccess}))
  expect(result.report.blocks).toContainEqual(expect.objectContaining({type:'METRIC',metricKey:'total',value:3}))
 })
 it('refuses a missing, expired or mismatched audit receipt before rendering',async()=>{
  mocks.systemAuth.mockRejectedValue(new Error('AUDIT_REQUIRED'))
  await expect(readSurveyStoredReport('system',{...input,systemAccess:{auditId:'foreign',proof:{tokenVersion:0}}})).rejects.toThrow('AUDIT_REQUIRED')
 })
})
