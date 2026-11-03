import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {approveToolEntryPolicies,assertToolEntryPolicy,lockToolPolicyAdmission} from '../../modules/assessment-governance/tool-entry-policy'

// Real Postgres: shared admission locks vs exclusive policy mutations.
// Opt-in, synthetic rows only, cleaned up afterwards.
const suite=process.env.TOOL_POLICY_LOCK_PG_TEST==='1'?describe:describe.skip
const serializable={isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:30000}
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return {promise,resolve}}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
async function advisoryWaiters(){
 const rows=await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`
 return Number(rows[0].n)
}
async function until(check:()=>Promise<boolean>,ms=5000){
 const end=Date.now()+ms
 while(Date.now()<end){if(await check())return;await sleep(20)}
 throw new Error('condition not reached')
}
suite('tool-policy ADMISSION_READ / POLICY_MUTATION on real Postgres',()=>{
 let actor:string
 const keys:string[]=[]
 const fingerprint='e'.repeat(64)
 async function approvedIdentity(){
  const identity={resourceKey:'release:lock-test-'+randomUUID(),fingerprint};keys.push(identity.resourceKey)
  await db.$transaction(tx=>approveToolEntryPolicies(tx,identity,['SURVEY','TRAINING'],actor,'lock test'))
  return identity
 }
 /** Admission tx that takes the shared lock, reports, then holds until released. */
 function holdingAdmission(identity:{resourceKey:string;fingerprint:string},events:string[],name:string){
  const locked=deferred(),release=deferred()
  const done=db.$transaction(async tx=>{
   await assertToolEntryPolicy(tx,identity,'TRAINING')
   events.push(name+':admitted');locked.resolve()
   await release.promise
  },serializable).then(()=>{events.push(name+':committed')})
  return {locked:locked.promise,release:release.resolve,done}
 }
 beforeAll(async()=>{
  actor=(await db.user.create({data:{username:'tool-lock-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',role:'STUDENT'}})).id
 })
 afterAll(async()=>{
  if(keys.length)await db.$executeRaw`DELETE FROM survey_tool_policies WHERE resource_key=ANY(${keys}::text[])`
  if(actor)await db.user.delete({where:{id:actor}})
  await db.$disconnect()
 })
 it('concurrent admissions on the same key do not block each other',async()=>{
  const identity=await approvedIdentity(),events:string[]=[]
  const first=holdingAdmission(identity,events,'a')
  await first.locked
  // While `a` holds its shared lock, a second admission must complete with a short lock_timeout.
  await db.$transaction(async tx=>{
   await tx.$executeRaw`SET LOCAL lock_timeout='1s'`
   await assertToolEntryPolicy(tx,identity,'TRAINING')
   await lockToolPolicyAdmission(tx,[identity,{resourceKey:'release:lock-test-other',fingerprint}])
  },serializable)
  events.push('b:committed')
  first.release();await first.done
  expect(events).toEqual(['a:admitted','b:committed','a:committed'])
 })
 it('a revoke waits for in-flight admissions; once it has returned every later admission is rejected',async()=>{
  const identity=await approvedIdentity(),events:string[]=[]
  const inflight=holdingAdmission(identity,events,'inflight')
  await inflight.locked
  const revoke=db.$transaction(tx=>approveToolEntryPolicies(tx,identity,['SURVEY'],actor,'revoke TRAINING'),{maxWait:5000,timeout:30000})
   .then(()=>{events.push('revoke:returned')})
  await until(async()=>await advisoryWaiters()>=1)
  // An admission arriving while the revoke is queued waits behind it (no writer starvation)
  const late=db.$transaction(async tx=>{await assertToolEntryPolicy(tx,identity,'TRAINING');events.push('late:admitted')},serializable)
   .then(()=>'committed',(e:any)=>{events.push('late:rejected');return e?.statusCode??(e?.meta?.code??e?.code)})
  await until(async()=>await advisoryWaiters()>=2)
  expect(events).toEqual(['inflight:admitted'])
  inflight.release()
  await inflight.done;await revoke
  const lateResult=await late
  // Serializable admission with an older snapshot fails the FOR SHARE re-read
  // (40001, raw-query P2010 meta.code); otherwise it reads RETURNED (409). Either way it is rejected.
  expect([409,'40001']).toContain(lateResult)
  await expect(db.$transaction(tx=>assertToolEntryPolicy(tx,identity,'TRAINING'),serializable)).rejects.toMatchObject({statusCode:409})
  expect(events).toEqual(['inflight:admitted','inflight:committed','revoke:returned','late:rejected'])
  // SURVEY entry was kept by the explicit scope change.
  await db.$transaction(tx=>assertToolEntryPolicy(tx,identity,'SURVEY'),serializable)
 })
 it('many concurrent admissions on one key overlap instead of serialising',async()=>{
  const identity=await approvedIdentity(),events:string[]=[]
  const holders=Array.from({length:5},(_,i)=>holdingAdmission(identity,events,'h'+i))
  await Promise.all(holders.map(h=>h.locked))
  expect(events.filter(e=>e.endsWith(':admitted'))).toHaveLength(5)
  expect(await advisoryWaiters()).toBe(0)
  holders.forEach(h=>h.release());await Promise.all(holders.map(h=>h.done))
 })
})
