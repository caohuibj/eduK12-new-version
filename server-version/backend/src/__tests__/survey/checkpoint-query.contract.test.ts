import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {readSurveyCheckpoint,saveSurveyCheckpoint,clearSurveyCheckpoint} from '../../modules/survey/checkpoint.service'
const m=vi.hoisted(()=>({locator:vi.fn(),full:vi.fn(),query:vi.fn(),attempt:vi.fn(),publication:vi.fn(),person:vi.fn(),prior:vi.fn(),create:vi.fn(),update:vi.fn(),remove:vi.fn(),event:vi.fn(),assignment:vi.fn(),assigned:vi.fn(),scale:vi.fn(),cognitive:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:any)=>fn({
 $queryRaw:m.query,surveyWaveAttempt:{findFirst:m.attempt},surveyPublication:{findFirst:m.publication},surveyParticipant:{findFirst:m.person},
 surveyAttemptCheckpoint:{findUnique:m.prior,create:m.create,updateMany:m.update,delete:m.remove,deleteMany:m.remove},surveyEvent:{create:m.event},
})}}))
vi.mock('../../modules/survey/admission.service',()=>({verifiedSurveyFinalLocator:m.locator,verifiedSurveyAttempt:m.full}))
vi.mock('../../modules/survey/identity.service',()=>({hashResearchCredential:()=> 'hash'}))
vi.mock('../../modules/survey/flow.assignment',()=>({ensureSurveyFlowAssignment:m.assignment,assignedSurveySnapshot:m.assigned}))
vi.mock('../../modules/survey/scale-collection-guard',()=>({assertSurveyScaleCollectionAllowed:m.scale}))
vi.mock('../../modules/survey/cognitive.results',()=>({assertSurveyCognitiveLockedAnswers:m.cognitive}))
vi.mock('../../modules/assessment-runtime/security',()=>({encryptUnifiedRuntimePayload:JSON.stringify,decryptUnifiedRuntimePayload:JSON.parse}))
const proof={publicId:'public',attemptId:'attempt',accessCredential:'a'.repeat(43)}
let snapshot:any,publication:any,attempt:any,known:any
const rehash=()=>{publication.definitionDigest=canonicalHash(snapshot);known.definitionDigest=publication.definitionDigest}
beforeEach(()=>{
 vi.clearAllMocks()
 snapshot={runtimeStatus:'SURVEY_FINAL_V1',units:[],checkpointPolicy:{enabled:true,ttlHours:2}}
 publication={compiledSnapshot:snapshot,definitionDigest:''}
 known={projectId:'project',waveId:'wave',attemptId:'attempt',participantId:null,status:'STARTED',publicationId:'publication',definitionDigest:''};rehash()
 attempt={participantId:null,status:'STARTED',excludedAt:null,sessionHash:'hash',wave:{publicationId:'publication',hardStopAt:null,finishUntil:new Date(Date.now()+3600000),closesAt:null}}
 m.locator.mockResolvedValue(known);m.attempt.mockResolvedValue(attempt);m.publication.mockResolvedValue(publication)
 m.prior.mockResolvedValue(null);m.person.mockResolvedValue({id:'person'});m.remove.mockResolvedValue({count:1});m.update.mockResolvedValue({count:1})
 m.assignment.mockResolvedValue({groupKey:'a'});m.assigned.mockImplementation((s:any)=>s)
})
describe('checkpoint request-local publication and bounded save reads',()=>{
 for(const [name,run] of [['read',()=>readSurveyCheckpoint(proof)],['save',()=>saveSurveyCheckpoint(proof,{revision:0,answers:{}})],['clear',()=>clearSurveyCheckpoint(proof)]] as const){
  it(`${name} loads the full definition once, after current locks`,async()=>{
   await run();expect(m.locator).toHaveBeenCalledOnce();expect(m.full).not.toHaveBeenCalled();expect(m.publication).toHaveBeenCalledOnce()
   expect(m.query.mock.invocationCallOrder[2]).toBeLessThan(m.publication.mock.invocationCallOrder[0])
   expect(m.attempt.mock.calls[0][0]).toMatchObject({where:{id:'attempt',projectId:'project',waveId:'wave'},select:{sessionHash:true,wave:{select:{publicationId:true}}}})
  })
 }
 it('save does not load old encrypted answers',async()=>{
  m.prior.mockResolvedValue({id:'prior',version:1,expiresAt:new Date(Date.now()+10000)})
  await saveSurveyCheckpoint(proof,{revision:1,answers:{}})
  expect(m.prior).toHaveBeenCalledWith({where:{attemptId:'attempt'},select:{id:true,version:true,expiresAt:true}});expect(m.update).toHaveBeenCalledOnce()
 })
 for(const state of ['revoked','withdrawn','completed','hard-stop','expired','participant-changed']){
  it(`rejects current ${state} after locator authorization`,async()=>{
   if(state==='revoked')attempt.sessionHash='new'
   if(state==='withdrawn')attempt.excludedAt=new Date()
   if(state==='completed')attempt.status='COMPLETED'
   if(state==='hard-stop')attempt.wave.hardStopAt=new Date()
   if(state==='expired')attempt.wave.finishUntil=new Date(0)
   if(state==='participant-changed')attempt.participantId='other'
   await expect(saveSurveyCheckpoint(proof,{revision:0,answers:{}})).rejects.toMatchObject({statusCode:403});expect(m.create).not.toHaveBeenCalled()
  })
 }
 for(const state of ['payload','digest','publication','runtime','missing']){
  it(`rejects changed ${state} under locks`,async()=>{
   if(state==='payload')snapshot.units.push({kind:'FORM'})
   if(state==='digest')publication.definitionDigest='changed'
   if(state==='publication')attempt.wave.publicationId='other'
   if(state==='runtime'){snapshot.runtimeStatus='INVALID';rehash()}
   if(state==='missing')m.publication.mockResolvedValue(null)
   await expect(clearSurveyCheckpoint(proof)).rejects.toMatchObject({statusCode:409});expect(m.remove).not.toHaveBeenCalled()
  })
 }
 it('preserves linked credential fences and locked variant assignment',async()=>{
  known.participantId=attempt.participantId='person';snapshot.flow={experiment:{mode:'QUESTIONNAIRE_VARIANTS'}};rehash()
  await readSurveyCheckpoint({...proof,researchCode:'R-12345678'})
  expect(m.person.mock.calls[0][0].where).toMatchObject({id:'person',projectId:'project',credentialHash:'hash',credentialRevokedAt:null,status:'ACTIVE',researchCode:'R-12345678'})
  expect(m.assignment.mock.calls[0][1].snapshot).toBe(snapshot);expect(m.query.mock.calls[3][0].join(' ')).toContain('FOR UPDATE')
  m.person.mockResolvedValue(null);await expect(readSurveyCheckpoint({...proof,researchCode:'R-12345678'})).rejects.toMatchObject({statusCode:403})
 })
 it('retains ciphertext integrity and revision conflicts',async()=>{
  m.prior.mockResolvedValue({id:'prior',version:1,expiresAt:new Date(Date.now()+10000),definitionDigest:known.definitionDigest,contentCipher:'{}',contentHash:'corrupt'})
  await expect(readSurveyCheckpoint(proof)).rejects.toMatchObject({statusCode:409})
  await expect(saveSurveyCheckpoint(proof,{revision:0,answers:{}})).rejects.toMatchObject({statusCode:409});expect(m.update).not.toHaveBeenCalled()
 })
 it('retains cognitive locking across all frozen units, not just selected variant',async()=>{
  snapshot.units=[{kind:'COGNITIVE'}];snapshot.flow={experiment:{mode:'QUESTIONNAIRE_VARIANTS'}};rehash();m.assigned.mockReturnValue({...snapshot,units:[]})
  await saveSurveyCheckpoint(proof,{revision:0,answers:{}});expect(m.cognitive).toHaveBeenCalledOnce()
 })
})
