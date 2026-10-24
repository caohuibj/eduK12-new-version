// Explicitly provisioned, disposable local resources only. No installation or migration.
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, realpathSync} from 'node:fs';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const required=k=>{if(!process.env[k])throw new Error(`Set ${k} explicitly`);return process.env[k]};
if(required('SYNTHETIC_LOCAL_PROBE_ACK')!=='disposable-local-only')throw new Error('Explicit isolated-resource acknowledgement required');
const database=new URL(required('DATABASE_URL')),redis=new URL(required('REDIS_URL'));
for(const [label,u,protocol] of [['database',database,'postgresql:'],['redis',redis,'redis:']]){
 if(u.protocol!==protocol||u.hostname!=='127.0.0.1'||!u.port)throw new Error(`${label} must use explicit 127.0.0.1 TCP port`);
}
if(!/^\/[a-z0-9_]+_perf_test$/.test(database.pathname))throw new Error('Database must have a dedicated *_perf_test name');
// Prevent connection-string host/socket overrides from bypassing the loopback check.
for(const k of database.searchParams.keys())if(!['schema','connection_limit','pool_timeout'].includes(k))throw new Error('Unsupported database connection option');
if(redis.search||redis.hash||database.hash)throw new Error('Unexpected connection options');
const parent=realpathSync(required('PARENT_BACKEND_ROOT')),candidate=realpathSync(required('CANDIDATE_BACKEND_ROOT'));
for(const root of [parent,candidate])for(const p of ['src/modules/scale/unified-final-submit.service.ts','node_modules/tsx/dist/loader.mjs'])if(!existsSync(join(root,p)))throw new Error('Backend source/dependencies missing');
const output=resolve(required('PROBE_OUTPUT_DIR'));if(existsSync(output))throw new Error('Output directory must be new; do not overwrite prior evidence');mkdirSync(output,{recursive:true,mode:0o700});
const home=dirname(fileURLToPath(import.meta.url));
const env={...process.env,NODE_ENV:'test',DIRECT_DATABASE_URL:database.toString(),DATABASE_URL:database.toString(),REDIS_URL:redis.toString(),BENCH_SOURCE_ROOT:parent,BENCH_PARENT_SOURCE:parent,BENCH_CANDIDATE_SOURCE:candidate,BENCH_HOME:home,BENCH_OUTPUT_ROOT:output,PERF_ISOLATED_TEST_MODE:'1',PERF_SQL_EVENT_COUNT:'1',ASSESSMENT_TIMELINE_ENABLED:'true',ASSESSMENT_REPORT_ASYNC_ENABLED:'false',ASSESSMENT_WHOLE_SUBMIT_ENABLED:'false',DATA_ENCRYPTION_KEY:randomBytes(32).toString('hex'),DATA_PSEUDONYM_KEY:randomBytes(32).toString('hex'),JWT_SECRET:randomBytes(48).toString('hex'),ASSET_SIGNING_SECRET:randomBytes(32).toString('hex')};
const child=spawn(process.execPath,['--import',join(parent,'node_modules/tsx/dist/loader.mjs'),join(home,'probe.ts')],{env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Probe process could not start');process.exitCode=1});
child.on('exit',(code,signal)=>{process.exitCode=code??1;if(signal)console.error('Probe interrupted');});
