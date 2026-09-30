import {test} from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {runMixedLoad,validateFixture} from './prelaunch-mixed-load.mjs'
const serve=async(handler,fn)=>{
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 try {await fn(`http://127.0.0.1:${server.address().port}`)}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
const step={path:'/final',method:'POST',body:{sealed:'immutable'},headers:{'X-Export-Request-Key':'test-key'},retrySafe:true,expect:{status:200,path:'status',equals:'FINAL'},busy:{path:'code',equals:'BUSY'}}
test('keeps body and key stable across busy, network loss and discarded success',async()=>{
 const bodies=[];const keys=[];let calls=0
 await serve(async(req,res)=>{
  let body='';for await(const part of req)body+=part;bodies.push(body);keys.push(req.headers['x-export-request-key']);calls++
  if(calls===1){res.writeHead(503,{'Retry-After':'0'});res.end(JSON.stringify({code:'BUSY'}))}
  else if(calls===2)req.socket.destroy()
  else res.end(JSON.stringify({status:'FINAL'}))
 },async(baseUrl)=>{
  const report=await runMixedLoad({baseUrl,operations:[{id:'1',category:'scale-final',steps:[step]}]},{concurrency:1,deadlineMs:2000})
  assert.equal(report.logicalCompleted,1);assert.equal(report.attempts,3);assert.equal(report.intendedBusy503,1);assert.equal(report.networkErrors,1);assert.equal(report.unexpected5xx,0)
  assert.equal(new Set(bodies).size,1);assert.equal(new Set(keys).size,1);assert.equal(report.capacityCertified,false)
  assert.ok(!JSON.stringify(report).includes('immutable'))
 })
 await serve((_req,res)=>res.end(JSON.stringify({status:'FINAL'})),async(baseUrl)=>{
  const report=await runMixedLoad({baseUrl,operations:[{id:'1',category:'cpt-final',steps:[{...step,discardFirstResponse:true}]}]},{concurrency:1,deadlineMs:2000})
  assert.equal(report.attempts,2);assert.equal(report.discardedResponses,1);assert.equal(report.logicalCompleted,1)
 })
})
test('200 acknowledgement does not count as completed FINAL; explicit poll confirms',async()=>{
 let polls=0
 await serve((req,res)=>res.end(JSON.stringify(req.url==='/final'?{code:0}:{status:++polls===1?'PROCESSING':'FINAL'})),async(baseUrl)=>{
  const report=await runMixedLoad({baseUrl,operations:[{id:'1',category:'bundle-final',steps:[{...step,expect:{status:200,path:'code',equals:0},confirm:{path:'/status',expect:{status:200,path:'status',equals:'FINAL'},pending:{path:'status',equals:'PROCESSING'}}}]}]},{concurrency:1,deadlineMs:2000})
  assert.equal(report.logicalCompleted,1);assert.equal(report.attempts,3)
  const failed=await runMixedLoad({baseUrl,operations:[{id:'2',category:'scale-final',steps:[step]}]},{concurrency:1,deadlineMs:1000})
  assert.equal(failed.logicalCompleted,0)
 })
})
test('unexpected 503 is not endlessly retried, expiry refusal can be expected',async()=>{
 await serve((req,res)=>{res.statusCode=req.url==='/expired'?403:503;res.end(JSON.stringify({code:'UNEXPECTED'}))},async(baseUrl)=>{
  const report=await runMixedLoad({baseUrl,operations:[{id:'1',category:'password-abuse',steps:[step]},{id:'2',category:'expired-export',steps:[{path:'/expired',expect:{status:403}}]}]},{concurrency:1,deadlineMs:1000})
  assert.equal(report.attempts,2);assert.equal(report.unexpected5xx,1);assert.equal(report.logicalCompleted,1)
 })
})
test('rejects cross-origin credentials, duplicate logical IDs and acknowledgement-only success',()=>{
 const fixture={baseUrl:'http://localhost',operations:[{id:'1',category:'scale-final',steps:[step]}]}
 assert.throws(()=>validateFixture({...fixture,operations:[...fixture.operations,...fixture.operations]}))
 assert.throws(()=>validateFixture({...fixture,operations:[{...fixture.operations[0],steps:[{...step,path:'https://other.test'}]}]}))
 assert.throws(()=>validateFixture({...fixture,operations:[{...fixture.operations[0],steps:[{...step,expect:{status:200}}]}]}))
})
