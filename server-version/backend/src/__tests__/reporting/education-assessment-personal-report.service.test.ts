import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
const m=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn(),scope:vi.fn(),summary:vi.fn(),parent:vi.fn(),units:vi.fn(),job:vi.fn(),identity:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:(work:(tx:unknown)=>unknown)=>work({$queryRaw:m.query,$executeRaw:m.execute,
  compositeAssessmentAttempt:{findUnique:m.parent},assessmentUnitSnapshot:{findMany:m.units},compositeReportJob:{findUnique:m.job}})}}))
vi.mock('../../modules/organization/educationProductAccess',()=>({resolveEducationProductMemberScope:m.scope}))
vi.mock('../../modules/reporting/respondentSummary',()=>({readRespondentRunSummary:m.summary}))
vi.mock('../../modules/assessment-run/educationAssessmentExecution',()=>({assertEducationAssessmentExecutionSource:m.identity}))
import { readEducationRespondentAssessmentReport } from '../../modules/reporting/education-assessment-report.service'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { educationReportFixture } from './education-assessment-report.fixture'
import { createEducationAssessmentReportReader } from '../../modules/reporting/education-assessment-personal-report.service'

const input={actorUserId:'self',executionId:'execution',product:'SCHOOL' as const}
async function setup(sharedMetricKey?:string){
  const f=await educationReportFixture('SCHOOL',['COGNITIVE','SJT'],{sharedMetricKey})
  m.query.mockResolvedValue([f.own]);m.scope.mockResolvedValue({membershipId:'own-member'})
  m.summary.mockResolvedValue({schemaVersion:1,state:'READY',mode:'INDIVIDUAL_SUMMARY',metricKeys:f.contract.audiences.RESPONDENT.metricKeys})
  m.parent.mockResolvedValue(f.parent);m.units.mockResolvedValue(f.rows);m.job.mockResolvedValue(null)
  const readSource=vi.fn().mockResolvedValue(f.source),assertSourceAuthority=vi.fn().mockResolvedValue(undefined)
  return {...f,readSource,assertSourceAuthority,read:createEducationAssessmentReportReader({readSource,assertSourceAuthority})}
}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64))})
afterEach(()=>vi.unstubAllEnvs())
describe('education respondent multi-tool report service (mock DB boundary, real saved-fact codecs)',()=>{
  it('reads exact saved mixed reports and independently rechecks current source and respondent rights',async()=>{
    const f=await setup(),data=await f.read(input)
    expect(data).toMatchObject({kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',state:'READY',reports:[{status:'READY'},{status:'READY'}]})
    expect(f.assertSourceAuthority).toHaveBeenCalledTimes(2)
    expect(m.query).toHaveBeenCalledTimes(2)
    expect(m.execute).toHaveBeenCalledTimes(1)
    expect(m.execute.mock.calls[0][0].join('')).toBe('SET LOCAL join_collapse_limit = 1')
    expect(m.execute.mock.invocationCallOrder[0]).toBeLessThan(m.query.mock.invocationCallOrder[0])
    expect(m.summary).toHaveBeenCalledWith('self','execution',{disclosureOnly:true,db:expect.objectContaining({$queryRaw:m.query})})
    expect(m.units).toHaveBeenCalledTimes(1)
    const sql=m.query.mock.calls[0][0].strings.join(' ')
    expect(sql).toContain("a.relationship_kind='SELF'")
    expect(sql).toContain("a.perspective='SELF_REPORT'")
    expect(sql).toContain("s.provenance_kind='ORG_MEMBER'")
    expect(sql).toContain("'REPORT_READ'")
    expect(JSON.stringify(data)).not.toContain('secret')
  })
  it.each(['not-own','membership','source-authority'] as const)('refuses %s before facts and never treats identity as authorization',async change=>{
    const f=await setup()
    if(change==='not-own')m.query.mockResolvedValue([])
    if(change==='membership')m.scope.mockResolvedValue(null)
    if(change==='source-authority')f.assertSourceAuthority.mockRejectedValue(Error('source permission withdrawn'))
    if(change==='source-authority')await expect(f.read(input)).rejects.toThrow('source permission withdrawn')
    else expect(await f.read(input)).toBeNull()
    expect(m.units).not.toHaveBeenCalled()
  })
  it.each(['product','organization','version','subject','assignment'] as const)('rejects wrong %s binding',async change=>{
    const f=await setup()
    if(change==='product')f.source.origin.product='TEACHER'
    if(change==='organization')f.source.origin.organizationId='00000000-0000-4000-8000-000000000999'
    if(change==='version')f.own.resourceVersion='2.0.0'
    if(change==='subject')f.parent.subjectUserId='another-student'
    if(change==='assignment')f.parent.assignmentRef='another-assignment'
    await expect(f.read(input)).rejects.toMatchObject({statusCode:404})
    expect(m.units).not.toHaveBeenCalled()
  })
  it('honors current respondent disclosure without materializing raw canonical facts',async()=>{
    const f=await setup();m.summary.mockResolvedValue({state:'WITHHELD',mode:'NONE'})
    expect(await f.read(input)).toMatchObject({state:'WITHHELD'})
    expect(m.units).not.toHaveBeenCalled()
  })
  it('shows only completion when the frozen tool permits that mode',async()=>{
    const f=await setup();f.contract.audiences.RESPONDENT={mode:'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]}
    f.source.entry.resultDisclosure=f.contract;f.own.policyHash=canonicalHash(f.own.policy)
    expect(await f.read(input)).toMatchObject({state:'COMPLETED',mode:'COMPLETION_ONLY'})
    expect(m.summary).not.toHaveBeenCalled();expect(m.units).not.toHaveBeenCalled()
  })
  it('returns PENDING only for a real matching accepted asynchronous job',async()=>{
    const f=await setup();f.parent.asyncReportEpoch=1
    m.job.mockResolvedValue({status:'PROCESSING',attemptEpoch:1,slotSetHash:f.parent.frozenActiveSlotSetHash,contextHash:null,aggregateInputHash:f.parent.aggregateInputHash,wholeAcceptedAt:null})
    expect(await f.read(input)).toMatchObject({state:'PENDING'})
    expect(m.units).not.toHaveBeenCalled()
  })
  it.each(['absent','wrong-epoch','wrong-slots','failed'] as const)('never invents PENDING for %s report job',async change=>{
    const f=await setup();f.parent.asyncReportEpoch=1
    const job={status:change==='failed'?'FAILED':'PROCESSING',attemptEpoch:change==='wrong-epoch'?2:1,slotSetHash:change==='wrong-slots'?'other':f.parent.frozenActiveSlotSetHash,contextHash:null,aggregateInputHash:f.parent.aggregateInputHash,wholeAcceptedAt:null}
    m.job.mockResolvedValue(change==='absent'?null:job)
    expect(await f.read(input)).toMatchObject({state:'WITHHELD'})
    expect(m.units).not.toHaveBeenCalled()
  })
  it.each(['respondent','authority','release'] as const)('rejects %s withdrawal during asynchronous materialization',async change=>{
    const f=await setup()
    if(change==='respondent')m.query.mockResolvedValueOnce([f.own]).mockResolvedValueOnce([])
    if(change==='authority')f.assertSourceAuthority.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('withdrawn'))
    if(change==='release'){
      const latest={...f.source,releases:new Map(f.releases)}
      for(const [id,release] of latest.releases)latest.releases.set(id,{...release,status:'REVOKED'})
      f.readSource.mockResolvedValueOnce(f.source).mockResolvedValueOnce(latest)
    }
    await expect(f.read(input)).rejects.toThrow()
  })
  it('refuses a changed canonical FINAL source rather than displaying a stored template',async()=>{
    const f=await setup();f.rows[0].sourceAttemptId='foreign-child'
    await expect(f.read(input)).rejects.toMatchObject({statusCode:404})
  })
  it('repeated reads do not write FINAL, reinterpretation or queue state',async()=>{
    const f=await setup(),receipt=f.parent.trainingContentInterpretationEncrypted
    const first=await f.read(input),second=await f.read(input)
    expect(second).toEqual(first);expect(f.parent.trainingContentInterpretationEncrypted).toBe(receipt)
    expect(m.units).toHaveBeenCalledTimes(2)
  })
})

it('honors an exact configured education report opening and becomes readable after that time',async()=>{
 const f=await setup(),readReportOpening=vi.fn().mockResolvedValue({releaseAt:'2099-01-01T00:00:00.000Z'})
 const read=createEducationAssessmentReportReader({readSource:f.readSource,assertSourceAuthority:f.assertSourceAuthority,readReportOpening})
 expect(await read(input)).toMatchObject({state:'WITHHELD',releaseAt:'2099-01-01T00:00:00.000Z'})
 expect(m.units).not.toHaveBeenCalled()
 readReportOpening.mockResolvedValue({releaseAt:'2000-01-01T00:00:00.000Z'})
 expect(await read(input)).toMatchObject({state:'READY'})
})

it('refuses a different frozen publication even if unit IDs are the same',async()=>{
 const f=await setup();f.origin.runtimeSnapshotHash='b'.repeat(64)
 await expect(f.read(input)).rejects.toMatchObject({statusCode:404})
})

it('does not replace original source authority proofs with another later administrator during a read',async()=>{
 const f=await setup(),latest={...f.source,authority:[{kind:'PRODUCT_ADMIN',actorId:'later-admin',membershipId:'later-member',grantId:'later-grant'}]}
 f.readSource.mockResolvedValueOnce(f.source).mockResolvedValueOnce(latest)
 await expect(f.read(input)).rejects.toMatchObject({statusCode:404})
})

it('refuses replacement of the frozen distribution proof while materializing a saved report',async()=>{
 const f=await setup(),origin=structuredClone(f.origin)
 origin.distribution.grants[0].version+=1
 f.readSource.mockResolvedValueOnce(f.source).mockResolvedValueOnce({...f.source,origin})
 await expect(f.read(input)).rejects.toMatchObject({statusCode:404})
})

it('keeps identically named metrics in distinct approved unit reports instead of flattening a mixed bundle',async()=>{
 const f=await setup('score'),data=await f.read(input)
 expect(data).toMatchObject({state:'READY',reports:[
  {itemId:f.origin.units[0].itemId,rendered:{blocks:[{type:'TEXT'},{metricKey:'score',value:10}]}},
  {itemId:f.origin.units[1].itemId,rendered:{blocks:[{type:'TEXT'},{metricKey:'score',value:11}]}},
 ]})
 expect(m.summary).toHaveBeenCalledWith('self','execution',{disclosureOnly:true,db:expect.objectContaining({$queryRaw:m.query})})
})

it('production composition consumes HISTORY and original proofs without new-use or current-issuer admission',async()=>{
 const f=await setup()
 f.source.authority=[0,1,2].map(index=>({kind:'SYSTEM_ADMIN',actorId:'00000000-0000-4000-8000-'+String(index+900).padStart(12,'0')})) as unknown as typeof f.source.authority
 m.identity.mockResolvedValue(f.source)
 expect(await readEducationRespondentAssessmentReport(input)).toMatchObject({state:'READY'})
 expect(m.identity).toHaveBeenCalledWith(expect.anything(),{executionId:'execution',compositeId:f.origin.runtimeCompositeId,purpose:'FROZEN'})
 expect(m.query).toHaveBeenCalledTimes(2)
})

async function formOnly(mode:'NONE'|'COMPLETION_ONLY'='COMPLETION_ONLY'){
 const f=await setup();f.origin.family='BUNDLE';f.origin.units=[]
 Object.assign(f.source.runtime,{formSections:[{id:'approved-form-section'}],items:[{type:'FORM'}]})
 f.contract.audiences.RESPONDENT={mode,metricKeys:[],longitudinalMetricKeys:[]}
 f.source.entry.resultDisclosure=f.contract;f.own.policyHash=canonicalHash(f.own.policy)
 Object.assign(f.parent,{trainingContentInterpretationEncrypted:null,trainingContentInterpretationHash:null})
 return f
}
it('pure Form BUNDLE confirms a completed parent without measurement, interpretation or score rows',async()=>{
 const f=await formOnly()
 const frozenOrigin=canonicalHash(f.origin)
 expect(await f.read(input)).toMatchObject({state:'COMPLETED',mode:'COMPLETION_ONLY'})
 expect(canonicalHash(f.origin)).toBe(frozenOrigin);expect(f.origin).not.toHaveProperty('feedbackPolicy')
 expect(m.units).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();expect(m.job).not.toHaveBeenCalled()
})
it('pure Form NONE never exposes completion feedback from the measurement-free exception',async()=>{
 const f=await formOnly('NONE')
 expect(await f.read(input)).toMatchObject({state:'WITHHELD',mode:'NONE'})
 expect(m.units).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();expect(m.job).not.toHaveBeenCalled()
})
it('pure Form completion obeys the same frozen opening and opens without creating report facts',async()=>{
 const f=await formOnly(),readReportOpening=vi.fn().mockResolvedValue({releaseAt:'2099-01-01T00:00:00.000Z'})
 const read=createEducationAssessmentReportReader({readSource:f.readSource,assertSourceAuthority:f.assertSourceAuthority,readReportOpening})
 expect(await read(input)).toMatchObject({state:'WITHHELD',mode:'NONE',releaseAt:'2099-01-01T00:00:00.000Z'})
 expect(readReportOpening).toHaveBeenCalledTimes(2)
 readReportOpening.mockResolvedValue({releaseAt:'2000-01-01T00:00:00.000Z'})
 expect(await read(input)).toMatchObject({state:'COMPLETED',mode:'COMPLETION_ONLY'})
 expect(m.units).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();expect(m.job).not.toHaveBeenCalled()
})
it('pure Form uses its frozen education schedule without borrowing a Training course snapshot',async()=>{
 const f=await formOnly()
 Object.assign(f.origin,{feedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt:'2099-01-01T00:00:00.000Z'}})
 expect(await f.read(input)).toMatchObject({state:'WITHHELD',mode:'NONE',releaseAt:'2099-01-01T00:00:00.000Z'})
 expect(m.units).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled()
})

it('production composition enforces frozen education timing with no injected opening reader',async()=>{
 const f=await setup()
 Object.assign(f.origin,{feedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt:'2099-01-01T08:00:00+08:00'}})
 m.identity.mockResolvedValue(f.source)
 expect(await readEducationRespondentAssessmentReport(input)).toMatchObject({state:'WITHHELD',releaseAt:'2099-01-01T00:00:00.000Z'})
 expect(m.units).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled()
 Object.assign(f.origin,{feedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt:'2000-01-01T00:00:00.000Z'}})
 expect(await readEducationRespondentAssessmentReport(input)).toMatchObject({state:'READY'})
})

