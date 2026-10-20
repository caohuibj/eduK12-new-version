import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {getWave} from '../../modules/survey/waves.service'
const mocks=vi.hoisted(()=>({transaction:vi.fn(),owner:vi.fn(),wave:vi.fn(),publication:vi.fn(),draft:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
const feedback={policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:['total'],release:'AFTER_COLLECTION'}
const snapshot=()=>({schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'project',waveId:'wave',units:[{
 draftId:'draft',instrumentKey:'scale',title:'Frozen title',kind:'SCALE',participantFeedback:feedback,compiledDefinition:{secret:'scoring key'},displayDefinition:{private:'source'}},
 {draftId:'legacy',instrumentKey:'sjt',title:'Legacy title',kind:'SJT',compiledDefinition:{secret:'weights'}}]})
let published:any
beforeEach(()=>{
 vi.clearAllMocks();const compiledSnapshot=snapshot();published={id:'pub',projectId:'project',compiledSnapshot,definitionDigest:canonicalHash(compiledSnapshot)}
 mocks.owner.mockResolvedValue([{id:'project',status:'ACTIVE'}]);mocks.wave.mockResolvedValue({id:'wave',projectId:'project',publicationId:'pub'})
 mocks.publication.mockImplementation(async()=>published)
 mocks.draft.mockResolvedValue({title:'Changed draft',participantFeedback:{...feedback,metricKeys:['other']}})
 mocks.transaction.mockImplementation(async(fn:any)=>fn({$queryRaw:mocks.owner,surveyWave:{findFirst:mocks.wave},surveyPublication:{findFirst:mocks.publication},surveyInstrumentDraft:{findFirst:mocks.draft}}))
})
describe('owner frozen participant feedback read',()=>{
 it('returns only actual frozen policy and explicit legacy absence, independent of current drafts',async()=>{
  expect(await getWave('owner','project','wave')).toMatchObject({frozenParticipantFeedback:[
   {draftId:'draft',instrumentKey:'scale',title:'Frozen title',participantFeedback:feedback},
   {draftId:'legacy',instrumentKey:'sjt',title:'Legacy title',participantFeedback:null}]})
  expect(mocks.draft).not.toHaveBeenCalled()
  expect(JSON.stringify(await getWave('owner','project','wave'))).not.toMatch(/scoring key|weights|compiledDefinition|displayDefinition/)
  expect(mocks.publication).toHaveBeenCalledWith(expect.objectContaining({where:{id:'pub',projectId:'project'}}))
 })
 it.each(['project','wave','digest','publication scope'])('rejects mismatched %s',async(reason)=>{
  if(reason==='digest')published.definitionDigest='changed'
  else if(reason==='publication scope')published.projectId='other'
  else{published.compiledSnapshot[reason==='project'?'projectId':'waveId']='other';published.definitionDigest=canonicalHash(published.compiledSnapshot)}
  await expect(getWave('owner','project','wave')).rejects.toMatchObject({statusCode:409})
 })
 it('rechecks account expiry with the clock after acquiring identity locks',async()=>{
  mocks.owner.mockResolvedValue([{id:'project',status:'ACTIVE',expires_at:new Date('2026-10-20T05:00:00Z'),checked_at:new Date('2026-10-20T05:00:01Z')}])
  await expect(getWave('owner','project','wave')).rejects.toMatchObject({statusCode:404})
  expect(mocks.publication).not.toHaveBeenCalled()
  const sql=mocks.owner.mock.calls[0][0].join('')
  expect(sql).toContain('WITH locked AS MATERIALIZED');expect(sql).toContain('clock_timestamp() AS checked_at')
 })
 it('checks owner before reading wave/publication and leaves unfrozen wave unchanged',async()=>{
  mocks.owner.mockResolvedValueOnce([]);await expect(getWave('other','project','wave')).rejects.toThrow()
  expect(mocks.wave).not.toHaveBeenCalled();expect(mocks.publication).not.toHaveBeenCalled()
  mocks.wave.mockResolvedValueOnce({id:'wave',projectId:'project',publicationId:null})
  expect(await getWave('owner','project','wave')).not.toHaveProperty('frozenParticipantFeedback')
  expect(mocks.publication).not.toHaveBeenCalled()
 })
})
