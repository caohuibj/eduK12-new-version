/** Read-only qualification over the original retained eight-actor fixture. */
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_MANAGER_READ==='1'?describe:describe.skip
suite('education exact management source and canonical recipients, retained PostgreSQL',()=>{
 let db:any,teacher:any,school:any,source:any,management:any,uses:any[],system:any
 const scope=(product:'SCHOOL'|'TEACHER')=>({product,organizationId:teacher.scopeId})
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Original isolated fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated known fixture required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==5)throw Error('Inspect retained outcomes before continuation')
  uses=await db.contentCapabilityGrant.findMany({where:{capabilities:{equals:['material.use']}}})
  teacher=uses.find((use:any)=>use.product==='TEACHER');school=uses.find((use:any)=>use.product==='SCHOOL')
  source=(await import('../../modules/education-tools/public-source.identity')).parseEducationPublicSourceKey(teacher.resourceKeys[0])!
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  management=await import('../../modules/assessment-authorization/education-standard-management')
 },30000)
 afterAll(async()=>{if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it('shows an assignable exact Teacher configuration but keeps historical School use read-only after original delegation withdrawal',async()=>{
  const current=await management.educationStandardManagementCatalog(teacher.issuerId,scope('TEACHER'),{})
  expect(current.list).toHaveLength(1);expect(current.list[0]).toMatchObject({id:source.id,combinationHash:source.hash,assignable:true})
  expect(current.list[0].authorities).toHaveLength(1)
  const withdrawn=await management.educationStandardManagementCatalog(school.issuerId,scope('SCHOOL'),{})
  expect(withdrawn.list).toHaveLength(1);expect(withdrawn.list[0]).toMatchObject({id:source.id,assignable:false,authorities:[]})
  expect(JSON.stringify(current)).not.toMatch(/"definition"|"snapshot"|"scoring"|"answers"/)
 })
 it('requires the independent matching manager entry, exact school and source authority for preview or recipients',async()=>{
  await expect(management.educationStandardManagementCatalog(system.id,scope('TEACHER'),{})).rejects.toMatchObject({statusCode:403})
  await expect(management.educationStandardManagementCatalog(teacher.issuerId,scope('SCHOOL'),{})).rejects.toMatchObject({statusCode:403})
  await expect(management.educationStandardManagementPreview(school.issuerId,scope('SCHOOL'),source.id,source.hash)).rejects.toMatchObject({statusCode:403})
  const other=await db.organization.findFirstOrThrow({where:{id:{not:teacher.scopeId}}})
  await expect(management.educationStandardManagementRecipients(teacher.issuerId,{product:'TEACHER',organizationId:other.id},source.id,source.hash,{})).rejects.toMatchObject({statusCode:403})
  expect(await management.educationStandardManagementPreview(teacher.issuerId,scope('TEACHER'),source.id,source.hash)).toMatchObject({previewOnly:true,report:{reportVersion:expect.any(String)}})
 })
 it('lists only this school current Teacher productAdmin in one canonical qualified batch and preserves single-actor qualification',async()=>{
  const result=await management.educationStandardManagementRecipients(teacher.issuerId,scope('TEACHER'),source.id,source.hash,{})
  expect(result.list.map((row:any)=>row.userId)).toEqual([teacher.subjectId])
  const {listEducationAuthoringMemberCandidates,resolveEducationProductMemberScope}=await import('../../modules/organization/educationProductAccess')
  const psychologists=await listEducationAuthoringMemberCandidates({product:'HUISCHOOL',organizationId:teacher.scopeId,page:1,q:''},db)
  expect(psychologists.list.map(row=>row.userId)).toEqual([school.subjectId])
  expect(await resolveEducationProductMemberScope({actorUserId:'',product:'HUITEACHER',organizationId:teacher.scopeId},db)).toBeNull()
  const {resolveEducationToolAuthoringContext}=await import('../../modules/education-tools/access')
  for(const [entry,use]of [['SCHOOL',school],['TEACHER',teacher]] as const)
   expect(await resolveEducationToolAuthoringContext({entry,organizationId:teacher.scopeId,principal:{userId:use.subjectId,accountDomain:'SCHOOL'}},db)).not.toBeNull()
  expect((await management.educationStandardManagementRecipients(teacher.issuerId,scope('TEACHER'),source.id,source.hash,{page:2})).list).toEqual([])
 })
 it('reads only the original issuer exact school/source grants for reconciliation without requiring their withdrawn distribution root',async()=>{
  const t=await management.educationStandardManagementGrants(teacher.issuerId,scope('TEACHER'),source.id,{userId:teacher.subjectId})
  expect(t.list).toHaveLength(1);expect(t.list[0].selectedBinding.authorizationId).toBe(teacher.id)
  const s=await management.educationStandardManagementGrants(school.issuerId,scope('SCHOOL'),source.id,{userId:school.subjectId})
  expect(s.list).toHaveLength(2);expect(s.list.every((row:any)=>row.canManage)).toBe(true)
  expect((await management.educationStandardManagementGrants(teacher.issuerId,scope('TEACHER'),source.id,{userId:school.subjectId})).list).toEqual([])
  expect(await db.user.count()).toBe(8);expect(await db.contentCapabilityGrant.count()).toBe(5)
 })
})
