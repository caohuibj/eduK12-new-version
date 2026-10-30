/** Explicit, read-only function/HTTP comparison on retained synthetic data.
 * This does not boot a release, qualify 253/255 migrations, or benchmark writes.
 */
import {strict as assert} from 'node:assert'
import {createHash,randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {createServer,type Server} from 'node:http'
import {createRequire} from 'node:module'
import {realpathSync,readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'

const workspace='/workspace/eduK12-new-version'
const baseline='/workspace/materials-load-20261029/performance-main-dc0'
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')
const json=(value:unknown)=>JSON.stringify(value)
async function main(){
 const root=process.env.PRECISE_PERF_SOURCE_ROOT
 assert(root===workspace||root===baseline,'Only the two explicit local source roots are allowed')
 assert.equal(realpathSync(root),root)
 assert.equal(process.env.PRECISE_READ_PERFORMANCE,'1')
 assert.equal(process.env.NODE_ENV,'test')
 assert.equal(process.env.PERF_ISOLATED_TEST_MODE,'1');assert.equal(process.env.PERF_SQL_EVENT_COUNT,'1')
 const url=new URL(process.env.DATABASE_URL!)
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55439')
 assert.equal(url.pathname,'/precise_runtime_role_test_20261029');assert.equal(url.username,'precise_task1_runtime')
 const output=process.env.PRECISE_PERF_OUTPUT!
 assert(output.startsWith('/workspace/materials-load-20261029/evidence/')&&output.endsWith('.json'))
 const rounds=Number(process.env.PRECISE_PERF_ROUNDS??'30')
 assert(Number.isInteger(rounds)&&rounds>=1&&rounds<=50)
 const kinds=process.env.PRECISE_PERF_KIND==='directory'?['directory'] as const:process.env.PRECISE_PERF_KIND==='report'?['report'] as const:['directory','report'] as const
 const backend=path.join(root,'server-version/backend'),load=createRequire(path.join(backend,'package.json'))
 const source=(relative:string)=>load(path.join(backend,'src',relative))
 const git=(args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim()
 const result:any={schemaVersion:1,sourceCommit:git(['rev-parse','HEAD']),sourceBackendTree:git(['rev-parse','HEAD:server-version/backend']),
  runnerSha256:sha(readFileSync(__filename)),node:process.version,startedAt:new Date().toISOString(),rounds,
  scope:'Single small retained fixture; readonly directory function and historical report HTTP. Same 255-migration database; main release boot/253-migration qualification not claimed.',
  productionAccessed:false,concurrency:1,cache:'Independent Node process, shared warm PostgreSQL/Redis. First observation is not host cold startup.',
  samples:[],firstObservations:[],warmups:[],errors:[],tables:{},files:{}}
 for(const file of ['prisma/schema.prisma','package.json','package-lock.json','src/modules/measurement-content/standard-combination-use.ts','src/modules/composite/composite.service.ts'])
  result.files[file]=sha(readFileSync(path.join(backend,file)))
 let db:any,server:Server|undefined,queries=0,sqlDurationMs=0,writesObserved=0,state:(()=>Promise<Record<string,unknown>>)|undefined
 try{
  const init=performance.now();db=source('config/database.ts').prisma
  db.$on('query',(event:{query:string;duration:number})=>{
   queries++;sqlDurationMs+=event.duration
   // No SQL text, parameters or credentials leave this counter.
   if(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i.test(event.query))writesObserved++
  })
  const [identity]=await db.$queryRaw`SELECT current_user,session_user`
  assert.deepEqual(identity,{current_user:'precise_task1_runtime',session_user:'precise_task1_runtime'})
  result.identity=identity;result.migrationRows=await db.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations`
  const tables=['users','material_grants','composite_assessments','composite_assessment_items','composite_assessment_attempts',
   'assessment_management_events','survey_standard_releases','measurement_content_releases','assessment_public_templates']
  state=async()=>{
   const hashes:Record<string,unknown>={}
   for(const table of tables){
    // Fixed local allowlist, not request input. Hash rows on the DB; no contents exported.
    const [row]=await db.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) AS h FROM "${table}" t) rows`)
    hashes[table]=row
   }
   return hashes
  }
  result.tables.before=await state()
  assert.equal(result.tables.before.users.count,6);assert.equal(result.tables.before.composite_assessments.count,13)
  const task=await db.compositeAssessment.findFirstOrThrow({where:{name:'Synthetic exact COURSE participant journey'}})
  const attempt=await db.compositeAssessmentAttempt.findFirstOrThrow({where:{compositeAssessmentId:task.id,status:'COMPLETED'}})
  const teacher=await db.user.findUniqueOrThrow({where:{id:task.createdBy}})
  const sourceRef=attempt.trainingContentBinding.units.find((unit:any)=>unit.source.standardCombination).source.standardCombination.reference
  assert.equal(sourceRef.selectedBinding.authorizationRevision,7)
  const use=await db.materialGrant.findUniqueOrThrow({where:{id:sourceRef.selectedBinding.authorizationId}})
  assert.equal(use.version,9);assert.equal(use.revokedAt,null)
  result.fixture={users:6,tasks:13,grants:4,historicalSelectedRevision:7,currentUseRevision:9,
   attemptSnapshotBytes:Buffer.byteLength(json(attempt.trainingContentBinding)),attemptSnapshotHash:sha(json(attempt.trainingContentBinding))}
  const choices=source('modules/measurement-content/standard-combination-use.ts').listTrainingStandardCombinationChoices
  const express=load('express'),app=express();app.use(express.json())
  app.use('/api',source('middleware/csrf.ts').csrfProtection)
  app.use('/api/composite-assessments',source('modules/composite/composite.routes.ts').default)
  app.use(source('middleware/errorHandler.ts').errorHandler)
  const token=source('utils/jwt.ts').generateToken({userId:teacher.id,username:teacher.username,role:teacher.role,accountDomain:'TRAINING',tokenVersion:teacher.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve))
  const base='http://127.0.0.1:'+(server.address() as {port:number}).port
  result.moduleAndFixtureInitMs=performance.now()-init
  const expected:Record<string,string>={}
  async function observe(kind:'directory'|'report',phase:string,index:number){
   const q=queries,d=sqlDurationMs,start=performance.now();let payload:any,projected:any,status:number|undefined
   if(kind==='directory'){
    payload=await choices(teacher.id);assert.equal(payload.length,2,'Main/candidate must return the same two legitimate choices')
    assert(payload.every((row:any)=>row.available!==false),'Unavailable choices are not a comparable successful baseline')
    projected=payload.map((row:any)=>({combination:row.combination,scaleId:row.scaleId,title:row.title,toolKey:row.toolKey,
     instrumentVersion:row.instrumentVersion,axisVersions:row.axisVersions,useGrantId:row.useGrantId,useGrantVersion:row.useGrantVersion}))
   }else{
    const response=await fetch(base+'/api/composite-assessments/'+task.id+'/attempts/'+attempt.id+'/report',{headers:{Cookie:'ptool_session='+token}})
    status=response.status;payload=await response.json() as any
    if(status!==200)result.failedResponse={kind,status,message:payload.message}
    assert.equal(status,200,payload.message)
    assert.equal(payload.data.contentReports.length,1);projected=payload.data
   }
   const sample={kind,phase,index,elapsedMs:performance.now()-start,queries:queries-q,sqlDurationMs:sqlDurationMs-d,
    responseBytes:Buffer.byteLength(json(payload)),projectedHash:sha(json(projected)),...(status?{status}:{})}
   if(expected[kind])assert.equal(sample.projectedHash,expected[kind],'Frozen business result must stay constant')
   else expected[kind]=sample.projectedHash
   return sample
  }
  for(const kind of kinds){
   result.firstObservations.push(await observe(kind,'first',0))
   for(let i=0;i<3;i++)result.warmups.push(await observe(kind,'warmup',i))
   for(let i=0;i<rounds;i++)result.samples.push(await observe(kind,'warm',i))
  }
 }catch(error){result.errors.push({name:(error as Error).name,message:(error as Error).message});process.exitCode=1}
 finally{
  if(state&&result.tables.before)try{
   result.tables.after=await state();assert.deepEqual(result.tables.after,result.tables.before,'Retained rows must not change')
  }catch(error){result.errors.push({name:(error as Error).name,message:(error as Error).message});process.exitCode=1}
  result.writesObserved=writesObserved
  if(writesObserved){result.errors.push({message:'Read probe observed a write; stop without replay'});process.exitCode=1}
  result.finishedAt=new Date().toISOString()
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await source('config/queue.ts').closeQueues(true);await db.$disconnect()}
  writeFileSync(output,JSON.stringify(result,null,2)+'\n')
 }
}
main().catch(error=>{console.error(error);process.exitCode=1})
