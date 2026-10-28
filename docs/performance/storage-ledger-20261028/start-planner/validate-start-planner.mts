import {createRequire} from 'node:module'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const root=process.env.PROBE_BACKEND_ROOT!,req=createRequire(root+'/package.json'),{prisma:db}=req(root+'/src/config/database.ts')
const {assertCurrentRunStartAuthority}=req(root+'/src/modules/assessment-run/startAuthority.ts')
const out=process.env.AUTHORITY_OUTPUT!,result:any={scope:'Existing owned synthetic completed Teacher SELF record; current authority only, no START/FINAL/report replay; mutation branches explicitly roll back',cases:[],completed:false}
const save=()=>writeFileSync(out,JSON.stringify(result,null,2)+'\n');save()
async function settings(tx:any){return (await tx.$queryRawUnsafe("SELECT pg_backend_pid() AS pid,current_setting('join_collapse_limit') AS value"))[0]}
try{
 const [e]=await db.$queryRawUnsafe("SELECT e.id,e.run_id AS run,r.user_id AS actor FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id WHERE e.status='COMPLETED' ORDER BY e.id LIMIT 1");assert(e)
 const before=await settings(db),finals=await db.assessmentUnitSnapshot.count();assert.equal(before.value,'8')
 const t=performance.now();await db.$transaction(async(tx:any)=>{await assertCurrentRunStartAuthority(tx,e.id,{accountMode:'DETECT_EDUCATION_LIBRARY'});const inside=await settings(tx);assert.equal(inside.value,'1');assert.equal(inside.pid,before.pid)})
 const after=await settings(db);assert.deepEqual(after,before);result.cases.push({name:'current authority and pooled setting restored',status:'PASS',before,after,ms:performance.now()-t});save()
 const rollback=new Error('owned diagnostic rollback')
 for(const kind of ['expired-intake','frozen-actor']){
  try{await db.$transaction(async(tx:any)=>{
   if(kind==='expired-intake')await tx.$executeRaw`UPDATE assessment_runs SET intake_deadline=statement_timestamp()-interval '1 minute' WHERE id=${e.run}`
   else await tx.user.update({where:{id:e.actor},data:{isFrozen:true}})
   await assert.rejects(()=>assertCurrentRunStartAuthority(tx,e.id,{accountMode:'DETECT_EDUCATION_LIBRARY'}),{code:kind==='expired-intake'?'RUN_INTAKE_CLOSED':'RUN_ACCOUNT_INACTIVE'})
   throw rollback
  });throw Error('Rollback branch committed unexpectedly')}catch(error){if(error!==rollback)throw error}
  assert.deepEqual(await settings(db),before);result.cases.push({name:kind+' remains denied and diagnostic mutation rolled back',status:'PASS'});save()
 }
 assert.equal((await db.user.findUniqueOrThrow({where:{id:e.actor}})).isFrozen,false)
 assert.equal(await db.assessmentUnitSnapshot.count(),finals)
 await db.$transaction((tx:any)=>assertCurrentRunStartAuthority(tx,e.id,{accountMode:'DETECT_EDUCATION_LIBRARY'}))
 assert.deepEqual(await settings(db),before);result.completed=true;result.immutableFinalCountUnchanged=finals;save()
}finally{await db.$disconnect()}
