import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {PrismaClient} from '@prisma/client'
// Real pool exhaustion: a P2024 raised by a genuinely saturated pool (not a
// constructed error object) must still map to the safe-retry 503 contract.
// The suite needs a live PostgreSQL; it skips (never fails) without one,
// following the integration-suite convention.
const hasDb=Boolean(process.env.DATABASE_URL)
const suite=hasDb?describe:describe.skip
const m=vi.hoisted(()=>({start:vi.fn(),parent:vi.fn()}))
vi.mock('../../modules/assessment-run/startExecution',()=>({startAssessmentRunExecution:m.start}))
vi.mock('../../modules/assessment-run/resourceBoundary',()=>({
  assertRunExecutionParent:m.parent,
  assertCurrentRunManagerBoundary:vi.fn(),
  assertCurrentRunPublisherBoundary:vi.fn(),
}))
import {assessmentRunController as runController} from '../../modules/assessment-run/run.controller'
import {AssessmentStartBusyError,classifyStartTransaction} from '../../modules/composite/start-transient'
import {prisma} from '../../config/database'
import {logger} from '../../utils/logger'

function fakeRes(){
  const res:any={headers:{} as Record<string,string>,statusCode:200,body:undefined}
  res.setHeader=(k:string,v:string)=>{res.headers[k]=v;return res}
  res.status=(s:number)=>{res.statusCode=s;return res}
  res.json=(b:unknown)=>{res.body=b;return res}
  return res
}
const req={
  user:{userId:'student-1',role:'STUDENT'},
  params:{organizationId:'org-1',runId:'run-1',executionId:'exec-1'},
  query:{},body:{},
} as any

const tinyPoolUrl=()=>{
  const url=new URL(process.env.DATABASE_URL as string)
  url.searchParams.set('connection_limit','1')
  url.searchParams.set('pool_timeout','1')
  return url.toString()
}
// The hold sleeps 20s (far longer than the 1s pool timeout) so a late
// pg_stat_activity poll under parallel load cannot let the sleep expire
// before the second transaction times out; the finally terminates the
// sleeper so the test still finishes in seconds. The hold transaction's
// own timeout is raised to 60s: Prisma's default 5s transaction timeout
// would roll the hold back (freeing the pool's only connection) before a
// load-delayed poll fires the second transaction. The self-pid exclusion
// keeps the terminator from killing its own connection (its query text
// itself matches '%pg_sleep%').
const killSleepers=async()=>{
  await prisma.$executeRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active' AND query LIKE '%pg_sleep%' AND pid <> pg_backend_pid()`.catch(()=>undefined)
}

suite('real PostgreSQL pool exhaustion → P2024 → 503',()=>{
  let tiny:PrismaClient|null=null
  beforeEach(()=>{
    m.start.mockReset();m.parent.mockReset();m.parent.mockResolvedValue(undefined)
    vi.spyOn(logger,'error').mockImplementation(()=>{})
    vi.spyOn(logger,'info').mockImplementation(()=>{})
  })
  afterEach(async()=>{
    if(tiny){await tiny.$disconnect().catch(()=>undefined);tiny=null}
  })

  // Hold the tiny pool's only connection with a sleeping transaction, then
  // prove a second transaction attempt fails with a REAL P2024 from the
  // pool (not a constructed error) and is classified as safe-retry 503.
  it('classifies a real P2024 from a saturated pool as safe-retry 503',async()=>{
    tiny=new PrismaClient({datasources:{db:{url:tinyPoolUrl()}}})
    const hold=tiny.$transaction(async(tx)=>{await tx.$queryRaw`SELECT pg_sleep(20)`},{timeout:60000})
    try{
      await expect.poll(async()=>{
        // pid <> pg_backend_pid() excludes this poll query itself: its
        // text contains the literal '%pg_sleep%', so without the
        // exclusion the count would be >= 1 even with no sleeper running
        // (diagnosed 2026-11-07 — the poll passed instantly and the
        // second transaction beat the still-starting hold to the pool's
        // only connection under parallel load).
        const rows=await prisma.$queryRaw<Array<{count:bigint}>>`SELECT count(*) AS "count" FROM pg_stat_activity WHERE state='active' AND query LIKE '%pg_sleep%' AND pid <> pg_backend_pid()`
        return Number(rows[0]?.count ?? 0)
      },{timeout:5000}).toBeGreaterThan(0)
      await expect(classifyStartTransaction(()=>tiny!.$transaction(async(tx)=>{await tx.$queryRaw`SELECT 1`})))
        .rejects.toMatchObject({code:'ASSESSMENT_START_BUSY',reason:'P2024'})
    }finally{
      await killSleepers()
      await hold.catch(()=>undefined)
    }
  },60000)

  it('a Run START against the saturated pool returns HTTP 503 with Retry-After',async()=>{
    tiny=new PrismaClient({datasources:{db:{url:tinyPoolUrl()}}})
    const hold=tiny.$transaction(async(tx)=>{await tx.$queryRaw`SELECT pg_sleep(20)`},{timeout:60000})
    try{
      await expect.poll(async()=>{
        const rows=await prisma.$queryRaw<Array<{count:bigint}>>`SELECT count(*) AS "count" FROM pg_stat_activity WHERE state='active' AND query LIKE '%pg_sleep%' AND pid <> pg_backend_pid()`
        return Number(rows[0]?.count ?? 0)
      },{timeout:5000}).toBeGreaterThan(0)
      m.start.mockImplementation(()=>classifyStartTransaction(()=>tiny!.$transaction(async(tx)=>{await tx.$queryRaw`SELECT 1`})))
      const res=fakeRes()
      await runController.startExecution(req,res)
      expect(res.statusCode).toBe(503)
      expect(res.headers['Retry-After']).toBe('1')
      expect(res.body).toEqual({code:'ASSESSMENT_START_BUSY',message:'综合测评开始请求繁忙，请稍后重试',data:null})
      expect(m.start).toHaveBeenCalledTimes(1)
    }finally{
      await killSleepers()
      await hold.catch(()=>undefined)
    }
  },60000)
})
