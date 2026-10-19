/** No-service actual A/B leaf + probe contract. Only the index boundary and
 * Prisma constructor/event source are replaced. Real compiled consumer stays. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire,registerHooks} from 'node:module'
const require=createRequire(import.meta.url),{selectAnalysisArtifact}=require('./c25-c26-analysis-artifacts.cjs')
// Deny networking before installing the replacement entry, so a failed hook
// cannot accidentally turn this contract into a real API/DB startup.
const net=require('node:net');net.Socket.prototype.connect=function(){throw Error('No fixture network')};net.Server.prototype.listen=function(){throw Error('No fixture listener')}
const selected=selectAnalysisArtifact(process.env.C26_ANALYSIS_ARTIFACT_ARM),directory=process.env.C26_API_FIXTURE_DIRECTORY,here=new URL(import.meta.url)
assert.ok(directory)
const event=value=>fs.appendFileSync(path.join(directory,'fixture-events.jsonl'),JSON.stringify({...value,pid:process.pid})+'\n',{mode:0o600})
if(!here.search){
 const replacement=new URL(here);replacement.search='index'
 registerHooks({resolve(specifier,context,next){let resolved;try{resolved=new URL(specifier,context.parentURL).pathname}catch{};if(resolved===selected.entry)return {url:replacement.href,shortCircuit:true};return next(specifier,context)}})
}else{
 assert.ok(fs.existsSync(path.join(directory,'registered.json')))
 const callbacks=new Map(),fake={$on:(name,fn)=>callbacks.set(name,fn),$use:()=>{}};globalThis.prisma=fake
 const Module=require('node:module'),load=Module._load,database=selected.dist+'/config/database.js'
 Module._load=function(name,parent,...rest){if(name==='@prisma/client'&&parent?.filename===database)return {PrismaClient:class{constructor(){throw Error('No fixture Prisma constructor')}}};return Reflect.apply(load,this,[name,parent,...rest])}
 try{assert.equal(require(database).prisma,fake)}finally{Module._load=load}
 const runtimeFile=selected.dist+'/services/runtimeObservability.js',runtime=require(runtimeFile)
 runtime.runtimeMetricLines=()=>{throw Error('No resetting metrics read')};runtime.resetRuntimeObservabilityForTests=()=>{throw Error('No reset')}
 assert.equal(require.cache[database].children.find(x=>x.filename===runtimeFile),require.cache[runtimeFile])
 event({stage:'SAME_REAL_SINGLETON',arm:selected.arm,database,runtimeFile,prismaSame:globalThis.prismaObservabilityClient===fake})
 callbacks.get('query')({duration:2.5});process.on('SIGTERM',()=>process.exit(0));process.send('ready');setInterval(()=>{},1000)
}
