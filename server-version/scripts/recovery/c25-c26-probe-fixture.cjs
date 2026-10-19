'use strict'
/** Service-free boundary only: keep frozen runtime and DB consumer code real,
 * replace only Prisma construction/event source, deny networking. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module')
const mode=process.env.C26_PROBE_FIXTURE_MODE
const backend=path.resolve(__dirname,'../../backend'),runtimeFile=path.join(backend,'dist/services/runtimeObservability.js')
 const runtime=require(runtimeFile),probeModule=require('./c25-c26-runtime-probe.cjs'),probe=globalThis[probeModule.marker]
 assert.ok(probe)
 const callbacks=new Map(),fake={$on:(name,callback)=>callbacks.set(name,callback),$use:()=>{}}
 globalThis.prisma=fake
 const load=Module._load
 Module._load=function(request,parent,...rest){
  if(request==='@prisma/client'&&parent?.filename===path.join(backend,'dist/config/database.js'))return {PrismaClient:class{constructor(){throw Error('No Prisma construction in service-free test')}}}
  return Reflect.apply(load,this,[request,parent,...rest])
 }
 try{if(mode!=='missing-consumer')require(path.join(backend,'dist/config/database.js'))}finally{Module._load=load}
 // Calling either metrics/reset export would make this test fail.
 runtime.runtimeMetricLines=()=>{throw Error('runtimeMetricLines forbidden')}
 runtime.resetRuntimeObservabilityForTests=()=>{throw Error('reset forbidden')}
 process.on('message',message=>{
  if(message?.type!=='c26-fixture')return
  try{
   if(message.action==='event')callbacks.get('query')({duration:message.duration})
   else if(message.action==='invalid-events')for(const duration of [-1,NaN,Infinity,'7',null])callbacks.get('query')({duration})
   else if(message.action==='drift')runtime.recordPrismaSqlEvent=()=>{}
   else if(message.action==='duplicate')assert.throws(()=>probeModule.install())
   else if(message.action==='check'){
    assert.equal(globalThis.__c26ResetCount,0)
    assert.equal(require.cache[runtimeFile].exports,runtime)
   }else if(message.action==='stop'){process.send({type:'c26-fixture-ok',id:message.id});process.disconnect();return}
   else throw Error('Unknown fixture action')
   process.send({type:'c26-fixture-ok',id:message.id,resetCount:globalThis.__c26ResetCount})
  }catch(error){process.send({type:'c26-fixture-error',id:message.id,errorClass:error.name});process.exitCode=1;process.disconnect()}
 })
 process.send({type:'c26-fixture-loaded',consumerLoaded:mode!=='missing-consumer'})
