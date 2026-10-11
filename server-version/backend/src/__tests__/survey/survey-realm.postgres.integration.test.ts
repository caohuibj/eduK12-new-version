import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import express from 'express'
import { PrismaClient } from '@prisma/client'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { hashPassword } from '../../utils/password'
import { generateToken } from '../../utils/jwt'
import { authenticate, authenticateSurvey } from '../../middleware/auth'
import { csrfProtection } from '../../middleware/csrf'
import { surveyProjectsRouter } from '../../modules/survey/projects.routes'
import { issueSurveyCsrfToken } from '../../utils/authCookies'
import { isActiveResearcher } from '../../modules/survey/authority'
import { inviteResearcher, redeemResearcherInvite, authorizeAdmin, invitePasswordReset, resetResearcherMfa, updateResearcherStatus } from '../../modules/survey/governance.service'
import {
  startSurveyMfaEnrollment, completeSurveyMfa, totpAt, verifySurveyTotpStepUp,
} from '../../modules/survey/mfa.service'

const dbUrl=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=dbUrl?describe:describe.skip
let db:PrismaClient
let userId='',adminId='',server:Server,base=''
let initialPassword='SecurePassword42'
let aliceToken=''
const asPassword='PasswordForInvitation42'
function secretFromBase32(value:string):Buffer {
  const alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits=0,buffer=0
  const bytes:number[]=[]
  for(const char of value){
    buffer=(buffer<<5)|alpha.indexOf(char);bits+=5
    if(bits>=8){bits-=8;bytes.push((buffer>>>bits)&255)}
  }
  return Buffer.from(bytes)
}
const requestStub=()=>{
  const cookies:string[]=[]
  const req={secure:false} as express.Request
  const res={append:(_key:string,value:string)=>{cookies.push(value);return res}} as unknown as express.Response
  return {req,res,cookies}
}
const rawChallenge=(cookies:string[])=>{
  const found=cookies.find(x=>x.startsWith('huisurvey_mfa_pending='))
  if(!found)throw new Error('missing MFA cookie')
  return decodeURIComponent(found.split(';')[0].split('=')[1])
}
const jwt=(uid:string)=>generateToken({
  userId:uid,username:'integration',role:'STUDENT',accountDomain:'SURVEY',tokenVersion:0,
  mfaVerifiedAt:Math.floor(Date.now()/1000),
})
const http=async(path:string,opts:RequestInit={})=>{
  const r=await fetch(base+path,opts)
  return {status:r.status,data:await r.json()}
}
suite('Survey realm, TOTP and project ACL — isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    process.env.SURVEY_MFA_ENCRYPTION_KEY='45'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:dbUrl!}}})
    await db.$connect()
    const admin=await db.user.create({data:{
      username:'survey_admin_'+randomUUID().replace(/-/g,''),
      passwordHash:await hashPassword(initialPassword),role:'ADMIN',
      accountDomain:'LEGACY',platformRole:'SYSTEM_ADMIN',
    }})
    adminId=admin.id
    const app=express()
    app.use(express.json())
    app.use('/api',csrfProtection)
    app.get('/api/survey/auth/csrf',(req,res)=>res.json({code:0,data:{csrfToken:issueSurveyCsrfToken(req,res)}}))
    app.get('/api/legacy-check',authenticate,(_req,res)=>res.json({code:0}))
    app.get('/api/survey-check',authenticateSurvey,(_req,res)=>res.json({code:0}))
    app.use('/api/survey/projects',surveyProjectsRouter)
    server=createServer(app)
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    const address=server.address()
    if(!address||typeof address==='string')throw new Error('missing ephemeral port')
    base='http://127.0.0.1:'+address.port
  })
  afterAll(async()=>{
    await new Promise<void>(resolve=>server?.close(()=>resolve()))
    await db?.$disconnect()
  })
  it('accepts only current platform administrator and one-time claim',async()=>{
    await expect(authorizeAdmin(adminId,initialPassword)).resolves.toBeUndefined()
    await expect(authorizeAdmin(adminId,'invalid')).rejects.toThrow()
    const invite=await inviteResearcher(adminId)
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const c=requestStub()
    const login='survey_'+randomUUID().slice(0,8)
    const claimed=await redeemResearcherInvite(c.req,c.res,invite.token,login,asPassword)
    expect(claimed.mfaRequired).toBe(true)
    const account=await db.surveyAccount.findUniqueOrThrow({where:{normalizedLogin:login}})
    userId=account.userId
    expect(await isActiveResearcher(userId)).toBe(false)
    aliceToken=rawChallenge(c.cookies)
    await expect(redeemResearcherInvite(requestStub().req,requestStub().res,invite.token,login,asPassword)).rejects.toThrow()
  })
  it('enforces setup, non-replay, recovery, and independent realm',async()=>{
    const setup=await startSurveyMfaEnrollment(aliceToken)
    expect(setup?.otpauthUri).toContain('issuer=Huisurvey')
    const secret=new URL(setup!.otpauthUri).searchParams.get('secret')!
    const code=totpAt(secretFromBase32(secret),Math.floor(Date.now()/30000))
    const completed=await completeSurveyMfa(aliceToken,code,'ENROLL')
    expect(completed?.recoveryCodes).toHaveLength(10)
    expect(await isActiveResearcher(userId)).toBe(true)
    expect(await verifySurveyTotpStepUp(userId,code)).toBe(false)
    const token=jwt(userId)
    const wrong=await http('/api/legacy-check',{headers:{Cookie:'ptool_session='+token}})
    expect(wrong.status).toBe(401)
    const correct=await http('/api/survey-check',{headers:{Cookie:'huisurvey_research_session='+token}})
    expect(correct.status).toBe(200)
  })
  it('rejects another owner and stale revision in real project routes',async()=>{
    const other=await db.user.create({data:{
      username:'survey_other_'+randomUUID().replace(/-/g,''),
      passwordHash:'synthetic-only',role:'STUDENT',accountDomain:'SURVEY',
    }})
    const alias='other_'+randomUUID().slice(0,8)
    await db.surveyAccount.create({data:{userId:other.id,loginName:alias,normalizedLogin:alias}})
    await db.surveyResearcherGrant.create({data:{userId:other.id,grantedBy:adminId,status:'ACTIVE'}})
    await db.surveyMfaCredential.create({data:{userId:other.id,secretCipher:'synthetic-test',enabled:true}})
    const csrf=await http('/api/survey/auth/csrf')
    const token=csrf.data.data.csrfToken as string
    const auth=(id:string)=>({Cookie:'huisurvey_research_session='+jwt(id)+'; huisurvey_research_csrf='+token,
      'X-CSRF-Token':token,'Content-Type':'application/json'})
    const id=randomUUID()
    const created=await http('/api/survey/projects',{method:'POST',headers:auth(userId),body:JSON.stringify({
      requestId:id,title:'Learning pre/post',description:'test',collectionMode:'LINKED_WAVES',
    })})
    expect(created.status).toBe(200)
    const cross=await http('/api/survey/projects/'+id,{headers:auth(other.id)})
    expect(cross.status).toBe(404)
    const patch=await http('/api/survey/projects/'+id,{method:'PATCH',headers:auth(userId),
      body:JSON.stringify({revision:0,title:'Study updated'})})
    expect(patch.status).toBe(200)
    const stale=await http('/api/survey/projects/'+id,{method:'PATCH',headers:auth(userId),
      body:JSON.stringify({revision:0,title:'Stale'})})
    expect(stale.status).toBe(409)
    await expect(db.user.update({where:{id:userId},data:{accountDomain:'TRAINING'}})).rejects.toThrow()
  })
  it('suspended researcher cannot recover credentials or bypass mandatory MFA',async()=>{
    await updateResearcherStatus(adminId,userId,'SUSPENDED')
    expect(await isActiveResearcher(userId)).toBe(false)
    await expect(invitePasswordReset(adminId,userId)).rejects.toThrow()
    await expect(resetResearcherMfa(adminId,userId)).rejects.toThrow()
    const resumed=await updateResearcherStatus(adminId,userId,'ACTIVE')
    expect(resumed.status).toBe('ACTIVE')
    expect(await isActiveResearcher(userId)).toBe(true)
    const invitation=await inviteResearcher(adminId)
    const newName='srev_'+randomUUID().slice(0,8)
    await redeemResearcherInvite(requestStub().req,requestStub().res,invitation.token,newName,asPassword)
    const a=await db.surveyAccount.findUniqueOrThrow({where:{normalizedLogin:newName}})
    const suspended=await updateResearcherStatus(adminId,a.userId,'SUSPENDED')
    expect(suspended.status).toBe('SUSPENDED')
    const pending=await updateResearcherStatus(adminId,a.userId,'ACTIVE')
    expect(pending.status).toBe('PENDING_MFA')
    expect(await isActiveResearcher(a.userId)).toBe(false)
    await expect(invitePasswordReset(adminId,a.userId)).resolves.toMatchObject({kind:'PASSWORD_RESET'})
  })

  it('archives completed research without allowing an old participant study to be reopened',async()=>{
    const csrf=await http('/api/survey/auth/csrf')
    const token=csrf.data.data.csrfToken as string
    const headers={Cookie:'huisurvey_research_session='+jwt(userId)+'; huisurvey_research_csrf='+token,
      'X-CSRF-Token':token,'Content-Type':'application/json'}
    const projectId=randomUUID()
    await db.surveyProject.create({data:{
      id:projectId,ownerUserId:userId,title:'研究采集已永久结束',
      description:'归档不可重开',collectionMode:'LINKED_WAVES',
      status:'CLOSED',firstPublishedAt:new Date(),
    }})
    const archived=await http('/api/survey/projects/'+projectId+'/archive',{
      method:'POST',headers,body:JSON.stringify({revision:0}),
    })
    expect(archived.status).toBe(200)
    expect(archived.data.data).toMatchObject({status:'ARCHIVED',revision:1})
    const restored=await http('/api/survey/projects/'+projectId+'/restore',{
      method:'POST',headers,body:JSON.stringify({revision:1}),
    })
    expect(restored.status).toBe(409)
    expect((await db.surveyProject.findUniqueOrThrow({where:{id:projectId}})).status).toBe('ARCHIVED')
    expect(await db.surveyEvent.count({where:{projectId,action:'PROJECT_ARCHIVED'}})).toBe(1)
    const draftId=randomUUID()
    await db.surveyProject.create({data:{
      id:draftId,ownerUserId:userId,title:'尚未发布的草稿',
      description:'',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',
    }})
    const archivedDraft=await http('/api/survey/projects/'+draftId+'/archive',{
      method:'POST',headers,body:JSON.stringify({revision:0}),
    })
    expect(archivedDraft.status).toBe(200)
    const recoveredDraft=await http('/api/survey/projects/'+draftId+'/restore',{
      method:'POST',headers,body:JSON.stringify({revision:1}),
    })
    expect(recoveredDraft.status).toBe(200)
    expect(recoveredDraft.data.data).toMatchObject({status:'DRAFT',revision:2})
  })


})
