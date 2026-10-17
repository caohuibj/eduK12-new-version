import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import * as canonical from '../../modules/assessment-runtime/canonical'
import {prepareCanonicalSubmission} from '../../services/instrumentFinalSubmit'
import {computeSurveyFinal,verifySurveyFinalPublication} from '../../modules/survey/final.compute'
import {submitResearchFinal} from '../../modules/survey/final.service'
import {getOwnResearchTask} from '../../modules/survey/task.public'
import {screenOutResearchAttempt} from '../../modules/survey/flow.screen-out.service'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {compileFrozenResearchUnit} from '../../modules/survey/publication.service'
import {compileSurveyFlow} from '../../modules/survey/flow.definition'
import type {SurveyFlowAssignment} from '../../modules/survey/flow.assignment'

const mocks=vi.hoisted(()=>({verified:vi.fn(),transaction:vi.fn(),assignment:vi.fn(),
  attempt:vi.fn(),person:vi.fn(),final:vi.fn(),lock:vi.fn(),encrypt:vi.fn(),
  consent:vi.fn(),createFinal:vi.fn(),updateAttempt:vi.fn(),deleteCheckpoint:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../services/questionnaireProgressService',()=>({withFinalOnlyCompletionTransaction:mocks.transaction}))
vi.mock('../../modules/survey/admission.service',()=>({verifiedSurveyAttempt:mocks.verified}))
vi.mock('../../modules/survey/identity.service',()=>({hashResearchCredential:()=> 'credential-hash'}))
vi.mock('../../modules/survey/flow.assignment',()=>({ensureSurveyFlowAssignment:mocks.assignment}))
vi.mock('../../modules/assessment-runtime/security',()=>({encryptUnifiedRuntimePayload:mocks.encrypt}))

function snapshot():ResearchFrozenPublication {
  const form={schemaVersion:1,pages:[{pageKey:'page',title:'Synthetic',questions:[{
    itemKey:'choice',type:'SINGLE',prompt:'Choose',required:true,options:[
      {optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'},
    ],rows:[],
  }]}]}
  return {schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'project',waveId:'wave',
    collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,
    consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',units:[{
      draftId:'draft',instrumentKey:'form',kind:'FORM',title:'Synthetic',draftRevision:1,
      sourceDigest:'source',scoringDigest:null,compiledDefinition:form,displayDefinition:form,
    }]}
}
const answers=()=>({form:{choice:'yes'}})
const proof={publicId:'public',attemptId:'attempt',accessCredential:'A'.repeat(43)}
const input=()=>({...proof,submissionId:'00000000-0000-4000-8000-000000000001',answers:answers()})
let current:Record<string,any>
let known:Record<string,any>
const oldPublicationFlag=process.env.SURVEY_PUBLICATION_ENABLED
afterEach(()=>{process.env.SURVEY_PUBLICATION_ENABLED=oldPublicationFlag})
beforeEach(()=>{
  vi.restoreAllMocks();vi.clearAllMocks()
  process.env.SURVEY_PUBLICATION_ENABLED='true'
  const compiledSnapshot=snapshot(),definitionDigest=canonicalHash(compiledSnapshot)
  known={attemptId:'attempt',projectId:'project',waveId:'wave',participantId:null,
    status:'COMPLETED',publicationId:'publication',definitionDigest,compiledSnapshot,generalText:'Thanks'}
  current={id:'attempt',projectId:'project',waveId:'wave',participantId:null,status:'COMPLETED',
    excludedAt:null,sessionHash:'credential-hash',wave:{id:'wave',consentVersion:1,generalText:'Thanks',
      finishUntil:new Date(Date.now()+3600000),hardStopAt:null,publication:{id:'publication',definitionDigest,compiledSnapshot}}}
  mocks.verified.mockImplementation(async()=>known)
  mocks.attempt.mockImplementation(async()=>current)
  mocks.person.mockResolvedValue({id:'participant'})
  mocks.lock.mockResolvedValue([{id:'locked'}])
  mocks.transaction.mockImplementation(async(callback:any)=>callback({
    $queryRaw:mocks.lock,surveyWaveAttempt:{findFirst:mocks.attempt,updateMany:mocks.updateAttempt},
    surveyParticipant:{findFirst:mocks.person},surveyWaveFinal:{findUnique:mocks.final,create:mocks.createFinal},
    surveyConsent:{findFirst:mocks.consent},surveyAttemptCheckpoint:{deleteMany:mocks.deleteCheckpoint},
  }))
  mocks.consent.mockResolvedValue({id:'consent'})
  mocks.createFinal.mockResolvedValue({id:'receipt',completedAt:new Date('2026-10-17T00:00:00Z')})
  mocks.updateAttempt.mockResolvedValue({count:1})
  mocks.deleteCheckpoint.mockResolvedValue({count:1})
  mocks.encrypt.mockReturnValue('synthetic-cipher')
  mocks.final.mockResolvedValue({id:'receipt',completedAt:new Date('2026-10-17T00:00:00Z'),
    submissionId:input().submissionId,payloadHash:prepareCanonicalSubmission({
      publicationId:known.publicationId,definitionDigest:known.definitionDigest,answers:answers(),
    }).hash})
})

describe('request-local verified immutable Survey FINAL definition',()=>{
  it('uses one validated publication digest for computation without hashing it again',()=>{
    const source=snapshot(),digest=canonicalHash(source)
    const expected=computeSurveyFinal(source,answers())
    const hash=vi.spyOn(canonical,'canonicalHash')
    const verified=verifySurveyFinalPublication(source,digest)
    expect(verified).not.toBeNull()
    expect(verified!.compute(answers())).toEqual(expected)
    // Draft validation has its own digest. Count only the full Publication.
    expect(hash.mock.calls.filter(([value])=>
      (value as ResearchFrozenPublication)?.runtimeStatus==='SURVEY_FINAL_V1')).toHaveLength(1)
  })
  it('rejects arbitrary or stale expected digests rather than trusting a caller hint',()=>{
    const source=snapshot(),digest=canonicalHash(source)
    expect(verifySurveyFinalPublication(source,'0'.repeat(64))).toBeNull()
    source.units[0].title='changed'
    expect(verifySurveyFinalPublication(source,digest)).toBeNull()
  })
  it('owns a deeply immutable copy and is unaffected by subsequent source mutation',()=>{
    const source=snapshot(),digest=canonicalHash(source),expected=computeSurveyFinal(source,answers())
    const verified=verifySurveyFinalPublication(source,digest)!
    source.units.length=0
    expect(verified.compute(answers())).toEqual(expected)
    expect(Object.isFrozen(verified)).toBe(true)
    expect(Object.isFrozen(verified.snapshot.units[0].displayDefinition)).toBe(true)
    expect(()=>{verified.snapshot.units.length=0}).toThrow()
  })
  it('keeps each request independent and preserves ordinary validation failures',()=>{
    const first=snapshot(),second=snapshot()
    second.units[0].title='another frozen publication'
    const a=verifySurveyFinalPublication(first,canonicalHash(first))!
    const b=verifySurveyFinalPublication(second,canonicalHash(second))!
    expect(a.snapshot).not.toBe(b.snapshot)
    expect(a.compute(answers()).definitionDigest).not.toBe(b.compute(answers()).definitionDigest)
    expect(()=>a.compute({form:{choice:'forged'}})).toThrow()
    expect(()=>a.compute({})).toThrow()
  })
  it.each(['ALL_AT_ONCE','ONE_BY_ONE'] as const)('preserves %s Scale scoring, reversal and timing with frozen definitions',(presentationMode)=>{
    const source=snapshot()
    source.units.push(compileFrozenResearchUnit({id:'scale',instrumentKey:'scale',kind:'SCALE',
      title:'Synthetic scale',revision:1,definition:{schemaVersion:1,presentationMode,
        respondentType:'participant_self_report',aggregation:'mean',
        dimensions:[{dimensionKey:'dimension',label:'Dimension',direction:'descriptive'}],
        responseOptions:[{optionKey:'low',label:'Low',score:1},{optionKey:'high',label:'High',score:5}],
        items:[{itemKey:'one',prompt:'One',required:true,reverse:false,dimensionKeys:['dimension']},
          {itemKey:'two',prompt:'Two',required:true,reverse:true,dimensionKeys:['dimension']}],
      }}))
    const response={...answers(),scale:{one:'high',two:'high'}}
    const time={schemaVersion:1,firstResponseMs:10,activeTimeMs:20,changeCount:0,
      revisitCount:0,visits:1,interrupted:false,recoveredWithoutClock:false}
    const timing=presentationMode==='ONE_BY_ONE'?{scale:{one:time,two:time}}:undefined
    const expected=computeSurveyFinal(source,response,undefined,undefined,'FINAL',timing)
    const verified=verifySurveyFinalPublication(source,canonicalHash(source))!
    expect(verified.compute(response,undefined,undefined,'FINAL',timing)).toEqual(expected)
    expect(expected.units[1].privateScoring).toMatchObject({scores:[{key:'dimension',value:3}]})
  })
  it('preserves validated FORM/SCALE Flow computation and exact presentation checks',()=>{
    const source=snapshot()
    source.units.push(compileFrozenResearchUnit({id:'scale',instrumentKey:'scale',kind:'SCALE',
      title:'Synthetic flow scale',revision:1,definition:{schemaVersion:1,
        respondentType:'participant_self_report',aggregation:'sum',
        dimensions:[{dimensionKey:'dimension',label:'Dimension',direction:'descriptive'}],
        responseOptions:[{optionKey:'low',label:'Low',score:1},{optionKey:'high',label:'High',score:5}],
        items:[{itemKey:'one',prompt:'One',required:true,reverse:false,dimensionKeys:['dimension']}],
      }}))
    source.flow=compileSurveyFlow({schemaVersion:1,embeddedData:[],blocks:[
      {blockKey:'question',kind:'INSTRUMENT',instrumentKey:'form'},
      {blockKey:'rating',kind:'INSTRUMENT',instrumentKey:'scale',when:{op:'EQUALS',
        field:{source:'ANSWER',instrumentKey:'form',itemKey:'choice'},value:'yes'}},
      {blockKey:'thanks',kind:'MATERIAL',title:'Thanks',body:'Synthetic ending'},
    ]},source.units,'SINGLE_UNLINKED')
    const assignment:SurveyFlowAssignment={schemaVersion:1,flowDigest:source.flow.flowDigest,
      experimentKey:null,groupKey:null,algorithm:'NO_EXPERIMENT',assignedAt:'2026-10-17T00:00:00Z'}
    const verified=verifySurveyFinalPublication(source,canonicalHash(source))!
    const response={...answers(),scale:{one:'high'}}
    const shown=['question','rating','thanks']
    expect(verified.compute(response,assignment,shown)).toEqual(computeSurveyFinal(source,response,assignment,shown))
    const skipped={form:{choice:'no'}},shortPath=['question','thanks']
    expect(verified.compute(skipped,assignment,shortPath)).toEqual(computeSurveyFinal(source,skipped,assignment,shortPath))
    expect(()=>verified.compute(response,assignment,shortPath)).toThrow(/展示路径/)
    expect(()=>verified.compute({...skipped,scale:{one:'high'}},assignment,shortPath)).toThrow(/实际展示/)
  })
})

describe('Survey terminal receipt and withdrawal boundaries',()=>{
  it('commits validated answers, completion and checkpoint deletion in one transaction',async()=>{
    known.status=current.status='STARTED';mocks.final.mockResolvedValue(null)
    await expect(submitResearchFinal(input())).resolves.toMatchObject({idempotent:false,status:'COMPLETED'})
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.encrypt).toHaveBeenCalledWith(computeSurveyFinal(snapshot(),answers()))
    expect(mocks.createFinal).toHaveBeenCalledWith({data:expect.objectContaining({
      publicationId:'publication',definitionDigest:known.definitionDigest,resultsCipher:'synthetic-cipher',
    })})
    expect(mocks.updateAttempt).toHaveBeenCalledWith({where:{id:'attempt',projectId:'project',status:'STARTED'},
      data:{status:'COMPLETED',completedAt:new Date('2026-10-17T00:00:00Z')}})
    expect(mocks.deleteCheckpoint).toHaveBeenCalledWith({where:{attemptId:'attempt'}})
  })
  it('rejects a withdrawn unlinked replay even when its immutable FINAL remains',async()=>{
    known.status=current.status='WITHDRAWN';current.excludedAt=new Date()
    await expect(submitResearchFinal(input())).rejects.toMatchObject({statusCode:409})
    expect(mocks.final).not.toHaveBeenCalled()
    expect(mocks.encrypt).not.toHaveBeenCalled()
  })
  it('rejects excluded attempts before returning an existing FINAL receipt',async()=>{
    current.excludedAt=new Date()
    await expect(submitResearchFinal(input())).rejects.toMatchObject({statusCode:409})
  })
  it('retains identical completed replay after hard stop and rejects changed payloads',async()=>{
    current.wave.hardStopAt=new Date();current.wave.finishUntil=new Date(0)
    await expect(submitResearchFinal(input())).resolves.toMatchObject({idempotent:true,status:'COMPLETED'})
    await expect(submitResearchFinal({...input(),answers:{form:{choice:'no'}}})).rejects.toMatchObject({statusCode:409})
  })
  it('still rejects a changed publication inside the completion transaction',async()=>{
    current.wave.publication={...current.wave.publication,definitionDigest:'0'.repeat(64)}
    await expect(submitResearchFinal(input())).rejects.toMatchObject({statusCode:409})
    expect(mocks.final).not.toHaveBeenCalled()
  })
  it('still rejects corrupted transaction publication bytes',async()=>{
    current.wave.publication={...current.wave.publication,compiledSnapshot:{...snapshot(),consentDigest:'tampered'}}
    await expect(submitResearchFinal(input())).rejects.toMatchObject({statusCode:403})
    expect(mocks.final).not.toHaveBeenCalled()
  })
  it('keeps live linked credential rejection before any completed receipt',async()=>{
    known.participantId=current.participantId='participant';mocks.person.mockResolvedValue(null)
    await expect(submitResearchFinal({...input(),researchCode:'R-12345678'})).rejects.toMatchObject({statusCode:403})
    expect(mocks.final).not.toHaveBeenCalled()
  })
})

describe('Survey screened-out recovery without answer or assignment exposure',()=>{
  it('returns only authenticated terminal metadata without allocating an assignment',async()=>{
    known.status='SCREENED_OUT'
    const result=await getOwnResearchTask(proof)
    expect(result).toEqual({attemptId:'attempt',waveId:'wave',status:'SCREENED_OUT',
      definitionDigest:known.definitionDigest,reportMode:'GENERAL_ONLY',units:[]})
    expect(mocks.verified).toHaveBeenCalledWith(proof)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.assignment).not.toHaveBeenCalled()
  })
  it.each(['WITHDRAWN','CLOSED','ABANDONED'])('continues to reject %s task recovery',async(status)=>{
    known.status=status
    await expect(getOwnResearchTask(proof)).rejects.toMatchObject({statusCode:403})
  })
  it('still rejects a revoked credential before terminal recovery',async()=>{
    known.status='SCREENED_OUT';mocks.verified.mockRejectedValue(new Error('revoked'))
    await expect(getOwnResearchTask(proof)).rejects.toThrow('revoked')
  })
  it('rechecks linked authority before idempotent screen-out after lock acquisition',async()=>{
    known.status=current.status='SCREENED_OUT';known.participantId=current.participantId='participant'
    known.compiledSnapshot={...snapshot(),flow:{flowDigest:'flow'}}
    mocks.person.mockResolvedValue(null)
    await expect(screenOutResearchAttempt({...input(),researchCode:'R-12345678'})).rejects.toMatchObject({statusCode:403})
  })
  it('rechecks unlinked session authority before idempotent screen-out',async()=>{
    known.status=current.status='SCREENED_OUT';current.sessionHash='different-proof'
    known.compiledSnapshot={...snapshot(),flow:{flowDigest:'flow'}}
    await expect(screenOutResearchAttempt(input())).rejects.toMatchObject({statusCode:403})
  })
  it('recovers a valid terminal screen-out without allocating assignment or writing facts',async()=>{
    known.status=current.status='SCREENED_OUT'
    known.compiledSnapshot={...snapshot(),flow:{flowDigest:'flow'}}
    await expect(screenOutResearchAttempt(input())).resolves.toEqual({status:'SCREENED_OUT',idempotent:true})
    expect(mocks.assignment).not.toHaveBeenCalled()
    expect(mocks.encrypt).not.toHaveBeenCalled()
    expect(mocks.createFinal).not.toHaveBeenCalled()
  })
})
