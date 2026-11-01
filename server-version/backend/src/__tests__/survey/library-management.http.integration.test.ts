import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import express from 'express'
import {hash} from 'bcryptjs'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {cacheService} from '../../services/cacheService'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {errorHandler} from '../../middleware/errorHandler'
import {platformSurveyOriginGuard,surveyOriginGuard} from '../../modules/survey/originGuard'
import {surveyStandardTripletRouter} from '../../modules/survey/standard-triplet.routes'
import {surveyLibraryAdminRouter} from '../../modules/survey/library-admin.routes'
import {surveyGovernedToolsRouter,surveyGovernedUseRouter} from '../../modules/survey/governed-tool.routes'
import {surveyPlatformRouter} from '../../modules/survey/platform.routes'
import {surveyBuilderRouter} from '../../modules/survey/builder.routes'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {listScaleInstrumentSources} from '../../modules/scale/onboarding/instrument-registry'

const password='synthetic-http-fixture-only'
type Actor='system'|'manager'|'outsider'|'researcher'|'anonymous'
type CatalogRow={id?:string;toolKey?:string;instrumentVersion?:string;catalogId?:string;ref?:{sourceId:string};exactVersion?:{instrumentKey?:string};classificationTags?:Array<{id:string;label:string;facet:string}>;states?:{assignment:{ready:boolean}};authorization?:{useGrantStatus:string};state?:string;available?:boolean;unsupportedReason?:string}
type CatalogPage={list:CatalogRow[];hasMore:boolean}
type PreflightData={readOnly:boolean;facts:{scaleId:string|null};stages:Array<{key:string;state:string}>;targetUseGrant:string}
const ids:Partial<Record<Actor,string>>={},tokens:Partial<Record<Actor,string>>={},usernames:Partial<Record<Actor,string>>={}
const journal:Array<{actor:Actor;path:string;method:string;status:number;limit:string|null;message?:string;ids?:Array<string|undefined>;hasMore?:boolean}>=[]
let server:Server,base:string,projectId:string,governedTarget:string,governedHash:string,configTarget:string
const standard='/api/platform/survey-standard',library='/api/platform/survey-library',sources='/api/platform/survey/source-catalog',governed='/api/platform/survey-tools/catalog'

