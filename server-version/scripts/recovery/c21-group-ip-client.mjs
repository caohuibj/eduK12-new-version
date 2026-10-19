import {publicFailure,publicRoute} from './c21-error-redaction.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {sha,normalizeProduct,closeQueues,prisma,require,backend} from './c20-materials-client.mjs'
export * from './c20-materials-client.mjs'
export function harness(phase){
 const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json')))
 assert.equal(process.version,'v24.21.0');assert.equal(process.env.NODE_ENV,'test');assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1');assert.equal(new URL(process.env.DATABASE_URL).username,'eduk12_runtime')
 const journal=path.join(state,'c21-'+phase+'-http-private.jsonl');let operationId=0
 const journalWrite=value=>fs.appendFileSync(journal,JSON.stringify(value)+'\n',{mode:0o600})
 const result={passed:false,phase,checks:[],requests:[],measurements:[],counts:[]}
 const moduleClosure=()=>Object.keys(require.cache).sort().filter(file=>fs.existsSync(file)).map(file=>({path:path.relative(backend,file),sha256:sha(fs.readFileSync(file))}))
 const initialModules=moduleClosure()
 const read=name=>JSON.parse(fs.readFileSync(path.join(state,name)))
 const write=(name,value)=>fs.writeFileSync(path.join(state,name),JSON.stringify(value,null,2),{mode:0o600})
 const check=text=>{result.checks.push(text);console.log('PASS',text)}
 async function sqlCount(){const response=await fetch(status.apiUrl+'/metrics',{signal:AbortSignal.timeout(8000)});assert.equal(response.status,200);const text=await response.text();const match=text.match(/^ptool_prisma_sql_events_total (\d+)$/m);assert.ok(match,'SQL observability must be enabled');return Number(match[1])}
 function client(){const cookies=new Map();return {recovery:null,async request(route,method='GET',body,expected=200,raw=false){
  const before=await sqlCount(),start=performance.now(),multipart=body instanceof FormData
  const op=++operationId;journalWrite({op,stage:'ISSUED',route,method,body:route.startsWith('/auth/')?'AUTH_REDACTED':multipart?'MULTIPART':body,at:new Date().toISOString()})
  const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(30000),headers:{...(!multipart?{'content-type':'application/json'}:{}),...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{}),...(this.recovery?{'x-recovery-token':this.recovery}:{})},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)})})
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
  const bytes=Buffer.from(await response.arrayBuffer()),safe=publicRoute(route)
  journalWrite({op,stage:'RECEIVED',status:response.status,responseSha256:sha(bytes),response:route.startsWith('/auth/')?'AUTH_REDACTED':raw?'BINARY':bytes.toString(),at:new Date().toISOString()})
  result.requests.push({route:safe,method,status:response.status,bytes:bytes.length,elapsedMs:performance.now()-start,apiSqlEvents:(await sqlCount())-before,sqlScope:'PROCESS_WIDE_WINDOW; CONCURRENT_WINDOWS_CAN_OVERLAP'})
  assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${method} ${safe}: status ${response.status}`)
  if(raw)return bytes
  const envelope=JSON.parse(bytes.toString());if(response.status!==200)return envelope
  assert.equal(envelope.code,0,`${safe}: nonzero response code`);return normalizeProduct(envelope.data)
 },async login(who,role){await this.request('/auth/csrf');await this.request(role==='ADMIN'?'/auth/login':'/auth/training-login','POST',role==='ADMIN'?{username:who.username,password:who.password}:{username:who.username,password:who.password,expectedRole:role})}}}
 async function finish(error){if(error){fs.writeFileSync(path.join(state,'c21-'+phase+'-error-private.log'),String(error.stack??error),{mode:0o600});result.error=publicFailure(error);}const consumed=moduleClosure();assert.ok(initialModules.every(row=>consumed.some(now=>now.path===row.path&&now.sha256===row.sha256)),'initial dependency bytes changed during phase');result.loadedModuleClosure=consumed;const lock=path.join(backend,'node_modules/.package-lock.json');result.installedDependencyLockSha256=fs.existsSync(lock)?sha(fs.readFileSync(lock)):null;write('c21-'+phase+'-result.json',result);await closeQueues();await prisma.$disconnect()}
 return {state,status,result,read,write,check,client,finish}
}
