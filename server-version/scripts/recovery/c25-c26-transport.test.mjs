import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createOperationGate,createHttpTransport,readWave} from './c25-c26-transport.mjs'
const base={apiUrl:'http://127.0.0.1:34567/',remainingMs:()=>1000}
const response=value=>new Response(JSON.stringify({code:0,data:value}),{status:200,headers:{'content-type':'application/json'}})
test('raw C26 transport performs only its exact HTTP request and forwards cookie/CSRF without metrics calls',async()=>{
 const records=[],calls=[],record=x=>records.push(x),gate=createOperationGate(record)
 const client=createHttpTransport({...base,gate,record,fetchImpl:async(url,options)=>{calls.push({url,options});const out=response({ok:true});if(calls.length===1)out.headers.append('set-cookie','ptool_csrf=synthetic; Path=/');return out}})
 assert.deepEqual((await client.request('/auth/csrf')).value,{ok:true})
 const result=await client.request('/auth/training-login','POST',{password:'synthetic-private'})
 assert.deepEqual(result.value,{ok:true});assert.equal(calls.length,2);assert.ok(calls.every(x=>!x.url.includes('metrics')))
 assert.equal(calls[1].options.headers['x-csrf-token'],'synthetic');assert.equal(calls[1].options.redirect,'error')
 assert.ok(!JSON.stringify(records).includes('synthetic-private'));assert.deepEqual(gate.assertQuiescent(),{issued:2})
})
test('two read members have distinct journal identities; a failed peer aborts and settles its sibling then latches stop',async()=>{
 const records=[],record=x=>records.push(x),gate=createOperationGate(record);let calls=0,aborted=false
 const client=createHttpTransport({...base,record,gate,fetchImpl:async(url,{signal})=>{
  calls++;if(url.endsWith('/two'))throw new Error('synthetic peer failure')
  return await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason)},{once:true})})
 }})
 const specs=['one','two'].map(name=>({kind:'read',name}))
 await assert.rejects(readWave(specs,s=>client.request('/'+s.name,'GET',undefined,200,false,{label:s.name}),gate),/synthetic peer failure/)
 assert.equal(calls,2);assert.equal(aborted,true);assert.equal(gate.state().failed,true);assert.deepEqual(gate.state().pending,[])
 assert.deepEqual(records.filter(x=>x.stage==='ISSUED').map(x=>x.id),[1,2])
 await assert.rejects(client.request('/three'),/stopped/);assert.equal(calls,2)
})
test('two successful reads settle as a wave; writes cannot overlap it or silently become read-only POSTs',async()=>{
 const record=()=>{},gate=createOperationGate(record),body={selector:{schemaVersion:1}},bodySha256=createHash('sha256').update(JSON.stringify(body)).digest('hex')
 const client=createHttpTransport({...base,record,gate,fetchImpl:async()=>response({ok:true})})
 const route='/courses/00000000-0000-4000-8000-000000000001/training-analysis'
 const values=await readWave([{kind:'read'},{kind:'read'}],()=>client.request(route,'POST',body,200,false,{label:'analysis',readOnlyAnalysis:true,bodySha256}),gate)
 assert.equal(values.length,2);gate.assertQuiescent()
 await assert.rejects(client.request('/authoring','POST',body,200,false,{readOnlyAnalysis:true,bodySha256}))
 const write=gate.begin({kind:'write',label:'write'});assert.throws(()=>gate.begin({kind:'read',label:'read'}));gate.uncertain(write.id,new Error('stop'))
})
test('unknown write outcome and journal failure stop permanently before resubmission',async()=>{
 let calls=0;const record=()=>{},gate=createOperationGate(record),client=createHttpTransport({...base,record,gate,fetchImpl:async()=>{calls++;throw new Error('unknown write')}})
 await assert.rejects(client.request('/final','POST',{}),/unknown write/);await assert.rejects(client.request('/final','POST',{}),/stopped/);assert.equal(calls,1)
 const log=x=>{if(x.stage==='HTTP_ISSUED')throw new Error('journal failure')},g=createOperationGate(log)
 const noNetwork=createHttpTransport({...base,record:log,gate:g,fetchImpl:async()=>{throw new Error('should not send')}})
 await assert.rejects(noNetwork.request('/final','POST',{}),/journal failure/);assert.equal(g.state().failed,true);assert.deepEqual(g.state().pending,[])
})
