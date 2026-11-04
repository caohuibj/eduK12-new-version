import {randomUUID,createHash} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
const hex=(v:string)=>createHash('sha256').update(v).digest('hex')
let db:PrismaClient,owner:string
const unit=(itemId:string)=>({itemId,family:'SCALE',source:{kind:'SCALE',id:'s-'+itemId,ownerId:'o'},measurement:{releaseId:randomUUID(),contentHash:hex(itemId),measurementHash:hex('m'+itemId)}})
async function publication(units:any[]){
  const c=await db.compositeAssessment.create({data:{code:randomUUID(),name:'Guard publication',createdBy:owner,status:'PUBLISHED'}})
  const snapshot={schemaVersion:1,compositeId:c.id,units},hash=hex(JSON.stringify(snapshot))
  await db.$executeRaw`UPDATE composite_assessments SET training_content_snapshot=${JSON.stringify(snapshot)}::jsonb,training_content_snapshot_hash=${hash} WHERE id=${c.id}`
  return {id:c.id,hash,units}
}
async function attempt(pub:{id:string;hash:string},units:any[],epoch=1,publicationHash=pub.hash){
  const id=randomUUID(),binding={schemaVersion:1,compositeId:pub.id,attemptId:id,epoch,publicationHash,units}
  await db.$executeRaw`INSERT INTO composite_assessment_attempts(id,composite_assessment_id,user_id,participant_key,status,progress,completed_items,attempt_epoch,training_content_binding,training_content_binding_hash)
    VALUES (${id},${pub.id},${owner},${'guard-'+id},'IN_PROGRESS',0,0,${epoch},${JSON.stringify(binding)}::jsonb,${hex(JSON.stringify(binding))})`
  return id
}
suite('training_content_attempt_guard narrowed to binding/identity columns / real isolated PostgreSQL',()=>{
  let a:{id:string;hash:string;units:any[]},b:{id:string;hash:string;units:any[]}
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
    owner=(await db.user.create({data:{username:'guard'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER'}})).id
    a=await publication([unit('i1'),unit('i2')]);b=await publication([unit('i1'),unit('i2')])
  })
  afterAll(async()=>{await db?.$disconnect()})
  it('is declared only for INSERT and UPDATE OF the binding and identity columns',async()=>{
    const [row]=await db.$queryRaw<Array<{def:string}>>`SELECT pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgname='training_content_attempt_guard'`
    expect(row.def).toMatch(/BEFORE INSERT OR UPDATE OF training_content_binding, training_content_binding_hash, id, composite_assessment_id, attempt_epoch ON/)
  })
  it('INSERT still rejects a wrong publication hash, a foreign unit and duplicate items',async()=>{
    await expect(attempt(a,[a.units[0]],1,b.hash)).rejects.toThrow(/publication mismatch/)
    await expect(attempt(a,[unit('foreign')])).rejects.toThrow(/not in its frozen publication/)
    await expect(attempt(a,[a.units[0],a.units[0]])).rejects.toThrow(/duplicate/)
  })
  it('hot progress UPDATEs succeed without touching the binding',async()=>{
    const id=await attempt(a,[a.units[0]])
    await db.$executeRaw`UPDATE composite_assessment_attempts SET progress=50,completed_items=1 WHERE id=${id}`
    const [row]=await db.$queryRaw<any[]>`SELECT progress FROM composite_assessment_attempts WHERE id=${id}`
    expect(row.progress).toBe(50)
  })
  it('binding rewrites, cross-publication swaps and identity changes are still rejected',async()=>{
    const id=await attempt(a,[a.units[0]])
    await expect(db.$executeRaw`UPDATE composite_assessment_attempts SET training_content_binding_hash=${hex('other')} WHERE id=${id}`).rejects.toThrow(/binding is immutable/)
    await expect(db.$executeRaw`UPDATE composite_assessment_attempts SET training_content_binding=NULL,training_content_binding_hash=NULL WHERE id=${id}`).rejects.toThrow(/binding is immutable/)
    await expect(db.$executeRaw`UPDATE composite_assessment_attempts SET composite_assessment_id=${b.id} WHERE id=${id}`).rejects.toThrow(/new attempt identity/)
    await expect(db.$executeRaw`UPDATE composite_assessment_attempts SET attempt_epoch=attempt_epoch+1 WHERE id=${id}`).rejects.toThrow(/new attempt identity/)
    await expect(db.$executeRaw`UPDATE composite_assessment_attempts SET id=${randomUUID()} WHERE id=${id}`).rejects.toThrow(/new attempt identity/)
    // A swap combined with a hot column is still a write of the identity column.
    await expect(db.$executeRaw`UPDATE composite_assessment_attempts SET progress=10,composite_assessment_id=${b.id} WHERE id=${id}`).rejects.toThrow(/new attempt identity/)
    const [row]=await db.$queryRaw<any[]>`SELECT composite_assessment_id,attempt_epoch FROM composite_assessment_attempts WHERE id=${id}`
    expect(row).toMatchObject({composite_assessment_id:a.id,attempt_epoch:1})
  })
  it('a legacy null binding still cannot be filled in later',async()=>{
    const id=randomUUID()
    await db.$executeRaw`INSERT INTO composite_assessment_attempts(id,composite_assessment_id,user_id,participant_key,status,progress,completed_items,attempt_epoch)
      VALUES (${id},${a.id},${owner},${'legacy-'+id},'IN_PROGRESS',0,0,1)`
    const binding={schemaVersion:1,compositeId:a.id,attemptId:id,epoch:1,publicationHash:a.hash,units:[a.units[0]]}
    await expect(db.$executeRaw`UPDATE composite_assessment_attempts SET training_content_binding=${JSON.stringify(binding)}::jsonb,training_content_binding_hash=${hex('x')} WHERE id=${id}`).rejects.toThrow(/binding is immutable/)
  })
})
