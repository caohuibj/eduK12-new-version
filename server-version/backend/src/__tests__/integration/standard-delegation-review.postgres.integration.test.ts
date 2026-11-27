import {randomUUID} from 'node:crypto'
import {afterAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {grantEducationStandardConfigurationUse} from '../../modules/assessment-authorization/education-standard-use'
import {issueStandardDelegation,readStandardDelegationCoverage} from '../../modules/measurement-content/standard-delegations.service'
import {issueStandardDelegationSuccessor,listStandardDelegationReview,readStandardDelegationReview,
 withdrawStandardDelegationReview} from '../../modules/measurement-content/standard-delegation-review'
import {requireIsolatedReleaseDatabase} from './integration-env'
import {installStudentStandardFixtures} from './studentStandardSource.fixture'
import {approveStandardCombinationEntryPolicies} from '../../modules/assessment-governance/tool-entry-policy'

const suite=process.env.STANDARD_DELEGATION_REVIEW_PG==='1'?describe:describe.skip
suite('exact grant account review and handoff (isolated PostgreSQL)',()=>{
 afterAll(async()=>{vi.restoreAllMocks();await db.$disconnect()})

 it('uses one original grant, verifies impact and successor, and keeps the original configuration immutable',async()=>{
  const url=process.env.DATABASE_URL??''
  requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||!['55434',...(process.env.GITHUB_ACTIONS==='true'?['5432']:[])].includes(new URL(url).port)||new URL(url).pathname!=='/tool_licensing_student_final_test_20261127')
   throw new Error('The seeded isolated Teacher student test database is required')
  const authors=await installStudentStandardFixtures('_'+randomUUID().slice(0,8))
  const source={id:authors.declared.versionId,hash:authors.declared.contentHash}
  await db.$transaction(tx=>approveStandardCombinationEntryPolicies(tx,{resourceKey:'standard-release:'+source.id,
   fingerprint:source.hash},['SURVEY','TEACHER'],authors.system,'Synthetic Teacher approval for handoff'))
  const user=async(domain:'TRAINING'|'SCHOOL',role:'ADMIN'|'TEACHER',platformRole:'STANDARD'|'SYSTEM_ADMIN'='STANDARD')=>
   db.user.create({data:{username:'review_'+randomUUID().replace(/-/g,''),passwordHash:'synthetic-only',
    accountDomain:domain,role,platformRole,teacherApproved:role==='TEACHER'}})
  const [system,incumbent,successor,outsider,business]=await Promise.all([
   user('TRAINING','ADMIN','SYSTEM_ADMIN'),user('TRAINING','ADMIN'),user('TRAINING','ADMIN'),user('TRAINING','ADMIN'),user('SCHOOL','TEACHER'),
  ])
  const school=await db.organization.create({data:{id:randomUUID(),name:'Synthetic transfer '+randomUUID(),
   productDomain:'SCHOOL',createdByUserId:system.id}})
  const scope={product:'TEACHER' as const,organizationId:school.id}
  await db.educationProductEntitlement.create({data:{organizationId:school.id,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:system.id}})
  await db.adminEntryGrant.createMany({data:[incumbent.id,successor.id].map(userId=>({id:randomUUID(),userId,entry:'HUITEACHER',grantedBy:system.id}))})
  const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:school.id,userId:business.id}})
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:school.id,membershipId:member.id,persona:'TEACHER',grantedByUserId:system.id}})
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:school.id,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:system.id}})
  const proof=()=>({tokenVersion:system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'synthetic-handoff-proof',
   adminAuthenticationMethod:'TOTP' as const})
  const cover=await db.$transaction(tx=>readStandardDelegationCoverage(tx,source.id,'TEACHER'))
  const oldId=randomUUID(),validFrom=new Date(Date.now()-60_000).toISOString()
  const expiresAt=new Date(Date.now()+3_600_000).toISOString()
  await issueStandardDelegation(system.id,proof(),source.id,{requestId:oldId,product:'TEACHER',schoolId:school.id,
   adminId:incumbent.id,startsAt:validFrom,expiresAt,reason:'Synthetic original',scope:'COMBINATION',coverageDigest:cover.combinationCoverageDigest})
  const use=(authorityGrantId:string,title:string)=>({requestId:randomUUID(),userId:business.id,combinationHash:source.hash,authorityGrantId,
   expectedAuthorityVersion:1,validFrom,expiresAt,configurationName:title})
  const oldUse=await grantEducationStandardConfigurationUse(incumbent.id,scope,source.id,use(oldId,'原固定配置'))
  const original=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:oldUse.id}})
  const list=await listStandardDelegationReview(system.id,proof(),incumbent.id,{})
  expect(list.list).toEqual([expect.objectContaining({id:oldId,releaseId:source.id,exact:true})])
  const read=()=>readStandardDelegationReview(system.id,proof(),incumbent.id,oldId,{candidateQuery:successor.username})
  await expect(readStandardDelegationReview(system.id,proof(),outsider.id,oldId,{})).rejects.toMatchObject({statusCode:404})
  const initial=await read()
  expect(initial.combinations.map(row=>row.id)).toEqual([source.id])
  expect(initial.affected).toMatchObject({count:1,list:[{id:oldUse.id,title:'原固定配置',label:business.username}]})
  expect(initial.candidates).toMatchObject([{id:successor.id,grantId:null}])
  const input={requestId:randomUUID(),expectedVersion:1,successorId:successor.id,reason:'Synthetic demonstrated transfer'}
  await expect(issueStandardDelegationSuccessor(system.id,proof(),incumbent.id,oldId,{...input,successorId:outsider.id}))
   .rejects.toMatchObject({statusCode:403})
  await expect(issueStandardDelegationSuccessor(system.id,proof(),incumbent.id,oldId,input))
   .resolves.toMatchObject({grantId:input.requestId,changed:true})
  await expect(issueStandardDelegationSuccessor(system.id,proof(),incumbent.id,oldId,input))
   .resolves.toMatchObject({grantId:input.requestId,changed:false})
  const after=await read()
  expect(after.candidates).toMatchObject([{id:successor.id,grantId:input.requestId}])
  const withdraw={expectedVersion:1,impactDigest:after.affected.digest,successorGrantId:input.requestId,reason:'Synthetic checked old roots'}
  await expect(withdrawStandardDelegationReview(system.id,proof(),incumbent.id,oldId,{...withdraw,impactDigest:'0'.repeat(64)}))
   .rejects.toMatchObject({statusCode:409})
  await expect(withdrawStandardDelegationReview(system.id,proof(),incumbent.id,oldId,{...withdraw,successorGrantId:oldId}))
   .rejects.toMatchObject({statusCode:409})
  const continuation={...withdraw,continueIds:[oldUse.id]}
  await expect(withdrawStandardDelegationReview(system.id,proof(),incumbent.id,oldId,continuation))
   .rejects.toMatchObject({statusCode:409})
  await grantEducationStandardConfigurationUse(successor.id,scope,source.id,use(input.requestId,'接任人重新签发配置'))
  const reviewed=await readStandardDelegationReview(system.id,proof(),incumbent.id,oldId,{successorGrantId:input.requestId})
  expect(reviewed.affected.list).toMatchObject([{id:oldUse.id,reissued:true}])
  await expect(withdrawStandardDelegationReview(system.id,proof(),incumbent.id,oldId,continuation))
   .resolves.toMatchObject({changed:true,version:2})
  expect((await read()).grant.status).toBe('REVOKED')
  expect(await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:oldUse.id}})).toEqual(original)
 },45_000)
})
