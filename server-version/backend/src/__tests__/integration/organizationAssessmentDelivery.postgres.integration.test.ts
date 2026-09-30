import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass, grantTeachingAssessmentDelivery, revokeTeachingAssessmentDelivery } from '../../modules/organization/classRelationships'
import { resolveAssessmentDeliveryAuthority } from '../../modules/organization/access'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
const key = (label: string) => `delivery-grant-${label}-${suffix}-${randomUUID()}`

async function user(label: string) {
  return db.user.create({ data: {
    username: `delivery-grant-${label}-${suffix}-${randomUUID().slice(0,8)}`,
    passwordHash: 'test-only', role: UserRole.TEACHER,
  } })
}

suite('Organization class-scoped assessment delivery grants', () => {
  beforeAll(async () => { db = new PrismaClient({ datasources: { db: { url: DB_URL! } } }); await db.$connect() })
  afterAll(async () => db.$disconnect())

  it('defaults HOMEROOM to delivery and requires explicit grant for TEACHING', async () => {
    const owner=await user('owner'), homeroom=await user('homeroom'), teaching=await user('teaching')
    const org=await createOrganization({name:`Delivery school ${suffix}`,meta:{actorUserId:owner.id,commandKey:key('org')}})
    const grade=await createOrganizationUnit({organizationId:org.organization.id,unitKind:'GRADE',name:'一年级'})
    const cls=await createOrganizationUnit({organizationId:org.organization.id,unitKind:'CLASS',name:'一班',parentUnitId:grade.id})
    const homeMember=await createMembership({organizationId:org.organization.id,userId:homeroom.id,meta:{actorUserId:owner.id,commandKey:key('home')}})
    const teachingMember=await createMembership({organizationId:org.organization.id,userId:teaching.id,meta:{actorUserId:owner.id,commandKey:key('teaching')}})
    for(const [membershipId,label] of [[homeMember.id,'home'],[teachingMember.id,'teaching']] as const) {
      await grantPersona({organizationId:org.organization.id,membershipId,persona:'TEACHER',meta:{actorUserId:owner.id,commandKey:key(label+'-persona')}})
    }
    await assignStaffToClass({organizationId:org.organization.id,membershipId:homeMember.id,classUnitId:cls.id,staffRole:'HOMEROOM'})
    await assignStaffToClass({organizationId:org.organization.id,membershipId:teachingMember.id,classUnitId:cls.id,staffRole:'TEACHING'})
    const principal=(userId:string)=>({userId,platformRole:'STANDARD' as const})
    expect((await resolveAssessmentDeliveryAuthority({principal:principal(homeroom.id),organizationId:org.organization.id}))?.deliveryScopes).toContain('CLASS')
    expect(await resolveAssessmentDeliveryAuthority({principal:principal(teaching.id),organizationId:org.organization.id})).toBeNull()
    const grant=await grantTeachingAssessmentDelivery({organizationId:org.organization.id,teacherMembershipId:teachingMember.id,classUnitId:cls.id,grantedByUserId:owner.id})
    expect((await resolveAssessmentDeliveryAuthority({principal:principal(teaching.id),organizationId:org.organization.id}))?.deliveryScopes).toContain('CLASS')
    await revokeTeachingAssessmentDelivery({organizationId:org.organization.id,grantId:grant.id,revokedByUserId:owner.id})
    expect(await resolveAssessmentDeliveryAuthority({principal:principal(teaching.id),organizationId:org.organization.id})).toBeNull()
  })
})
