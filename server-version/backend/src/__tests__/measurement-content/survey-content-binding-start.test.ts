import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({bind:vi.fn(),allocate:vi.fn(),transaction:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:m.transaction}}))
vi.mock('../../modules/survey/content-binding.service',()=>({bindSurveyAttemptContent:m.bind}))
vi.mock('../../modules/survey/flow.assignment',()=>({allocateResearchFlowOnAdmission:m.allocate}))
vi.mock('../../modules/survey/identity.service',()=>({recoverLinkedResearchIdentity:vi.fn(async()=>({participantId:'person'})),
  freshUnlinkedSession:()=>({sessionHash:'hash',accessCredential:'a'.repeat(43)}),hashResearchCredential:()=> 'hash'}))
import {startLinkedWave,startSingleUnlinkedWave} from '../../modules/survey/admission.service'
const publicId='11111111-1111-4111-8111-111111111111'
let tx:any
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true');vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true')
  tx={surveyProject:{findFirst:vi.fn(async()=>({id:'project'}))},
    $queryRaw:vi.fn(async(query:{strings?:string[]}|TemplateStringsArray)=>{
      const sql=('strings' in query?query.strings:query as TemplateStringsArray)!.join(' ')
      return sql.includes('"owner_user_id"')?[{ownerUserId:'owner',status:'ACTIVE',collectionMode:'LINKED_WAVES'}]:[{id:'owner'}]
    }),surveyWave:{findFirst:vi.fn(async()=>({id:'wave',publicationId:'publication',status:'OPEN',consentVersion:1,startsCount:0,quotaStarts:100})),
      updateMany:vi.fn(async()=>({count:1}))},surveyParticipant:{findFirst:vi.fn(async()=>({id:'person'}))},
    surveyWaveAttempt:{findFirst:vi.fn(async()=>null),create:vi.fn(async()=>({id:'attempt'}))},
    surveyConsent:{create:vi.fn()},surveyEntryToken:{findFirst:vi.fn(async()=>({id:'entry'}))}}
  m.transaction.mockImplementation(async fn=>fn(tx))
})
describe('actual Survey START binding integration',()=>{
  it('binds after durable flow allocation and before linked START response',async()=>{
    await expect(startLinkedWave({publicId,waveId:'wave',researchCode:'R-ABCDEFGH',accessCredential:'a'.repeat(43),consent:true,consentVersion:1}))
      .resolves.toEqual({attemptId:'attempt',waveId:'wave',status:'STARTED',recovered:false})
    expect(m.bind).toHaveBeenCalledWith(tx,{projectId:'project',waveId:'wave',attemptId:'attempt',publicationId:'publication',newAttempt:true})
    expect(m.allocate.mock.invocationCallOrder[0]).toBeLessThan(m.bind.mock.invocationCallOrder[0])
  })
  it('binds anonymous START without treating the participant as author or exposing binding',async()=>{
    tx.$queryRaw.mockImplementation(async(query:TemplateStringsArray)=>query.join(' ').includes('"owner_user_id"')
      ?[{ownerUserId:'owner',status:'ACTIVE',collectionMode:'SINGLE_UNLINKED'}]:[{id:'owner'}])
    const result=await startSingleUnlinkedWave({publicId,waveId:'wave',entryToken:'a'.repeat(43),consent:true,consentVersion:1})
    expect(m.allocate.mock.invocationCallOrder[0]).toBeLessThan(m.bind.mock.invocationCallOrder[0])
    expect(m.bind.mock.calls[0][1]).toEqual({projectId:'project',waveId:'wave',attemptId:'attempt',publicationId:'publication',newAttempt:true})
    expect(result).toEqual({attemptId:'attempt',waveId:'wave',status:'STARTED',accessCredential:'a'.repeat(43)})
  })
  it('validates original linked recovery without allocation or backfill',async()=>{
    tx.surveyWaveAttempt.findFirst.mockResolvedValue({id:'prior',status:'STARTED'})
    await startLinkedWave({publicId,waveId:'wave',researchCode:'R-ABCDEFGH',accessCredential:'a'.repeat(43),consent:true,consentVersion:1})
    expect(m.bind).toHaveBeenCalledWith(tx,{projectId:'project',waveId:'wave',attemptId:'prior',publicationId:'publication',newAttempt:false})
    expect(m.allocate).not.toHaveBeenCalled();expect(tx.surveyWaveAttempt.create).not.toHaveBeenCalled()
  })
  it('propagates binding failure inside admission transaction instead of returning success',async()=>{
    m.bind.mockRejectedValue(new Error('BINDING_DENIED'))
    await expect(startLinkedWave({publicId,waveId:'wave',researchCode:'R-ABCDEFGH',accessCredential:'a'.repeat(43),consent:true,consentVersion:1}))
      .rejects.toThrow('BINDING_DENIED')
  })
})