it('an optional earlier workflow opening cannot widen the frozen schedule',async()=>{
 const f=await formOnly(),readReportOpening=vi.fn().mockResolvedValue({releaseAt:'2000-01-01T00:00:00.000Z'})
 Object.assign(f.origin,{feedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt:'2099-01-01T00:00:00.000Z'}})
 const read=createEducationAssessmentReportReader({readSource:f.readSource,assertSourceAuthority:f.assertSourceAuthority,readReportOpening})
 expect(await read(input)).toMatchObject({state:'WITHHELD',releaseAt:'2099-01-01T00:00:00.000Z'})
 expect(m.units).not.toHaveBeenCalled()
 Object.assign(f.origin,{feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'}})
 expect(await read(input)).toMatchObject({state:'COMPLETED'})
})

it.each([null,{schemaVersion:1,mode:'SCHEDULED',releaseAt:'bad-date'},{schemaVersion:1,mode:'OTHER'}])('rejects malformed present frozen policy instead of silently enabling legacy immediate: %j',async feedbackPolicy=>{
 const f=await formOnly();Object.assign(f.origin,{feedbackPolicy})
 await expect(f.read(input)).rejects.toMatchObject({statusCode:404})
 expect(m.units).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled()
})

it('an elapsed frozen schedule does not open NONE, incomplete or unauthorized Form reads',async()=>{
 const f=await formOnly('NONE');Object.assign(f.origin,{feedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt:'2000-01-01T00:00:00.000Z'}})
 expect(await f.read(input)).toMatchObject({state:'WITHHELD',mode:'NONE'})
 f.contract.audiences.RESPONDENT.mode='COMPLETION_ONLY';f.own.policyHash=canonicalHash(f.own.policy)
 f.parent.status='STARTED'
 expect(await f.read(input)).toMatchObject({state:'WITHHELD'})
 m.query.mockResolvedValue([])
 expect(await f.read(input)).toBeNull()
 expect(m.units).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled()
})
