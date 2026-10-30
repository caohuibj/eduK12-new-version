import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME} from '../../utils/authCookies'
const suite=process.env.PRECISE_EDUCATION_COGNITIVE_BINDING==='1'?describe:describe.skip
suite('School and Teacher precise cognitive T1/T2 through real entry routes',()=>{
 let db:any,server:Server|undefined,base='',sign:any,state:any,stage='init'
 const requests:any[]=[],observations:any[]=[],password='Synthetic-manager-test-20261029!'
 async function checkpoint(){await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_CHECKPOINT!,JSON.stringify(state,null,2)+'\n',{mode:0o600})}
 async function call(actor:any,product:'SCHOOL'|'TEACHER',method:string,path:string,body?:unknown,status=200){
  const platform=actor.accountDomain!=='SCHOOL',teacher=product==='TEACHER',csrf='education-exact-profile'
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:actor.accountDomain,tokenVersion:actor.tokenVersion,
   ...(platform?{adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}:{mfaVerifiedAt:Math.floor(Date.now()/1000),...(teacher?{sessionProduct:'HUITEACHER'}:{})})})
  const cookie=platform?'ptool_session':teacher?HUITEACHER_AUTH_COOKIE_NAME:SCHOOL_AUTH_COOKIE_NAME,csrfCookie=platform?'ptool_csrf':teacher?HUITEACHER_CSRF_COOKIE_NAME:SCHOOL_CSRF_COOKIE_NAME
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',Cookie:cookie+'='+token+'; '+csrfCookie+'='+csrf,'X-CSRF-Token':csrf},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json() as any;requests.push({stage,product,method,path,status:response.status});expect(response.status,value.message??path).toBe(status);return value.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_COGNITIVE_DATABASE_URL!;requireIsolatedReleaseDatabase(url);const parsed=new URL(url)
  if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_education_cognitive_profile_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Exact isolated actual runtime required')
  state=JSON.parse(await readFile(process.env.PRECISE_EDUCATION_COGNITIVE_CHECKPOINT!,'utf8'));db=(await import('../../config/database')).prisma
  expect(await db.user.count()).toBe(8);expect(await db.cognitiveTestConfig.count()).toBe(1);expect(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_PROFILE_APPROVED'}})).toBe(2)
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform/education',(await import('../../modules/huiteacher/platform.routes')).default)
  app.use('/api/campus',(await import('../../modules/campus/organization.routes')).default)
  app.use('/api/huiteacher',(await import('../../modules/huiteacher/organization.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as any).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_EVIDENCE??'/tmp/education-cognitive-bindings.json',JSON.stringify({productionAccessed:false,stage,requests,observations,scope:'Real protected manager and author HTTP/CSRF/password, exact original scoped M delegation, qualified existing synthetic psychologist/productAdmin; actual restricted database. Synthetic recent-MFA sessions, not human MFA or participant completion.'},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s binds one named precise use to its original immutable profile at author freeze',async product=>{
  const original=state.entries[product],counterpart=process.env.PRECISE_EDUCATION_COGNITIVE_BINDING_RESUME==='counterparts'
  if(counterpart){if(original.counterpart)throw Error('Inspect retained counterpart before retry');original.counterpart={managerId:original.managerId,userId:original.userId,organizationId:original.organizationId,rootId:original.rootId,useId:original.browserReplacementId}}
  const entry=counterpart?original.counterpart:original,profile=counterpart?(product==='SCHOOL'?'research':'experience'):(product==='SCHOOL'?'experience':'research'),source=state.profiles[profile]
  const resumeDraft=process.env.PRECISE_EDUCATION_COGNITIVE_BINDING_RESUME==='drafts',resume=counterpart||resumeDraft||process.env.PRECISE_EDUCATION_COGNITIVE_BINDING_RESUME==='uses'
  if(entry.fixed||Boolean(entry.useId)!==resume||Boolean(entry.draftId)!==resumeDraft)throw Error('Inspect retained checkpoint; no repeated grant or draft creation')
  const manager=await db.user.findUniqueOrThrow({where:{id:entry.managerId}}),owner=await db.user.findUniqueOrThrow({where:{id:entry.userId}})
  const basePath=`/platform/education/organizations/${entry.organizationId}/products/${product==='SCHOOL'?'HUISCHOOL':'HUITEACHER'}/cognitive-profile-configurations`,exactPath=basePath+'/'+state.configId+'/'+profile
  if(!resume){
  const people=await call(manager,product,'GET',exactPath+'/recipients?artifactHash='+source.artifactHash);expect(people.list.some((p:any)=>p.userId===owner.id)).toBe(true)
  const preview=await call(manager,product,'GET',exactPath+'/preview?artifactHash='+source.artifactHash);expect(preview).toMatchObject({artifactHash:source.artifactHash,profile})
  }
  const input=counterpart?original.browserAttempt.input:{requestId:entry.useId??randomUUID(),userId:owner.id,artifactHash:source.artifactHash,authorityGrantId:entry.rootId,expectedAuthorityVersion:1,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:product+' 固定'+(profile==='experience'?'体验':'科研')+'配置'}
  let use={id:entry.useId}
  if(!resume){
  use=await call(manager,product,'POST',exactPath+'/use-grants',{...input,currentPassword:password});entry.useId=use.id;stage=product+'-issued';await checkpoint()
  expect((await call(manager,product,'POST',exactPath+'/use-grants',{...input,currentPassword:password})).replayed).toBe(true)
  await call(manager,product,'POST',exactPath+'/use-grants',{...input,configurationName:'Changed original name',currentPassword:password},409)
  }
  if(!resumeDraft&&!counterpart){
  const recovered=await call(manager,product,'GET',basePath+'/'+state.configId+'/operations/'+use.id);expect(recovered.request).toMatchObject({...input,profile,validFrom:new Date(input.validFrom).toISOString(),expiresAt:new Date(input.expiresAt).toISOString()})
  }
  const authorPath=(product==='SCHOOL'?'/campus':'/huiteacher')+'/organizations/'+entry.organizationId+'/private-tools'
  const catalog=await call(owner,product,'GET',authorPath+'/public-sources?kind=COGNITIVE'),choice=catalog.list.find((r:any)=>r.artifactHash===source.artifactHash)
  expect(choice).toMatchObject({sourceId:state.configId,profile,configurationName:input.configurationName,selectedBinding:{authorizationId:use.id}})
  let draft:any,saved:any
  if(resumeDraft){
   draft=await call(owner,product,'GET',authorPath+'/'+entry.draftId);saved=entry.saved
   expect(draft).toMatchObject({id:entry.draftId,revision:saved.revision,contentHash:saved.contentHash})
   expect(await db.cognitiveAssignment.count({where:{createdBy:owner.id,configId:state.configId}})).toBe(0)
  }else{
  draft=await call(owner,product,'POST',authorPath,{kind:'COMPOSITION',title:product+' exact native profile'});entry.draftId=draft.id;await checkpoint()
  const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:product==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},instruction:'Synthetic fixed native profile',blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'COGNITIVE_CONFIG',kind:'COGNITIVE',versionId:state.configId,contentHash:choice.contentHash,profile,artifactHash:source.artifactHash,selectedBinding:choice.selectedBinding}}]}
  saved=await call(owner,product,'PUT',authorPath+'/'+draft.id,{expectedRevision:1,title:draft.title,definition});entry.definition=definition;entry.saved=saved;await checkpoint()
  await call(owner,product,'PUT',authorPath+'/'+draft.id,{expectedRevision:saved.revision,title:draft.title,definition:{...definition,blocks:[{...definition.blocks[0],source:{...definition.blocks[0].source,profile:profile==='experience'?'research':'experience'}}]}},409)
  }
  const fixed=await call(owner,product,'POST',authorPath+'/'+draft.id+'/freeze',{expectedRevision:saved.revision,expectedContentHash:saved.contentHash});entry.fixed=fixed;stage=product+'-frozen';await checkpoint()
  const composite=await db.compositeAssessment.findFirstOrThrow({where:{creationKey:fixed.runtime.resourceKey},include:{items:{include:{cognitiveAssignment:true}}}}),assignment=composite.items[0].cognitiveAssignment
  expect(assignment).toMatchObject({profile,resolvedConfigHash:source.configuration.resolvedConfigHash})
  expect(assignment.courseSnapshot.selectedEducationCognitiveProfile).toMatchObject({product,organizationId:entry.organizationId,artifactHash:source.artifactHash,selectedBinding:choice.selectedBinding})
  const unit=composite.trainingContentSnapshot.units[0];expect(unit.source.educationNative).toMatchObject({profile,artifactHash:source.artifactHash,selectedBinding:choice.selectedBinding})
  entry.compositeId=composite.id;entry.assignmentId=assignment.id;await checkpoint()
  observations.push({product,useId:use.id,profile,artifactHash:source.artifactHash,compositeId:composite.id,assignmentId:assignment.id,retainedT1FromPriorInvocation:resume,retainedDraftFromPriorInvocation:resumeDraft,actualT1Replayed:!resume,changedIntentDenied:!resume,authorProfileSwapDenied:!resumeDraft,originalPinAtT2:true,participantNotStarted:true})
 },30000)
})
