import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import express from 'express'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {publishContentRelease} from '../../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {submit,review} from '../../modules/scale-library-governance/service'
import {surveyLibraryAdminRouter} from '../../modules/survey/library-admin.routes'
import {platformSurveyOriginGuard} from '../../modules/survey/originGuard'
import {csrfProtection} from '../../middleware/csrf'
import {errorHandler} from '../../middleware/errorHandler'
import {generateToken} from '../../utils/jwt'
import {standardPolicyIdentity} from '../../modules/survey/tool-policy'
const url=integrationDatabaseUrl('SURVEY_FOLLOWUP_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('SDQ and original shared Scale coexist in the actual Survey admin directory',()=>{
 let server:Server,base:string,token:string,entryId:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  const system=await db.user.create({data:{username:'fingerprint-system-'+randomUUID(),passwordHash:'synthetic',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING'}})
  const owner=await db.user.create({data:{username:'fingerprint-owner-'+randomUUID(),passwordHash:'synthetic',accountDomain:'SURVEY'}})
  const login='f'+randomUUID().replaceAll('-','').slice(0,20)
  await db.surveyAccount.create({data:{userId:owner.id,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:owner.id,status:'ACTIVE',grantedBy:system.id}})
  await db.surveyMfaCredential.create({data:{userId:owner.id,enabled:true,secretCipher:'synthetic'}})
  const project=await db.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner.id,title:'Synthetic original Scale',collectionMode:'SINGLE_UNLINKED'}})
  const metadata={title:'Synthetic original catalog Scale',author:'Synthetic',copyright:'Explicit self-authored redistribution',applicability:'Synthetic research',scoringDescription:'Descriptive mean',reportDescription:'Descriptive only'}
  const definition={schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Synthetic',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic',required:true,reverse:false,dimensionKeys:['total']}]}
  const release=await db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId:randomUUID(),version:'1',instrumentVersion:'1',definition:compileResearchScale(metadata.title,definition as any),instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:'ALL_AT_ONCE',scope:{kind:'PRIVATE',ownerId:owner.id,product:'SURVEY',resourceId:project.id},sourceReleaseId:null,provenance:{authoringRelationship:'ORIGINAL',authoringSnapshot:{title:metadata.title,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}}),owner.id))
  const application=await submit(owner.id,'SURVEY',{requestId:randomUUID(),releaseId:release.releaseId,metadata})
  entryId=(await review(system.id,application.id,{expectedVersion:1,decision:'APPROVE',allowedProducts:['SURVEY'],reason:'Synthetic independent approval'})).entryId!
  token=generateToken({userId:system.id,role:system.role,accountDomain:'TRAINING',tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/platform/survey-library',platformSurveyOriginGuard,surveyLibraryAdminRouter);app.use(errorHandler)
  server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()})
 const call=async(path:string,body?:unknown)=>{const res=await fetch(base+'/api/platform/survey-library'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://training.eduk12.top',Cookie:'ptool_session='+token+'; ptool_csrf=synthetic','x-csrf-token':'synthetic','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json()}}
 it('reads both real SDQ and the newly approved original entry, then validates the same exact approval fingerprint',async()=>{
  const rows=[]
  for(let page=1;page<=10;page++){const r=await call('/catalog?page='+page);expect(r.status).toBe(200);rows.push(...r.body.data.list);if(!r.body.data.hasMore)break}
  const sdq=rows.find(r=>r.origin==='STANDARD_REGISTRY'&&r.exactVersion.instrumentKey==='sdq_teacher_zh_cn')
  expect(sdq).toBeTruthy();expect(rows.some(r=>r.origin==='AUTHORED'&&r.exactVersion.entryId===entryId)).toBe(true)
  expect(sdq.policyIdentity).toEqual(standardPolicyIdentity('sdq_teacher_zh_cn','1.0.0'))
  const accepted=await call('/policies',{...sdq.policyIdentity,expectedVersion:sdq.policy.version,decision:'RETURNED',paused:false,reason:'Synthetic exact identity verification'})
  expect(accepted.status).toBe(200)
  expect((await call('/policies',{...sdq.policyIdentity,fingerprint:'0'.repeat(64),expectedVersion:1,decision:'APPROVED',paused:false,reason:'Synthetic altered identity'})).status).toBe(409)
  expect((await call('/policies',{resourceKey:'standard:sdq_teacher_zh_cn:synthetic-not-a-release',fingerprint:sdq.policyIdentity.fingerprint,expectedVersion:0,decision:'APPROVED',paused:false,reason:'Synthetic wrong version'})).status).toBe(409)
 })
})
