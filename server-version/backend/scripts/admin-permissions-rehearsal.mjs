// Explicit disposable loopback rehearsal. No production account/configuration,
// external upload, automatic cleanup policy or deployment is performed.
import {readFileSync,writeFileSync,openSync,closeSync,mkdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash,randomBytes} from 'node:crypto'
import pg from 'pg'
import {PrismaClient} from '@prisma/client'
import {verifyRuntimePrivileges} from './runtime-role-contract.mjs'
import {verifyReleaseSchema} from './release-schema-contract.mjs'
const source=new URL(process.env.DATABASE_URL||'http://invalid'),root=fileURLToPath(new URL('../',import.meta.url))
if(process.env.ADMIN_PERMISSIONS_ISOLATED_TEST!=='1'||process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(source.hostname)
  ||!source.pathname.startsWith('/eduk12_admin_permissions_')||source.port!=='55432')throw new Error('Dedicated loopback test database required')
const privateRoot='/workspace/admin-permissions-private',suffix=Date.now().toString(36)
const restored='eduk12_admin_permissions_restore_'+suffix,runtimeRole='admin_permissions_runtime_'+suffix
const ownerName=decodeURIComponent(source.username),sourceDb=source.pathname.slice(1)
const sql=pg.escapeIdentifier,secret=randomBytes(24).toString('base64url')
const owner=new pg.Client({connectionString:source.href}),restoredUrl=new URL(source.href);restoredUrl.pathname='/'+restored
let restoreOwner,runtime,stage='connect'
const psql=(database,input)=>execFileSync('docker',['exec','-i','eduk12-cloud-postgres-1','psql','-X','-U',ownerName,'-d',database,'-v','ON_ERROR_STOP=1','-f','-'],{input,stdio:['pipe','pipe','pipe']})
const fingerprint=async db=>{
 const rows=await db.query('SELECT id,user_id,entry,version,granted_by,granted_at,revoked_by,revoked_at FROM admin_entry_grants ORDER BY id')
 return createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex')
}
try{
 mkdirSync(privateRoot,{recursive:true,mode:0o700});await owner.connect()
 const before=await fingerprint(owner)
 stage='additive-replay'
 for(const migration of ['20261020100000_admin_entry_authority','20261020110000_admin_security_keys']){
  await owner.query('BEGIN')
  try{await owner.query(readFileSync(path.join(root,'prisma/migrations',migration,'migration.sql'),'utf8'));await owner.query('COMMIT')}
  catch(error){await owner.query('ROLLBACK');throw error}
 }
 if(before!==await fingerprint(owner))throw new Error('Grant state changed during idempotent replay')
 stage='isolated-dump-restore'
 const dump=path.join(privateRoot,'admin-authority-'+suffix+'.dump'),fd=openSync(dump,'wx',0o600)
 try{execFileSync('docker',['exec','eduk12-cloud-postgres-1','pg_dump','-U',ownerName,'-d',sourceDb,'-Fc'],{stdio:['ignore',fd,'pipe']})}finally{closeSync(fd)}
 await owner.query('CREATE DATABASE '+sql(restored))
 execFileSync('docker',['exec','-i','eduk12-cloud-postgres-1','pg_restore','-U',ownerName,'-d',restored,'--exit-on-error'],{input:readFileSync(dump),stdio:['pipe','pipe','pipe']})
 restoreOwner=new pg.Client({connectionString:restoredUrl.href});await restoreOwner.connect()
 if(before!==await fingerprint(restoreOwner))throw new Error('Restored grant/version state differs')
 stage='restricted-runtime'
 await owner.query('CREATE ROLE '+sql(runtimeRole)+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '+pg.escapeLiteral(secret))
 const policy=JSON.parse(readFileSync(path.join(root,'scripts/runtime-table-policy.json'),'utf8'))
 const input=`\\set target_database ${pg.escapeLiteral(restored)}\n\\set migration_owner ${pg.escapeLiteral(ownerName)}\n\\set runtime_role ${pg.escapeLiteral(runtimeRole)}\n\\set table_policy ${pg.escapeLiteral(JSON.stringify(policy))}\n`+readFileSync(path.join(root,'scripts/runtime-role-defaults.sql'),'utf8')
 psql(restored,input)
 const runtimeUrl=new URL(restoredUrl.href);runtimeUrl.username=runtimeRole;runtimeUrl.password=secret
 runtime=new PrismaClient({datasources:{db:{url:runtimeUrl.href}},log:[]})
 const privileges=await verifyRuntimePrivileges(runtime),schema=await verifyReleaseSchema(runtime)
 let denied=0
 for(const statement of ["UPDATE admin_authorization_audits SET reason='synthetic tamper' WHERE FALSE",'TRUNCATE admin_authorization_audits','ALTER TABLE admin_entry_grants DISABLE TRIGGER ALL']){
  try{await runtime.$executeRawUnsafe(statement)}catch{denied++}
 }
 if(denied!==3)throw new Error('Restricted runtime weakened immutable audit/ownership')
 const indexes=await runtime.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename IN ('admin_entry_grants','admin_security_keys','admin_security_challenges','admin_authorization_audits') ORDER BY indexname")
 const [storage]=await runtime.$queryRawUnsafe("SELECT sum(pg_total_relation_size(oid))::text AS bytes FROM pg_class WHERE relname IN ('admin_entry_grants','admin_security_keys','admin_security_challenges','admin_authorization_audits')")
 const [counts]=await runtime.$queryRawUnsafe('SELECT (SELECT count(*)::int FROM admin_entry_grants) AS grants,(SELECT count(*)::int FROM admin_authorization_audits) AS audits,(SELECT count(*)::int FROM admin_security_keys) AS keys')
 const report={result:'PASS',additiveReplayPreserved:true,dumpRestorePreserved:true,restrictedRuntime:true,deniedMutations:denied,grantStateSha256:before,
  ...privileges,...schema,indexes:indexes.length,storageBytes:Number(storage.bytes),counts,rawDatabaseUploaded:false,productionAccess:false}
 writeFileSync(path.join(privateRoot,'rehearsal-report.json'),JSON.stringify(report,null,2),{mode:0o600})
 console.log(JSON.stringify(report))
}catch{console.error(JSON.stringify({result:'FAIL',stage,productionAccess:false}));process.exitCode=1}
finally{await runtime?.$disconnect();await restoreOwner?.end();await owner.end()}
