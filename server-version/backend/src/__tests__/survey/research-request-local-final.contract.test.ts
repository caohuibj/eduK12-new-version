import * as interpretationService from '../../modules/survey/final-interpretation.service'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import * as canonical from '../../modules/assessment-runtime/canonical'
import {prepareCanonicalSubmission} from '../../services/instrumentFinalSubmit'
import {computeSurveyFinal,verifySurveyFinalPublication} from '../../modules/survey/final.compute'
import {submitResearchFinal,readGeneralForOwnAttempt} from '../../modules/survey/final.service'
import {getOwnResearchTask} from '../../modules/survey/task.public'
import {screenOutResearchAttempt} from '../../modules/survey/flow.screen-out.service'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {compileFrozenResearchUnit} from '../../modules/survey/publication.service'
import {compileSurveyFlow,surveyVariantProvenance} from '../../modules/survey/flow.definition'
import type {SurveyFlowAssignment} from '../../modules/survey/flow.assignment'
import * as flowAssignment from '../../modules/survey/flow.assignment'

const mocks=vi.hoisted(()=>({verified:vi.fn(),transaction:vi.fn(),assignment:vi.fn(),
  attempt:vi.fn(),person:vi.fn(),final:vi.fn(),readFinal:vi.fn(),lock:vi.fn(),encrypt:vi.fn(),
  consent:vi.fn(),createFinal:vi.fn(),updateAttempt:vi.fn(),deleteCheckpoint:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction,
  surveyWaveFinal:{findFirst:mocks.readFinal}}}))
