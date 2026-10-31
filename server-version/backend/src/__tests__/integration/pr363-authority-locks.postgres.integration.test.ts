import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {lockEducationAssessmentUsers} from '../../modules/education-tools/assessment-resource.locks'
import {assertEducationDeliveryIssuerCurrent} from '../../modules/education-tools/assessment-resource.authority'
const url=integrationDatabaseUrl('PR363_AUTHORITY_LOCKS_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,other:PrismaClient
const gate=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done});return {promise,resolve}}
suite('education account authority inverse-order lock fence on real PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});other=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect();await other.$connect()})
 afterAll(async()=>{await db?.$disconnect();await other?.$disconnect()})
 it('rolls back a new-use transaction rather than wait Org -> User against User -> Org lifecycle',async()=>{
  const user=await db.user.create({data:{username:'synthetic-lock-'+randomUUID(),passwordHash:'no-login',accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
  const org=await db.organization.create({data:{id:randomUUID(),name:'Synthetic authority lock only',createdByUserId:user.id,productDomain:'SCHOOL'}})
  const orgHeld=gate(),userHeld=gate(),tryUser=gate()
  const consumer=db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org.id} FOR SHARE`;orgHeld.resolve()
   await tryUser.promise
   await lockEducationAssessmentUsers(tx,[user.id])
   await tx.organization.update({where:{id:org.id},data:{name:'MUST NOT COMMIT'}})
  },{timeout:10000})
  // Attach rejection observation before releasing the competing lock attempt.
  const refused=expect(consumer).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_AUTHORITY_BUSY',statusCode:409})
  await orgHeld.promise
  const lifecycle=other.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id} FOR UPDATE`;userHeld.resolve()
   await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org.id} FOR UPDATE`
   await tx.user.update({where:{id:user.id},data:{isActive:false}})
  },{timeout:10000})
  await userHeld.promise;tryUser.resolve();await refused;await lifecycle
  expect((await db.organization.findUniqueOrThrow({where:{id:org.id}})).name).toBe('Synthetic authority lock only')
  expect((await db.user.findUniqueOrThrow({where:{id:user.id}})).isActive).toBe(false)
  await expect(db.$transaction(tx=>assertEducationDeliveryIssuerCurrent(tx,{proof:{kind:'SYSTEM_ADMIN',actorId:user.id},organizationId:org.id,product:'TEACHER'}))).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_ORIGINAL_ISSUER_REVOKED'})
 })
 it('allows the uncontended original issuer and propagates unrelated database failures',async()=>{
  const user=await db.user.create({data:{username:'synthetic-lock-open-'+randomUUID(),passwordHash:'no-login',accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
  await expect(db.$transaction(tx=>assertEducationDeliveryIssuerCurrent(tx,{proof:{kind:'SYSTEM_ADMIN',actorId:user.id},organizationId:randomUUID(),product:'SCHOOL'}))).resolves.toBeUndefined()
  const broken={$queryRaw:async()=>{throw Object.assign(new Error('synthetic unrelated SQL error'),{code:'P2010',meta:{code:'42P01'}})}}
  await expect(lockEducationAssessmentUsers(broken as never,[user.id])).rejects.toThrow('synthetic unrelated SQL error')
 })
})