async function call<T=CatalogPage>(actor:Actor,path:string,body?:unknown,csrf=true){
 const researcher=actor==='researcher',cookie=researcher?'huisurvey_research_session':'ptool_session',csrfCookie=researcher?'huisurvey_research_csrf':'ptool_csrf'
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:researcher?'https://survey.eduk12.top':'https://training.eduk12.top',...(tokens[actor]?{Cookie:cookie+'='+tokens[actor]+'; '+csrfCookie+'=synthetic-csrf'}:{}),...(csrf?{'x-csrf-token':'synthetic-csrf'}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const result=await response.json() as {message:string;data:T}
 journal.push({actor,path,method:body===undefined?'GET':'POST',status:response.status,limit:response.headers.get('ratelimit-limit'),message:result.message,ids:(result.data as CatalogPage)?.list?.map((row:CatalogRow)=>row.id??row.toolKey??row.catalogId??row.ref?.sourceId),hasMore:(result.data as CatalogPage)?.hasMore})
 return {status:response.status,data:result.data,message:result.message,headers:response.headers}
}

beforeAll(async()=>{
 const url=process.env.LIBRARY_MANAGEMENT_HTTP_TEST_DATABASE_URL
 if(!url||process.env.LIBRARY_MANAGEMENT_HTTP_ISOLATED!=='1')throw new Error('Explicit task-owned HTTP integration fixture required')
 requireIsolatedReleaseDatabase(url)
 if(!/^redis:\/\/127\.0\.0\.1:\d+(?:\/\d+)?$/.test(process.env.REDIS_URL??''))throw new Error('Task-owned loopback Redis required')
 // The normal test runner bypasses these dynamic limiters. Activate their
 // unchanged production branches and assert the actual Redis-backed headers;
 // this isolated router harness is not production startup qualification.
 vi.stubEnv('NODE_ENV','production')
 await cacheService.initialize()
 const passwordHash=await hash(password,4)
 for(const actor of ['system','manager','outsider','researcher'] as const){
  const user=await db.user.create({data:{username:'library-http-'+actor+'-'+randomUUID(),passwordHash,role:actor==='system'||actor==='manager'?'ADMIN':'STUDENT',platformRole:actor==='system'?'SYSTEM_ADMIN':'STANDARD',accountDomain:actor==='researcher'?'SURVEY':'TRAINING'}})
  ids[actor]=user.id;usernames[actor]=user.username
 }
 await db.adminEntryGrant.create({data:{id:randomUUID(),userId:ids.manager!,entry:'SURVEY',grantedBy:ids.system!}})
 const login='synthetic'+randomUUID().replace(/-/g,'').slice(0,16)
 await db.surveyAccount.create({data:{userId:ids.researcher!,loginName:login,normalizedLogin:login}})
 await db.surveyResearcherGrant.create({data:{userId:ids.researcher!,status:'ACTIVE',grantedBy:ids.system!}})
 await db.surveyMfaCredential.create({data:{userId:ids.researcher!,enabled:true,secretCipher:'synthetic-not-a-real-mfa-secret'}})
 projectId=(await db.surveyProject.create({data:{id:randomUUID(),ownerUserId:ids.researcher!,title:'Synthetic HTTP catalog fixture',collectionMode:'SINGLE_UNLINKED'}})).id
 for(const actor of ['system','manager','outsider','researcher'] as const){
  tokens[actor]=generateToken({userId:ids[actor]!,username:usernames[actor]!,role:'ADMIN',accountDomain:actor==='researcher'?'SURVEY':'TRAINING',tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID(),...(actor==='researcher'?{mfaVerifiedAt:Math.floor(Date.now()/1000)}:{})})
 }
 // Synthetic incomplete directory rows only. No real source is installed,
 // submitted, approved, trialled or made ONLINE, and no measurement is created.
 for(let i=0;i<31;i++){
  const id=randomUUID(),identity={testType:i===0?'gonogo':'memory',engineVersion:'1.0.0',scoringVersion:i===0?'1.0.0':'1.1.0'}
  const snapshot={schemaVersion:1,family:'COGNITIVE',toolKey:'synthetic-catalog-'+i,version:'fixture-1',title:'Synthetic governed '+i,unit:{ref:{kind:'COGNITIVE',sourceId:'synthetic-config-'+i,sourceVersion:'fixture-only'},compiledDefinition:{sessionSnapshot:identity}},parameters:null,report:null,components:[],packageReport:null,reference:{}}
  const digest=canonicalHash(snapshot)
  await db.$executeRaw`INSERT INTO survey_governed_tools(id,family,tool_key,tool_version,title,snapshot,snapshot_hash,reference,submitted_by,submitted_at,blockers) VALUES(${id},'COGNITIVE',${snapshot.toolKey},'fixture-1',${snapshot.title},${JSON.stringify(snapshot)}::jsonb,${digest},'{}'::jsonb,${ids.system!},${new Date(Date.UTC(2026,9,25,0,0,i))},'["合成目录夹具缺少可运行内容，不能批准或投放"]'::jsonb)`
  if(i===0){governedTarget=id;governedHash=digest}
  const config=await db.cognitiveTestConfig.create({data:{id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),testType:i===30?'gonogo':'memory',configVersion:'synthetic-'+i,name:'Synthetic source '+i,engineVersion:'1.0.0',scoringVersion:i===30?'1.0.0':'1.1.0',config:{syntheticCatalogFixture:true},status:'PUBLISHED',accessPolicy:'OPEN'}})
  if(i===30)configTarget=config.id
 }
 const app=express();app.use(express.json());app.use('/api',csrfProtection)
 app.use(standard,platformSurveyOriginGuard,surveyStandardTripletRouter)
 app.use(library,platformSurveyOriginGuard,surveyLibraryAdminRouter)
 app.use('/api/platform/survey-tools',platformSurveyOriginGuard,surveyGovernedToolsRouter)
 app.use('/api/platform/survey-tool-use',platformSurveyOriginGuard,surveyGovernedUseRouter)
 app.use('/api/platform/survey',platformSurveyOriginGuard,surveyPlatformRouter)
 app.use('/api/survey/projects',surveyOriginGuard,surveyBuilderRouter);app.use(errorHandler)
 server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
},30000)

