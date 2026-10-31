import {createRequire} from 'node:module'
import {writeFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
const root=process.env.PROBE_BACKEND_ROOT!,req=createRequire(root+'/package.json')
const {prisma:db}=req(root+'/src/config/database.ts')
const {verifyConfiguredRuntime}=await import(root+'/scripts/runtime-role-contract.mjs')
const {saveTaskGroupArtifact,readTaskGroupArtifact}=req(root+'/src/modules/reporting/task-artifact.ts')
const output=process.env.OBSERVER_OUTPUT!,result:any={scope:'Synthetic artifact persistence and restricted runtime only, not HTTP/group science/authorization acceptance',completed:false,checks:[]}
const save=()=>writeFileSync(output,JSON.stringify(result,null,2)+'\n')
try{
 const [identity]=await db.$queryRawUnsafe('SELECT current_database() AS database,current_user AS role')
 assert.equal(identity.database,'b_o13_authority_test');assert.equal(identity.role,'b_o13_runtime')
 result.verification=await verifyConfiguredRuntime({current:true});result.checks.push('exact migrated schema and restricted runtime privileges');save()
 const user=await db.user.create({data:{username:'b-artifact-'+randomUUID(),passwordHash:'synthetic-nonlogin',accountDomain:'TRAINING'}})
 const source={product:'TRAINING',containerId:randomUUID(),taskId:randomUUID()}
 const artifact=await saveTaskGroupArtifact(db,{source,generatedBy:user.id,selector:{kind:'ALL'},sourceBindings:{parents:[]},projection:{
  schemaVersion:1,descriptionVersion:'group-descriptive-v1',title:'Synthetic runtime policy probe',sourceLabel:'No respondent records',populationLabel:'Synthetic only',cutoff:new Date().toISOString(),completedN:0,countUnit:'RESPONSE',assignedN:null,tool:{key:'synthetic',title:'Synthetic',kind:'FORM'},metrics:[],limitations:['Persistence probe; not a generated scientific report.']}})
 assert.deepEqual((await readTaskGroupArtifact(db,source,artifact.artifactId))?.projection,artifact.projection)
 assert.equal(await readTaskGroupArtifact(db,{...source,containerId:randomUUID()},artifact.artifactId),null)
 result.checks.push('actual encrypted artifact insert/read and exact source mismatch');save()
 for(const op of ['UPDATE reporting_task_artifacts SET payload_hash=payload_hash WHERE id=$1','DELETE FROM reporting_task_artifacts WHERE id=$1']){
  await assert.rejects(()=>db.$executeRawUnsafe(op,artifact.artifactId),/reporting snapshot rows are immutable/)
 }
 result.checks.push('immutable trigger refuses UPDATE and DELETE');save()
 await assert.rejects(()=>db.$executeRawUnsafe('UPDATE _prisma_migrations SET checksum=checksum WHERE false'),/permission denied/)
 await assert.rejects(()=>db.$executeRawUnsafe('CREATE TABLE b_runtime_ddl_forbidden(id text)'),/permission denied/)
 result.checks.push('migration ledger write and schema CREATE remain denied')
 result.completed=true;save();console.log(JSON.stringify(result))
}catch(error:any){result.error={name:error.name,code:error.code,message:error.message};save();throw error}
finally{await db.$disconnect()}
