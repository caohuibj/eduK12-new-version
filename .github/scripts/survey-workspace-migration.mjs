import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {binding} from './survey-workspace-scope.mjs';
const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5432');assert.equal(url.pathname,'/survey_upgrade');
assert.equal(process.env.CI,'true','Disposable CI database only');
const run=(cmd,args,input)=>execFileSync(cmd,args,{input,encoding:input instanceof Buffer?undefined:'utf8',stdio:['pipe','pipe','pipe']});
const sql=(db,s)=>String(run('psql',['-X','-v','ON_ERROR_STOP=1','-At','-d',db],s)).trim();
const root=process.cwd(),prisma=join(root,'server-version/backend/node_modules/prisma/build/index.js');
const temp=mkdtempSync(join(tmpdir(),'survey-upgrade-'));
try{
 run('tar',['-x','-C',temp],execFileSync('git',['archive',binding.base,'server-version/backend/prisma']));
 execFileSync(process.execPath,[prisma,'migrate','deploy','--schema',join(temp,'server-version/backend/prisma/schema.prisma')],{stdio:'inherit'});
 sql('survey_upgrade',"CREATE TABLE survey_upgrade_probe(id TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO survey_upgrade_probe VALUES ('baseline','preserved');");
 execFileSync(process.execPath,[prisma,'migrate','deploy','--schema','server-version/backend/prisma/schema.prisma'],{stdio:'inherit'});
 sql('survey_upgrade',`INSERT INTO users(id,username,password_hash,role,account_domain,updated_at) VALUES ('survey-ci-probe','survey-ci-probe','!disabled-no-login','STUDENT','SURVEY',now());
 INSERT INTO survey_accounts(user_id,login_name,normalized_login) VALUES ('survey-ci-probe','survey-ci-probe','survey-ci-probe');
 INSERT INTO survey_projects(id,owner_user_id,title,collection_mode) VALUES ('survey-ci-project','survey-ci-probe','Synthetic upgrade','SINGLE_UNLINKED');
 INSERT INTO survey_tool_templates(id,owner_user_id,kind,title,definition,creation_digest) VALUES ('draft','survey-ci-probe','FORM','Synthetic','{}','synthetic');
 INSERT INTO survey_tool_templates(id,owner_user_id,kind,title,definition,creation_digest,revision,completed_revision) VALUES ('ready','survey-ci-probe','SCALE','Synthetic','{}','synthetic',2,2);
 INSERT INTO survey_tool_selections(id,owner_user_id,project_id,request_digest,instrument_ids) VALUES ('selection','survey-ci-probe','survey-ci-project','synthetic','[]');
 DO $$ BEGIN BEGIN UPDATE survey_tool_templates SET completed_revision=1 WHERE id='ready'; RAISE EXCEPTION 'MISSING_CONSTRAINT'; EXCEPTION WHEN check_violation THEN NULL; END; END $$;`);
 assert.equal(sql('survey_upgrade',"SELECT count(*) FROM survey_tool_templates WHERE id='draft' AND completed_revision IS NULL"),'1');
 const snapshot=execFileSync('pg_dump',['-Fc','-d','survey_upgrade'],{maxBuffer:64*1024*1024});
 run('createdb',['survey_restore']);run('pg_restore',['--exit-on-error','--no-owner','-d','survey_restore'],snapshot);
 for(const db of ['survey_upgrade','survey_restore']){
  assert.equal(sql(db,"SELECT value FROM survey_upgrade_probe WHERE id='baseline'"),'preserved');
  assert.equal(sql(db,"SELECT completed_revision FROM survey_tool_templates WHERE id='ready'"),'2');
  assert.equal(sql(db,"SELECT count(*) FROM survey_tool_selections"),'1');
  assert.equal(sql(db,"SELECT count(*) FROM pg_constraint WHERE conrelid='survey_tool_templates'::regclass AND conname='survey_tool_templates_completed_revision_check'"),'1');
 }
 mkdirSync('survey-workspace-evidence',{recursive:true});writeFileSync('survey-workspace-evidence/migration-restore.json',JSON.stringify({status:'passed',base:binding.base,head:process.env.GITHUB_SHA,disposableSyntheticOnly:true,baselinePreserved:true,existingDraftsRemainIncomplete:true,completionConstraint:true,selectionPreserved:true,nativeDumpRestore:true,productionQualification:false},null,2));
}finally{rmSync(temp,{recursive:true,force:true});}
