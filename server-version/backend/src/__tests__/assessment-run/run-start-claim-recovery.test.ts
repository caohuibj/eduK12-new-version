import {beforeEach,describe,expect,it,vi} from 'vitest'
import {Prisma} from '@prisma/client'
const m=vi.hoisted(()=>({
  acquire:vi.fn(),
  release:vi.fn(),
  lockEnvelope:vi.fn(),
  relationalStart:vi.fn(),
  tx:vi.fn(),
  raw:vi.fn(),
  rawExec:vi.fn(),
}))
vi.mock('../../modules/assessment-run/startClaim',async orig=>({
  ...(await orig<object>()),
  acquireRunExecutionStartClaim:m.acquire,
  releaseRolledBackRunStartClaim:m.release,
  lockExecutionEnvelope:m.lockEnvelope,
}))
vi.mock('../../modules/composite/composite.service',async orig=>({
  ...(await orig<object>()),
  startRelationalCompositeAttemptInTransaction:m.relationalStart,
}))
vi.mock('../../config/database',()=>({
  prisma:{$transaction:m.tx,$queryRaw:m.raw,$executeRaw:m.rawExec},
}))
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {AssessmentStartBusyError} from '../../modules/composite/start-transient'
import type * as startClaimModule from '../../modules/assessment-run/startClaim'
import {logger} from '../../utils/logger'

// The suite mocks './startClaim' above; the real release helper is still under
// test, so import the unmocked module namespace explicitly.
const realStartClaimModule = await vi.importActual<typeof startClaimModule>('../../modules/assessment-run/startClaim')

const p2028MaxWait=()=>new Prisma.PrismaClientKnownRequestError('Transaction API error: Unable to start a transaction in the given time.',{code:'P2028',clientVersion:'5.22.0'})
const p2028Committed=()=>new Prisma.PrismaClientKnownRequestError('Transaction API error: Transaction already closed: A query cannot be executed on a committed transaction.',{code:'P2028',clientVersion:'5.22.0'})

const leaseIn=(ms:number)=>new Date(Date.now()+ms)
const claimFixture=(over:Record<string,unknown>={})=>({
  id:'claim-1',organizationId:'org-1',runId:'run-1',executionId:'exec-1',
  operationKey:'run-start:exec-1:op-1',claimGeneration:3,state:'CLAIMED',
  claimedAt:new Date(Date.now()-500),leaseUntil:leaseIn(20500),
  dispatchedAt:null,completedAt:null,abortedAt:null,unknownAt:null,
  admittedAttemptIdentity:{},...over,
})
const envelopeRow=(kind='COMPOSITE',family='SCALE')=>([{
  family,resourceKey:'edu-assessment:k',
  frozenResourcePolicy:{runtimeLaunchTarget:{kind,ref:'composite-1'}},
}])

