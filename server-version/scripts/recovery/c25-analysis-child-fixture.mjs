/** Test-only process boundary. Never imported by the production coordinator. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {registerHooks} from 'node:module'
import {createHash} from 'node:crypto'

const state=process.env.C25_CHILD_CONTRACT_STATE
assert.ok(state&&path.isAbsolute(state),'An explicit isolated contract state is required')
const config=JSON.parse(fs.readFileSync(path.join(state,'fixture-config.json')))
assert.equal(config.scope,'SYNTHETIC_CLI_LIFECYCLE_ONLY')
const graph=path.resolve(process.env.C25_CHILD_CONTRACT_GRAPH)
const base=pathToFileURL(graph+path.sep)
const here=fileURLToPath(import.meta.url)
const ownUrl=pathToFileURL(here).href
const journal=path.join(state,'fixture-events.jsonl')
export function event(name,extra={}){
 fs.appendFileSync(journal,JSON.stringify({event:name,pid:process.pid,ppid:process.ppid,at:Date.now(),...extra})+'\n',{mode:0o600})
}
export function readAnalysisPrerequisites(value){
 // Only this fixed prerequisite boundary is synthetic. Argument, nonce,
 // ownership, permissions, environment and result guards remain real.
 assert.equal(value,state);assert.equal(config.scope,'SYNTHETIC_CLI_LIFECYCLE_ONLY')
 event('prerequisites-read');return {scope:config.scope}
}

if(!new URL(import.meta.url).search){
 const replacements=new Map([
  [new URL('c20-materials-client.mjs',base).href,new URL('c25-analysis-child-runtime-fixture.mjs',ownUrl).href],
  [new URL('c25-analysis-contract.mjs',base).href,ownUrl+'?prerequisites'],
 ])
 const observed=new Set(['c25-analysis-export.mjs','c25-analysis-http.mjs','c25-analysis-child.mjs'].map(name=>new URL(name,base).href))
 registerHooks({
  resolve(specifier,context,nextResolve){
   let resolved
   try{resolved=new URL(specifier,context.parentURL).href}catch{}
   if(replacements.has(resolved))return {url:replacements.get(resolved),shortCircuit:true}
   return nextResolve(specifier,context)
  },
  load(url,context,nextLoad){
   const value=nextLoad(url,context)
   if(observed.has(url))event('real-module-loaded',{url,sha256:createHash('sha256').update(fs.readFileSync(fileURLToPath(url))).digest('hex')})
   return value
  },
 })
}

if(!new URL(import.meta.url).search&&process.argv[1]&&path.resolve(process.argv[1])===here){
 event('parent-start')
 const {runAnalysisChild}=await import(new URL('c25-analysis-export.mjs',base))
 const started=performance.now()
 let value,error
 try{value=await runAnalysisChild({state,remaining:()=>config.remainingMs},config.kind,config.input)}catch(caught){error={name:caught.name,message:caught.message}}
 const result={passed:!error,elapsedMs:performance.now()-started,value,error}
 event('parent-return',{passed:result.passed})
 fs.writeFileSync(path.join(state,'fixture-parent-result.json'),JSON.stringify(result),{flag:'wx',mode:0o600})
 if(error)process.exitCode=1
}
