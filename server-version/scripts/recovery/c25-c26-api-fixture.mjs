/** Actual API leaf/probe, synthetic index boundary only; opens no listener. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire,registerHooks} from 'node:module'
import {fileURLToPath} from 'node:url'
const here=new URL(import.meta.url),directory=process.env.C26_API_FIXTURE_DIRECTORY
assert.ok(directory);const config=JSON.parse(fs.readFileSync(path.join(directory,'fixture-config.json')));assert.equal(config.scope,'NO_SERVICE_API_LIFECYCLE')
const backend=path.resolve(path.dirname(fileURLToPath(here)),'../../backend'),require=createRequire(path.join(backend,'package.json'))
const event=name=>fs.appendFileSync(path.join(directory,'fixture-events.jsonl'),JSON.stringify({name,pid:process.pid,monotonicNs:process.hrtime.bigint().toString()})+'\n',{mode:0o600})
if(!here.search){
 const actual=new URL('../../backend/dist/index.js',here).href,replacement=new URL(here);replacement.search='index'
 registerHooks({resolve(specifier,context,next){let resolved;try{resolved=new URL(specifier,context.parentURL).href}catch{};if(resolved===actual)return {url:replacement.href,shortCircuit:true};return next(specifier,context)}})
 event('preload')
}else{
 assert.ok(fs.existsSync(path.join(directory,'registration.json')),'API imported before exact parent registration')
 const net=require('node:net');net.Socket.prototype.connect=function(){throw Error('No API fixture network allowed')}
 const callbacks=new Map(),fake={$on:(name,fn)=>callbacks.set(name,fn),$use:()=>{}};globalThis.prisma=fake
 const Module=require('node:module'),load=Module._load
 Module._load=function(name,parent,...rest){if(name==='@prisma/client'&&parent?.filename===path.join(backend,'dist/config/database.js'))return {PrismaClient:class{constructor(){throw Error('No real Prisma construction')}}};return Reflect.apply(load,this,[name,parent,...rest])}
 try{assert.equal(require(path.join(backend,'dist/config/database.js')).prisma,fake)}finally{Module._load=load}
 event('consumer-loaded');callbacks.get('query')({duration:0.5})
 process.on('SIGTERM',()=>{event('term');if(config.mode==='ignore-term')return;if(config.mode==='late-query')callbacks.get('query')({duration:1});process.exit(0)})
 if(config.mode==='descendant'){
  const {spawn}=require('node:child_process');const descendant=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.send({ready:true})"],{stdio:['ignore','ignore','ignore','ipc']});await new Promise((resolve,reject)=>{descendant.once('message',value=>value.ready?resolve():reject(new Error('descendant not ready')));descendant.once('error',reject)});fs.writeFileSync(path.join(directory,'descendant.json'),JSON.stringify({pid:descendant.pid}),{mode:0o600})
 }
 if(config.mode==='bad-ipc')process.send({type:1})
 else{process.send('ready');if(config.mode==='duplicate-ready')process.send('ready')}
 setInterval(()=>{},1000)
}
