import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import example from '../../modules/situational/authoring/examples/teacher-demonstration.json'
import {compileSjtAuthorDocument} from '../../modules/situational/authoring/dispatcher'
import {forkSjtDraftVersion} from '../../modules/situational/authoring/service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,owner:string,reviewer:string
async function published(instrumentKey:string,version='1.0.0'){
 const compiled=compileSjtAuthorDocument({...example,instrumentKey,instrumentVersion:version})
 const draft=await db.sjtAuthorDraft.create({data:{ownerId:owner,status:'PUBLISHED',template:compiled.template as unknown as Prisma.InputJsonValue,contentDigest:compiled.contentDigest}})
 const release=await db.sjtAuthorRelease.create({data:{instrumentKey,instrumentVersion:version,sourceDraftId:draft.id,authorId:owner,reviewerId:reviewer,
  contentDigest:compiled.contentDigest,definitionHash:compiled.definitionHash,package:{...compiled.package,releaseStatus:'PUBLISHED'} as unknown as Prisma.InputJsonValue}})
 return {draft,release}
}
suite('SJT update-version allocation / real isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  owner=(await db.user.create({data:{username:randomUUID(),passwordHash:'synthetic-only',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})).id
  reviewer=(await db.user.create({data:{username:randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',accountDomain:'TRAINING'}})).id
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('serializes simultaneous forks into separate unused versions without modifying their published source',async()=>{
  const key='workspace-parallel-'+randomUUID(),source=await published(key),sibling=await published(key,'1.0.1')
  const copies=await Promise.all([forkSjtDraftVersion({userId:owner,admin:false},source.draft.id),forkSjtDraftVersion({userId:owner,admin:false},sibling.draft.id)])
  expect(new Set(copies.map(row=>row.id)).size).toBe(2)
  expect(copies.map(row=>(row.template as {instrumentVersion:string}).instrumentVersion).sort()).toEqual(['1.0.2','1.0.3'])
  expect(copies.every(row=>row.status==='DRAFT')).toBe(true)
  expect(await db.sjtAuthorDraft.findUnique({where:{id:source.draft.id}})).toEqual(source.draft)
  expect(await db.sjtAuthorRelease.findUnique({where:{id:source.release.id}})).toEqual(source.release)
  expect(await db.sjtAuthorDraft.findUnique({where:{id:sibling.draft.id}})).toEqual(sibling.draft)
 },30000)
 it('forking an old source skips existing drafts and published versions, including retired release identities',async()=>{
  const key='workspace-old-source-'+randomUUID(),source=await published(key),newer=await published(key,'1.0.3')
  await db.sjtAuthorRelease.update({where:{id:newer.release.id},data:{status:'RETIRED'}})
  const first=await forkSjtDraftVersion({userId:owner,admin:false},source.draft.id)
  expect((first.template as {instrumentVersion:string}).instrumentVersion).toBe('1.0.4')
  const next=await forkSjtDraftVersion({userId:owner,admin:false},source.draft.id)
  expect((next.template as {instrumentVersion:string}).instrumentVersion).toBe('1.0.5')
  expect(await db.sjtAuthorDraft.findUnique({where:{id:source.draft.id}})).toEqual(source.draft)
  expect(await db.sjtAuthorRelease.count({where:{instrumentKey:key}})).toBe(2)
  expect(await db.sjtAuthorAudit.count({where:{draftId:{in:[first.id,next.id]},action:'VERSION_COPY'}})).toBe(2)
 },30000)
})
