import {randomUUID} from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {Prisma,PrismaClient,UserRole} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
const binding=vi.hoisted(()=>({db:undefined as unknown as PrismaClient}))
vi.mock('../../config/database',()=>({prisma:new Proxy({},{get(_target,key){const value=(binding.db as any)[key];return typeof value==='function'?value.bind(binding.db):value}})}))
vi.mock('../../config/queue',()=>({exportQueue:{},videoQueue:{},imageQueue:{}}))
import * as questionnaire from '../../modules/questionnaire-product/service'
import {startUserAttempt} from '../../modules/composite/composite.service'
import {getContentRelease} from '../../modules/measurement-content/repository'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'

const suite=process.env.MEASUREMENT_V10_FIXTURE==='1'?describe:describe.skip
const state=process.env.MEASUREMENT_V10_STATE||'/workspace/scratch/5a77e8bdc1ae/measurement-v10-connected-20261020-0717'
const checkpoint=path.join(state,'private-reference-expiry-checkpoint.json')
let db:PrismaClient,owner:PrismaClient,holder:PrismaClient,base:any,formal:any
suite('private reference fresh START expiry after a later release lock',()=>{
 beforeAll(async()=>{
  if(process.env.NODE_ENV!=='test'||!/^[a-f0-9]{40}$/.test(process.env.MEASUREMENT_V10_HEAD||''))throw new Error('Exact isolated invocation required')
  if(!state.startsWith('/workspace/scratch/5a77e8bdc1ae/measurement-v10-connected-'))throw new Error('Dedicated fixture state required')
  const runtime=new URL(process.env.MEASUREMENT_V10_RUNTIME_DATABASE_URL||''),admin=new URL(process.env.MEASUREMENT_V10_OWNER_DATABASE_URL||'')
  if(runtime.hostname!=='127.0.0.1'||runtime.port!=='39403'||runtime.pathname!=='/eduk12_measurement_v10_test'
   ||admin.hostname!==runtime.hostname||admin.port!==runtime.port||admin.pathname!==runtime.pathname||admin.username!=='v10_owner'
   ||!/^v10_runtime_[a-f0-9]{8}$/.test(runtime.username)||process.env.DATABASE_URL!==runtime.href)throw new Error('Dedicated synthetic runtime required')
  runtime.searchParams.set('connection_limit','1');admin.searchParams.set('connection_limit','1')
  db=new PrismaClient({datasources:{db:{url:runtime.href}}});binding.db=db
  holder=new PrismaClient({datasources:{db:{url:runtime.href}}});owner=new PrismaClient({datasources:{db:{url:admin.href}}})
  base=JSON.parse(fs.readFileSync(path.join(state,'training-fixture-private.json'),'utf8'))
  formal=JSON.parse(fs.readFileSync(path.join(state,'formal-reference-fixture-private.json'),'utf8'))
  expect(base.label).toContain('SYNTHETIC');expect(base.teacher.username).toMatch(/^v10-/)
  if(fs.existsSync(checkpoint)&&!JSON.parse(fs.readFileSync(checkpoint,'utf8')).restored)throw new Error('Unrestored expiry checkpoint requires supervisor reconciliation')
  await db.$connect()
 })
 afterAll(async()=>{await holder?.$disconnect();await db?.$disconnect();await owner?.$disconnect()})
 it('rejects at the final database clock fence and rolls back parent, binding and children',async()=>{
  const actor={userId:base.teacher.id,role:UserRole.TEACHER}
  let product:any=await questionnaire.create(actor,{requestId:randomUUID(),name:'V10 SYNTHETIC private reference late expiry',questionnaireType:'COURSE',courseIds:[base.courseId],publicEnabled:false})
  product=await questionnaire.addItem(actor,product.id,{revision:product.revision,item:{type:'SCALE',scaleId:base.scaleId,required:true}})
  const a=await getContentRelease(db as never,base.reference.releaseId),b=await getContentRelease(db as never,formal.release.releaseId)
  expect(a?.layer).toBe('REFERENCE');expect(b?.layer).toBe('REFERENCE')
  if(!a||a.layer!=='REFERENCE'||!b||b.layer!=='REFERENCE')throw new Error('Published reference fixtures required')
  expect(a.status).toBe('PUBLISHED');expect(b.status).toBe('PUBLISHED')
  product=await questionnaire.updateContentReferenceSelection(actor,product.id,{revision:product.revision,selection:{schemaVersion:1,units:[{itemId:product.items[0].id,choices:[
   {releaseId:a.releaseId,entryKey:referenceEntryKey(a.content.entries[0].definition as any),priority:1},
   {releaseId:b.releaseId,entryKey:referenceEntryKey(b.content.entries[0].definition as any),priority:0}]}]}})
  product=await questionnaire.publish(actor,product.id,{revision:product.revision})
  const publication=await db.compositeAssessment.findUniqueOrThrow({where:{id:product.id},select:{trainingContentSnapshot:true}})
  expect((publication.trainingContentSnapshot as any).units[0].referencePolicy.choices.map((c:any)=>c.releaseId)).toEqual([a.releaseId,b.releaseId])
  await owner.$connect()
  const principal=await owner.user.findUniqueOrThrow({where:{id:base.teacher.id},select:{expiresAt:true,username:true}})
  expect(principal.username).toBe(base.teacher.username)
  const receipt:any={label:'SYNTHETIC expiry-only mutation',ownerId:base.teacher.id,originalExpiresAt:principal.expiresAt?.toISOString()??null,productId:product.id,restored:false,outcome:'PENDING'}
  const save=()=>fs.writeFileSync(checkpoint,JSON.stringify(receipt,null,2),{mode:0o600})
  save()
  let pending:Promise<{ok:boolean;error?:unknown}>|undefined
  try{
   await owner.$executeRaw`UPDATE users SET expires_at=clock_timestamp()+interval '3500 milliseconds' WHERE id=${base.teacher.id}`
   await owner.$disconnect();await holder.$connect()
   await holder.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM measurement_content_releases WHERE id=${b.releaseId} FOR UPDATE`
    pending=startUserAttempt(base.students[0].id,product.id).then(()=>({ok:true}),error=>({ok:false,error}))
    let waiting=false
    const deadline=Date.now()+2200
    while(Date.now()<deadline){
     const [row]=await tx.$queryRaw<Array<{waiting:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid()=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock') AS waiting`
     if(row.waiting){waiting=true;break}
     await new Promise(resolve=>setTimeout(resolve,25))
    }
    expect(waiting).toBe(true);receipt.observedLaterReferenceLock=true;save()
    const [clock]=await tx.$queryRaw<Array<{wait_ms:number}>>`SELECT GREATEST(0,EXTRACT(EPOCH FROM (expires_at-clock_timestamp()))*1000)::float8+100 AS wait_ms FROM users WHERE id=${base.teacher.id}`
    expect(clock.wait_ms).toBeGreaterThan(100);expect(clock.wait_ms).toBeLessThan(3600)
    await tx.$executeRaw(Prisma.sql`SELECT pg_sleep(${clock.wait_ms/1000})`)
   },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,timeout:6500})
   const result=await pending!;receipt.outcome=result.ok?'UNEXPECTED_ADMISSION':String(result.error);save()
   expect(result.ok).toBe(false);expect(String(result.error)).toContain('CONTENT_TRAINING_REFERENCE_SCOPE_DENIED')
   expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:product.id}})).toBe(0)
   expect(await db.assessment.count({where:{compositeItemId:product.items[0].id}})).toBe(0)
   receipt.rollbackVerified=true;save()
  }finally{
   // Never restore while the admission still owns the principal's SHARE lock.
   if(pending)await pending
   await holder.$disconnect();await owner.$connect()
   await owner.user.update({where:{id:base.teacher.id},data:{expiresAt:principal.expiresAt}})
   expect((await owner.user.findUniqueOrThrow({where:{id:base.teacher.id},select:{expiresAt:true}})).expiresAt).toEqual(principal.expiresAt)
   receipt.restored=true;save();await owner.$disconnect()
  }
 },20000)
})
