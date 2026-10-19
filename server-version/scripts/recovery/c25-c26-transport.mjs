/** Inert C26 transport. No metrics scrape, automatic retry or networking at import. */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
export function createOperationGate(record){
 let failed=null,serial=0;const pending=new Map()
 const stop=error=>{failed??=error;for(const op of pending.values())op.abort.abort(failed)}
 return Object.freeze({
  begin({kind,label}){
   assert.ok(!failed,'C26 operation gate stopped');assert.ok(['read','write'].includes(kind));assert.match(label,/^[a-z0-9:-]{1,100}$/)
   assert.ok(pending.size<2&&(kind==='read'||pending.size===0)&&[...pending.values()].every(op=>op.kind==='read'),'only a two-read wave may overlap')
   const id=++serial,abort=new AbortController(),op={id,kind,label,abort}
   try{record({stage:'ISSUED',id,kind,label})}catch(error){stop(error);throw error}
   pending.set(id,op);return Object.freeze({id,signal:abort.signal})
  },
  received(id,summary){
   const op=pending.get(id);assert.ok(op,'unissued or duplicate response')
   try{record({stage:'RECEIVED',id,...summary});if(failed)throw failed;assert.equal(summary.accepted,true,'unaccepted response')}
   catch(error){stop(error);throw error}finally{pending.delete(id)}
  },
  uncertain(id,error){
   const op=pending.get(id);assert.ok(op,'unissued uncertain operation');stop(error)
   try{record({stage:'UNCERTAIN',id,kind:op.kind,errorClass:error.name})}finally{pending.delete(id)}
  },
  stop,
  assertQuiescent(){if(failed)throw failed;assert.equal(pending.size,0,'outstanding transport');return {issued:serial}},
  state(){return {issued:serial,pending:[...pending.keys()],failed:Boolean(failed)}},
 })
}

/** One batch has either one request or exactly two reads. Always settle both
 * members before propagating a shared fault; an aborted write is never retried. */
export async function readWave(specs,perform,gate){
 assert.equal(specs.length,2);assert.ok(specs.every(spec=>spec.kind==='read'))
 const outcomes=await Promise.allSettled(specs.map(spec=>Promise.resolve().then(()=>perform(spec)).catch(error=>{gate.stop(error);throw error})))
 const failure=outcomes.find(outcome=>outcome.status==='rejected')
 if(failure)throw failure.reason
 gate.assertQuiescent();return outcomes.map(outcome=>outcome.value)
}

export function createHttpTransport({apiUrl,remainingMs,record,gate,fetchImpl=fetch,now=()=>performance.now(),normalize=x=>x}){
 const api=new URL(apiUrl);assert.equal(api.protocol,'http:');assert.equal(api.hostname,'127.0.0.1');assert.equal(api.username,'');assert.equal(api.password,'');assert.ok(api.port);assert.equal(api.pathname,'/');assert.equal(api.search,'');assert.equal(api.hash,'')
 const cookies=new Map();let serial=0
 return Object.freeze({
  async request(route,method='GET',body,expected=200,raw=false,measurement={}){
   assert.ok(route.startsWith('/')&&!route.startsWith('//')&&!route.startsWith('/api/')&&!route.includes('://'))
   assert.notEqual(route,'/metrics');assert.ok(['GET','POST','PUT','DELETE','HEAD'].includes(method))
   // POST is a write unless the exact frozen analysis route/body is supplied.
   const semanticRead=method==='GET'||method==='HEAD'||measurement.readOnlyAnalysis===true
   if(measurement.readOnlyAnalysis){assert.equal(method,'POST');assert.match(route,/^\/courses\/[a-f0-9-]{36}\/training-analysis$/);assert.equal(sha(Buffer.from(JSON.stringify(body))),measurement.bodySha256)}
   const at=now(),time=remainingMs();assert.ok(Number.isFinite(time)&&time>0)
   const kind=semanticRead?'read':'write',label=measurement.label??`setup-${++serial}`,op=gate.begin({kind,label})
   const signal=AbortSignal.any([op.signal,AbortSignal.timeout(Math.max(1,Math.floor(Math.min(30000,time))))])
   const multipart=body instanceof FormData,auth=route.startsWith('/auth/'),requestBytes=body===undefined||multipart?null:Buffer.byteLength(JSON.stringify(body))
   let settled=false
   try{
    record({stage:'HTTP_ISSUED',id:op.id,label,route,method,body:auth?'AUTH_REDACTED':multipart?'MULTIPART':body,requestBytes,at:new Date().toISOString()})
    const response=await fetchImpl(api.origin+'/api'+route,{method,redirect:'error',signal,headers:{...(!multipart?{'content-type':'application/json'}:{}),...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{}),},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)})})
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');assert.ok(i>0);cookies.set(pair.slice(0,i),pair.slice(i+1))}
    const bytes=Buffer.from(await response.arrayBuffer()),elapsedMs=now()-at
    assert.ok(elapsedMs>=0);remainingMs()
    record({stage:'HTTP_RECEIVED',id:op.id,label,route,method,status:response.status,responseSha256:sha(bytes),response:auth?'AUTH_REDACTED':raw?'BINARY':bytes.toString(),bytes:bytes.length,elapsedMs,serverDate:response.headers.get('date')})
    assert.equal(response.status,expected,'unexpected HTTP status; stop without retry')
    let value=bytes
    if(!raw){const envelope=JSON.parse(bytes.toString());assert.equal(envelope.code,0,'nonzero HTTP envelope');value=normalize(envelope.data)}
    settled=true;gate.received(op.id,{accepted:true,status:response.status,elapsedMs,bytes:bytes.length,sha256:sha(bytes)})
    return {value,measurement:{id:op.id,label,route,method,status:response.status,elapsedMs,requestBytes,responseBytes:bytes.length,responseSha256:sha(bytes)}}
   }catch(error){if(!settled)gate.uncertain(op.id,error);throw error}
  },
 })
}
