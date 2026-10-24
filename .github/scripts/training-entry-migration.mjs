import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const output='training-entry-evidence';
const databaseName='qualification_training_entry_ci',restoreName='qualification_restore_training_entry_ci';
const migrations=['20261024080000_training_participation_codes','20261024083000_training_stable_admission_identity'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const identifier=value=>'"'+value.replaceAll('"','""')+'"';
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const child=(command,args,options={})=>execFileSync(command,args,{timeout:240000,stdio:'inherit',...options});
const sql=(url,query)=>{try{return execFileSync('psql',['--dbname',url,'-X','-At','-v','ON_ERROR_STOP=1'],{
 input:query,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000,maxBuffer:64*1024*1024}).trim()}
 catch(error){throw new Error('Isolated SQL probe failed (status '+String(error.status)+'): '+String(error.stderr??'').slice(0,6000))}};
const json=(url,query)=>JSON.parse(sql(url,query));
const columns=url=>json(url,`SELECT jsonb_agg(t ORDER BY t.name) FROM (
 SELECT table_name AS name,jsonb_agg(column_name ORDER BY ordinal_position) AS columns
 FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations'
 AND table_name IN(SELECT tablename FROM pg_tables WHERE schemaname='public') GROUP BY table_name) t;`);
function snapshot(url,tables){
 const query=tables.map(table=>`SELECT jsonb_build_object('name',${literal(table.name)},'rows',count(*),'data',COALESCE(jsonb_agg(row_data ORDER BY row_data::text),'[]'::jsonb))
 FROM(SELECT to_jsonb(projected) AS row_data FROM(SELECT ${table.columns.map(identifier).join(',')} FROM public.${identifier(table.name)}) projected) rows`).join(' UNION ALL ');
 return Object.fromEntries(sql(url,query+';').split('\n').map(line=>{const row=JSON.parse(line);return[row.name,{rows:Number(row.rows),sha256:hash(JSON.stringify(row.data))}]}));
}
const history=url=>json(url,'SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY migration_name),\'[]\'::jsonb) FROM _prisma_migrations m;');
const schema=url=>json(url,`SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name,ordinal_position) FROM information_schema.columns c WHERE table_schema='public'),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.conrelid::regclass::text,c.conname,pg_get_constraintdef(c.oid),c.convalidated) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(tablename,indexname,indexdef) ORDER BY tablename,indexname) FROM pg_indexes WHERE schemaname='public'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_functiondef(p.oid)) ORDER BY p.proname,p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p')));`);
// Exact PostgreSQL 17 dump/reparse representations observed for four fixed-base
// CHECK constraints. Only identical full definitions map; no general SQL rewrite.
export const restoredCheckRepresentations = [
  {
    "name": "campus_accounts_login_shape_check",
    "table": "campus_accounts",
    "original": "CHECK ((((length(login_name) >= 4) AND (length(login_name) <= 32)) AND (normalized_login = lower(TRIM(BOTH FROM login_name))) AND (normalized_login ~ '^[a-z0-9_.-]{4,32}$'::text)))",
    "restored": "CHECK (((length(login_name) >= 4) AND (length(login_name) <= 32) AND (normalized_login = lower(TRIM(BOTH FROM login_name))) AND (normalized_login ~ '^[a-z0-9_.-]{4,32}$'::text)))"
  },
  {
    "name": "content_capability_grants_capabilities_check",
    "table": "content_capability_grants",
    "original": "CHECK ((((cardinality(capabilities) >= 1) AND (cardinality(capabilities) <= 12)) AND (capabilities <@ ARRAY['measurement.edit'::text, 'measurement.publish'::text, 'reference.analyze'::text, 'reference.review'::text, 'reference.publish'::text, 'report.edit'::text, 'report.publish'::text, 'catalog.manage'::text, 'material.use'::text, 'material.adapt'::text, 'material.distribute'::text, 'data.reinterpret'::text])))",
    "restored": "CHECK (((cardinality(capabilities) >= 1) AND (cardinality(capabilities) <= 12) AND (capabilities <@ ARRAY['measurement.edit'::text, 'measurement.publish'::text, 'reference.analyze'::text, 'reference.review'::text, 'reference.publish'::text, 'report.edit'::text, 'report.publish'::text, 'catalog.manage'::text, 'material.use'::text, 'material.adapt'::text, 'material.distribute'::text, 'data.reinterpret'::text])))"
  },
  {
    "name": "huiteacher_improvement_actions_cipher_check",
    "table": "huiteacher_improvement_actions",
    "original": "CHECK ((((length(goal_cipher) >= 30) AND (length(goal_cipher) <= 30000)) AND ((length(plan_cipher) >= 30) AND (length(plan_cipher) <= 100000))))",
    "restored": "CHECK (((length(goal_cipher) >= 30) AND (length(goal_cipher) <= 30000) AND ((length(plan_cipher) >= 30) AND (length(plan_cipher) <= 100000))))"
  },
  {
    "name": "survey_login_shape_check",
    "table": "survey_accounts",
    "original": "CHECK ((((length(login_name) >= 4) AND (length(login_name) <= 32)) AND (normalized_login = lower(TRIM(BOTH FROM login_name))) AND (normalized_login ~ '^[a-z0-9_.-]{4,32}$'::text)))",
    "restored": "CHECK (((length(login_name) >= 4) AND (length(login_name) <= 32) AND (normalized_login = lower(TRIM(BOTH FROM login_name))) AND (normalized_login ~ '^[a-z0-9_.-]{4,32}$'::text)))"
  }
];
export function normalizedRestoredSchema(value,catalog=databaseName){
 const result=structuredClone(value),positions=new Map();
 for(const column of result.columns){
  const key=column.table_schema+'\0'+column.table_name;
  const ordinal=(positions.get(key)||0)+1;positions.set(key,ordinal);
  // Dropped physical attributes leave gaps which pg_dump does not recreate.
  // Relative visible order was checked independently before this comparison.
  assert.equal(String(column.dtd_identifier),String(column.ordinal_position),'Unexpected non-column dtd identity');
  column.ordinal_position=ordinal;column.dtd_identifier=String(ordinal);
  for(const field of Object.keys(column))if(field.endsWith('_catalog')&&column[field]===catalog)column[field]=databaseName;
 }
 result.constraints=result.constraints.map(c=>{
  const exact=restoredCheckRepresentations.find(v=>v.table===c[0]&&v.name===c[1]&&v.original===c[2]);
  return exact?[c[0],c[1],exact.restored,...c.slice(3)]:c;
 });
 return result;
}
const reject=(operation,code='raise_exception')=>`DO $$ DECLARE rejected BOOLEAN=false; BEGIN BEGIN ${operation}; EXCEPTION WHEN ${code} THEN rejected=true; END; IF NOT rejected THEN RAISE EXCEPTION 'Expected invariant rejection did not occur'; END IF; END $$;`;

// Synthetic literals only: no real account, bearer token, credential or answer.
const seed=`
 INSERT INTO users(id,username,password_hash,role,updated_at) VALUES('ci_entry_owner','ci_entry_owner','synthetic-unusable','TEACHER',NOW());
 INSERT INTO composite_assessments(id,code,name,created_by,updated_at) VALUES('ci_entry_composite','ci_entry_composite','Synthetic old form','ci_entry_owner',NOW());
 INSERT INTO composite_form_sections(id,composite_assessment_id,title,updated_at) VALUES('ci_entry_section','ci_entry_composite','Old section',NOW());
 INSERT INTO composite_assessment_items(id,composite_assessment_id,type,form_type,form_label,form_section_id,form_section_position,updated_at) VALUES('ci_entry_item','ci_entry_composite','FORM','text_input','Old response','ci_entry_section',0,NOW());
 INSERT INTO composite_assessment_access_tokens(id,composite_assessment_id,token,token_hash,token_encrypted,created_by,expires_at) VALUES('ci_entry_token','ci_entry_composite',NULL,repeat('a',64),'synthetic-non-decryptable','ci_entry_owner',NOW()+INTERVAL '1 day');
 INSERT INTO anonymous_studies(id,owner_user_id,title) VALUES('ci_entry_study','ci_entry_owner','Old anonymous study');
 INSERT INTO anonymous_study_waves(id,study_id,access_token_id,title,ordinal) VALUES('ci_entry_wave','ci_entry_study','ci_entry_token','Old wave',1);
 INSERT INTO anonymous_study_participants(id,study_id,credential_hash,display_code) VALUES('ci_entry_participant','ci_entry_study',repeat('b',64),'OLD-PARTICIPANT');
 INSERT INTO composite_assessment_attempts(id,composite_assessment_id,access_token_id,participant_key,recovery_token_hash) VALUES('ci_entry_attempt','ci_entry_composite','ci_entry_token','synthetic-old-participant',repeat('c',64));
 INSERT INTO anonymous_study_attempts(study_id,wave_id,participant_id,attempt_id) VALUES('ci_entry_study','ci_entry_wave','ci_entry_participant','ci_entry_attempt');
 INSERT INTO composite_form_answers(id,attempt_id,item_id,value,updated_at) VALUES('ci_entry_answer','ci_entry_attempt','ci_entry_item','synthetic-old-answer',NOW());
`;
function validateInvariants(url){
 assert.equal(sql(url,`SELECT participation_mode='PERSONAL_LINK' AND participation_revision=0 AND participation_label='参与编号' AND participation_instructions='' FROM anonymous_studies WHERE id='ci_entry_study';`),'t');
 assert.equal(sql(url,`SELECT recovery_generation=0 FROM anonymous_study_participants WHERE id='ci_entry_participant';`),'t');
 assert.equal(sql(url,`SELECT admission_credential_hash IS NULL AND admission_attempt_epoch IS NULL FROM anonymous_study_attempts WHERE attempt_id='ci_entry_attempt';`),'t');
 // Every negative probe rolls back its statement; all positive synthetic probes
 // are rolled back together. Original records and migration checksums stay intact.
 sql(url,`BEGIN;
 ${reject("UPDATE anonymous_studies SET participation_mode='MEMORABLE_CODE' WHERE id='ci_entry_study'")}
 ${reject("UPDATE anonymous_study_attempts SET admission_credential_hash=repeat('c',64),admission_attempt_epoch=1 WHERE attempt_id='ci_entry_attempt'")}
 INSERT INTO anonymous_study_participants(id,study_id,credential_hash,display_code) VALUES('ci_entry_new_participant','ci_entry_study',repeat('d',64),'NEW-SYNTHETIC');
 INSERT INTO composite_assessment_attempts(id,composite_assessment_id,access_token_id,participant_key,recovery_token_hash) VALUES('ci_entry_new_attempt','ci_entry_composite','ci_entry_token','synthetic-new-participant',repeat('e',64));
 ${reject("INSERT INTO anonymous_study_attempts(study_id,wave_id,participant_id,attempt_id,admission_credential_hash,admission_attempt_epoch) VALUES('ci_entry_study','ci_entry_wave','ci_entry_new_participant','ci_entry_new_attempt',repeat('f',64),1)")}
 INSERT INTO anonymous_study_attempts(study_id,wave_id,participant_id,attempt_id,admission_credential_hash,admission_attempt_epoch) VALUES('ci_entry_study','ci_entry_wave','ci_entry_new_participant','ci_entry_new_attempt',repeat('e',64),1);
 ${reject("UPDATE anonymous_study_attempts SET admission_credential_hash=repeat('f',64) WHERE attempt_id='ci_entry_new_attempt'")}
 ${reject("DELETE FROM anonymous_study_attempts WHERE attempt_id='ci_entry_new_attempt'")}
 UPDATE composite_assessment_attempts SET recovery_token_hash=repeat('f',64) WHERE id='ci_entry_new_attempt';
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM anonymous_study_attempts WHERE attempt_id='ci_entry_new_attempt' AND admission_credential_hash=repeat('e',64) AND admission_attempt_epoch=1) THEN RAISE EXCEPTION 'Stable identity changed with current proof'; END IF; END $$;
 ROLLBACK;`);
}

export async function main(){
 assert.equal(process.env.CI,'true','Actions-only migration qualification');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.version,'v24.21.0');
 const binding=JSON.parse(readFileSync('.github/scripts/training-entry-bindings.json','utf8'));
 assert.equal(binding.base,'44c1e502acaed5524c5b1e233d1bfb1f0c6f7b40');
 const u=new URL(process.env.DATABASE_URL);assert.equal(u.protocol,'postgresql:');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55432');assert.equal(u.pathname,'/'+databaseName);u.search='';
 const url=u.toString(),container=process.env.CI_POSTGRES_CONTAINER;assert.match(container||'',/^[a-f0-9]{64}$/);
 assert.equal(sql(url,'SELECT current_database();'),databaseName);
 assert.equal(sql(url,"SELECT count(*) FROM pg_tables WHERE schemaname='public';"),'0','Refuse an existing nonempty database; never reset it');
 assert.equal(sql(url,`SELECT count(*) FROM pg_database WHERE datname=${literal(restoreName)};`),'0','Refuse an existing restore database');
 const expected=migrations.map(name=>'server-version/backend/prisma/migrations/'+name+'/migration.sql');
 assert.deepEqual(git('diff','--name-only',binding.base,'HEAD','--','server-version/backend/prisma/migrations').split('\n').sort(),[...expected].sort());
 for(const path of expected)assert.equal(git('rev-parse','HEAD:'+path),binding.source[path].after,'Migration differs from frozen product');
 const temp=mkdtempSync(join(tmpdir(),'training-entry-base-'));
 try{
  const tar=execFileSync('git',['archive',binding.base,'server-version/backend/prisma'],{maxBuffer:32*1024*1024});execFileSync('tar',['-x','-C',temp],{input:tar});
  const prisma='server-version/backend/node_modules/prisma/build/index.js';
  child(process.execPath,[prisma,'migrate','deploy','--schema',join(temp,'server-version/backend/prisma/schema.prisma')]);
  sql(url,seed);const oldColumns=columns(url),before=snapshot(url,oldColumns),oldHistory=history(url);
  for(const table of ['anonymous_studies','anonymous_study_waves','anonymous_study_participants','anonymous_study_attempts','composite_assessment_attempts','composite_form_answers'])assert(before[table].rows>0,'Old fixture must be nonempty: '+table);
  child(process.execPath,[prisma,'migrate','deploy','--schema','server-version/backend/prisma/schema.prisma']);
  assert.deepEqual(snapshot(url,oldColumns),before,'Old columns or rows changed during upgrade');
  const upgradedHistory=history(url),oldNames=new Set(oldHistory.map(row=>row.migration_name));
  assert.deepEqual(upgradedHistory.filter(row=>oldNames.has(row.migration_name)),oldHistory);
  assert.deepEqual(upgradedHistory.filter(row=>!oldNames.has(row.migration_name)).map(row=>row.migration_name).sort(),migrations);
  for(const name of migrations){const applied=upgradedHistory.find(row=>row.migration_name===name);assert(applied.finished_at&&!applied.rolled_back_at);assert.equal(applied.checksum,hash(readFileSync('server-version/backend/prisma/migrations/'+name+'/migration.sql')))}
  validateInvariants(url);assert.deepEqual(snapshot(url,oldColumns),before);
  const newColumns=columns(url),upgraded=snapshot(url,newColumns),upgradedSchema=schema(url);
  mkdirSync(output,{recursive:true});const dump=resolve(output,'training-entry-upgrade.dump');
  writeFileSync(dump,execFileSync('docker',['exec',container,'pg_dump','-U','postgres','--format=custom','--dbname',databaseName],{timeout:60000,maxBuffer:64*1024*1024}));
  sql(url,'CREATE DATABASE '+identifier(restoreName));u.pathname='/'+restoreName;
  child('docker',['exec','-i',container,'pg_restore','-U','postgres','--dbname',restoreName,'--exit-on-error'],{input:readFileSync(dump),stdio:['pipe','inherit','inherit']});
  const restored=u.toString();assert.deepEqual(columns(restored),newColumns);assert.deepEqual(snapshot(restored,newColumns),upgraded);assert.deepEqual(history(restored),upgradedHistory);
  const restoredSchema=schema(restored);
  writeFileSync(join(output,'migration-schema-comparison.json'),JSON.stringify({upgraded:upgradedSchema,restored:restoredSchema},null,2)+'\n');
  assert.deepEqual(normalizedRestoredSchema(restoredSchema,restoreName),normalizedRestoredSchema(upgradedSchema));validateInvariants(restored);assert.deepEqual(snapshot(restored,newColumns),upgraded);
  writeFileSync(join(output,'migration.json'),JSON.stringify({kind:'isolated-actions-migration-restore',base:binding.base,head:git('rev-parse','HEAD'),migrations,
   oldTables:oldColumns.length,oldRowsPreserved:true,legacyNullBindingsPreserved:true,newDefaultsVerified:true,stableIdentityGuardsVerified:true,
   before,after:snapshot(url,oldColumns),restoredTables:newColumns.length,restoredRowsAndSchemaEqual:true,dumpSHA256:hash(readFileSync(dump))},null,2)+'\n');
 }finally{rmSync(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1});
