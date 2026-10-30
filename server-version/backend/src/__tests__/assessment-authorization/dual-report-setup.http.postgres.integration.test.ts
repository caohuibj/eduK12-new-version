import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const suite=process.env.PRECISE_DUAL_REPORT_SETUP==='1'?describe:describe.skip
suite('Normal isolated scale setup registers two nonempty reports without changing the default',()=>{
 let db:any,server:Server|undefined,base='',sign:any
 const requests:any[]=[],observations:any[]=[],state:any={}
 const keys=['cfq7_zh_cn_research','ipip_neo_c1_self_efficacy10_zh_cn_research','bps9_zh_cn_research']
 async function checkpoint(){await writeFile(process.env.PRECISE_DUAL_REPORT_CHECKPOINT!,JSON.stringify(state,null,2)+'\n',{mode:0o600})}
 beforeAll(async()=>{
  const u=new URL(process.env.PRECISE_DUAL_REPORT_DATABASE_URL!);if(u.hostname!=='127.0.0.1'||u.port!=='55439'||!['/precise_dual_report_test_20261030','/precise_dual_report_test_20261030_v2'].includes(u.pathname)||u.username!=='precise_task1_runtime')throw Error('Fresh named isolated restricted runtime required')
  db=(await import('../../config/database')).prisma;expect(await db.user.count()).toBe(0);expect(await db.scale.count()).toBe(0)
  const [identity]=await db.$queryRaw`SELECT rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`;expect(identity).toEqual({rolsuper:false,rolcreaterole:false,rolbypassrls:false})
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection);app.use('/api/admin/permissions',(await import('../../modules/admin-permissions/routes')).adminPermissionsRouter);app.use((await import('../../middleware/errorHandler')).errorHandler)
  sign=(await import('../../utils/jwt')).generateToken;server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as any).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_DUAL_REPORT_EVIDENCE??'/tmp/dual-report-setup.json',JSON.stringify({productionAccessed:false,requests,observations,scope:'Fresh normal migrations; synthetic identity fixture only, normal seedScalePackages twice and real admin entry API. Restricted role. No source/report SQL patch, Cognitive seed/test or production activation.'},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('loads basic/fun R through the existing seed materializer, repeats idempotently and keeps all sources DRAFT/HIDDEN',async()=>{
  const actors:any={}
  for(const name of ['system','manager','standardTeacher','funTeacher']){
   const user=await db.user.create({data:{username:'synthetic-dual-report-'+name+'-'+randomUUID(),passwordHash:'!synthetic-no-login',role:name.endsWith('Teacher')?'TEACHER':'STUDENT',teacherApproved:name.endsWith('Teacher'),platformRole:name==='system'?'SYSTEM_ADMIN':'STANDARD',accountDomain:'TRAINING',isActive:true,isFrozen:false,mustChangePassword:false}});actors[name]=user;state[name+'Id']=user.id;await checkpoint()
  }
  const token=sign({userId:actors.system.id,username:actors.system.username,role:actors.system.role,accountDomain:'TRAINING',tokenVersion:actors.system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+'/api/admin/permissions/accounts/'+actors.manager.id+'/entries/TRAINING',{method:'PUT',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',Cookie:'ptool_session='+token+'; ptool_csrf=dual-report-setup','X-CSRF-Token':'dual-report-setup'},body:JSON.stringify({active:true,expectedVersion:0,reason:'Synthetic exact dual-report entry manager fixture'})});const body=await response.json() as any;requests.push({method:'PUT',path:'/admin/permissions/accounts/:manager/entries/TRAINING',status:response.status});expect(response.status,body.message).toBe(200)
  const {seedScalePackages}=await import('../../../prisma/seeds/scales')
  await seedScalePackages(db,actors.system.id)
  const snapshots=()=>db.$queryRaw`SELECT s.id AS scale_id,s.code,s.instrument_version,s.status::text,s.visibility::text,a.axis_hash,a.source_hash,a.axes,a.source_snapshot#>'{executable,definition,report}' AS report FROM scales s JOIN scale_axis_snapshots a ON a.scale_id=s.id WHERE s.code=ANY(${keys}::text[]) ORDER BY s.code,a.axis_hash`
  const first=await snapshots();expect(first).toHaveLength(6)
  for(const key of keys){const rows=first.filter((r:any)=>r.code===key);expect(rows).toHaveLength(2);expect(rows.every((r:any)=>r.status==='DRAFT'&&r.visibility==='HIDDEN'&&r.report.interpretations.length)).toBe(true);expect(new Set(rows.map((r:any)=>r.axes.measurementHash)).size).toBe(1);expect(new Set(rows.map((r:any)=>canonicalHash(r.report))).size).toBe(2)}
  const defaults=await db.scale.findMany({where:{code:{in:keys}},select:{id:true,code:true,definition:true,status:true,visibility:true},orderBy:{code:'asc'}}),beforeHash=canonicalHash(defaults)
  state.scaleId=defaults.find((s:any)=>s.code===keys[0]).id;state.setupSnapshots=first.map((r:any)=>({code:r.code,axisHash:r.axis_hash,sourceHash:r.source_hash,reportVersion:r.report.reportVersion,reportHash:canonicalHash(r.report)}));await checkpoint()
  await seedScalePackages(db,actors.system.id)
  expect(await snapshots()).toEqual(first);expect(canonicalHash(await db.scale.findMany({where:{code:{in:keys}},select:{id:true,code:true,definition:true,status:true,visibility:true},orderBy:{code:'asc'}}))).toBe(beforeHash)
  expect(await db.cognitiveTestConfig.count()).toBe(0);const [approved]=await db.$queryRaw`SELECT count(*)::int AS n FROM survey_standard_releases`;expect(approved.n).toBe(0)
  state.setupComplete=true;await checkpoint();observations.push({toolCount:3,nonemptyReportSnapshots:6,normalSeedIdempotent:true,defaultDefinitionsUnchanged:true,allDraftHidden:true,noCognitiveContentInstalled:true,snapshots:state.setupSnapshots})
 },60000)
})
