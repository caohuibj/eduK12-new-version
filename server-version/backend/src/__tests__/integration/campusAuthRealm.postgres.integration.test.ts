import { randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { authenticate, authenticateSchool } from '../../middleware/auth'
import { generateToken } from '../../utils/jwt'
import { schoolAccountNeedsMfa } from '../../modules/campus/mfa.service'
import { requestSchoolMfaReset } from '../../modules/campus/recovery.service'

const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
const response=()=>{
 const state:{code:number;body:unknown}={code:200,body:null}
 const res={
   status(code:number){state.code=code;return res},
   json(body:unknown){state.body=body;return res},
   setHeader(){return res},
 } as unknown as Response
 return {state,res}
}
async function check(method:typeof authenticate|typeof authenticateSchool,name:string,token:string){
 const req={headers:{cookie:`${name}=${encodeURIComponent(token)}`},
   originalUrl:name==='huischool_session'?'/api/campus/my-status':'/api/auth/me',
 } as unknown as Request
 const {res,state}=response()
 const next=vi.fn() as unknown as NextFunction
 await method(req,res,next)
 return {code:state.code,nextCalled:(next as any).mock.calls.length>0,user:req.user}
}
suite('Huischool product sessions use database account realm and live role elevation',()=>{
 beforeAll(async()=>{
   process.env.CAMPUS_MFA_ENCRYPTION_KEY='34'.repeat(32)
   db=new PrismaClient({datasources:{db:{url:URL!}}})
   await db.$connect()
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('rejects school JWT at training cookie and training JWT at school cookie',async()=>{
   const schoolUser=await db.user.create({data:{
     username:'realm_student_'+randomUUID().replace(/-/g,''),
     accountDomain:'SCHOOL',role:'STUDENT',passwordHash:'synthetic',
   }})
   const legacy=await db.user.create({data:{
     username:'realm_legacy_'+randomUUID().replace(/-/g,''),
     accountDomain:'LEGACY',role:'STUDENT',passwordHash:'synthetic',
   }})
   const make=(user:typeof schoolUser,domain:'SCHOOL'|'LEGACY')=>generateToken({
     userId:user.id,username:user.username,role:user.role,
     tokenVersion:user.tokenVersion,accountDomain:domain,
   })
   const st=make(schoolUser,'SCHOOL'),lt=make(legacy,'LEGACY')
   expect((await check(authenticate,'ptool_session',st)).code).toBe(401)
   expect((await check(authenticateSchool,'huischool_session',lt)).code).toBe(401)
   expect((await check(authenticateSchool,'huischool_session',st)).nextCalled).toBe(true)
   expect((await check(authenticate,'ptool_session',lt)).nextCalled).toBe(true)
   const oldSchool=generateToken({
     userId:schoolUser.id,username:schoolUser.username,role:schoolUser.role,
     tokenVersion:schoolUser.tokenVersion,
   })
   expect((await check(authenticateSchool,'huischool_session',oldSchool)).code).toBe(401)
 })
 it('requires MFA immediately upon role elevation and rejects previous bearer',async()=>{
   const staff=await db.user.create({data:{
     username:'realm_staff_'+randomUUID().replace(/-/g,''),
     accountDomain:'SCHOOL',role:'STUDENT',passwordHash:'synthetic',
   }})
   const token=generateToken({
     userId:staff.id,username:staff.username,role:staff.role,
     accountDomain:'SCHOOL',tokenVersion:staff.tokenVersion,
   })
   expect((await check(authenticateSchool,'huischool_session',token)).nextCalled).toBe(true)
   await db.user.update({where:{id:staff.id},data:{role:'ADMIN'}})
   expect((await check(authenticateSchool,'huischool_session',token)).code).toBe(401)
 })
 it('requires TOTP when SCHOOL governance is valid until a future date',async()=>{
   const admin=await db.user.create({data:{
     username:'realm_expiring_'+randomUUID().replace(/-/g,''),
     role:'TEACHER',accountDomain:'SCHOOL',passwordHash:'synthetic',
   }})
   const org=await db.organization.create({data:{
     id:randomUUID(),name:'realm-expiring-'+randomUUID(),
     createdByUserId:admin.id,productDomain:'SCHOOL',
   }})
   await db.organizationMembership.create({data:{
     id:randomUUID(),organizationId:org.id,userId:admin.id,orgRole:'ORG_ADMIN',
     validUntil:new Date(Date.now()+60*60*1000),
   }})
   expect(await schoolAccountNeedsMfa(admin.id)).toBe(true)
   const passwordOnly=generateToken({
     userId:admin.id,username:admin.username,role:admin.role,
     accountDomain:'SCHOOL',tokenVersion:admin.tokenVersion,
   })
   expect((await check(authenticateSchool,'huischool_session',passwordOnly)).code).toBe(401)
 })

 it('counts future-expiring school memberships before allowing an MFA reset',async()=>{
   const admin=await db.user.create({data:{
     username:'mfa_review_admin_'+randomUUID().replace(/-/g,''),
     passwordHash:'synthetic',accountDomain:'SCHOOL',role:'ADMIN',
   }})
   const target=await db.user.create({data:{
     username:'mfa_review_target_'+randomUUID().replace(/-/g,''),
     passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',
   }})
   const a=await db.organization.create({data:{
     id:randomUUID(),name:'realmA-'+randomUUID(),productDomain:'SCHOOL',
     createdByUserId:admin.id,
   }})
   const b=await db.organization.create({data:{
     id:randomUUID(),name:'realmB-'+randomUUID(),productDomain:'SCHOOL',
     createdByUserId:admin.id,
   }})
   const future=new Date(Date.now()+60*60_000)
   await db.organizationMembership.createMany({data:[
     {id:randomUUID(),organizationId:a.id,userId:admin.id,orgRole:'ORG_ADMIN',validUntil:future},
     {id:randomUUID(),organizationId:a.id,userId:target.id,orgRole:'MEMBER',validUntil:future},
     {id:randomUUID(),organizationId:b.id,userId:target.id,orgRole:'MEMBER',validUntil:future},
   ]})
   await db.campusMfaCredential.create({data:{
     userId:target.id,secretCipher:'synthetic-unused-secret',enabled:true,
   }})
   await expect(requestSchoolMfaReset({
     actor:{
       userId:admin.id,username:admin.username,role:admin.role,
       platformRole:'STANDARD',accountDomain:'SCHOOL',
       tokenVersion:admin.tokenVersion,mustChangePassword:false,
     },organizationId:a.id,targetUserId:target.id,reasonCode:'DEVICE_LOST',
   })).rejects.toMatchObject({
     code:'MULTI_SCHOOL_MFA_RESET_REQUIRES_OPERATOR',
   })
 })

})
