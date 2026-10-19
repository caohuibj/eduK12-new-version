/** Execute the original C22 rollback-only guard body after independently
 * verified missing-only evidence. Neither historical scheduled receipt is
 * rewritten or interpreted as a complete pass. Importing performs no I/O. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {harness,sha} from './c25-client.mjs'
import {runGuardBody} from './c25-guards.mjs'
import {readMissingPrerequisites} from './c25-missing-contract.mjs'

export const requiredGuardPhases=['open','probe','consumers']
export function validateGuardReceipts(receipts){
 assert.deepEqual(Object.keys(receipts).sort(),[...requiredGuardPhases].sort(),'exact missing-only guard prerequisites required')
 for(const name of requiredGuardPhases){
  const receipt=receipts[name]
  assert.equal(receipt?.schemaVersion,1)
  assert.equal(receipt?.passed,true,`missing-only ${name} did not pass`)
  assert.equal(receipt?.phase,`missing-${name}`,`wrong ${name} receipt identity`)
 }
 return true
}

export function readGuardPrerequisites(state){
 readMissingPrerequisites(state)
 const files=['c25-missing-prerequisites.json',...requiredGuardPhases.map(name=>`c25-missing-${name}-result.json`)],hashes={},receipts={}
 for(const file of files){
  const source=path.join(state,file),info=fs.lstatSync(source)
  assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1,'regular unaliased prerequisite required')
  assert.equal(info.mode&0o777,0o600,'private prerequisite required')
  const bytes=fs.readFileSync(source);hashes[file]=sha(bytes)
  const name=requiredGuardPhases.find(name=>file===`c25-missing-${name}-result.json`)
  if(name)receipts[name]=JSON.parse(bytes)
 }
 validateGuardReceipts(receipts)
 return hashes
}

export function verifyGuardPrerequisitesUnchanged(state,hashes){
 assert.deepEqual(readGuardPrerequisites(state),hashes,'guard prerequisites changed during rollback probes')
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const state=process.argv[2]
 let h,error
 try{
  assert.equal(process.argv.length,3,'only explicit new evidence state is accepted')
  assert.ok(path.isAbsolute(state)&&path.resolve(state)===state)
  // Validate before harness loads any runtime or database module.
  const hashes=readGuardPrerequisites(state)
  assert.ok(!fs.existsSync(path.join(state,'c25-missing-guards-result.json')),'missing guard phase already attempted')
  h=await harness('missing-guards',120)
  h.result.prerequisiteSha256=hashes
  await runGuardBody(h)
  verifyGuardPrerequisitesUnchanged(state,hashes)
  h.result.originalGuardBodyReused=true
  h.result.inheritedScheduledPromoted=false
 }catch(e){error=e;if(!h){console.error(JSON.stringify({passed:false,errorType:e.name,message:'Missing-only guard prerequisites rejected; no guard transaction started.'}));process.exitCode=1}}
 finally{if(h)await h.finish(error)}
}
