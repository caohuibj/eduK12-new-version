import express from 'express'
import type {Server} from 'node:http'
import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {grantSyntheticHuischoolProduct} from './educationProductFixture'
import {educationPersonnelRouter} from '../../modules/campus/personnel.routes'
import {educationRosterFileRouter} from '../../modules/education-roster/files.routes'
import {schoolOriginGuard} from '../../modules/campus/originGuard'
import {huiteacherOriginGuard} from '../../modules/huiteacher/originGuard'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let server:Server,base:string
const csrf='synthetic-roster-'+ 'a'.repeat(32)
async function fixture(){
 const username='bridge_'+randomUUID().slice(0,12)
 const user=await prisma.user.create({data:{username,passwordHash:'synthetic-unused',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true,mustChangePassword:false}})
 await prisma.campusAccount.create({data:{userId:user.id,loginName:username,normalizedLogin:username}})
 const org=await prisma.organization.create({data:{id:randomUUID(),name:'synthetic bridge only',productDomain:'SCHOOL',createdByUserId:user.id}})
 const member=await prisma.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:user.id,orgRole:'ORG_ADMIN'}})
 await grantSyntheticHuischoolProduct(prisma,{organizationId:org.id,adminUserId:user.id,adminMembershipId:member.id})
 await prisma.educationProductEntitlement.create({data:{organizationId:org.id,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:user.id}})
 const teacher=await prisma.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:user.id}})
 const call=async(entry:'SCHOOL'|'TEACHER',path:string,body?:unknown)=>{
  const teacherEntry=entry==='TEACHER',prefix=teacherEntry?'huiteacher':'campus',cookie=teacherEntry?'huiteacher':'huischool'
  const token=generateToken({userId:user.id,username,role:'TEACHER',accountDomain:'SCHOOL',tokenVersion:0,mfaVerifiedAt:Math.floor(Date.now()/1000),...(teacherEntry?{sessionProduct:'HUITEACHER' as const}:{})})
  const response=await fetch(`${base}/api/${prefix}/organizations/${org.id}${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:`http://${teacherEntry?'teacher':'school'}.localhost:5197`,'X-CSRF-Token':csrf,Cookie:`${cookie}_csrf=${csrf}; ${cookie}_session=${token}`},...(body?{body:JSON.stringify(body)}:{})})
  return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')}
 }
 return {user,org,member,teacher,call}
}
suite('shared roster bridge with real isolated PostgreSQL and product authentication',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='ab'.repeat(32)
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/campus',schoolOriginGuard,educationPersonnelRouter('SCHOOL'),educationRosterFileRouter('SCHOOL'))
  app.use('/api/huiteacher',huiteacherOriginGuard,educationPersonnelRouter('TEACHER'),educationRosterFileRouter('TEACHER'))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`
 })
 afterAll(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect()})
 it('imports once through Teacher and reads the same records through School without creating accounts or grants',async()=>{
  const f=await fixture(),beforeUsers=await prisma.user.count(),beforeGrants=await prisma.educationProductRoleGrant.count()
  const caps=await f.call('TEACHER','/roster-files/capabilities');expect(caps).toMatchObject({status:200,body:{data:{structure:true,personnel:true}}})
  const input={kind:'STAFF',rows:[{line:2,number:'T0001',name:'合成普通教师'},{line:3,number:'T0002',name:'合成心理教师',persona:'COUNSELOR'}]}
  const preview=await f.call('TEACHER','/personnel/preview',input);expect(preview).toMatchObject({status:200,body:{data:{add:2,skip:0,errors:0}}})
  const apply=await f.call('TEACHER','/personnel/import',{input,previewToken:preview.body.data.token,batchId:randomUUID(),verifiedOffline:false})
  expect(apply).toMatchObject({status:200,body:{data:{added:2,skipped:0}}})
  const school=await f.call('SCHOOL','/personnel/directory'),teacher=await f.call('TEACHER','/personnel/directory')
  expect(school.status).toBe(200);expect(teacher.status).toBe(200);expect(teacher.body.data).toEqual(school.body.data);expect(teacher.cache).toBe('no-store')
  expect(school.body.data.list.filter((p:any)=>p.source==='IMPORTED')).toHaveLength(2)
  expect(school.body.data.list.filter((p:any)=>p.source==='IMPORTED').every((p:any)=>p.activation==='PENDING'&&p.membership==='NONE')).toBe(true)
  expect(await prisma.user.count()).toBe(beforeUsers);expect(await prisma.educationProductRoleGrant.count()).toBe(beforeGrants)
 })
 it('requires each live product grant and School governance deny remains authoritative',async()=>{
  const f=await fixture()
  await prisma.educationProductRoleGrant.update({where:{id:f.teacher.id},data:{revokedAt:new Date(),revokedByUserId:f.user.id}})
  expect((await f.call('TEACHER','/personnel/directory')).status).toBe(403)
  expect((await f.call('SCHOOL','/personnel/directory')).status).toBe(200)
  await prisma.educationProductRoleGrant.update({where:{id:f.teacher.id},data:{revokedAt:null,revokedByUserId:null}})
  await prisma.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.org.id,userId:f.user.id,permission:'ORGANIZATION_GOVERNANCE',reason:'synthetic deny',deniedByUserId:f.user.id}})
  expect((await f.call('TEACHER','/roster-files/capabilities')).body.data.personnel).toBe(false)
  expect((await f.call('TEACHER','/personnel/directory')).status).toBe(403)
  expect((await f.call('SCHOOL','/personnel/directory')).status).toBe(403)
  const rows=await prisma.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int AS n FROM campus_personnel WHERE organization_id=${f.org.id}`;expect(rows[0].n).toBe(0)
 })
})
