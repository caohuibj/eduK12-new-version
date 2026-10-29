// Local control precheck only. Formal migrate/restore qualification remains in
// the existing Actions PG job after its actual current-source behavior suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {migrate,restoreRows} from './school-teacher-checks.mjs';
import {SELF_BASE,sha256} from './school-teacher-scope.mjs';
import {verifyRuntimePrivileges} from '../../server-version/backend/scripts/runtime-role-contract.mjs';
import {verifyReleaseSchema} from '../../server-version/backend/scripts/release-schema-contract.mjs';
const require=createRequire(import.meta.url),{Client}=require('../../server-version/backend/node_modules/pg'),{PrismaClient}=require('../../server-version/backend/node_modules/@prisma/client');
const selected=process.env.EDUCATION_SELF_STORAGE_LOCAL_URL,serviceId=process.env.EDUCATION_SELF_STORAGE_LOCAL_CONTAINER;
const run=selected&&serviceId?test:test.skip;
run('LOCAL_PRECHECK exact nonempty main baseline preserves rows and scientific DDL through upgrade and real dump restore with a restricted role',async()=>{
 const url=new URL(selected);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/education_self_storage_ci_test');assert.equal(url.username,'ptool');assert.match(serviceId,/^[a-f0-9]{64}$/);
 const inspect=()=>JSON.parse(execFileSync('docker',['inspect',serviceId],{encoding:'utf8'}))[0];
 const guard=()=>{const d=inspect();assert.equal(d.State.Running,true);assert.equal(d.Config.Image,'postgres:16.15-bookworm');assert.equal(d.Config.Labels['education.self.purpose'],'ci-storage-local-precheck');assert(d.Config.Env.includes('POSTGRES_DB=education_self_storage_ci_test'));assert(d.NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort===url.port&&p.HostIp==='127.0.0.1'));assert(d.Mounts.every(m=>m.Type==='volume'&&/^[a-f0-9]{64}$/.test(m.Name)));};
 guard();assert.notEqual(process.env.GITHUB_ACTIONS,'true','Local precheck must not impersonate Actions');
 const previous={DATABASE_URL:process.env.DATABASE_URL,RUNNER_TEMP:process.env.RUNNER_TEMP},dir=mkdtempSync(join(tmpdir(),'education-self-storage-'));
 process.env.DATABASE_URL=url.href;process.env.RUNNER_TEMP=dir;
 const sql=readFileSync(new URL('./school-teacher-self-baseline.sql',import.meta.url),'utf8');
 const preserveTables=['users','organizations','organization_memberships','courses','campus_activities','education_private_tools','education_private_tool_versions','composite_assessments'];
 const b={base:SELF_BASE,execution:{migration:{baselineFixtureSql:sql,baselineFixtureSha256:sha256(sql),preserveTables}}};
 let owner;
 try{
  await migrate(b,{guard});
  owner=new Client({connectionString:url.href});await owner.connect();
  const source=(await owner.query("SELECT pg_get_functiondef('education_composition_scientific_json(jsonb)'::regprocedure) AS definition")).rows[0];assert(source.definition.includes('leading_count'));
  const {restrictedRole}=require('../../server-version/e2e/school-teacher-fixture.cjs');
  const runtimeUrl=await restrictedRole(url.href,'local_storage_precheck');
  const preserved=await restoreRows({owner,url:url.href,serviceId,tables:preserveTables,database:'school_teacher_restore_ci_test',checkRestored:async target=>{
   const actual=new URL(runtimeUrl);actual.pathname=target.pathname;
   const runtime=new PrismaClient({datasources:{db:{url:actual.href}}});
   try{assert.equal((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole,true);await verifyReleaseSchema(runtime)}finally{await runtime.$disconnect()}
  }});
  assert.deepEqual(preserved.map(r=>r.table),preserveTables);assert(preserved.every(r=>r.count>0));
  assert.deepEqual((await owner.query("SELECT datname FROM pg_database WHERE datname='school_teacher_restore_ci_test'")).rows,[]);
 }finally{if(owner)await owner.end();for(const [key,value]of Object.entries(previous))value===undefined?delete process.env[key]:process.env[key]=value;rmSync(dir,{recursive:true,force:true});}
});
