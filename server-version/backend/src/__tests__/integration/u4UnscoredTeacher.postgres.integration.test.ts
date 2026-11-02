import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import {ensureStaticSjtRegistryMapping,publishStaticSjtMeasurement} from '../../modules/situational/static-measurement-release'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import {educationPublicSourceKey} from '../../modules/education-tools/public-source.identity'
import {createSjtNativeStagedFinalFixture} from '../fixtures/sjt-native-staged.fixture'
import {getSituationPackage} from '../../modules/situational/situation-package.registry'
import {hashSituationRuntimeDefinition} from '../../modules/situational/situation-runtime-definition'
// Test-only publication seam; no file or external review is promoted. Full native
// source/measurement/U/Run/FINAL/report contracts run against disposable PostgreSQL.
vi.mock('../../modules/situational/onboarding/instruments.generated',async original=>{
 const actual=await original<typeof import('../../modules/situational/onboarding/instruments.generated')>()
 const {publicationContentDigest,instrumentSourceSchema}=await import('../../modules/situational/onboarding/schema')
 return {GENERATED_SITUATIONAL_INSTRUMENT_SOURCES:actual.GENERATED_SITUATIONAL_INSTRUMENT_SOURCES.map(source=>instrumentSourceSchema.parse(source)).map(source=>source.content.identity.instrumentKey.startsWith('u4-cjx01-')?{...source,publication:{releaseStatus:'PUBLISHED',review:{kind:'github-review',reviewUrl:'https://github.com/caohuibj/eduK12-new-version/pull/0#pullrequestreview-0',contentDigest:publicationContentDigest(source.content)}}}:source)}
})
import {createPrivateTool,freezePrivateTool} from '../../modules/education-tools/private-tool.service'
import {addTeacherPrivateCompositionRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
import {getAttemptState,startUserAttempt} from '../../modules/composite/composite.service'
import {readTeacherOrdinaryFeedback} from '../../modules/reporting/education-ordinary-feedback.service'
import {submitCompositeScaleFinal} from '../../modules/scale/scale-final-submit.service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {loadFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {updatePrivateTool} from '../../modules/education-tools/private-tool.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
async function headers(userId:string){
 const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-ordinary-csrf'
 const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',
  sessionProduct:'HUITEACHER',mfaVerifiedAt:Math.floor(Date.now()/1000)})
 return {cookie:`${HUITEACHER_AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,
  [CSRF_HEADER_NAME]:csrf,'content-type':'application/json'}
}
async function request(path:string,auth:Record<string,string>,body?:unknown){
 const response=await fetch(base+path,{headers:auth,...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})})
 const value=await response.json()
 return {status:response.status,value,data:value.data}
}
suite('U4 CJX01 native registry to Teacher SELF FINAL and authorized unscored narrative',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
  base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/huiteacher'
 })
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await db?.$disconnect()})
 it.each(['u4-cjx01-sd','u4-cjx01-wd'])('%s independently freezes and runs with current teacher/report authority',async key=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
  const context:PrivateToolContext={entry:'TEACHER',organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL'}}
  const pkg=getSituationPackage(key,'0.3.0')!
  const mapping=await db.$transaction(tx=>ensureStaticSjtRegistryMapping(tx,{instrumentKey:key,instrumentVersion:'0.3.0'}))
  const published=await db.$transaction(tx=>publishStaticSjtMeasurement(tx,{actorId:f.libraryAdminUserId,mappingId:mapping.id,deployment:{locale:'zh-CN',territory:'CN'}}))
  const source={provider:'SJT_RELEASE',kind:'SJT',versionId:mapping.id,contentHash:published.release.contentHash}
  await issueAdminContentRoot(f.libraryAdminUserId,{tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'synthetic-u4-session'},
   {requestId:randomUUID(),expectedVersion:0,reason:'Synthetic exact CJX01 teacher U',grant:{subjectId:f.managerUserId,
    scope:{product:'TEACHER',scopeKind:'ORGANIZATION',scopeId:f.organizationId,resourceKind:'material',resourceKeys:[educationPublicSourceKey({kind:'SJT_RELEASE',id:mapping.id,hash:published.release.contentHash})]},
    capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  const draft=await createPrivateTool(context,{kind:'COMPOSITION',title:'U4 independent teacher scenario'})
  const composition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'本次只使用一个专题',
   blocks:[{blockId:randomUUID(),instruction:'',source}]}
  const updated=await updatePrivateTool(context,draft.id,{expectedRevision:draft.revision,title:draft.title,definition:composition})
  const bundle=await freezePrivateTool(context,draft.id,{expectedRevision:updated.revision,expectedContentHash:updated.contentHash})
  const teacher={organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId}
  await addTeacherPrivateCompositionRunTrack(teacher,{expectedVersion:f.expectedVersion,privateComposition:{versionId:bundle.id,contentHash:bundle.contentHash},
   subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}})
  await f.open();await publishTeacherRun({...teacher,expectedVersion:f.expectedVersion+1})
  const [execution]=await f.executions(),auth=await headers(f.participantUserId)
  const tasks=await request('/my-assessment-tasks',auth),task=tasks.data.list.find((row:any)=>row.executionId===execution.id)
  if(task.consentRequired)expect((await request(`/run-executions/${execution.id}/assessment-consent/accept`,auth,{})).status).toBe(200)
  const start=await request(`/run-executions/${execution.id}/start-assessment`,auth,{})
  expect(start.status,JSON.stringify(start.value)).toBe(200)
  const id=start.data.runtimeBindingRef,path=`/assessment-composite-attempts/${id}`,state=await request(path,auth),current=state.data.currentItem
  expect(state.data.totalItems).toBe(1);expect(current.type).toBe('SITUATIONAL')
  const g=pkg.goldenCases.find(g=>g.expected.unscored!.responseStatus==='COMPLETE')!
  const capture=createSjtNativeStagedFinalFixture(current.situationalAttemptId,g.name,{package:pkg,definitionHash:hashSituationRuntimeDefinition(pkg.definition)} as never)
  const payload={...capture.finalInput,submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,definitionHash:current.definitionHash}
  const endpoint=path+`/items/${current.id}/situational/${current.situationalAttemptId}/submit`
  const final=await request(endpoint,auth,payload)
  expect(final.status,JSON.stringify(final.value)).toBe(200)
  expect((await request(endpoint,auth,payload)).status).toBe(200)
  expect((await request(path,auth)).data.status).toBe('COMPLETED')
  const feedback=await request(`/run-executions/${execution.id}/feedback`,auth)
  expect(feedback.status,JSON.stringify(feedback.value)).toBe(200)
  expect(feedback.data.units).toHaveLength(1)
  expect(feedback.data.units[0]).toMatchObject({kind:'SJT',state:'READY',nativeSituationalReport:{qualityState:'unscored',metrics:[],narrative:{paragraphs:g.expected.unscored!.paragraphs}}})
  expect(JSON.stringify(feedback.value)).not.toMatch(/canonicalResultEncrypted|collectionFactsEncrypted|manifestHash/)
  await expect(readTeacherOrdinaryFeedback({executionId:execution.id,actorUserId:f.managerUserId})).rejects.toMatchObject({statusCode:404})
  await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:f.participantUserId,permission:'REPORT_READ',reason:'Synthetic withdrawal',deniedByUserId:f.managerUserId}})
  expect((await request(`/run-executions/${execution.id}/feedback`,auth)).status).toBe(404)
 },120_000)
})
