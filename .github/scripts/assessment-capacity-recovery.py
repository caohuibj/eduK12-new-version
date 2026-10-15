"""Actual isolated new-schema backup/restore with a pending acknowledged report."""
import hashlib, importlib.util, json, os, subprocess, sys, time
from pathlib import Path
builder, directory=sys.argv[1:]; evidence=Path(directory)
checks_path=evidence/'checks.json'; checks=json.loads(checks_path.read_text())
if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('CI')!='true': raise RuntimeError('Official isolated CI only')
base='postgresql://ptool:synthetic@127.0.0.1:5432/assessment_capacity_ci_test?schema=public'
common=['docker','run','--rm','--network','host','-v',str(evidence)+':/evidence','-v',str(Path('server-version/backend/src/__tests__').resolve())+':/app/src/__tests__:ro',
 '-e','CI=true','-e','GITHUB_ACTIONS=true','-e','NODE_ENV=test','-e','JWT_SECRET=synthetic-report-ci-not-production','-e','ASSET_SIGNING_SECRET=synthetic-report-assets',
 '-e','DATA_ENCRYPTION_KEY='+'55'*32,'-e','DATA_PSEUDONYM_KEY='+'56'*32,'-e','ASSET_MIGRATION_COMPLETE=true','-e','ASSESSMENT_REPORT_ASYNC_ENABLED=true',
 '-e','UPLOAD_DIR=/tmp/report-ci-uploads']
script=evidence/'prepare-restore.ts'
script.write_text("""import {writeFileSync} from 'node:fs';
import {PrismaClient} from '/app/node_modules/@prisma/client/index.js';
import {createReportOutboxFixture} from '/app/src/__tests__/integration/report-outbox-fixture';
import {requireIsolatedReleaseDatabase} from '/app/src/__tests__/integration/integration-env';
import {submitScaleAssessmentFinal} from '/app/src/modules/scale/scale-final-submit.service';
import {prisma as serviceDb} from '/app/src/config/database';
(async()=>{requireIsolatedReleaseDatabase(process.env.DATABASE_URL!);const db=new PrismaClient();const f=await createReportOutboxFixture(db);const ack=await submitScaleAssessmentFinal(f.inputs[0]);
writeFileSync('/evidence/restore-fixture.json',JSON.stringify({attemptId:f.parent.id,participantId:f.participant.id,assessmentId:f.inputs[0].assessmentId,submissionId:ack.submissionId,payloadHash:ack.payloadHash}));
await db.$disconnect();await serviceDb.$disconnect()})().catch(e=>{console.error(e);process.exit(1)});
""")
subprocess.run(common+['-e','DATABASE_URL='+base,builder,'npx','tsx','/evidence/prepare-restore.ts'],check=True,timeout=60)
archive=evidence/'pending-report.dump'
with archive.open('wb') as out:subprocess.run(['docker','exec','assessment-capacity-ci-postgres','pg_dump','-U','ptool','-Fc','assessment_capacity_ci_test'],stdout=out,check=True,timeout=60)
subprocess.run(['docker','exec','assessment-capacity-ci-postgres','createdb','-U','ptool','assessment_restore_ci_test'],check=True,timeout=30)
with archive.open('rb') as source:subprocess.run(['docker','exec','-i','assessment-capacity-ci-postgres','pg_restore','-U','ptool','-d','assessment_restore_ci_test'],stdin=source,check=True,timeout=90)
role='report_ci_runtime'
subprocess.run(['docker','exec','assessment-capacity-ci-postgres','psql','-U','ptool','-d','assessment_restore_ci_test','-v','ON_ERROR_STOP=1','-c',"CREATE ROLE report_ci_runtime LOGIN PASSWORD 'synthetic-runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO report_ci_runtime;"],check=True,timeout=30)
policy=json.loads(Path('server-version/backend/scripts/runtime-table-policy.json').read_text())
for table, category in policy['tables'].items():
    if category=='OPERATOR_ONLY':continue
    privileges='SELECT,INSERT,UPDATE,DELETE' if category=='RUNTIME_RW' else 'SELECT'
    subprocess.run(['docker','exec','assessment-capacity-ci-postgres','psql','-U','ptool','-d','assessment_restore_ci_test','-v','ON_ERROR_STOP=1','-q','-c',f'GRANT {privileges} ON TABLE "{table}" TO {role}'],check=True,stdout=subprocess.DEVNULL,timeout=10)
