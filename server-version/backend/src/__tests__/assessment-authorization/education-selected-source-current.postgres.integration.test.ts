/** Read-only assertions against the completed, retained selected-source fixture. */
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_SELECTED_SOURCE_CURRENT==='1'?describe:describe.skip
suite('education selected use current boundaries, retained PostgreSQL',()=>{
 let db:any,c:any,active:any,revoked:any,activePin:any,oldPin:any,read:any
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Retained exact binding fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_binding_test_20261029_v2'||new URL(url).port!=='55439')throw Error('Dedicated known fixture required')
  db=(await import('../../config/database')).prisma
  const uses=await db.contentCapabilityGrant.findMany({where:{product:'TEACHER',capabilities:{equals:['material.use']}}})
  expect(uses).toHaveLength(2);active=uses.find((value:any)=>!value.revokedAt);revoked=uses.find((value:any)=>value.revokedAt)
  expect(active).toBeTruthy();expect(revoked).toBeTruthy()
  c={entry:'TEACHER',organizationId:active.scopeId,principal:{userId:active.subjectId,accountDomain:'SCHOOL'}}
  const {selectedConfigurationPointer}=await import('../../modules/assessment-authorization/standard-configuration-binding')
  activePin=selectedConfigurationPointer((await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:active.id}})).metadata.selectedBinding)
  oldPin=selectedConfigurationPointer((await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:revoked.id}})).metadata.selectedBinding)
  read=(await import('../../modules/education-tools/public-source.catalog')).readEducationPublicUse
 },30000)
 afterAll(async()=>{if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it('keeps discovery readable but cannot consume a new typed grant through a pinless legacy draft',async()=>{
  const result=await db.$transaction(async(tx:any)=>({discovery:await read(tx,c,active.resourceKeys,true),legacy:await read(tx,c,active.resourceKeys,true,new Map(),true)}))
  expect(result.discovery.size).toBe(1);expect(result.legacy.size).toBe(0)
 })
 it('accepts only the original active exact revision and refuses the revoked or forged alternatives',async()=>{
  for(const [pins,expected]of [[[activePin],1],[[oldPin],0],[[{...activePin,bindingHash:'f'.repeat(64)}],0],
   [[{...activePin,authorizationRevision:2}],0],[[oldPin,activePin],0]] as const){
   const found=await db.$transaction((tx:any)=>read(tx,c,active.resourceKeys,true,new Map([[active.resourceKeys[0],pins]]),true))
   expect(found.size).toBe(expected)
  }
 })
 it('the real compiler cannot seal a pinless block using only the new typed use, before reading executable bodies',async()=>{
  const row=await db.educationPrivateToolVersion.findFirstOrThrow({where:{ownerUserId:active.subjectId}})
  const definition=structuredClone(row.definition);delete definition.blocks[0].source.selectedBinding
  const {compilePrivateComposition}=await import('../../modules/education-tools/private-tool.composition-compiler')
  await expect(db.$transaction((tx:any)=>compilePrivateComposition(tx,c,definition))).rejects.toMatchObject({code:'PUBLIC_SOURCE_USE_REQUIRED'})
 })
})
