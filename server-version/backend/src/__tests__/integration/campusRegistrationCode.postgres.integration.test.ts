import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {resolveCampusRegistrationCode} from '../../modules/campus/registration-code'
import {createCampusStaffInvitation,registerCampusStaff} from '../../modules/campus/staff.service'
import {createOrganizationUnit} from '../../modules/organization/structure'
import {replaceCampusRoster,setCampusRegistrationWindow,issueCampusActivationCodes,registerCampusStudent,approveCampusClass} from '../../modules/campus/admission.service'
import {createCampusParentInvitation,registerCampusParent} from '../../modules/campus/parent.service'
import type {AuthenticatedPrincipal} from '../../types'
const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
const name=()=> 'discovery_'+randomUUID().replace(/-/g,'').slice(0,20)
const actor=(u:{id:string;username:string;role:'ADMIN'|'TEACHER'|'STUDENT'}):AuthenticatedPrincipal=>({userId:u.id,username:u.username,role:u.role,platformRole:'STANDARD',tokenVersion:0,mustChangePassword:false,accountDomain:'SCHOOL'})
suite('campus registration discovery on real isolated PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(URL!);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='12'.repeat(32);db=new PrismaClient({datasources:{db:{url:URL!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('discovers all five persisted forms read-only; refuses consumed, denied and expired invitations',async()=>{
  const admin=await db.user.create({data:{username:name(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'ADMIN'}})
  const org=await db.organization.create({data:{id:randomUUID(),name:name(),productDomain:'SCHOOL',createdByUserId:admin.id}})
  await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:admin.id,orgRole:'ORG_ADMIN'}})
  const principal=actor(admin)
  for(const [persona,adminRole,expected] of [['TEACHER',false,'TEACHER'],['COUNSELOR',false,'COUNSELOR'],['COUNSELOR',true,'ADMIN']] as const){
   const invitation=await createCampusStaffInvitation({actor:principal,organizationId:org.id,persona,adminRole,psychologyStaff:persona==='COUNSELOR'})
   expect(await resolveCampusRegistrationCode(invitation.inviteCode)).toEqual({kind:'STAFF',role:expected})
   expect((await db.campusStaffInvitation.findUniqueOrThrow({where:{id:invitation.invitationId}})).consumedAt).toBeNull()
   await registerCampusStaff({inviteCode:invitation.inviteCode,username:name(),password:'SyntheticStaff123!'})
   await expect(resolveCampusRegistrationCode(invitation.inviteCode)).rejects.toMatchObject({code:'CAMPUS_REGISTRATION_CODE_UNAVAILABLE'})
  }
  const grade=await createOrganizationUnit({organizationId:org.id,unitKind:'GRADE',name:name()})
  const classroom=await createOrganizationUnit({organizationId:org.id,unitKind:'CLASS',name:name(),parentUnitId:grade.id})
  const counselor=await db.user.create({data:{username:name(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER'}})
  const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:counselor.id,orgRole:'MEMBER'}})
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:admin.id}})
  await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:admin.id}})
  const number='N'+randomUUID().replace(/-/g,'').slice(0,12)
  const roster=await replaceCampusRoster({actor:principal,organizationId:org.id,classUnitId:classroom.id,studentNumbers:[number]})
  await setCampusRegistrationWindow({actor:principal,organizationId:org.id,classUnitId:classroom.id,action:'OPEN',closesAt:new Date(Date.now()+600000)})
  const issued=await issueCampusActivationCodes({actor:principal,organizationId:org.id,classUnitId:classroom.id,count:1,ttlMinutes:5})
  const code=issued.codes[0]
  expect(await resolveCampusRegistrationCode(code)).toEqual({kind:'STUDENT',organizationId:org.id,classUnitId:classroom.id})
  expect((await db.campusActivationCode.findUniqueOrThrow({where:{codeDigest:(await import('node:crypto')).createHash('sha256').update(code).digest('hex')}})).consumedAt).toBeNull()
  const registered=await registerCampusStudent({organizationId:org.id,classUnitId:classroom.id,studentNumber:number,activationCode:code,username:name(),password:'SyntheticStudent123!'})
  await expect(resolveCampusRegistrationCode(code)).rejects.toMatchObject({code:'CAMPUS_REGISTRATION_CODE_UNAVAILABLE'})
  await setCampusRegistrationWindow({actor:principal,organizationId:org.id,classUnitId:classroom.id,action:'CLOSE'})
  await approveCampusClass({actor:actor(counselor),organizationId:org.id,classUnitId:classroom.id,expectedRosterVersion:roster.rosterVersion})
  const student=await db.user.findUniqueOrThrow({where:{id:registered.userId}})
  const parent=await createCampusParentInvitation(actor({...student,role:'STUDENT'}),org.id)
  expect(await resolveCampusRegistrationCode(parent.inviteCode)).toEqual({kind:'PARENT'})
  await registerCampusParent({inviteCode:parent.inviteCode,username:name(),password:'SyntheticParent123!',guardianAcknowledged:true})
  await expect(resolveCampusRegistrationCode(parent.inviteCode)).rejects.toMatchObject({code:'CAMPUS_REGISTRATION_CODE_UNAVAILABLE'})
  const revoked=await createCampusStaffInvitation({actor:principal,organizationId:org.id,persona:'COUNSELOR',adminRole:true,psychologyStaff:true})
  const deny=await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:org.id,userId:admin.id,permission:'ORGANIZATION_GOVERNANCE',reason:'synthetic',deniedByUserId:admin.id}})
  await expect(resolveCampusRegistrationCode(revoked.inviteCode)).rejects.toMatchObject({code:'CAMPUS_REGISTRATION_CODE_UNAVAILABLE'})
  await db.organizationAccessDeny.update({where:{id:deny.id},data:{liftedAt:new Date(),liftedByUserId:admin.id}})
  await expect(resolveCampusRegistrationCode(revoked.inviteCode)).rejects.toMatchObject({code:'CAMPUS_REGISTRATION_CODE_UNAVAILABLE'})
  const expired=await createCampusStaffInvitation({actor:principal,organizationId:org.id,persona:'TEACHER',adminRole:false,psychologyStaff:false})
  await db.campusStaffInvitation.update({where:{id:expired.invitationId},data:{expiresAt:new Date(Date.now()-1000)}})
  await expect(resolveCampusRegistrationCode(expired.inviteCode)).rejects.toMatchObject({code:'CAMPUS_REGISTRATION_CODE_UNAVAILABLE'})
  await expect(resolveCampusRegistrationCode('x'.repeat(32))).rejects.toMatchObject({code:'CAMPUS_REGISTRATION_CODE_UNAVAILABLE'})
 })
})
