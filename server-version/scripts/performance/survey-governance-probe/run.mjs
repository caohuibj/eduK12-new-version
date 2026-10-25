import {fork,execFileSync} from 'node:child_process'
import {randomBytes,createHash} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const directory=path.dirname(fileURLToPath(import.meta.url)),backend=path.resolve(directory,'../../../backend'),repo=path.resolve(backend,'../..')
const target=new URL(process.env.DATABASE_URL||''),redis=new URL(process.env.REDIS_URL||'')
if(process.env.SURVEY_GOVERNANCE_PROBE_ACK!=='owned-local-synthetic-only'||process.env.NODE_ENV!=='test'
 ||target.hostname!=='127.0.0.1'||target.port!=='55433'||target.pathname!=='/survey_governance_probe_test'
 ||redis.hostname!=='127.0.0.1'||redis.port!=='56380'||redis.pathname!=='/2')throw Error('Exact owned loopback probe resources and acknowledgement required')
const output=process.env.PROBE_OUTPUT_DIR
if(!output||!path.isAbsolute(output)||existsSync(output))throw Error('New absolute output directory required; prior evidence is never overwritten')
execFileSync('git',['diff','--exit-code','HEAD','--','server-version/backend/src','server-version/backend/prisma','server-version/backend/package.json','server-version/backend/package-lock.json','server-version/backend/scripts/runtime-table-policy.json'],{cwd:repo,stdio:'pipe'})
mkdirSync(output,{mode:0o700})
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
const source={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:repo,encoding:'utf8'}).trim(),node:process.version,backendLock:hash(path.join(backend,'package-lock.json')),harness:Object.fromEntries(['run.mjs','fixture.ts','api.ts'].map(p=>[p,hash(path.join(directory,p))]))}
const env={...process.env,PROBE_BACKEND_ROOT:backend,NODE_ENV:'test',PERF_ISOLATED_TEST_MODE:'1',PERF_SQL_EVENT_COUNT:'1',SURVEY_WORKSPACE_ENABLED:'true',SURVEY_PUBLICATION_ENABLED:'true',JWT_SECRET:randomBytes(32).toString('hex'),DATA_ENCRYPTION_KEY:randomBytes(32).toString('hex'),DATA_PSEUDONYM_KEY:randomBytes(32).toString('hex'),ASSESSMENT_REPORT_ASYNC_ENABLED:'false'}
function child(file,request){return new Promise((resolve,reject)=>{
 const worker=fork(path.join(directory,file),[],{cwd:backend,env,execArgv:['--import',path.join(backend,'node_modules/tsx/dist/loader.mjs')],stdio:['ignore','inherit','inherit','ipc']})
 const timeout=setTimeout(()=>worker.kill('SIGTERM'),90000)
 let result
 worker.on('message',message=>{if(message.kind==='ready'&&request)worker.send(request);else if(['fixtures','result'].includes(message.kind))result=message;else if(message.kind==='partial')appendFileSync(path.join(output,request.workload.group+'.partial.jsonl'),JSON.stringify(message.evidence)+'\n',{mode:0o600})})
 worker.on('error',error=>{clearTimeout(timeout);reject(error)});worker.on('exit',(code,signal)=>{clearTimeout(timeout);code===0&&result?resolve(result):reject(Error('Isolated child failed: '+file+' / '+(signal||code)))})
})}
const fixtures=await child('fixture.ts'),results=[]
writeFileSync(path.join(output,'source.json'),JSON.stringify(source,null,2),{mode:0o600})
for(const workload of fixtures.workloads){
 const result=await child('api.ts',{workload});results.push(result.result)
 writeFileSync(path.join(output,workload.group+'.json'),JSON.stringify({source,...result.result},null,2),{mode:0o600})
 console.log(JSON.stringify({group:workload.group,complete:true,series:result.result.series.map(s=>({cache:s.cache,requests:s.requests.length,verified:s.verified}))}))
}
writeFileSync(path.join(output,'results.json'),JSON.stringify({schemaVersion:1,kind:'bounded-synthetic-resource-probe',source,results},null,2),{mode:0o600})
