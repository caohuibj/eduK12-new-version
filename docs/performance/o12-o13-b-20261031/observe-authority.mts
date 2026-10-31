import {createRequire} from 'node:module'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'

// Task-owned synthetic database only. This is a performance diagnostic, not an
// authorization acceptance suite or a replacement for HTTP/START/FINAL evidence.
const root=process.env.PROBE_BACKEND_ROOT!,req=createRequire(root+'/package.json')
const {Prisma}=req('@prisma/client'),{prisma:db}=req(root+'/src/config/database.ts')
const output=process.env.OBSERVER_OUTPUT!,mode=process.env.OBSERVER_MODE!
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex')
const result:any={schemaVersion:1,mode,completed:false,samples:[],plans:[],scope:'One synthetic Teacher SELF library Scale pending execution; current authority reader only; no START/FINAL/report/concurrency/production claim'}
const save=()=>writeFileSync(output,JSON.stringify(result,(_k,v)=>typeof v==='bigint'?String(v):v,2)+'\n')
try{
 const [identity]=await db.$queryRawUnsafe('SELECT current_database() AS name,version() AS version')
 assert.equal(identity.name,'b_o13_authority_test');result.postgres=identity.version
 if(mode==='seed'){
  const {setupEducationLibraryRuntimeFixture}=req(root+'/src/__tests__/integration/educationLibraryRuntimeFixture.ts')
  const fixture=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER'})
  assert(fixture.executionId);result.executionId=fixture.executionId
  const [counts]=await db.$queryRawUnsafe('SELECT (SELECT count(*) FROM assessments)::int AS answers,(SELECT count(*) FROM assessment_unit_snapshots)::int AS snapshots')
  assert.deepEqual(counts,{answers:0,snapshots:0});result.noFinalRows=counts
 }else{
  assert.equal(mode,'read')
  const {assertCurrentRunStartAuthority}=req(root+'/src/modules/assessment-run/startAuthority.ts')
  const executionId=JSON.parse(readFileSync(process.env.FIXTURE_INPUT!,'utf8')).executionId
  const captured:any[]=[]
  // The database has already served setup and the identity SELECT above. The
  // first invocation is NOT an OS-cache-cold database or a cold browser visit.
  for(let i=0;i<6;i++){
   const queries:any[]=[],cpu=process.cpuUsage(),memoryBefore=process.memoryUsage(),start=performance.now()
   await db.$transaction(async(tx:any)=>{
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
    const [s]=await tx.$queryRawUnsafe("SELECT current_setting('transaction_read_only') AS ro,pg_backend_pid() AS pid,current_setting('join_collapse_limit') AS collapse")
    assert.equal(s.ro,'on')
    const proxy=new Proxy(tx,{get(target,key){
     if(key==='$queryRaw')return async(...args:any[])=>{
      const query=Array.isArray(args[0])?Prisma.sql(args[0],...args.slice(1)):args[0],t=performance.now()
      const rows=await target.$queryRaw(...args)
      queries.push({hash:sha(query.text),wallMs:performance.now()-t,rows:rows.length})
      if(i===0)captured.push(query)
      return rows
     }
     const value=target[key];return typeof value==='function'?value.bind(target):value
    }})
    await assertCurrentRunStartAuthority(proxy,executionId,{accountMode:'DETECT_EDUCATION_LIBRARY'})
    result.samples.push({invocation:i+1,readerAndTransactionWallMs:performance.now()-start,cpuMicros:process.cpuUsage(cpu),memoryBefore,memoryAfter:process.memoryUsage(),pid:s.pid,initialJoinCollapse:s.collapse,queries})
   },{timeout:20000})
   const [after]=await db.$queryRawUnsafe("SELECT current_setting('join_collapse_limit') AS value")
   assert.equal(after.value,'8');save()
  }
  // Only two source-expanded statements changed since the earlier planner
  // evidence: library identity detection and final population/time window.
  // Interleave alternatives to expose order effects; do not time the old suite.
  for(const index of [0,captured.length-1]){
   const query=captured[index];assert(!/\b(INSERT|UPDATE|DELETE|FOR SHARE|FOR UPDATE)\b/i.test(query.text))
   const item:any={ordinal:index+1,hash:sha(query.text),sql:query.text,parameterCount:query.values.length,observations:[]}
   for(const collapse of [8,1,1,8,8,1]){
    await db.$transaction(async(tx:any)=>{
     await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
     await tx.$executeRawUnsafe('SET LOCAL join_collapse_limit = '+collapse)
     const [row]=await tx.$queryRawUnsafe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+query.text,...query.values)
     item.observations.push({joinCollapse:collapse,plan:row['QUERY PLAN'][0]})
    },{timeout:20000})
   }
   result.plans.push(item);save()
  }
  const [counts]=await db.$queryRawUnsafe('SELECT (SELECT count(*) FROM assessments)::int AS answers,(SELECT count(*) FROM assessment_unit_snapshots)::int AS snapshots')
  assert.deepEqual(counts,{answers:0,snapshots:0});result.noFinalRows=counts
 }
 result.loadedSources=Object.keys(req.cache).filter(p=>p.startsWith(root+'/src/')&&/\.[cm]?tsx?$/.test(p)).sort().map(path=>({path:path.slice(root.length+1),sha256:sha(readFileSync(path))}))
 result.completed=true;save()
 console.log(JSON.stringify({mode,completed:true,samples:result.samples.map((s:any)=>({n:s.invocation,ms:s.readerAndTransactionWallMs,selects:s.queries.length})),plans:result.plans.map((p:any)=>({ordinal:p.ordinal,values:p.observations.map((o:any)=>({collapse:o.joinCollapse,planningMs:o.plan['Planning Time'],executionMs:o.plan['Execution Time']}))}))}))
}catch(error:any){result.error={name:error.name,code:error.code,message:error.message};save();throw error}
finally{await db.$disconnect()}
