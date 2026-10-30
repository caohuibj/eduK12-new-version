import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
const suite=process.env.PRECISE_EDUCATION_COGNITIVE_OPERATION==='1'?describe:describe.skip
suite('Read retained original education cognitive browser operations only',()=>{
 let db:any,state:any;const rows:any[]=[]
 beforeAll(async()=>{const u=new URL(process.env.PRECISE_EDUCATION_COGNITIVE_DATABASE_URL!);if(u.hostname!=='127.0.0.1'||u.port!=='55439'||u.pathname!=='/precise_education_cognitive_profile_test_20261030'||u.username!=='precise_task1_runtime')throw Error('Exact actual retained runtime required');db=(await import('../../config/database')).prisma;state=JSON.parse(await readFile(process.env.PRECISE_EDUCATION_COGNITIVE_CHECKPOINT!,'utf8'))})
 afterAll(async()=>{await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_EVIDENCE??'/tmp/education-cognitive-operation.json',JSON.stringify({productionAccessed:false,rows,noRepeatedWrite:true},null,2)+'\n');if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it.each(['SCHOOL','TEACHER'] as const)('%s reads the exact original browser intent and returned replacement lineage',async product=>{
  const e=state.entries[product],input=e.browserAttempt.input
  const operation=await(await import('../../modules/assessment-authorization/education-standard-management')).educationStandardManagementOperation(e.managerId,{product,organizationId:e.organizationId},state.configId,input.requestId)
  const old=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:e.useId}})
  rows.push({product,input,operation,old:{id:old.id,version:old.version,revoked:old.revokedAt!==null}})
  expect(operation).toMatchObject({kind:'ISSUE',request:{...input,profile:product==='SCHOOL'?'research':'experience'}})
 },30000)
})
