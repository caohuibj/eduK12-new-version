import {randomUUID,createHash} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {scaleReferencedByPublishedContent} from '../../modules/scale/onboarding/materialize'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
const hex=(v:string)=>createHash('sha256').update(v).digest('hex')
let db:PrismaClient,owner:string
async function scale(){
  return (await db.scale.create({data:{code:'guard-'+randomUUID().slice(0,8),name:'Guard scale',status:'PUBLISHED',instrumentClass:'STANDARD',instrumentVersion:'1.0.0',
    definition:{v:1} as any,definitionHash:hex('d1'),instruction:'old',creatorId:owner}})).id
}
async function composite(scaleId:string,publish:boolean){
  const c=await db.compositeAssessment.create({data:{code:randomUUID(),name:'Guard composite',createdBy:owner,status:publish?'PUBLISHED':'DRAFT'}})
  await db.compositeAssessmentItem.create({data:{compositeAssessmentId:c.id,type:'SCALE',scaleId,position:0} as any})
  if(publish){const snapshot={schemaVersion:1,compositeId:c.id,units:[]}
    await db.$executeRaw`UPDATE composite_assessments SET training_content_snapshot=${JSON.stringify(snapshot)}::jsonb,training_content_snapshot_hash=${hex(JSON.stringify(snapshot))} WHERE id=${c.id}`}
}
suite('scale_published_reference_immutable / real isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
    owner=(await db.user.create({data:{username:'sguard'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER'}})).id
  })
  afterAll(async()=>{await db?.$disconnect()})
  it('rejects in-place definition, hash, instruction and identity edits of a scale frozen by published Training',async()=>{
    const id=await scale();await composite(id,true)
    expect(await scaleReferencedByPublishedContent(db,id)).toBe(true)
    for(const data of [{definition:{v:2}},{definitionHash:hex('d2')},{instruction:'new'},{instrumentVersion:'1.0.1'},{code:'renamed-'+randomUUID().slice(0,8)}])
      await expect(db.scale.update({where:{id},data:data as any})).rejects.toThrow(/SCALE_DEFINITION_REFERENCED/)
    // Same-value writes and lifecycle/presentation-neutral columns stay allowed.
    await db.$executeRaw`UPDATE scales SET instruction=instruction, definition=definition WHERE id=${id}`
    await db.scale.update({where:{id},data:{status:'DEPRECATED',tags:['x']}})
    const row=await db.scale.findUniqueOrThrow({where:{id}})
    expect(row).toMatchObject({instruction:'old',definitionHash:hex('d1'),status:'DEPRECATED'})
  })
  it('leaves scales referenced only by unpublished drafts (or not at all) editable',async()=>{
    const draft=await scale();await composite(draft,false)
    const free=await scale()
    expect(await scaleReferencedByPublishedContent(db,draft)).toBe(false)
    await db.scale.update({where:{id:draft},data:{definition:{v:2} as any,instruction:'new'}})
    await db.scale.update({where:{id:free},data:{definitionHash:hex('d3')}})
  })
})
