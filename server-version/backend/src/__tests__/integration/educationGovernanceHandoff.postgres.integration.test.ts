import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { assignStaffToClass, endStaffClassAssignment } from '../../modules/organization/classRelationships'
import {
  grantEducationProductAdmin, listEducationProductAdmins, listEducationProductAdminCandidates,
  revokeEducationProductAdmin, searchEducationGovernanceSchools,
} from '../../modules/organization/educationProductGovernance'
import { educationStandardManagementGrants, educationStandardManagementOperation } from '../../modules/assessment-authorization/education-standard-management'
import { revokeEducationStandardConfigurationUse } from '../../modules/assessment-authorization/education-standard-revoke'
import { EDUCATION_STANDARD_USE_ACTION } from '../../modules/assessment-authorization/education-standard-use'
import { sealSelectedConfigurationBinding } from '../../modules/assessment-authorization/selected-configuration'
import { educationPublicSourceKey } from '../../modules/education-tools/public-source.identity'
import { grantSyntheticHuischoolProduct } from './educationProductFixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const hash = 'a'.repeat(64)

async function createSchool() {
  const makeUser = (accountDomain: 'SCHOOL' | 'TRAINING') => prisma.user.create({
    data: { username: 'edu-handoff-'+randomUUID(), passwordHash: 'synthetic-only', accountDomain, role: 'TEACHER', teacherApproved: true },
  })
  const [previous, successor, teacher, entry, issuer] = await Promise.all([
    makeUser('SCHOOL'), makeUser('SCHOOL'), makeUser('SCHOOL'), makeUser('TRAINING'), makeUser('TRAINING'),
  ])
  const organizationId = randomUUID()
  const scope = { product: 'SCHOOL' as const, organizationId }
  await prisma.organization.create({ data: {
    id: organizationId, name: 'isolated handoff '+organizationId, productDomain: 'SCHOOL', createdByUserId: entry.id,
  } })
  const addMember = (userId: string, orgRole: 'ORG_ADMIN' | 'MEMBER') => prisma.organizationMembership.create({
    data: { id: randomUUID(), organizationId, userId, orgRole },
  })
  const [previousM, successorM, teacherM] = await Promise.all([
    addMember(previous.id,'ORG_ADMIN'), addMember(successor.id,'ORG_ADMIN'), addMember(teacher.id,'MEMBER'),
  ])
  await grantSyntheticHuischoolProduct(prisma, { organizationId, adminUserId: previous.id, adminMembershipId: previousM.id })
  await prisma.adminEntryGrant.createMany({ data: [entry.id,issuer.id].map(userId => ({
    id: randomUUID(), userId, entry: 'HUISCHOOL', grantedBy: entry.id,
  })) })
  return { scope, organizationId, previous, successor, teacher, entry, issuer, previousM, successorM, teacherM }
}