afterAll(async()=>{
 if(process.env.LIBRARY_MANAGEMENT_HTTP_JOURNAL)await writeFile(process.env.LIBRARY_MANAGEMENT_HTTP_JOURNAL,JSON.stringify({scope:'isolated synthetic HTTP; no real tool or grant writes',requests:journal},null,2)+'\n')
 if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))
 await (await import('../../config/queue')).closeQueues(true);await cacheService.close();await db.$disconnect();vi.unstubAllEnvs()
})

describe('bounded library management HTTP contracts with real authentication and PostgreSQL',()=>{
 it('requires current identity and an exact entry rather than a forged ADMIN JWT role',async()=>{
  expect((await call('anonymous',standard+'/catalog')).status).toBe(401)
  expect((await call('manager',standard+'/catalog')).status).toBe(403)
  expect((await call('outsider',sources+'?kind=COGNITIVE')).status).toBe(403)
 })
 it('finds standard versions across pages using multiple AND facets and Chinese/original IDs',async()=>{
  const expected=listScaleInstrumentSources().filter(source=>source.catalog.construct.constructOverlapTags.includes('student_self_report'))
   .map(source=>source.identity.instrumentKey+':'+source.identity.instrumentVersion)
  const first=await call('system',standard+'/catalog?tags=student_self_report&page=1'),second=await call('system',standard+'/catalog?tags=student_self_report&page=2')
  expect(first.status).toBe(200);expect(second.status).toBe(200);expect(first.headers.get('ratelimit-limit')).toBe('90')
  expect(first.data.list).toHaveLength(25);expect(first.data.hasMore).toBe(true);expect(second.data.list).toHaveLength(expected.length-25);expect(second.data.hasMore).toBe(false)
  expect(new Set([...first.data.list,...second.data.list].map(row=>row.toolKey+':'+row.instrumentVersion))).toEqual(new Set(expected))
  const query=(keyword:string)=>standard+'/catalog?'+new URLSearchParams({keyword,tags:'value_cost,mathematics,student_self_report,language:zh-CN'})
  const chinese=await call('system',query('学生 数学')),original=await call('system',query('student_self_report mathematics'))
  expect(chinese.status).toBe(200);expect(original.status).toBe(200)
  expect(chinese.data.list.map(row=>row.toolKey)).toEqual(['value_cost_mathematics_zh_cn'])
  expect(original.data.list.map(row=>row.toolKey)).toEqual(chinese.data.list.map(row=>row.toolKey))
  expect(chinese.data.list[0].classificationTags).toContainEqual({id:'language:zh-CN',label:'简体中文',facet:'language'})
 })
 it('keeps unfiltered page two readable and reports actual missing installation/approval/grants consistently',async()=>{
  const page=await call('system',library+'/catalog?page=2')
  expect(page.status).toBe(200);expect(page.data.list).toHaveLength(25)
  const sdq=await call('system',library+'/catalog?keyword=sdq')
  expect(sdq.status).toBe(200);expect(sdq.data.list.some(row=>row.exactVersion?.instrumentKey?.includes('sdq'))).toBe(true)
  const filtered=await call('system',library+'/catalog?'+new URLSearchParams({keyword:'学生 数学',tags:'value_cost,language:zh-CN'}))
  expect(filtered.status).toBe(200);expect(filtered.data.list).toHaveLength(1)
  const row=filtered.data.list[0];expect(row.states?.assignment.ready).toBe(false);expect(row.authorization?.useGrantStatus).toBe('NOT_EVALUATED')
  const preflight=await call<PreflightData>('system',standard+'/preflight/value_cost_mathematics_zh_cn/1.0.0')
  expect(preflight.status).toBe(200);expect(preflight.data.readOnly).toBe(true);expect(preflight.data.facts.scaleId).toBeNull()
  expect(preflight.data.stages.find(stage=>stage.key==='installation')!.state).toBe('PENDING')
  expect(preflight.data.stages.find(stage=>stage.key==='assignment')!.state).toBe('BLOCKED');expect(preflight.data.targetUseGrant).toBe('NOT_EVALUATED')
 })
 it('filters cognitive ability before page limits and never mistakes a label for approval or runtime support',async()=>{
  const first=await call('system',governed+'?family=COGNITIVE&page=1'),second=await call('system',governed+'?family=COGNITIVE&page=2')
  expect(first.status).toBe(200);expect(second.status).toBe(200);expect(first.headers.get('ratelimit-limit')).toBe('120')
  expect(first.data.list).toHaveLength(25);expect(second.data.list).toHaveLength(6);expect(first.data.list.some(row=>row.id===governedTarget)).toBe(false)
  const found=await call('system',governed+'?'+new URLSearchParams({family:'COGNITIVE',keyword:'反应抑制',tags:'cognitive-facet:response_inhibition/action_withholding'}))
  expect(found.status).toBe(200);expect(found.data.list.map(row=>row.id)).toEqual([governedTarget])
  expect(found.data.list[0].state).toBe('SUBMITTED');expect(found.data.list[0].states?.assignment.ready).toBe(false)
  expect((await call('system',governed+'?family=COGNITIVE&tags=cognitive-domain:working_memory,cognitive-domain:response_inhibition')).data.list).toEqual([])
  expect((await call('system',governed+'?family=COGNITIVE&tags=PUBLIC')).data.list).toEqual([])
  expect((await call('manager','/api/platform/survey-tool-use/catalog?family=COGNITIVE')).data.list).toEqual([])
  const rawFirst=await call('manager',sources+'?kind=COGNITIVE&page=1'),rawSecond=await call('manager',sources+'?kind=COGNITIVE&page=2')
  expect(rawFirst.status).toBe(200);expect(rawSecond.status).toBe(200);expect(rawFirst.data.list).toHaveLength(25);expect(rawSecond.data.list).toHaveLength(6)
  const original=await call('manager',sources+'?'+new URLSearchParams({kind:'COGNITIVE',keyword:'cognitive-domain:response_inhibition',tags:'cognitive-facet:response_inhibition/action_withholding'}))
  expect(original.status).toBe(200);expect(original.data.list.map(row=>row.ref?.sourceId)).toEqual([configTarget])
  expect(original.data.list[0].available).toBe(false);expect(original.data.list[0].unsupportedReason).toBe('SOURCE_COGNITIVE_CONTROLLED_IDENTITY_UNSUPPORTED')
 })
 it('rejects unqualified targets, unapproved exact versions, implicit bulk/label grants and missing CSRF with zero grants created',async()=>{
  const path=(id:string)=>'/api/platform/survey/researchers/'+id+'/tool-grants',source={kind:'COGNITIVE',sourceId:'survey-tool:'+governedTarget,sourceVersion:governedHash}
  expect((await call('manager',path(ids.outsider!),{currentPassword:password,source})).status).toBe(404)
  expect((await call('manager',path(ids.researcher!),{currentPassword:password,source})).status).toBe(409)
  expect((await call('manager',path(ids.researcher!),{currentPassword:password,source:{...source,sourceVersion:'wrong-exact-version'}})).status).toBe(409)
  expect((await call('manager',path(ids.researcher!),{currentPassword:password,sources:[source]})).status).toBe(400)
  expect((await call('manager',path(ids.researcher!),{currentPassword:password,source,tags:['cognitive-domain:response_inhibition'],selectAll:true})).status).toBe(400)
  expect((await call('manager',path(ids.researcher!),{currentPassword:password,source},false)).status).toBe(403)
  expect((await call('researcher','/api/survey/projects/'+projectId+'/catalog')).data.list).toEqual([])
  expect((await call('researcher','/api/survey/projects/'+projectId+'/catalog/'+randomUUID()+'/import',{requestId:randomUUID(),instrumentKey:'ungranted',title:'Synthetic denied import'})).status).toBe(403)
  const counts=await db.$queryRaw<Array<Record<string,bigint>>>`SELECT (SELECT count(*) FROM survey_tool_grants) AS tool_grants,(SELECT count(*) FROM scale_library_use_grants) AS use_grants,(SELECT count(*) FROM survey_package_grants) AS package_grants,(SELECT count(*) FROM scales) AS scales,(SELECT count(*) FROM survey_standard_releases) AS standard_releases,(SELECT count(*) FROM survey_governed_trials) AS trials,(SELECT count(*) FROM measurement_content_releases) AS measurements,(SELECT count(*) FROM survey_instrument_drafts) AS drafts`
  expect(Object.values(counts[0]).every(value=>value===0n)).toBe(true)
  expect(journal.length).toBeLessThanOrEqual(40)
 })
})
