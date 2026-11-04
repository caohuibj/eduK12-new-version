import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {getContentRelease,getContentReleaseBatch,publishContentRelease,transitionContentRelease} from '../../modules/measurement-content/repository'

// Real Postgres: START binds a release by digest with one unlocked batch read.
// Opt-in, synthetic rows only; tampering runs inside a rolled-back transaction.
const suite=process.env.RELEASE_BINDING_PG_TEST==='1'?describe:describe.skip
const opts={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:30000}
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return {promise,resolve}}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
const prefix='start-bind-'+randomUUID()
let actor:string
const fixture=(suffix:string)=>({
 family:'SCALE',layer:'MEASUREMENT',key:`${prefix}:${suffix}`,version:'1',
 scope:{kind:'PRIVATE',ownerId:actor,product:'TRAINING',resourceId:randomUUID()},
 provenance:{sourceKind:'START_BINDING_SYNTHETIC_FIXTURE'},assetRefs:[],sourceReleaseId:null,
 content:{projectionVersion:1,instrumentVersion:'1',measurementHash:'a'.repeat(64),measurementHashScheme:'SCALE_AXES_V1',
  scoringVersion:'1',runnerKey:'scale',runnerVersion:'2',locale:'zh-CN',localizationVersion:'1',
  metrics:[{metricKey:'total',unit:'points',direction:'descriptive'}],executable:{items:[{key:'fixture'}]}},
})
const publish=(suffix:string)=>db.$transaction(tx=>publishContentRelease(tx,fixture(suffix),actor),opts)
/** Holds tx A after `first`, runs `second` in tx B, and reports whether B finished while A was still open. */
async function whileHeld(first:(tx:Prisma.TransactionClient)=>Promise<unknown>,second:(tx:Prisma.TransactionClient)=>Promise<unknown>){
 const held=deferred(),release=deferred()
 const a=db.$transaction(async tx=>{await first(tx);held.resolve();await release.promise},opts)
 await held.promise
 let finishedWhileHeld=false
 const b=db.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3000ms'");return second(tx)},opts).then(v=>{finishedWhileHeld=true;return v})
 await Promise.race([b.catch(()=>{}),sleep(800)])
 const observed=finishedWhileHeld
 release.resolve();await a
 return {observed,result:await b}
}
suite('START release binding on real Postgres',()=>{
 beforeAll(async()=>{
  actor=(await db.user.create({data:{username:prefix,passwordHash:'synthetic-only',accountDomain:'TRAINING',role:'TEACHER'}})).id
 })
 afterAll(async()=>{await db.$disconnect()})

 it('a concurrent RETIRE neither blocks nor is blocked by a START read, and the retired release stays bindable',async()=>{
  const release=await publish('retire')
  // Retire holds the row update; START batch read returns immediately with the committed digest.
  const during=await whileHeld(tx=>transitionContentRelease(tx,{releaseId:release.releaseId,expectedStatus:'PUBLISHED',status:'RETIRED',actorId:actor,reason:'start-binding test'}),
   tx=>getContentReleaseBatch(tx,[release.releaseId],false))
  expect(during.observed).toBe(true)
  const seen=(during.result as Map<string,any>).get(release.releaseId)
  expect(seen.contentHash).toBe(release.contentHash)
  // Replay binds the same digest; status is now RETIRED (START accepts, only REVOKED fails).
  const after=await getContentReleaseBatch(db,[release.releaseId],false)
  expect(after.get(release.releaseId)).toMatchObject({contentHash:release.contentHash,status:'RETIRED'})
 },30000)

 it('START read does not make a RETIRE wait (counterexample: the old FOR SHARE read did)',async()=>{
  const unlocked=await publish('unlocked'),locked=await publish('locked')
  const retire=(id:string)=>(tx:Prisma.TransactionClient)=>transitionContentRelease(tx,{releaseId:id,expectedStatus:'PUBLISHED',status:'RETIRED',actorId:actor,reason:'start-binding test'})
  const now=await whileHeld(tx=>getContentReleaseBatch(tx,[unlocked.releaseId],false),retire(unlocked.releaseId))
  expect(now.observed).toBe(true)
  const old=await whileHeld(tx=>getContentRelease(tx,locked.releaseId,true),retire(locked.releaseId))
  expect(old.observed).toBe(false)
 },30000)

 it('detects persisted content tampering on read (digest re-verified on decode)',async()=>{
  const release=await publish('tamper')
  const rollback=new Error('ROLLBACK_TAMPER_FIXTURE')
  await expect(db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('ALTER TABLE measurement_content_releases DISABLE TRIGGER USER')
   await tx.$executeRaw`UPDATE measurement_content_releases SET content=jsonb_set(content,'{scoringVersion}','"2"') WHERE id=${release.releaseId}`
   await expect(getContentRelease(tx,release.releaseId,false)).rejects.toThrow('CONTENT_RELEASE_HASH_MISMATCH')
   await expect(getContentReleaseBatch(tx,[release.releaseId],false)).rejects.toThrow('CONTENT_RELEASE_HASH_MISMATCH')
   throw rollback
  },opts)).rejects.toThrow('ROLLBACK_TAMPER_FIXTURE')
  expect((await getContentRelease(db,release.releaseId,false))?.contentHash).toBe(release.contentHash)
 },30000)
})