# All runtime sequences are owned by already classified runtime tables. Preserve
# the established restriction: operator sequences receive no runtime privilege.
query="SELECT c.relname,owning.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i') JOIN pg_class owning ON owning.oid=d.refobjid WHERE n.nspname='public' AND c.relkind='S'"
rows=subprocess.check_output(['docker','exec','assessment-capacity-ci-postgres','psql','-U','ptool','-d','assessment_restore_ci_test','-At','-F','|','-c',query],text=True).strip().splitlines()
for row in rows:
    sequence, table=row.split('|')
    if policy['tables'].get(table)=='RUNTIME_RW':subprocess.run(['docker','exec','assessment-capacity-ci-postgres','psql','-U','ptool','-d','assessment_restore_ci_test','-q','-c',f'GRANT USAGE,SELECT ON SEQUENCE "{sequence}" TO {role}'],check=True,stdout=subprocess.DEVNULL,timeout=10)
runtime='postgresql://report_ci_runtime:synthetic-runtime@127.0.0.1:5432/assessment_restore_ci_test?schema=public'
verify=evidence/'verify-restore.cjs'
verify.write_text("""const fs=require('fs'),assert=require('assert/strict');
const {prisma}=require('/app/dist/config/database');const outbox=require('/app/dist/modules/assessment-runtime/report-outbox.service');
(async()=>{const expected=JSON.parse(fs.readFileSync('/evidence/restore-fixture.json'));const before=await prisma.assessment.findUniqueOrThrow({where:{id:expected.assessmentId}});
assert.equal(before.submissionId,expected.submissionId);assert.equal(before.submissionPayloadHash,expected.payloadHash);
const job=await outbox.claimCompositeReportJob();assert.equal(job.attemptId,expected.attemptId);await require('/app/dist/workers/compositeReportWorker').processCompositeReportJob(job);
const ready=await outbox.readCompositeReportJob(expected.attemptId,1);assert.equal(ready.status,'READY');
const report=await require('/app/dist/modules/composite/composite.service').getReport(expected.attemptId,{userId:expected.participantId});assert.equal(report.unitReports[0].scores[0].value,3);
assert.equal((await prisma.compositeReportQueueBudget.findUniqueOrThrow({where:{id:'reports'}})).pending,0);
fs.writeFileSync('/evidence/recovery-result.json',JSON.stringify({status:'success',receiptPreserved:true,pendingReportRecovered:true,restrictedRuntimeRole:true,scoreVerified:true}));await prisma.$disconnect()})().catch(e=>{console.error(e);process.exit(1)});
""")
subprocess.run(common+['-e','DATABASE_URL='+runtime,'-e','DATABASE_URL_RUNTIME='+runtime,builder,'node','scripts/runtime-role-contract.mjs','verify-current'],check=True,timeout=30)
subprocess.run(common+['-e','DATABASE_URL='+runtime,builder,'node','/evidence/verify-restore.cjs'],check=True,timeout=90)
result=json.loads((evidence/'recovery-result.json').read_text());assert result['status']=='success'
result['backupSha256']=hashlib.sha256(archive.read_bytes()).hexdigest();result['schemaMigration']='20261015010000_composite_report_outbox';result['at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
(evidence/'recovery-result.json').write_text(json.dumps(result,indent=2))
# Synthetic dump is not a production backup. Keep its digest and real restore
# results; the disposable container and all fixture files are removed by CI.
archive.unlink()
script.unlink();verify.unlink()