vi.mock('../../services/questionnaireProgressService',()=>({withFinalOnlyCompletionTransaction:mocks.transaction}))
vi.mock('../../modules/survey/admission.service',()=>({verifiedSurveyAttempt:mocks.verified,verifiedSurveyFinalLocator:mocks.verified}))
vi.mock('../../modules/survey/identity.service',()=>({hashResearchCredential:()=> 'credential-hash'}))
vi.mock('../../modules/survey/flow.assignment',async importOriginal=>({
  ...await importOriginal<typeof import('../../modules/survey/flow.assignment')>(),ensureSurveyFlowAssignment:mocks.assignment,
}))
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
  mocks.lock.mockImplementation(async (sql:any)=>String(sql?.sql??sql).includes('scale_library_emergency_stops')?[]:[{id:'locked'}])
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
  mocks.readFinal.mockResolvedValue({id:'receipt',completedAt:new Date('2026-10-17T00:00:00Z'),
    definitionDigest})
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
    }),select:{id:true,completedAt:true}})
    expect(mocks.updateAttempt).toHaveBeenCalledWith({where:{id:'attempt',projectId:'project',status:'STARTED'},
      data:{status:'COMPLETED',completedAt:new Date('2026-10-17T00:00:00Z')}})
    expect(mocks.deleteCheckpoint).toHaveBeenCalledWith({where:{attemptId:'attempt'}})
  })
  it('loads only receipt and integrity fields for exact FINAL replay',async()=>{
    await expect(submitResearchFinal(input())).resolves.toMatchObject({idempotent:true,receiptId:'receipt'})
    expect(mocks.final).toHaveBeenCalledWith({where:{attemptId:'attempt'},
      select:{id:true,completedAt:true,payloadHash:true,submissionId:true}})
    expect(mocks.createFinal).not.toHaveBeenCalled()
    expect(mocks.encrypt).not.toHaveBeenCalled()
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
  it('rejects a changed submission id despite identical replay answers',async()=>{
    await expect(submitResearchFinal({...input(),submissionId:'00000000-0000-4000-8000-000000000002'}))
      .rejects.toMatchObject({statusCode:409})
    expect(mocks.createFinal).not.toHaveBeenCalled()
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

describe('Survey first-success GENERAL receipt allowlist',()=>{
  const disclaimer='本研究反馈仅作一般说明，不提供未经验证的常模、诊断或个体能力等级。'
  const defaultText='感谢参与研究。研究结果将按研究说明进行汇总分析，不构成个人心理诊断。'
  const start=()=>{known.status=current.status='STARTED';mocks.final.mockResolvedValue(null)}
  it('returns only submission-time general text, disclaimer and persisted completion time on first success',async()=>{
    start()
    known.generalText='Stale pre-transaction text'
    current.wave.generalText='Current transaction text'
    const result=await submitResearchFinal(input())
    expect(result).toMatchObject({attemptId:'attempt',receiptId:'receipt',status:'COMPLETED',idempotent:false,
      generalText:'Current transaction text',generalReceipt:{text:'Current transaction text',disclaimer,
        completedAt:new Date('2026-10-17T00:00:00Z')}})
    expect(Object.keys((result as any).generalReceipt).sort()).toEqual(['completedAt','disclaimer','text'])
    expect(mocks.verified).toHaveBeenCalledTimes(1)
    expect(mocks.readFinal).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/answers|privateScoring|resultsCipher|payloadHash|credential/)
  })
  it.each(['',null])('uses identical default wording for the new receipt, legacy FINAL text and GENERAL route (%s)',async(text)=>{
    start();known.generalText=current.wave.generalText=text
    const result=await submitResearchFinal(input())
    known.status='COMPLETED'
    const general=await readGeneralForOwnAttempt(proof)
    expect(result.generalText).toBe(defaultText)
    expect((result as any).generalReceipt).toEqual({text:defaultText,disclaimer,completedAt:general.completedAt})
    expect(general).toEqual({kind:'GENERAL_ONLY',text:defaultText,disclaimer,
      completedAt:new Date('2026-10-17T00:00:00Z')})
  })
  it('keeps the custom GENERAL text and legacy route response exactly compatible',async()=>{
    start();known.generalText=current.wave.generalText='研究者一般说明'
    const result=await submitResearchFinal(input())
    known.status='COMPLETED'
    const general=await readGeneralForOwnAttempt(proof)
    expect(general).toEqual({kind:'GENERAL_ONLY',text:result.generalText,disclaimer,
      completedAt:result.completedAt})
    expect((result as any).generalReceipt).toEqual({text:general.text,disclaimer:general.disclaimer,
      completedAt:general.completedAt})
  })
  it('does not include a first-success receipt in an idempotent replay and preserves legacy text',async()=>{
    current.wave.generalText=known.generalText=''
    const result=await submitResearchFinal(input())
    expect(result).toMatchObject({status:'COMPLETED',idempotent:true,generalText:defaultText})
    expect(result).not.toHaveProperty('generalReceipt')
    expect(mocks.verified).toHaveBeenCalledWith(proof)
    expect(mocks.createFinal).not.toHaveBeenCalled()
  })
  it('reauthorizes every independent GENERAL read rather than caching the first-success receipt',async()=>{
    start();await submitResearchFinal(input())
    known.status='COMPLETED'
    await readGeneralForOwnAttempt(proof)
    const rejected=new Error('Current credential revoked')
    mocks.verified.mockRejectedValueOnce(rejected)
    await expect(readGeneralForOwnAttempt(proof)).rejects.toBe(rejected)
    expect(mocks.verified).toHaveBeenCalledTimes(3)
    expect(mocks.readFinal).toHaveBeenCalledTimes(1)
  })
  it.each(['hard stop','expired window','missing consent','withdrawn','revoked linked identity','changed unlinked credential'])(
    'rejects first completion after %s without writing or returning a receipt',async(reason)=>{
      start()
      if(reason==='hard stop')current.wave.hardStopAt=new Date()
      if(reason==='expired window')current.wave.finishUntil=new Date(0)
      if(reason==='missing consent')mocks.consent.mockResolvedValue(null)
      if(reason==='withdrawn'){current.status='WITHDRAWN';current.excludedAt=new Date()}
      if(reason==='revoked linked identity'){
        known.participantId=current.participantId='participant';mocks.person.mockResolvedValue(null)
      }
      if(reason==='changed unlinked credential')current.sessionHash='revoked'
      await expect(submitResearchFinal({...input(),researchCode:'R-12345678'})).rejects.toMatchObject({
        statusCode:reason==='withdrawn'?409:403,
      })
      expect(mocks.createFinal).not.toHaveBeenCalled()
      expect(mocks.encrypt).not.toHaveBeenCalled()
    })
  it('does not report completion or a receipt before the transaction commits',async()=>{
    start()
    const execute=mocks.transaction.getMockImplementation()!
    const rollback=new Error('Commit failed')
    mocks.transaction.mockImplementationOnce(async(callback)=>{await execute(callback);throw rollback})
    await expect(submitResearchFinal(input())).rejects.toBe(rollback)
    expect(mocks.createFinal).toHaveBeenCalledTimes(1)
    expect(mocks.readFinal).not.toHaveBeenCalled()
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

// The locator carries no definition authority. All checks below happen after
// the current publication is reloaded under the original transaction locks.
describe('parent FINAL narrow preflight source fence',()=>{
  it('does not require a preflight snapshot and verifies the locked full definition once',async()=>{
    delete known.compiledSnapshot
    const hash=vi.spyOn(canonical,'canonicalHash')
    await expect(submitResearchFinal(input())).resolves.toMatchObject({idempotent:true})
    expect(hash.mock.calls.filter(([value])=>(value as any)?.runtimeStatus==='SURVEY_FINAL_V1')).toHaveLength(1)
    expect(mocks.lock).toHaveBeenCalledTimes(3)
  })
  it.each(['id','definitionDigest'])('rejects a publication %s changed after preflight before receipt replay',async field=>{
    current.wave.publication[field]='changed-after-preflight'
    await expect(submitResearchFinal(input())).rejects.toMatchObject({statusCode:409})
    expect(mocks.final).not.toHaveBeenCalled();expect(mocks.createFinal).not.toHaveBeenCalled()
  })
  it('rejects a corrupted current snapshot even when its stored digest is unchanged',async()=>{
    current.wave.publication.compiledSnapshot.units[0].title='corrupted-after-preflight'
    await expect(submitResearchFinal(input())).rejects.toMatchObject({statusCode:403})
    expect(mocks.final).not.toHaveBeenCalled();expect(mocks.createFinal).not.toHaveBeenCalled()
  })
  it('rejects a matching digest for an unsupported runtime before receipt replay',async()=>{
    current.wave.publication.compiledSnapshot.runtimeStatus='OTHER_RUNTIME'
    known.definitionDigest=current.wave.publication.definitionDigest=canonicalHash(current.wave.publication.compiledSnapshot)
    await expect(submitResearchFinal(input())).rejects.toMatchObject({statusCode:403})
    expect(mocks.final).not.toHaveBeenCalled();expect(mocks.createFinal).not.toHaveBeenCalled()
  })
})


describe('Survey FINAL interpretation commit boundary',()=>{
  it('stores interpretation inside the same encrypted FINAL without disclosing it in receipt',async()=>{
    known.status=current.status='STARTED';mocks.final.mockResolvedValue(null)
    const stored={schemaVersion:1 as const,contentBindingHash:'a'.repeat(64),units:[]}
    const interpret=vi.spyOn(interpretationService,'interpretSurveyFinal').mockResolvedValue(stored)
    const result=await submitResearchFinal(input())
    expect(interpret).toHaveBeenCalledTimes(1)
    expect(interpret.mock.calls[0][1].calculated.units[0].rawAnswers).toEqual({choice:'yes'})
    expect(mocks.encrypt.mock.calls[0][0].interpretation).toEqual(stored)
    expect(mocks.createFinal).toHaveBeenCalledTimes(1)
    expect(result).not.toHaveProperty('interpretation')
  })
  it('does not recompute interpretation during idempotent replay',async()=>{
    const interpret=vi.spyOn(interpretationService,'interpretSurveyFinal')
    await expect(submitResearchFinal(input())).resolves.toMatchObject({idempotent:true})
    expect(interpret).not.toHaveBeenCalled();expect(mocks.createFinal).not.toHaveBeenCalled()
  })
})


describe('Survey FINAL bounded transaction reads and selected definition reuse',()=>{
  // Honor the actual Prisma projection, so missing consumed fields fail the
  // service instead of being masked by an over-generous mock return object.
  const project=(row:any,select:any):any=>!select?row:Object.fromEntries(Object.entries(select)
    .filter(([,value])=>!!value).map(([key,value])=>[key,value===true?row[key]:project(row[key],(value as any).select)]))
  it('does not transfer unused attempt ciphers or wave authoring data on first commit',async()=>{
    known.status=current.status='STARTED';mocks.final.mockResolvedValue(null)
    current.contentBindingCipher='private-binding';current.flowAssignmentCipher='private-assignment'
    current.wave.flowDefinition={private:'draft'};current.wave.consentText='private-consent'
    mocks.attempt.mockImplementation(async(args:any)=>project(current,args.select))
    const selected=vi.spyOn(flowAssignment,'assignedSurveySnapshot')
    const result=await submitResearchFinal(input())
    expect(result).toMatchObject({status:'COMPLETED',idempotent:false})
    expect(selected).toHaveBeenCalledTimes(1)
    expect(mocks.attempt.mock.calls[0][0]).toEqual({where:{id:'attempt',projectId:'project',waveId:'wave'},select:{
      id:true,participantId:true,status:true,excludedAt:true,sessionHash:true,wave:{select:{
        id:true,consentVersion:true,generalText:true,finishUntil:true,closesAt:true,hardStopAt:true,
        publication:{select:{id:true,definitionDigest:true,compiledSnapshot:true}},
      }},
    }})
    expect(JSON.stringify(result)).not.toContain('private-')
  })
  it('does not build the selected projection for an unchanged FINAL replay',async()=>{
    mocks.attempt.mockImplementation(async(args:any)=>project(current,args.select))
    const selected=vi.spyOn(flowAssignment,'assignedSurveySnapshot')
    expect(await submitResearchFinal(input())).toMatchObject({idempotent:true})
    expect(selected).not.toHaveBeenCalled()
  })
})


describe('Survey FINAL reused selected variant boundary',()=>{
  function setupVariant(){
    const source=snapshot()
    source.units.push({...source.units[0],draftId:'other',instrumentKey:'other'})
    source.flow=compileSurveyFlow({schemaVersion:1,embeddedData:[],experiment:{
      experimentKey:'arms',mode:'QUESTIONNAIRE_VARIANTS',linkedPolicy:'RERANDOMIZE',groups:[
        {groupKey:'a',variantLabel:'A',weight:1,instrumentKeys:['form'],materialTitle:'',materialBody:''},
        {groupKey:'b',variantLabel:'B',weight:1,instrumentKeys:['other'],materialTitle:'',materialBody:''},
      ]},blocks:[{blockKey:'form',kind:'INSTRUMENT',instrumentKey:'form'},
        {blockKey:'other',kind:'INSTRUMENT',instrumentKey:'other'}]},source.units,'SINGLE_UNLINKED')
    const assignment:SurveyFlowAssignment={schemaVersion:1,flowDigest:source.flow.flowDigest,
      experimentKey:'arms',groupKey:'a',algorithm:'CRYPTO_RANDOM_INT_V1',assignedAt:'2026-10-17T00:00:00Z',
      variant:surveyVariantProvenance(source.flow,'a')}
    known.status=current.status='STARTED';mocks.final.mockResolvedValue(null)
    known.definitionDigest=current.wave.publication.definitionDigest=canonicalHash(source)
    known.compiledSnapshot=current.wave.publication.compiledSnapshot=source
    mocks.assignment.mockResolvedValue(assignment)
    return {source,assignment}
  }
  it('projects assigned units once but computes and persists the unchanged frozen union',async()=>{
    const {source,assignment}=setupVariant(),before=structuredClone(assignment)
    const selected=vi.spyOn(flowAssignment,'assignedSurveySnapshot')
    const interpret=vi.spyOn(interpretationService,'interpretSurveyFinal').mockResolvedValue(undefined)
    await submitResearchFinal({...input(),presentation:{shownBlocks:['form']}})
    expect(selected).toHaveBeenCalledTimes(1)
    expect(interpret.mock.calls[0][1].selectedSnapshot.units.map(unit=>unit.instrumentKey)).toEqual(['form'])
    expect(mocks.encrypt.mock.calls[0][0]).toEqual(computeSurveyFinal(source,answers(),assignment,['form']))
    expect(mocks.encrypt.mock.calls[0][0].units[1]).toMatchObject({instrumentKey:'other',notExecuted:true})
    expect(assignment).toEqual(before)
  })
  it('continues rejecting unassigned answers after the selected projection is reused',async()=>{
    setupVariant()
    await expect(submitResearchFinal({...input(),answers:{...answers(),other:{choice:'yes'}},
      presentation:{shownBlocks:['form']}})).rejects.toMatchObject({statusCode:400})
    expect(mocks.createFinal).not.toHaveBeenCalled()
  })
})