describe('Run START claim recovery',()=>{
  beforeEach(()=>{
    m.acquire.mockReset();m.release.mockReset();m.lockEnvelope.mockReset()
    m.relationalStart.mockReset();m.tx.mockReset();m.raw.mockReset();m.rawExec.mockReset()
    vi.spyOn(logger,'warn').mockImplementation(()=>{})
  })

  it('a claim transaction that never began returns the safe-retry 503 and releases nothing',async()=>{
    m.acquire.mockRejectedValueOnce(p2028MaxWait())
    await expect(startAssessmentRunExecution({executionId:'exec-1',actorUserId:'u1'}))
      .rejects.toBeInstanceOf(AssessmentStartBusyError)
    expect(m.acquire).toHaveBeenCalledTimes(1)
    expect(m.release).not.toHaveBeenCalled()
  })

  it('a committed-transaction P2028 from the claim phase is not reclassified',async()=>{
    const err=p2028Committed()
    m.acquire.mockRejectedValueOnce(err)
    await expect(startAssessmentRunExecution({executionId:'exec-1',actorUserId:'u1'})).rejects.toBe(err)
    expect(m.release).not.toHaveBeenCalled()
  })

  it('a rolled-back runtime transaction shortens the claim lease and keeps Retry-After: 1',async()=>{
    m.acquire.mockResolvedValueOnce({kind:'ACQUIRED',claim:claimFixture(),admission:{}})
    m.tx.mockImplementationOnce(async()=>{throw p2028MaxWait()})
    m.raw.mockResolvedValueOnce(envelopeRow())
    m.release.mockResolvedValueOnce(true)
    await expect(startAssessmentRunExecution({executionId:'exec-1',actorUserId:'u1'}))
      .rejects.toMatchObject({code:'ASSESSMENT_START_BUSY',retryAfterSeconds:1})
    expect(m.release).toHaveBeenCalledExactlyOnceWith({claimId:'claim-1',executionId:'exec-1',generation:3})
  })

  it('when the lease release cannot run, Retry-After reports the real remaining lease',async()=>{
    m.acquire.mockResolvedValueOnce({kind:'ACQUIRED',claim:claimFixture(),admission:{}})
    m.tx.mockImplementationOnce(async()=>{throw p2028MaxWait()})
    m.raw.mockResolvedValueOnce(envelopeRow())
    m.release.mockResolvedValueOnce(false)
    let thrown:unknown
    await startAssessmentRunExecution({executionId:'exec-1',actorUserId:'u1'}).catch((e)=>{thrown=e})
    expect(thrown).toBeInstanceOf(AssessmentStartBusyError)
    const busy=thrown as AssessmentStartBusyError
    expect(busy.reason).toBe('P2028')
    expect(busy.retryAfterSeconds).toBeGreaterThanOrEqual(19)
    expect(busy.retryAfterSeconds).toBeLessThanOrEqual(21)
  })

  it('the Teacher Form dispatch shares the same recovery wiring',async()=>{
    m.acquire.mockResolvedValueOnce({kind:'ACQUIRED',claim:claimFixture(),admission:{}})
    m.tx.mockImplementationOnce(async()=>{throw p2028MaxWait()})
    m.raw.mockResolvedValueOnce(envelopeRow('HUITEACHER_FORM_V2','FORM'))
    m.release.mockResolvedValueOnce(true)
    await expect(startAssessmentRunExecution({executionId:'exec-1',actorUserId:'u1'}))
      .rejects.toMatchObject({code:'ASSESSMENT_START_BUSY'})
    expect(m.release).toHaveBeenCalledExactlyOnceWith({claimId:'claim-1',executionId:'exec-1',generation:3})
  })

  it('a non-classified runtime failure keeps the claim lease and rethrows untouched',async()=>{
    m.acquire.mockResolvedValueOnce({kind:'ACQUIRED',claim:claimFixture(),admission:{}})
    const boom=new Error('boom')
    m.tx.mockImplementationOnce(async()=>{throw boom})
    m.raw.mockResolvedValueOnce(envelopeRow())
    await expect(startAssessmentRunExecution({executionId:'exec-1',actorUserId:'u1'})).rejects.toBe(boom)
    expect(m.release).not.toHaveBeenCalled()
  })

  it('the real release helper degrades safely when its own statement fails',async()=>{
    m.rawExec.mockRejectedValueOnce(new Error('pool exhausted'))
    await expect(realStartClaimModule.releaseRolledBackRunStartClaim({
      claimId:'claim-1',executionId:'exec-1',generation:3,
    })).resolves.toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('a P2024 pool timeout on the post-claim envelope read returns 503 and releases the lease',async()=>{
    // The claim already committed, so the single-transaction safety
    // condition does not apply — but the retry still recovers the same
    // attempt: the claim is undispatched, the lease is shortened, and the
    // retry takes over through the generation CAS with the same operationKey.
    m.acquire.mockResolvedValueOnce({kind:'ACQUIRED',claim:claimFixture(),admission:{}})
    const p2024=new Prisma.PrismaClientKnownRequestError('Timed out fetching a new connection',{code:'P2024',clientVersion:'5.22.0'})
    m.raw.mockRejectedValueOnce(p2024)
    m.release.mockResolvedValueOnce(true)
    await expect(startAssessmentRunExecution({executionId:'exec-1',actorUserId:'u1'}))
      .rejects.toMatchObject({code:'ASSESSMENT_START_BUSY',reason:'P2024',retryAfterSeconds:1})
    expect(m.release).toHaveBeenCalledExactlyOnceWith({claimId:'claim-1',executionId:'exec-1',generation:3})
  })

  it('a P2028 maxWait on the post-claim envelope read shares the same recovery wiring',async()=>{
    m.acquire.mockResolvedValueOnce({kind:'ACQUIRED',claim:claimFixture(),admission:{}})
    m.raw.mockRejectedValueOnce(p2028MaxWait())
    m.release.mockResolvedValueOnce(true)
    await expect(startAssessmentRunExecution({executionId:'exec-1',actorUserId:'u1'}))
      .rejects.toMatchObject({code:'ASSESSMENT_START_BUSY',reason:'P2028',retryAfterSeconds:1})
    expect(m.release).toHaveBeenCalledExactlyOnceWith({claimId:'claim-1',executionId:'exec-1',generation:3})
  })

  it('when the post-claim read lease release cannot run, Retry-After reports the real remaining lease',async()=>{
    m.acquire.mockResolvedValueOnce({kind:'ACQUIRED',claim:claimFixture(),admission:{}})
    const p2024=new Prisma.PrismaClientKnownRequestError('Timed out fetching a new connection',{code:'P2024',clientVersion:'5.22.0'})
    m.raw.mockRejectedValueOnce(p2024)
    m.release.mockResolvedValueOnce(false)
    let thrown:unknown
    await startAssessmentRunExecution({executionId:'exec-1',actorUserId:'u1'}).catch((e)=>{thrown=e})
    expect(thrown).toBeInstanceOf(AssessmentStartBusyError)
    const busy=thrown as AssessmentStartBusyError
    expect(busy.reason).toBe('P2024')
    expect(busy.retryAfterSeconds).toBeGreaterThanOrEqual(19)
    expect(busy.retryAfterSeconds).toBeLessThanOrEqual(21)
  })

  it('a non-classified envelope read failure keeps the claim lease and rethrows untouched',async()=>{
    m.acquire.mockResolvedValueOnce({kind:'ACQUIRED',claim:claimFixture(),admission:{}})
    const boom=new Error('boom')
    m.raw.mockRejectedValueOnce(boom)
    await expect(startAssessmentRunExecution({executionId:'exec-1',actorUserId:'u1'})).rejects.toBe(boom)
    expect(m.release).not.toHaveBeenCalled()
  })
})
