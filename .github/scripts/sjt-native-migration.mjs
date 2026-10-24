import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Import-safe: the existing probe executes only behind its direct-entry guard.
// Its normalization is limited to catalog names, dropped-column ordinals and
// four exact, already reviewed PostgreSQL 17 CHECK representations.
import {normalizedRestoredSchema} from './training-entry-migration.mjs';

const base='b9ad2b7f6fea17a599bdfd57445822c80a4f7538';
const databaseName='sjt_native_upgrade_test',restoreName='sjt_native_restore_test';
const output='sjt-native-evidence',prismaRoot='server-version/backend/prisma';
const migrations=['20261024060000_survey_situational_host_binding','20261024121500_survey_situational_flow_locks'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const identifier=value=>'"'+value.replaceAll('"','""')+'"';
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const child=(command,args,options={})=>execFileSync(command,args,{timeout:240000,stdio:'inherit',...options});
function sql(url,query){
 try{return execFileSync('psql',['--dbname',url,'-X','-qAt','-v','ON_ERROR_STOP=1'],{
  input:query,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000,maxBuffer:64*1024*1024}).trim()}
 catch(error){throw new Error('Isolated SJT SQL probe failed (status '+String(error.status)+'): '+String(error.stderr??'').slice(0,6000))}
}
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
const history=url=>json(url,"SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY migration_name),'[]'::jsonb) FROM _prisma_migrations m;");
const schema=url=>json(url,`SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name,ordinal_position) FROM information_schema.columns c WHERE table_schema='public'),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.conrelid::regclass::text,c.conname,pg_get_constraintdef(c.oid),c.convalidated) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(tablename,indexname,indexdef) ORDER BY tablename,indexname) FROM pg_indexes WHERE schemaname='public'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_functiondef(p.oid)) ORDER BY p.proname,p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p')),
 'enums',(SELECT jsonb_agg(jsonb_build_array(t.typname,e.enumlabel,e.enumsortorder) ORDER BY t.typname,e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'),
 'sequences',(SELECT jsonb_agg(to_jsonb(s) ORDER BY sequencename) FROM pg_sequences s WHERE schemaname='public'),
 'views',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,pg_get_viewdef(c.oid,true)) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('v','m')));`);

// SQL literals only. These deliberately opaque fixtures are relationship/storage
// probes, not executable scientific content, usable credentials or real answers.
const attempt=(overrides={})=>{
 const values={id:"'ci_sjt_probe'",participant_key:"'synthetic-principal'",instrument_key:"'synthetic-legacy'",instrument_version:"'1.0.0'",
  status:"'IN_PROGRESS'",definition_hash:"repeat('a',64)",compiled_runtime_hash:"repeat('b',64)",scorer_key:"'situational.default'",
  scoring_version:"'synthetic'",frozen_at:"'2026-10-24T00:00:00Z'",runtime_snapshot_encrypted:"'synthetic-opaque-runtime'",...overrides};
 return `INSERT INTO situational_attempts(${Object.keys(values).map(identifier).join(',')}) VALUES(${Object.values(values).join(',')})`;
};
const native={survey_attempt_id:"'ci_sjt_parent'",survey_publication_id:"'ci_sjt_publication'",survey_slot_key:"'sjt'",
 survey_locked_answers_cipher:"'synthetic-opaque-locked-prefix'",survey_locked_answers_hash:"repeat('d',64)"};
const seed=`
 INSERT INTO users(id,username,password_hash,role,account_domain,updated_at) VALUES('ci_sjt_owner','ci_sjt_owner','synthetic-unusable','STUDENT','SURVEY',NOW());
 INSERT INTO survey_accounts(user_id,login_name,normalized_login) VALUES('ci_sjt_owner','ci_sjt_owner','ci_sjt_owner');
 INSERT INTO survey_projects(id,owner_user_id,title,collection_mode) VALUES('ci_sjt_project','ci_sjt_owner','Synthetic migration fixture','SINGLE_UNLINKED');
 INSERT INTO survey_publications(id,project_id,definition_digest,compiled_snapshot,consent_version,version)
 VALUES('ci_sjt_publication','ci_sjt_project',repeat('a',64),'{}',1,1),('ci_sjt_other_publication','ci_sjt_project',repeat('b',64),'{}',1,2);
 INSERT INTO survey_waves(id,project_id,publication_id,ordinal,title,consent_text) VALUES('ci_sjt_wave','ci_sjt_project','ci_sjt_publication',1,'Synthetic wave','Synthetic fixture only');
 INSERT INTO survey_wave_attempts(id,project_id,wave_id,session_hash,content_binding_cipher,content_binding_hash)
 VALUES('ci_sjt_parent','ci_sjt_project','ci_sjt_wave',repeat('a',64),'synthetic-opaque-binding',repeat('b',64)),
 ('ci_sjt_unbound','ci_sjt_project','ci_sjt_wave',repeat('c',64),NULL,NULL);
 ${attempt({id:"'ci_sjt_legacy'",status:"'COMPLETED'",submission_id:"'12345678-1234-4234-8234-123456789abc'",submission_payload_hash:"repeat('c',64)",canonical_result_encrypted:"'synthetic-opaque-canonical-result'"})};
 ${attempt({id:"'ci_sjt_active'",attempt_no:'2'})};
 INSERT INTO situational_raw_submissions(id,attempt_id,attempt_epoch,response_count,payload_encrypted,payload_hash,payload_schema_version,encoding_version)
 VALUES('ci_sjt_legacy_raw','ci_sjt_legacy',1,1,'synthetic-opaque-raw',repeat('c',64),1,'synthetic-v1');
`;
// Catch only the expected SQLSTATE and message/constraint, not arbitrary errors.
const reject=(operation,state,message)=>`DO $$ DECLARE rejected BOOLEAN=false; detail TEXT; BEGIN BEGIN ${operation};
 EXCEPTION WHEN SQLSTATE '${state}' THEN GET STACKED DIAGNOSTICS detail=MESSAGE_TEXT;
 IF position(${literal(message)} in detail)=0 THEN RAISE; END IF; rejected=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected SJT invariant rejection did not occur: %',${literal(message)}; END IF; END $$;`;
// 20261011133000 replaces the earlier function/message, not a second guard.
const publishedWaveMessage='Published Survey wave consent and definition are immutable';
function validateInvariants(url){
 assert.equal(sql(url,`SELECT count(*)=2 AND bool_and(survey_attempt_id IS NULL AND survey_publication_id IS NULL AND survey_slot_key IS NULL
 AND survey_locked_answers_cipher IS NULL AND survey_locked_answers_hash IS NULL) FROM situational_attempts WHERE id IN('ci_sjt_legacy','ci_sjt_active');`),'t','Legacy rows must not be adopted or backfilled');
 assert.equal(sql(url,`SELECT survey_attempt_id='ci_sjt_parent' AND survey_publication_id='ci_sjt_publication' AND survey_slot_key='sjt'
 AND survey_locked_answers_cipher='synthetic-opaque-locked-prefix' AND survey_locked_answers_hash=repeat('d',64) FROM situational_attempts WHERE id='ci_sjt_native';`),'t');
 const guards=[
  reject(attempt({status:"'COMPLETED'"}),'23505','situational_attempts_standalone_identity_key'),
  reject(attempt({attempt_no:'3'}),'23505','situational_attempts_active_participant_key'),
  reject(attempt(native),'23505','situational_attempts_survey_slot_epoch_key'),
  reject(attempt({...native,survey_attempt_id:"'ci_sjt_unbound'"}),'23514','SITUATIONAL_SURVEY_PARENT_NOT_FROZEN'),
  reject(attempt({...native,survey_publication_id:"'ci_sjt_other_publication'"}),'23514','SITUATIONAL_SURVEY_PUBLICATION_MISMATCH'),
  ...[{survey_slot_key:'NULL'},{survey_slot_key:"'INVALID'"},{user_id:"'ci_sjt_owner'"},{composite_slot_key:"'other'"},{attempt_epoch:'0'}]
   .map(change=>reject(attempt({...native,...change}),'23514','situational_attempts_survey_host_check')),
  ...[{survey_locked_answers_cipher:'NULL'},{survey_locked_answers_hash:'NULL'},{survey_locked_answers_hash:"'invalid'"}]
   .map(change=>reject(attempt({...native,...change}),'23514','situational_survey_answer_lock_pair')),
  reject(attempt({participant_key:"'synthetic-other'",survey_locked_answers_cipher:"'synthetic'",survey_locked_answers_hash:"repeat('e',64)"}),'23514','situational_survey_answer_lock_pair'),
  ...['id','survey_attempt_id','survey_publication_id','survey_slot_key','attempt_epoch','participant_key'].map(field=>
   reject(`UPDATE situational_attempts SET ${identifier(field)}=${field==='attempt_epoch'?'2':"'changed'"} WHERE id='ci_sjt_native'`,'23514','SITUATIONAL_SURVEY_HOST_IMMUTABLE')),
  ...['survey_locked_answers_cipher','survey_locked_answers_hash'].map(field=>reject(`UPDATE situational_attempts SET ${identifier(field)}=NULL WHERE id='ci_sjt_native'`,'23514','SITUATIONAL_SURVEY_ANSWER_LOCK_IMMUTABLE')),
  reject("UPDATE situational_attempts SET survey_attempt_id='ci_sjt_parent',survey_publication_id='ci_sjt_publication',survey_slot_key='adopted' WHERE id='ci_sjt_legacy'",'23514','SITUATIONAL_SURVEY_HOST_IMMUTABLE'),
  reject("UPDATE situational_attempts SET survey_locked_answers_cipher='synthetic',survey_locked_answers_hash=repeat('f',64) WHERE id='ci_sjt_legacy'",'23514','SITUATIONAL_SURVEY_ANSWER_LOCK_IMMUTABLE'),
  reject("UPDATE survey_wave_attempts SET wave_id='changed' WHERE id='ci_sjt_parent'",'P0001','SURVEY_ATTEMPT_CONTENT_BINDING_IMMUTABLE'),
  reject("UPDATE survey_waves SET publication_id=NULL WHERE id='ci_sjt_wave'",'23514',publishedWaveMessage),
  reject("DELETE FROM survey_wave_attempts WHERE id='ci_sjt_parent'",'23503','situational_attempts_survey_attempt_id_fkey'),
 ];
 const publicationGuards=[
  reject("UPDATE survey_waves SET publication_id='ci_sjt_linked_publication' WHERE id='ci_sjt_linked_draft'",'23514','Linked Wave requires explicit linkage disclosure confirmation'),
  reject("UPDATE survey_waves SET consent_text='changed' WHERE id='ci_sjt_linked_draft'",'23514',publishedWaveMessage),
 ];
 // All positive and negative mutations are rolled back; rerun after restore to
 // verify active guards, not merely catalog text. Progress remains mutable.
 sql(url,`BEGIN; ${guards.join('\n')}
 -- Isolate disclosure admission from already-published immutability: OLD has
 -- no publication for the first probe; the later consent update cannot invoke
 -- the disclosure trigger, which only listens to publication/notice changes.
 INSERT INTO survey_projects(id,owner_user_id,title,collection_mode) VALUES('ci_sjt_linked_project','ci_sjt_owner','Synthetic disclosure boundary','LINKED_WAVES');
 INSERT INTO survey_publications(id,project_id,definition_digest,compiled_snapshot,consent_version,version) VALUES('ci_sjt_linked_publication','ci_sjt_linked_project',repeat('e',64),'{}',1,1);
 INSERT INTO survey_waves(id,project_id,ordinal,title,consent_text) VALUES('ci_sjt_linked_draft','ci_sjt_linked_project',1,'Synthetic draft boundary','Synthetic fixture only');
 ${publicationGuards[0]}
 UPDATE survey_waves SET linkage_notice_confirmed=true,publication_id='ci_sjt_linked_publication' WHERE id='ci_sjt_linked_draft';
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM survey_waves WHERE id='ci_sjt_linked_draft' AND publication_id='ci_sjt_linked_publication' AND linkage_notice_confirmed) THEN RAISE EXCEPTION 'Confirmed draft publication failed'; END IF; END $$;
 ${publicationGuards[1]}
 UPDATE situational_attempts SET progress=1 WHERE id='ci_sjt_native';
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM situational_attempts WHERE id='ci_sjt_native' AND progress=1) THEN RAISE EXCEPTION 'Ordinary progress update failed'; END IF; END $$;
 ${attempt({...native,id:"'ci_sjt_other_slot'",survey_slot_key:"'other'"})};
 ROLLBACK;`);
 return guards.length+publicationGuards.length;
}

export async function main(){
 assert.equal(process.env.CI,'true','Actions-only qualification');assert.equal(process.env.GITHUB_ACTIONS,'true');
 const binding=JSON.parse(readFileSync('.github/scripts/sjt-native-bindings.json','utf8'));assert.equal(binding.base,base);
 const u=new URL(process.env.DATABASE_URL);assert.equal(u.protocol,'postgresql:');assert(['localhost','127.0.0.1'].includes(u.hostname));
 assert.equal(u.username,'postgres');assert.equal(u.pathname,'/'+databaseName);assert.equal(u.search,'');assert.equal(u.hash,'');
 const url=u.toString(),container=process.env.PG_CONTAINER;assert.match(container||'',/^[a-f0-9]{64}$/);
 assert.equal(sql(url,'SELECT current_database();'),databaseName);assert.equal(sql(url,"SELECT current_setting('server_version_num')::int/10000;"),'17');
 assert.equal(sql(url,`SELECT count(*) FROM pg_namespace WHERE nspname NOT IN('public','information_schema') AND nspname !~ '^pg_';`),'0','Refuse preexisting user schemas');
 assert.equal(sql(url,`SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
 +(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
 +(SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public');`),'0','Refuse a nonempty target; never drop/reset a database');
 assert.equal(sql(url,`SELECT count(*) FROM pg_database WHERE datname=${literal(restoreName)};`),'0','Refuse an existing restore database');
 const containerSystem=execFileSync('docker',['exec',container,'psql','-U','postgres','-d',databaseName,'-X','-At','-c','SELECT system_identifier::text FROM pg_control_system();'],{encoding:'utf8',timeout:30000}).trim();
 assert.equal(containerSystem,sql(url,'SELECT system_identifier::text FROM pg_control_system();'),'DATABASE_URL and PG_CONTAINER must identify the same isolated server');
 const expected=migrations.map(name=>`${prismaRoot}/migrations/${name}/migration.sql`);
 assert.deepEqual(git('diff','--name-status',base,'HEAD','--',prismaRoot+'/migrations').split('\n').sort(),expected.map(path=>'A\t'+path).sort(),'Only the two new SJT migrations may be applied');
 for(const path of [...expected,prismaRoot+'/schema.prisma'])assert.equal(git('rev-parse','HEAD:'+path),binding.source[path].after,'Migration/schema differs from frozen product');
 const temp=mkdtempSync(join(tmpdir(),'sjt-native-migration-'));
 try{
  const archive=ref=>{
   const directory=join(temp,ref);mkdirSync(directory);
   const tar=execFileSync('git',['archive',ref,prismaRoot],{maxBuffer:32*1024*1024});
   execFileSync('tar',['-x','-C',directory],{input:tar});return join(directory,prismaRoot,'schema.prisma');
  };
  const prisma=resolve('server-version/backend/node_modules/prisma/build/index.js');
  child(process.execPath,[prisma,'migrate','deploy','--schema',archive(base)],{env:{...process.env,DATABASE_URL:url}});
  sql(url,seed);const oldColumns=columns(url),before=snapshot(url,oldColumns),oldHistory=history(url);
  const baseNames=git('ls-tree','-r','--name-only',base,prismaRoot+'/migrations').split('\n').filter(path=>path.endsWith('/migration.sql')).map(path=>path.split('/').at(-2)).sort();
  assert.deepEqual(oldHistory.map(row=>row.migration_name),baseNames,'Full fixed-main migration history must be present');
  for(const row of oldHistory){assert(row.finished_at&&!row.rolled_back_at);assert.equal(row.checksum,hash(readFileSync(join(temp,base,prismaRoot,'migrations',row.migration_name,'migration.sql'))))}
  for(const table of ['situational_attempts','situational_raw_submissions','survey_wave_attempts','survey_publications'])assert(before[table].rows>0,'Old synthetic fixture must be nonempty: '+table);
  child(process.execPath,[prisma,'migrate','deploy','--schema',archive('HEAD')],{env:{...process.env,DATABASE_URL:url}});
  assert.deepEqual(snapshot(url,oldColumns),before,'Old columns/rows changed during upgrade');
  const upgradedHistory=history(url),oldNames=new Set(baseNames);
  assert.deepEqual(upgradedHistory.filter(row=>oldNames.has(row.migration_name)),oldHistory,'Old migration records changed');
  assert.deepEqual(upgradedHistory.filter(row=>!oldNames.has(row.migration_name)).map(row=>row.migration_name),migrations);
  for(const name of migrations){const row=upgradedHistory.find(row=>row.migration_name===name);assert(row.finished_at&&!row.rolled_back_at);assert.equal(row.checksum,hash(readFileSync(join(temp,'HEAD',prismaRoot,'migrations',name,'migration.sql'))))}
  // Persist a new host-bound child too, so restore compares populated new fields
  // as well as the original legacy attempts and their opaque raw submission.
  sql(url,attempt({...native,id:"'ci_sjt_native'"})+';');
  const newColumns=columns(url),upgraded=snapshot(url,newColumns),upgradedSchema=schema(url);
  const guardCount=validateInvariants(url);assert.deepEqual(snapshot(url,newColumns),upgraded,'Invariant probes must leave no changed rows');
  mkdirSync(output,{recursive:true});const dump=resolve(output,'sjt-native-upgrade.dump');
  writeFileSync(dump,execFileSync('docker',['exec',container,'pg_dump','-U','postgres','--format=custom','--dbname',databaseName],{timeout:60000,maxBuffer:64*1024*1024}));
  sql(url,'CREATE DATABASE '+identifier(restoreName));u.pathname='/'+restoreName;
  child('docker',['exec','-i',container,'pg_restore','-U','postgres','--dbname',restoreName,'--exit-on-error'],{input:readFileSync(dump),stdio:['pipe','inherit','inherit']});
  const restored=u.toString();assert.deepEqual(columns(restored),newColumns);assert.deepEqual(snapshot(restored,newColumns),upgraded);assert.deepEqual(history(restored),upgradedHistory);
  const restoredSchema=schema(restored);
  writeFileSync(join(output,'migration-schema-comparison.json'),JSON.stringify({upgraded:upgradedSchema,restored:restoredSchema},null,2)+'\n');
  assert.deepEqual(normalizedRestoredSchema(restoredSchema,restoreName),normalizedRestoredSchema(upgradedSchema,databaseName));
  assert.equal(validateInvariants(restored),guardCount);assert.deepEqual(snapshot(restored,newColumns),upgraded);
  writeFileSync(join(output,'migration.json'),JSON.stringify({kind:'isolated-actions-sjt-migration-restore',base,head:git('rev-parse','HEAD'),migrations,
   baseMigrationCount:oldHistory.length,upgradedMigrationCount:upgradedHistory.length,oldTables:oldColumns.length,before,
   oldRowsPreserved:true,legacyNullBindingsPreserved:true,populatedNativeBindingRestored:true,guardChecksPerDatabase:guardCount,
   hostBindingAndAnswerLockGuardsVerified:true,restoredTables:newColumns.length,upgraded,restoredRowsAndSchemaEqual:true,
   normalization:'existing exact PostgreSQL 17 representations only',dumpSHA256:hash(readFileSync(dump))},null,2)+'\n');
 }finally{rmSync(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1});
