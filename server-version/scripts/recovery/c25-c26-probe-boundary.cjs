'use strict'
/** Test-only network denial/reset observation before the actual probe preload. */
const path=require('node:path'),net=require('node:net'),perf=require('node:perf_hooks')
net.Socket.prototype.connect=function(){throw Error('No fixture network allowed')}
const original=perf.monitorEventLoopDelay
globalThis.__c26ResetCount=0
perf.monitorEventLoopDelay=function(...args){
 const histogram=original(...args),reset=histogram.reset
 histogram.reset=function(...values){globalThis.__c26ResetCount++;return Reflect.apply(reset,this,values)}
 return histogram
}
if(process.env.C26_PROBE_PRELOAD_RUNTIME==='1')require(path.resolve(__dirname,'../../backend/dist/services/runtimeObservability.js'))
