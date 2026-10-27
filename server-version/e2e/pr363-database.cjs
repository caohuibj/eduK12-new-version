'use strict'
// One Actions-only additive migration / nonempty restore consumer, not a product journey rerun.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {execFileSync}=require('node:child_process'),{randomUUID,randomBytes,createHash}=require('node:crypto')
const {pathToFileURL}=require('node:url')
const repo=path.resolve(__dirname,'../..'),backend=path.join(repo,'server-version/backend')
const {Client}=require('../backend/node_modules/pg')
const digest=b=>createHash('sha256').update(b).digest('hex')
const sqlId=s=>'"'+s.replaceAll('"','""')+'"',literal=s=>"'"+String(s).replaceAll("'","''")+"'"
const run=(exe,args,options={})=>execFileSync(exe,args,{cwd:repo,encoding:'utf8',maxBuffer:64*1024*1024,...options})
const git=(...args)=>run('git',args).trim()
async function main(){
 for(const k of ['CI','GITHUB_ACTIONS'])assert.equal(process.env[k],'true')
 assert.equal(process.version,'v24.21.0');assert.equal(process.env.NODE_ENV,'test')
 assert.equal(git('rev-parse','HEAD'),process.env.GITHUB_SHA)
 assert.equal(git('diff','--name-only','HEAD','--','server-version','.github'),'')
 const service=process.env.CI_POSTGRES_SERVICE_ID;assert.match(service||'',/^[a-f0-9]{64}$/)
 const port=process.env.PR363_PG_PORT;assert.match(port||'',/^[0-9]+$/);assert(Number(port)>=1024&&Number(port)<=65535)
 const container=JSON.parse(run('docker',['inspect',service]))[0]
 assert.equal(container.Id,service);assert.equal(container.Config.Image,'postgres:16.15-bookworm');assert.equal(container.State.Running,true)
 assert(container.Config.Env.includes('POSTGRES_DB=pr363_ci_test')&&container.Config.Env.includes('POSTGRES_USER=ptool'))
 assert(container.Mounts.every(m=>m.Type==='volume'&&/^[a-f0-9]{64}$/.test(m.Name)))
 assert(container.NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort===port))
 const tmp=fs.realpathSync(process.env.RUNNER_TEMP),privateRoot=path.join(tmp,'pr363-database-private')
 assert(!fs.existsSync(privateRoot),'No retry against an already-used schema fixture');fs.mkdirSync(privateRoot,{mode:0o700})
 const out=path.join(repo,'pr363-evidence');fs.mkdirSync(out,{recursive:true})
 const binding=JSON.parse(fs.readFileSync(path.join(repo,'.github/scripts/pr363-bindings.json')))
 const url=name=>'postgresql://ptool:synthetic-pr363-only@127.0.0.1:'+port+'/'+name
 const owner=new Client({connectionString:url('pr363_ci_test')}),restore=new Client({connectionString:url('pr363_restore_test')})
 let runtime,restoredRuntime,stage='fresh-schema',restoreConnected=false
 const receipt={schemaVersion:1,head:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,status:'RUNNING',checks:[],syntheticOnly:true,productJourneysRepeated:false}
 const check=id=>receipt.checks.push(id)
 const snapshot=async db=>(await db.query(`SELECT 'users' AS kind,id::text AS id,row_to_json(t)::text AS data FROM users t UNION ALL SELECT 'organizations',id::text,row_to_json(t)::text FROM organizations t UNION ALL SELECT 'composite',id::text,row_to_json(t)::text FROM composite_assessments t ORDER BY kind,id`)).rows
 const migration=(schema,name)=>{
  const log=path.join(privateRoot,name+'.log'),fd=fs.openSync(log,'wx',0o600)
  try{run(process.execPath,[path.join(backend,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',schema],{env:{...process.env,DATABASE_URL:url('pr363_ci_test')},stdio:['ignore',fd,fd]})}finally{fs.closeSync(fd)}
  receipt[name+'LogSHA256']=digest(fs.readFileSync(log))
 }
 try{
  await owner.connect();assert.equal((await owner.query("SELECT current_database() AS db,current_user AS actor,current_setting('server_version_num') AS version")).rows[0].version,'160015')
  assert.equal((await owner.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0)
  assert.equal((await owner.query("SELECT count(*)::int n FROM pg_database WHERE datname='pr363_restore_test'")).rows[0].n,0)
  const baseDir=path.join(privateRoot,'base');fs.mkdirSync(baseDir)
  const archive=execFileSync('git',['archive',binding.base,'server-version/backend/prisma'],{cwd:repo,maxBuffer:64*1024*1024})
  run('tar',['-x','-C',baseDir],{input:archive})
  stage='old-schema';migration(path.join(baseDir,'server-version/backend/prisma/schema.prisma'),'base-migration')
  const {PrismaClient}=require('../backend/node_modules/@prisma/client'),db=new PrismaClient({datasources:{db:{url:url('pr363_ci_test')}}})
  let actor,org,source,target
  try{
   actor=await db.user.create({data:{username:'pr363-migration-'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',accountDomain:'SCHOOL'}})
   org=await db.organization.create({data:{id:randomUUID(),name:'Synthetic pre-upgrade organization',productDomain:'SCHOOL',createdByUserId:actor.id}})
   source=await db.compositeAssessment.create({data:{code:randomUUID(),name:'Synthetic pre-upgrade source',createdBy:actor.id}})
   target=await db.compositeAssessment.create({data:{code:randomUUID(),name:'Synthetic pre-upgrade runtime',createdBy:actor.id}})
  }finally{await db.$disconnect()}
  const before=await snapshot(owner);assert(before.length>=4);check('nonempty-base-schema-fixture')
  stage='candidate-upgrade';migration(path.join(backend,'prisma/schema.prisma'),'candidate-migration')
  assert.deepEqual(await snapshot(owner),before);assert.equal((await owner.query('SELECT count(*)::int n FROM education_assessment_deliveries')).rows[0].n,0)
  check('additive-upgrade-preserves-existing-rows-and-creates-no-deliveries')
  const id=randomUUID(),entry={releaseStatus:'DRAFT',educationOrigin:{resourceId:id,product:'SCHOOL',organizationId:org.id,family:'BUNDLE',sourceCompositeId:source.id,runtimeCompositeId:target.id},launchTarget:{compositeAssessmentId:target.id}}
  // Minimal SQL constraint fixture, not an approved executable tool or accepted FINAL.
  await owner.query(`INSERT INTO education_assessment_deliveries (id,product,organization_id,family,source_composite_id,runtime_composite_id,entry,entry_hash,created_by_user_id,created_authority) VALUES($1,'SCHOOL',$2,'BUNDLE',$3,$4,$5,$6,$7,$8)`,[id,org.id,source.id,target.id,entry,digest(JSON.stringify(entry)),actor.id,{actorId:actor.id}])
  const original=(await owner.query('SELECT row_to_json(t) AS data FROM education_assessment_deliveries t WHERE id=$1',[id])).rows[0].data
  const {verifyRuntimePrivileges}=await import(pathToFileURL(path.join(backend,'scripts/runtime-role-contract.mjs')).href)
  const {verifyReleaseSchema}=await import(pathToFileURL(path.join(backend,'scripts/release-schema-contract.mjs')).href)
  const role='pr363_runtime_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex')
  await owner.query(`CREATE ROLE ${sqlId(role)} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`)
  const runtimeFor=async(db,name)=>{
   await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');await db.query(`GRANT CONNECT ON DATABASE ${sqlId(name)} TO ${sqlId(role)}`);await db.query(`GRANT USAGE ON SCHEMA public TO ${sqlId(role)}`)
   const values={target_database:name,migration_owner:'ptool',runtime_role:role,table_policy:fs.readFileSync(path.join(backend,'scripts/runtime-table-policy.json'),'utf8')}
   await db.query(fs.readFileSync(path.join(backend,'scripts/runtime-role-defaults.sql'),'utf8').replace(/:'(target_database|migration_owner|runtime_role|table_policy)'/g,(_,key)=>literal(values[key])))
   const u=new URL(url(name));u.username=role;u.password=password
   const r=new PrismaClient({datasources:{db:{url:u.href}}});assert.equal((await verifyRuntimePrivileges(r)).restrictedRuntimeRole,true);await verifyReleaseSchema(r);return r
  }
  stage='runtime-immutability';runtime=await runtimeFor(owner,'pr363_ci_test')
  await assert.rejects(runtime.$executeRawUnsafe('DELETE FROM education_assessment_deliveries WHERE id=$1',id),/immutable/)
  await assert.rejects(runtime.$executeRawUnsafe("UPDATE education_assessment_deliveries SET entry=jsonb_set(entry,'{educationOrigin,product}','\"TEACHER\"') WHERE id=$1",id),/immutable/)
  await assert.rejects(runtime.$executeRawUnsafe("UPDATE education_assessment_deliveries SET status='PUBLISHED' WHERE id=$1",id),/transition/)
  check('restricted-runtime-and-delivery-immutability')
  stage='dump-restore';const dump=execFileSync('docker',['exec',service,'pg_dump','-U','ptool','-Fc','--no-owner','--no-acl','pr363_ci_test'],{maxBuffer:64*1024*1024})
  assert(dump.length>1000);receipt.syntheticDumpSHA256=digest(dump)
  await owner.query('CREATE DATABASE pr363_restore_test OWNER ptool')
  execFileSync('docker',['exec','-i',service,'pg_restore','-U','ptool','--exit-on-error','--no-owner','--no-acl','-d','pr363_restore_test'],{input:dump,maxBuffer:64*1024*1024})
  await restore.connect();restoreConnected=true;assert.deepEqual(await snapshot(restore),before)
  assert.deepEqual((await restore.query('SELECT row_to_json(t) AS data FROM education_assessment_deliveries t WHERE id=$1',[id])).rows[0].data,original)
  restoredRuntime=await runtimeFor(restore,'pr363_restore_test')
  await assert.rejects(restoredRuntime.$executeRawUnsafe('DELETE FROM education_assessment_deliveries WHERE id=$1',id),/immutable/)
  check('nonempty-restore-identical-data-schema-runtime-and-trigger')
  receipt.status='PASS';receipt.stage='complete'
 }catch(error){receipt.status='FAILED';receipt.stage=stage;receipt.errorDigest=digest(String(error));throw Error('PR363 database consumer failed at '+stage+'; original sanitized receipt retained')}
 finally{
  await runtime?.$disconnect();await restoredRuntime?.$disconnect();if(restoreConnected)await restore.end();await owner.end()
  fs.rmSync(privateRoot,{recursive:true,force:true});receipt.privateLogsUploaded=false
  fs.writeFileSync(path.join(out,'database.json'),JSON.stringify(receipt,null,2)+'\n')
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
