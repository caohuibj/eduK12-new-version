// Disposable full synthetic DB backup; assertions cover only this change's dependency closure.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.env.GITHUB_WORKSPACE,privateRoot=resolve(process.env.RUNNER_TEMP,'training-workspace-integrated-private');
const evidence=resolve(root,'training-workspace-integrated-evidence/postgres');
const binding=JSON.parse(readFileSync(resolve(root,'.github/scripts/training-workspace-integrated-bindings.json')));
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.TRAINING_WORKSPACE_ISOLATED,'1');
const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/ptool');assert(Number(url.searchParams.get('connection_limit'))>=4);
const container='training-workspace-integrated-postgres',image='training-workspace-integrated-backend-builder:'+(process.env.TRAINING_WORKSPACE_BACKEND_IMAGE_HEAD||process.env.GITHUB_SHA);
mkdirSync(evidence,{recursive:true});
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',...options});
const sql=(text,db='ptool')=>run('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','ptool','-d',db,'-At'],{input:text}).trim();
const migrate=schema=>run('docker',['run','--rm','--network','host','-e','DATABASE_URL='+process.env.DATABASE_URL,'-v',privateRoot+':'+privateRoot,image,'npx','prisma','migrate','deploy','--schema',schema],{stdio:'inherit'});
const id={user:'32700000-0000-4000-8000-000000000001',course:'32700000-0000-4000-8000-000000000002',checkin:'32700000-0000-4000-8000-000000000003'};
const history=()=>JSON.parse(sql(`SELECT json_build_object('course',md5(row_to_json(c)::text),'checkin',md5(row_to_json(k)::text)) FROM (SELECT id,title,course_code,creator_id,status,created_at,updated_at FROM courses WHERE id='${id.course}') c CROSS JOIN (SELECT id,course_id,title,creator_id,content,created_at,updated_at FROM checkins WHERE id='${id.checkin}') k;`));
const mode=process.argv[2];
if(mode==='upgrade'){
 assert.equal(sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"),'0');
 const dir=resolve(privateRoot,'old-schema');mkdirSync(dir);
 const archive=run('git',['archive',binding.base,'server-version/backend/prisma'],{cwd:root,encoding:null});
 run('tar',['-xf','-','-C',dir],{input:archive});
 migrate(resolve(dir,'server-version/backend/prisma/schema.prisma'));
 sql(`INSERT INTO users(id,username,password_hash,role,account_domain,teacher_approved,updated_at) VALUES('${id.user}','workspace_restore_teacher','synthetic-only','TEACHER','TRAINING',true,NOW());
 INSERT INTO courses(id,title,course_code,creator_id,status,course_type,updated_at) VALUES('${id.course}','Synthetic historical course','WSRESTORE','${id.user}','PUBLISHED','TRAINING_COURSE',NOW());
 INSERT INTO checkins(id,course_id,title,creator_id,content,updated_at) VALUES('${id.checkin}','${id.course}','Synthetic historical checkin','${id.user}','retain',NOW());`);
 const before=history();migrate('/app/prisma/schema.prisma');assert.deepEqual(history(),before);
 const values=sql(`SELECT enum_range(NULL::"MaterialResourceType")::text`);assert(values.includes('MEDIA_ASSET')&&values.includes('FORM_TEMPLATE'));
 writeFileSync(resolve(evidence,'migration.json'),JSON.stringify({status:'PASS',base:binding.base,legacyDigests:before,newEnums:['MEDIA_ASSET','FORM_TEMPLATE'],productionMigrationClaim:false}));
}else if(mode==='prepare-restore'){
 // Fresh disposable restore fixture only. Prior old-schema upgrade qualification is accepted separately.
 assert.equal(sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"),'0');
 migrate('/app/prisma/schema.prisma');
 sql(`INSERT INTO users(id,username,password_hash,role,account_domain,teacher_approved,updated_at) VALUES('${id.user}','workspace_restore_teacher','synthetic-only','TEACHER','TRAINING',true,NOW());
 INSERT INTO courses(id,title,course_code,creator_id,status,course_type,updated_at) VALUES('${id.course}','Synthetic historical course','WSRESTORE','${id.user}','PUBLISHED','TRAINING_COURSE',NOW());
 INSERT INTO checkins(id,course_id,title,creator_id,content,updated_at) VALUES('${id.checkin}','${id.course}','Synthetic historical checkin','${id.user}','retain',NOW());`);
 writeFileSync(resolve(evidence,'restore-fixture.json'),JSON.stringify({status:'PREPARED',priorUpgradeReexecuted:false}));
}else if(mode==='restore'){
 // Prisma supplies the real defaults/types; these are backup fixtures, never fake UI/publication facts.
 const code=`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const owner=${JSON.stringify(id.user)};const schedule=await p.checkinSchedule.create({data:{courseId:${JSON.stringify(id.course)},creatorId:owner,template:{title:'Synthetic recovery only'},intervalDays:1,durationHours:24,firstPublishAt:new Date('2026-01-01'),nextPublishAt:new Date('2026-01-02'),timezone:'UTC',publishedCount:1}});await p.checkin.update({where:{id:${JSON.stringify(id.checkin)}},data:{scheduleId:schedule.id,scheduledFor:new Date('2026-01-01')}});const asset=await p.storedAsset.create({data:{objectKey:'workspace-recovery/synthetic.png',sha256:'0'.repeat(64),mimeType:'image/png',sizeBytes:1,ownerId:owner,originalName:'Synthetic recovery metadata',accessScope:'PRIVATE'}});const form=await p.questionnaire.create({data:{code:'WORKSPACE_RECOVERY',name:'Synthetic recovery form',creatorId:owner,type:'GENERAL',status:'PUBLISHED',visibility:'HIDDEN'}});for(const [resourceType,resourceId]of [['MEDIA_ASSET',asset.id],['FORM_TEMPLATE',form.id]])await p.materialGrant.create({data:{teacherId:owner,grantedBy:owner,resourceType,resourceId}});await p.$disconnect()})().catch(async()=>{await p.$disconnect();process.exit(1)})`;
 run('docker',['run','--rm','-i','--network','host','-e','DATABASE_URL='+process.env.DATABASE_URL,image,'node','-'],{input:code});
 const tables=['users','courses','checkins','checkin_schedules','material_grants','stored_assets','questionnaires'];
 const snapshot=db=>Object.fromEntries(tables.map(table=>[table,JSON.parse(sql(`SELECT json_build_object('count',count(*),'digest',md5(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY id),''))) FROM ${table} t`,db))]));
 const before=snapshot('ptool');assert(Object.values(before).every(row=>row.count>0));
 const file=resolve(privateRoot,'synthetic-workspace.dump'),fd=openSync(file,'wx',0o600);
 try{run('docker',['exec',container,'pg_dump','-U','ptool','-d','ptool','-Fc'],{stdio:['ignore',fd,'pipe']});}finally{closeSync(fd)}
 run('docker',['exec',container,'createdb','-U','ptool','workspace_restore_test']);
 run('docker',['exec','-i',container,'pg_restore','--exit-on-error','--no-owner','-U','ptool','-d','workspace_restore_test'],{input:readFileSync(file)});
 assert.deepEqual(snapshot('workspace_restore_test'),before);
 writeFileSync(resolve(evidence,'restore.json'),JSON.stringify({status:'PASS',tables:before,completeSyntheticDatabaseDump:true,productionRecoveryClaim:false}));
}else throw Error('Unknown recovery mode');
