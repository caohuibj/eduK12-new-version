import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_SELECTED_CATALOG_CLOCK==='1'?describe:describe.skip
suite('exact education catalog grant interval across non-UTC hosts',()=>{
 let db:any
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit dedicated clock fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_catalog_clock_test_20261029'||new URL(url).port!=='55439'||process.env.TZ!=='Asia/Shanghai')throw Error('Dedicated non-UTC fixture required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==5)throw Error('Inspect previous outcomes before retry')
 },30000)
 afterAll(async()=>{if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it('keeps a ten-minute exact use visible without interpreting UTC database timestamps as local clock time',async()=>{
  expect(new Date().getTimezoneOffset()).toBe(-480)
  const use=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'TEACHER',capabilities:{equals:['material.use']}}})
  const root=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'TEACHER',capabilities:{equals:['material.distribute']}}})
  const source=(await import('../../modules/education-tools/public-source.identity')).parseEducationPublicSourceKey(use.resourceKeys[0])!
  const {grantEducationStandardConfigurationUse}=await import('../../modules/assessment-authorization/education-standard-use')
  const granted=await grantEducationStandardConfigurationUse(use.issuerId,{product:'TEACHER',organizationId:use.scopeId},source.id,
   {requestId:randomUUID(),userId:use.subjectId,combinationHash:source.hash,authorityGrantId:root.id,expectedAuthorityVersion:1,
    validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),configurationName:'合成时区可携带配置'})
  const page=await (await import('../../modules/education-tools/public-source.catalog')).listEducationPublicSources({entry:'TEACHER',organizationId:use.scopeId,
   principal:{userId:use.subjectId,accountDomain:'SCHOOL'}},{kind:'SCALE'})
  expect(page.list.find(row=>row.selectedBinding?.authorizationId===granted.id)).toMatchObject({configurationName:'合成时区可携带配置',allowedActions:['REFERENCE_FIXED_VERSION']})
 },30000)
})
