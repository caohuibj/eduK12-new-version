import {createRequire} from 'node:module'
import {writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const root=process.env.PROBE_BACKEND_ROOT!,req=createRequire(root+'/package.json'),{Prisma}=req('@prisma/client'),{prisma:db}=req(root+'/src/config/database.ts')
const {assertCurrentRunStartAuthority}=req(root+'/src/modules/assessment-run/startAuthority.ts')
const out=process.env.AUTHORITY_OUTPUT!,result:any={scope:'Read-only diagnostic of existing completed synthetic Teacher SELF current-authority queries; not a new START or full timing replay',queries:[],completed:false}
const save=()=>writeFileSync(out,JSON.stringify(result,null,2)+'\n')
try{
 const [check]=await db.$queryRawUnsafe('SHOW default_transaction_read_only');assert.equal(check.default_transaction_read_only,'on')
 const [e]=await db.$queryRawUnsafe("SELECT id FROM assessment_run_executions WHERE status='COMPLETED' ORDER BY id LIMIT 1");assert(e)
 const statements:any[]=[]
 await db.$transaction(async(tx:any)=>{
  const proxy=new Proxy(tx,{get(target,key){if(key==='$queryRaw')return async(...args:any[])=>{const query=Array.isArray(args[0])?Prisma.sql(args[0],...args.slice(1)):args[0];const t=performance.now();const rows=await target.$queryRaw(...args);statements.push({query,ms:performance.now()-t,rows:Array.isArray(rows)?rows.length:null});return rows};return target[key]}})
  await assertCurrentRunStartAuthority(proxy,e.id,{accountMode:'DETECT_EDUCATION_LIBRARY'})
 },{timeout:20000})
 for(const entry of statements){const text=entry.query.text;assert(!/\b(INSERT|UPDATE|DELETE)\b/i.test(text),'Only plain read diagnostics');const hash=createHash('sha256').update(text).digest('hex');const plans=[]
  for(const collapse of [8,1])await db.$transaction(async(tx:any)=>{await tx.$executeRawUnsafe('SET LOCAL join_collapse_limit = '+collapse);const [row]=await tx.$queryRawUnsafe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+text,...entry.query.values);const p=row['QUERY PLAN'][0];plans.push({joinCollapse:collapse,planningMs:p['Planning Time'],executionMs:p['Execution Time'],actualRows:p.Plan['Actual Rows'],plan:p.Plan})},{timeout:20000})
  result.queries.push({hash,sql:text,parameterCount:entry.query.values.length,originalCallMs:entry.ms,originalRows:entry.rows,plans});save()
 }
 result.completed=true;save();console.log(JSON.stringify(result.queries.map((q:any)=>({hash:q.hash.slice(0,10),ms:q.originalCallMs,plans:q.plans.map((p:any)=>({collapse:p.joinCollapse,plan:p.planningMs,exec:p.executionMs}))}))))
}finally{await db.$disconnect()}
