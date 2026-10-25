import { randomUUID } from 'node:crypto'
import { beforeEach,describe,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({verified:vi.fn(),db:{$transaction:vi.fn()}}))
vi.mock('../../config/database',()=>({prisma:mocks.db}))
vi.mock('../../modules/survey/admission.service',()=>({verifiedSurveyAttempt:mocks.verified}))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { compileFrozenResearchUnit } from '../../modules/survey/publication.service'
import { initialCognitiveDefinition } from '../../modules/survey/cognitive.definition'
import { hashResearchCredential } from '../../modules/survey/identity.service'
import { readSurveyCognitive,restartSurveyCognitive,startSurveyCognitive,submitSurveyCognitiveFinal,
  readSurveyCognitiveProgressFromVerifiedAttempt } from '../../modules/survey/cognitive.service'
import { gonogoSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { surveyCognitiveReceiptSelect } from '../../modules/survey/cognitive.results'
import { getOwnResearchTask } from '../../modules/survey/task.public'

const provenance={schemaVersion:1,deviceClass:'DESKTOP_LAPTOP',administrationMode:'KEYBOARD_MOUSE'}
beforeEach(()=>{vi.clearAllMocks();process.env.DATA_ENCRYPTION_KEY='1'.repeat(64)})
function fixture(){
  const proof={publicId:randomUUID(),attemptId:randomUUID(),accessCredential:'x'.repeat(43)}
  const scope={projectId:randomUUID(),waveId:randomUUID(),attemptId:proof.attemptId,publicationId:randomUUID()}
  const unit=compileFrozenResearchUnit({id:randomUUID(),instrumentKey:'go',title:'Go',kind:'COGNITIVE',revision:1,definition:initialCognitiveDefinition()})
  const snapshot={schemaVersion:1,runtimeStatus:'SURVEY_FINAL_V1',units:[unit]}
  const known={...scope,participantId:null,status:'STARTED',definitionDigest:canonicalHash(snapshot),compiledSnapshot:snapshot}
  const attempt={id:proof.attemptId,participantId:null,status:'STARTED',excludedAt:null,
    sessionHash:hashResearchCredential(proof.accessCredential),wave:{id:scope.waveId,hardStopAt:null,
      finishUntil:new Date(Date.now()+3600000),consentVersion:1,publication:{id:scope.publicationId,
        definitionDigest:known.definitionDigest,compiledSnapshot:snapshot}}}
  let current:any={id:randomUUID(),...scope,slotKey:'go',epoch:1,status:'IN_PROGRESS',
    measurementDigest:(unit.compiledDefinition as any).measurementDigest,
    randomSeedCipher:encryptUnifiedRuntimePayload('seed'),admissionCipher:encryptUnifiedRuntimePayload(provenance),
    lockedAnswersCipher:encryptUnifiedRuntimePayload({}),lockedAnswersHash:canonicalHash({}),
    retentionReviewAt:new Date(),startedAt:new Date(),interruptedAt:null,finishedAt:null,result:null}
  const tx={$queryRaw:vi.fn().mockResolvedValue([{id:'locked'}]),surveyWaveAttempt:{findFirst:vi.fn().mockResolvedValue(attempt)},
    situationalAttempt:{findMany:vi.fn().mockResolvedValue([])},
    surveyConsent:{findFirst:vi.fn().mockResolvedValue({id:'consent'})},
    surveyCognitiveResult:{findUnique:vi.fn(),create:vi.fn(async({data,select}:any)=>Object.fromEntries(Object.keys(select).map(key=>[key,data[key]])))},
    surveyCognitiveSession:{findFirst:vi.fn(async(_args:any)=>current),findMany:vi.fn(async(args:any)=>
      args.select?.lockedAnswersCipher?(current?[current]:[]):(current?[current]:[])),
      update:vi.fn(async({data}:any)=>Object.assign(current,data)),updateMany:vi.fn().mockResolvedValue({count:1}),
      create:vi.fn(async({data}:any)=>current={...data,startedAt:new Date(),interruptedAt:null,finishedAt:null})}}
  mocks.verified.mockResolvedValue(known);mocks.db.$transaction.mockImplementation(async(callback:any)=>callback(tx))
  return {proof,known,attempt,tx,get current(){return current},set current(value:any){current=value}}
}
describe('Survey participant lifecycle query reuse',()=>{
  it('reads receipt metadata once and never exposes private result fields',async()=>{
    const f=fixture()
    f.current.result={id:randomUUID(),slotKey:'go',epoch:1,resultHash:'a'.repeat(64),
      measurementDigest:f.current.measurementDigest,submissionId:'private-submission',payloadHash:'b'.repeat(64),completedAt:new Date()}
    f.current.status='COMPLETED'
    const result=await readSurveyCognitive(f.proof,'go',f.current.id)
    expect(f.tx.surveyCognitiveSession.findFirst).toHaveBeenCalledTimes(1)
    expect(f.tx.surveyCognitiveResult.findUnique).not.toHaveBeenCalled()
    const query=f.tx.surveyCognitiveSession.findFirst.mock.calls[0][0] as any
    expect(query.include.result.select).toMatchObject({submissionId:true,payloadHash:true,resultHash:true})
    expect(JSON.stringify(query.include)).not.toMatch(/rawCipher|resultCipher/)
    expect(result.result).toBeNull();expect(result.resultReference?.resultId).toBe(f.current.result.id)
    expect(JSON.stringify(result)).not.toMatch(/private-submission|payloadHash|rawCipher|resultCipher/)
  })
  it('creates a fresh session without querying a result known not to exist',async()=>{
    const f=fixture();f.current=null
    const result=await startSurveyCognitive(f.proof,'go',{priorAnswers:{},administrationProvenance:provenance})
    expect(result.freshAdmission).toBe(true);expect(result.resultReference).toBeNull()
    expect(f.tx.surveyCognitiveResult.findUnique).not.toHaveBeenCalled()
  })
  it('restarts against the already-loaded current session without a second latest query',async()=>{
    const f=fixture();f.current.status='INTERRUPTED'
    const result=await restartSurveyCognitive(f.proof,'go',f.current.id,1)
    expect(result.attemptEpoch).toBe(2);expect(result.freshAdmission).toBe(true)
    expect(f.tx.surveyCognitiveSession.findFirst).toHaveBeenCalledTimes(1)
    expect(f.tx.surveyCognitiveSession.update).toHaveBeenCalledTimes(1)
    expect(f.tx.surveyCognitiveSession.create).toHaveBeenCalledTimes(1)
    expect(f.tx.surveyCognitiveResult.findUnique).not.toHaveBeenCalled()
  })
  it('task reads perform one preflight and retain current locked authority, consent and publication checks',async()=>{
    const f=fixture(),result=await getOwnResearchTask(f.proof)
    expect(mocks.verified).toHaveBeenCalledTimes(1)
    expect(mocks.verified).toHaveBeenCalledWith(f.proof)
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(3)
    expect(f.tx.surveyWaveAttempt.findFirst).toHaveBeenCalledTimes(1)
    expect(f.tx.surveyConsent.findFirst).toHaveBeenCalledTimes(1)
    expect(result).toHaveProperty('cognitiveSessions')
    expect(JSON.stringify(result)).not.toMatch(/Cipher|randomSeed|metrics/)
  })
  it('a verified locator cannot suppress current hard stop, consent, withdrawal or credential checks',async()=>{
    const f=fixture()
    f.attempt.wave.hardStopAt=new Date() as any
    await expect(readSurveyCognitiveProgressFromVerifiedAttempt(f.proof,f.known as any)).rejects.toThrow('窗口')
    f.attempt.wave.hardStopAt=null
    f.tx.surveyConsent.findFirst.mockResolvedValueOnce(null)
    await expect(readSurveyCognitiveProgressFromVerifiedAttempt(f.proof,f.known as any)).rejects.toThrow('知情同意')
    f.attempt.excludedAt=new Date() as any
    await expect(readSurveyCognitiveProgressFromVerifiedAttempt(f.proof,f.known as any)).rejects.toThrow('撤回')
    f.attempt.excludedAt=null;f.attempt.sessionHash='wrong'
    await expect(readSurveyCognitiveProgressFromVerifiedAttempt(f.proof,f.known as any)).rejects.toThrow('凭证')
    expect(mocks.verified).not.toHaveBeenCalled()
  })
  it('rejects a mismatched attempt locator without opening a transaction',async()=>{
    const f=fixture()
    await expect(readSurveyCognitiveProgressFromVerifiedAttempt(f.proof,{...f.known,attemptId:randomUUID()} as any)).rejects.toThrow('入口')
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
})

describe('Survey cognitive FINAL receipt-only INSERT projection',()=>{
 it('persists both encrypted payloads while returning only receipt metadata',async()=>{
  const f=fixture(),frozen=f.attempt.wave.publication.compiledSnapshot.units[0].compiledDefinition as any
  const trials=gonogoSequence('seed',120,.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',
   startedAtPerfMs:trialIndex*1300,endedAtPerfMs:trialIndex*1300+800,
   payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?320:null,interrupted:false}}))
  const result=await submitSurveyCognitiveFinal(f.proof,'go',f.current.id,{
   submissionId:randomUUID(),attemptEpoch:1,definitionHash:frozen.sessionSnapshot.configHash,trials,
   administrationProvenance:provenance as any,
  })
  const query=f.tx.surveyCognitiveResult.create.mock.calls[0][0]
  expect(query.select).toEqual(surveyCognitiveReceiptSelect)
  expect(query.data.rawCipher).toEqual(expect.any(String));expect(query.data.resultCipher).toEqual(expect.any(String))
  expect(query.data.trialCount).toBe(120);expect(result.resultReference.resultId).toBe(query.data.id)
  expect(result.payloadHash).toBe(query.data.payloadHash);expect(result.completed).toBe(true)
  expect(JSON.stringify(result)).not.toMatch(/rawCipher|resultCipher|trialIndex|randomSeed/)
 })
})
