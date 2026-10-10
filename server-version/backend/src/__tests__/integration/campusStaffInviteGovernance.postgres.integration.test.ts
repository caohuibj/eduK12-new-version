import { randomUUID } from 'node:crypto'
import { UserRole, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { createCampusStaffInvitation, registerCampusStaff } from '../../modules/campus/staff.service'

const DB_URL=integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL',
)
const suite=DB_URL?describe:describe.skip
let db:PrismaClient

suite('Huischool staff invitation revocation / re-grant — isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(DB_URL!)
    db=new PrismaClient({datasources:{db:{url:DB_URL!}}})
    await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})

  it('cannot redeem an unconsumed ADMIN+PSYCHOLOGY_STAFF invite after issuer governance is revoked',async()=>{
    const user=await db.user.create({data:{
      username:'staff_issuer_'+randomUUID().replace(/-/g,''),
      accountDomain:'SCHOOL',role:UserRole.ADMIN,passwordHash:'synthetic-not-used',
      platformRole:'STANDARD',
    }})
    const org=await db.organization.create({data:{
      id:randomUUID(),name:'invite revocation '+randomUUID(),productDomain:'SCHOOL',
      createdByUserId:user.id,
    }})
    const membership=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:org.id,userId:user.id,orgRole:'ORG_ADMIN',
    }})
    const actor={
      userId:user.id,username:user.username,accountDomain:'SCHOOL' as const,
      role:UserRole.ADMIN,platformRole:'STANDARD' as const,
      tokenVersion:user.tokenVersion,mustChangePassword:false,
    }
    const invite=await createCampusStaffInvitation({
      actor,organizationId:org.id,persona:'COUNSELOR',
      adminRole:true,psychologyStaff:true,
    })
    expect((await db.campusStaffInvitation.findUniqueOrThrow({
      where:{id:invite.invitationId},
    })).consumedAt).toBeNull()
    const deny=await db.organizationAccessDeny.create({data:{
      id:randomUUID(),organizationId:org.id,userId:user.id,
      permission:'ORGANIZATION_GOVERNANCE',reason:'test issuer authorization revoked',
      deniedByUserId:user.id,
    }})
    const login='revoked_claim_'+randomUUID().slice(0,8)
    const claim=()=>registerCampusStaff({
      inviteCode:invite.inviteCode,username:login,password:'SchoolSecure!24password',
    })
    await expect(claim()).rejects.toMatchObject({
      code:'CAMPUS_INVITE_UNAVAILABLE',statusCode:404,
    })
    expect(await db.campusAccount.count({where:{normalizedLogin:login}})).toBe(0)
    const remaining=await db.campusStaffInvitation.findUniqueOrThrow({
      where:{id:invite.invitationId},
    })
    expect(remaining.consumedAt).toBeNull()
    // Membership was NOT revoked: the old guard accepted this situation.
    expect((await db.organizationMembership.findUniqueOrThrow({
      where:{id:membership.id},
    })).orgRole).toBe('ORG_ADMIN')
    // Re-granting governance cannot resurrect a bearer issued before denial.
    await db.organizationAccessDeny.update({
      where:{id:deny.id},
      data:{liftedAt:new Date(),liftedByUserId:user.id},
    })
    await expect(claim()).rejects.toMatchObject({code:'CAMPUS_INVITE_UNAVAILABLE'})
    expect(await db.campusAccount.count({where:{normalizedLogin:login}})).toBe(0)
    // A *new* invitation after the regrant may be issued by the current
    // governor, so recovery doesn't permanently disable school governance.
    const fresh=await createCampusStaffInvitation({
      actor,organizationId:org.id,persona:'TEACHER',
      adminRole:false,psychologyStaff:false,
    })
    expect(fresh.invitationId).not.toBe(invite.invitationId)
  })
})