suite('education roster and administrator handoff on isolated PostgreSQL', () => {
  beforeAll(() => requireIsolatedReleaseDatabase(url!))
  afterAll(() => prisma.$disconnect())

  it('counts only working School administrators and allows succession after enrollment', async () => {
    const f = await createSchool()
    const input = { actorUserId:f.entry.id, organizationId:f.organizationId, product:'HUISCHOOL' as const }
    const enable = (userId: string) => prisma.campusMfaCredential.create({
      data: { userId, secretCipher:'synthetic-only', enabled:true, lastUsedStep:1n },
    })
    await enable(f.previous.id)
    const old = await prisma.educationProductRoleGrant.findFirstOrThrow({ where: { membershipId:f.previousM.id } })
    const next = await grantEducationProductAdmin({ ...input, membershipId:f.successorM.id })
    expect(await searchEducationGovernanceSchools(f.entry.id,{q:f.organizationId,page:1})).toMatchObject({list:[{id:f.organizationId}]})
    expect(await listEducationProductAdminCandidates(f.entry.id,f.organizationId,'HUISCHOOL',{q:f.successor.username,page:1}))
      .toMatchObject({list:[{membershipId:f.successorM.id,ready:false}]})
    expect(await listEducationProductAdmins(f.entry.id,f.organizationId,'HUISCHOOL')).toMatchObject({
      effectiveCount:1,list:[{grantId:old.id,effective:true},{grantId:next.grantId,effective:false}],
    })
    await expect(revokeEducationProductAdmin({ ...input, grantId:old.id })).rejects.toMatchObject({code:'EDUCATION_LAST_ADMIN'})
    await enable(f.successor.id)
    await prisma.user.update({where:{id:f.successor.id},data:{expiresAt:new Date(0)}})
    await expect(revokeEducationProductAdmin({ ...input, grantId:old.id })).rejects.toMatchObject({code:'EDUCATION_LAST_ADMIN'})
    await prisma.user.update({where:{id:f.successor.id},data:{expiresAt:null}})
    await expect(revokeEducationProductAdmin({ ...input, grantId:old.id })).resolves.toMatchObject({revoked:true})
    expect(await listEducationProductAdmins(f.entry.id,f.organizationId,'HUISCHOOL')).toMatchObject({
      effectiveCount:1,list:[{grantId:next.grantId,effective:true}],
    })
    await expect(listEducationProductAdmins(f.entry.id,f.organizationId,'HUITEACHER')).rejects.toMatchObject({statusCode:403})
  })

  it('requires the same School roster authority for individual writes and audits the operator', async () => {
    const f = await createSchool()
    const classUnitId = randomUUID(), gradeId = randomUUID()
    await prisma.$executeRaw`INSERT INTO organization_units (id,organization_id,unit_kind,name) VALUES (${gradeId},${f.organizationId},'GRADE','Synthetic grade')`
    await prisma.$executeRaw`INSERT INTO organization_units (id,organization_id,unit_kind,name,parent_unit_id) VALUES (${classUnitId},${f.organizationId},'CLASS','Synthetic class',${gradeId})`
    await prisma.organizationPersonaGrant.create({data:{
      id:randomUUID(),organizationId:f.organizationId,membershipId:f.teacherM.id,
      persona:'TEACHER',grantedByUserId:f.previous.id,
    }})
    await prisma.educationProductEntitlement.create({data:{organizationId:f.organizationId,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:f.entry.id}})
    await prisma.educationProductRoleGrant.create({data:{
      id:randomUUID(),organizationId:f.organizationId,membershipId:f.teacherM.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:f.entry.id,
    }})
    const input = { organizationId:f.organizationId,membershipId:f.teacherM.id,classUnitId,staffRole:'TEACHING' as const }
    const actor = (userId:string) => ({userId,accountDomain:'SCHOOL' as const,platformRole:'STANDARD' as const})
    await expect(assignStaffToClass({...input,actor:actor(f.teacher.id)})).rejects.toMatchObject({code:'CAMPUS_GOVERNANCE_REQUIRED'})
    const assigned = await assignStaffToClass({...input,actor:actor(f.previous.id)})
    await expect(endStaffClassAssignment({organizationId:f.organizationId,assignmentId:assigned.id,actor:actor(f.teacher.id)}))
      .rejects.toMatchObject({code:'CAMPUS_GOVERNANCE_REQUIRED'})
    await endStaffClassAssignment({organizationId:f.organizationId,assignmentId:assigned.id,actor:actor(f.previous.id)})
    const audit = await prisma.organizationGovernanceAudit.findMany({where:{organizationId:f.organizationId,targetId:assigned.id}})
    expect(audit).toHaveLength(2)
    expect(audit.every(event=>event.actorUserId===f.previous.id)).toBe(true)
  })

  it('permits only exact-scope successors to revoke an existing frozen tool grant and preserves its issuer', async () => {
    const f = await createSchool()
    const grantId=randomUUID(),configId=randomUUID(),measurementId=randomUUID(),oldDistributionId=randomUUID()
    const validFrom=new Date(Date.now()-60_000),expiresAt=new Date(Date.now()+60*60_000)
    const toolKey=educationPublicSourceKey({kind:'COGNITIVE_PROFILE',id:configId,hash})
    const selectedBinding=sealSelectedConfigurationBinding({product:'SCHOOL',configuration:{
      kind:'COGNITIVE_PROFILE',testType:'reaction',configId,configVersion:'1',engineVersion:'1',scoringVersion:'1',
      measurement:{releaseId:measurementId,contentHash:hash},profile:'experience',profileDefinitionVersion:'1',
      resolvedConfigHash:hash,protocolSignature:hash,metricDefinitionVersion:'1',qualityDefinitionVersion:'1',
      reportDefinitionVersion:'1',reportHash:hash,presentationVersion:null,
    },authorization:{kind:'EDUCATION_SOURCE_USE',id:grantId,revision:1,recipientId:f.teacher.id,issuerId:f.issuer.id,
      organizationId:f.organizationId,authority:[
        {kind:'ENTRY_ADMIN',id:randomUUID(),revision:1},
        {kind:'CONTENT_DELEGATION',id:oldDistributionId,revision:1},
      ]}})
    const fixed = {
      product:'SCHOOL',scopeKind:'ORGANIZATION',scopeId:f.organizationId,resourceKind:'material',
      delegableCapabilities:[],remainingDelegationDepth:0,validFrom,expiresAt,
    }
    await prisma.contentCapabilityGrant.create({ data: {
      ...fixed,id:grantId,issuerId:f.issuer.id,subjectId:f.teacher.id,capabilities:['material.use'],resourceKeys:[toolKey],ancestry:[grantId],
    } })
    await prisma.assessmentManagementEvent.create({data:{
      id:grantId,actorId:f.issuer.id,resourceId:configId,action:EDUCATION_STANDARD_USE_ACTION,
      metadata:{schemaVersion:1,selectedBinding,artifactHash:hash,selfGrant:false,requestIntentHash:hash} as Prisma.InputJsonValue,
    }})
    const request={requestId:randomUUID(),expectedVersion:1,reason:'Synthetic succession'}
    const distribute = (resourceKey:string) => {
      const id=randomUUID()
      return prisma.contentCapabilityGrant.create({data:{
        ...fixed,id,subjectId:f.entry.id,issuerId:f.issuer.id,capabilities:['material.distribute'],resourceKeys:[resourceKey],ancestry:[id],
      }})
    }
    await distribute(randomUUID())
    expect((await educationStandardManagementGrants(f.entry.id,f.scope,configId,{})).list).toEqual([])
    await expect(revokeEducationStandardConfigurationUse(f.entry.id,f.scope,configId,grantId,request)).rejects.toMatchObject({statusCode:403})
    await distribute(measurementId)
    expect((await educationStandardManagementGrants(f.entry.id,f.scope,configId,{})).list).toMatchObject([{id:grantId,canManage:true,canReplace:false}])
    await expect(revokeEducationStandardConfigurationUse(f.entry.id,f.scope,configId,grantId,request)).resolves.toMatchObject({revoked:true,version:2})
    await expect(revokeEducationStandardConfigurationUse(f.entry.id,f.scope,configId,grantId,request)).resolves.toMatchObject({replayed:true})
    expect(await educationStandardManagementOperation(f.entry.id,f.scope,configId,request.requestId)).toMatchObject({kind:'REVOKE',request})
    expect(await prisma.contentCapabilityGrant.findUnique({where:{id:grantId}})).toMatchObject({issuerId:f.issuer.id,revokedBy:f.entry.id})
    expect(await prisma.assessmentManagementEvent.findUnique({where:{id:grantId}})).toMatchObject({actorId:f.issuer.id})
  })
})
