/** Exact inherited C25 subchecks. No false phase is promoted; no service import. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {assertTerminalBatch,assertWindow} from './c25-client.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
export const originalFailure=path.join(root,'eduk12_c25_http_01')
export const priorContinuation=path.join(root,'eduk12_c25_continuation_01')
export const missingState=path.join(root,'eduk12_c25_continuation_02')
export const sourceSnapshotSha256='cae493b8a6d6c62a34a9d181822d22cd927fa5c1081666cd8fb049cefa91d1cf'
const sha=value=>createHash('sha256').update(value).digest('hex')
const originalFiles={
 'c25-runtime-result.json':'8f7f0697582519c4032a1726e71fb2bd3879c7f81afea54e36d76d6c07c50eff',
 'c25-upgrade-result.json':'baaa49cbab8351e5da7930667a127746743afb0284695be8e0caf38f8349011f',
 'c25-prepare-result.json':'e2fac92a430680d0e671df6d890a3ef41b1b3cc2bfb57d5301aa4cbbbb4fc001',
 'c25-original-rows-private.json':'0948a2bedad3c87c6dc27f4cd325f59d866c92e659332cdf427800a428d0697c',
}
const continuationFiles={
 'c25-continuation-result.json':'16293c2c79b377c36fe665e260d8f45c43941df89d003e7be993925905a50f08',
 'c25-continuation-final-db-snapshot.json':sourceSnapshotSha256,
 'c25-continuation-audit-final-result.json':'8a1279f2ba7865f484d1bc80b665aaf11a0dcf9c098604154f9531d823698beb',
 'c25-continuation-protected-rows-private.json':'231c52d48d8533d17ebbb9c9563b56c7be7652bdd99a061e20f82ebe8b725f16',
 'c25-continuation-prepare-result.json':'44f13e5c6c1d01b2f180a30f03feb583ae67d4fdb12ab7c463123742b16e1348',
 'c25-scheduled-result.json':'3066b78f77bf32dd022ea2cb801cc4b1ff6f0c2bd32d3c202d7e9e64279352d8',
 'c25-scheduled-http-private.jsonl':'5e7be9f8028213ca4a3c5ab57b961b61634a732acc4448634a45332256ec9390',
 'c25-scheduled-baseline-private.json':'011c7216a03961fa06a2c2b033f34d9fdf1461ebf05b51189de1a4655250a958',
 'c25-scheduled-before-drain-private.json':'a8c0a05b5d062cbc7a5cb45bfc6dd469467eec03abe590d8a62bd731209476d7',
 'c25-scheduled-after-drain-private.json':'afc98cfe8c5ff1e6acb79ed3b465ec07ae0b635caf107643f057be7d854ebcb9',
 'c25-fixture-private.json':'e1015179f1c4494c3448000b9c62fb0d18ab82a382c43a43ebb29d0bc7fc4e28',
}
export function privateBinding(file){
 assert.ok(path.isAbsolute(file));for(let p=file;;p=path.dirname(p)){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);if(p===path.dirname(p))break}
 const before=fs.lstatSync(file);assert.ok(before.isFile());assert.equal(before.nlink,1);assert.equal(before.mode&0o777,0o600)
 const bytes=fs.readFileSync(file),after=fs.lstatSync(file)
 for(const key of ['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'])assert.equal(after[key],before[key],'Evidence changed while read')
 return {path:file,sha256:sha(bytes),bytes:bytes.length}
}
export function validateInheritedFacts({first,second,upgrade,prepare,fixturePrepare,scheduled,baseline,before,after,snapshot,audit}){
 assert.equal(first.passed,false);assert.equal(second.passed,false)
 assert.deepEqual(Object.keys(first.phases).sort(),['prepare','upgrade']);assert.deepEqual(Object.keys(second.phases),['continuation-prepare'])
 assert.deepEqual(second.executedPhases,['continuation-prepare'])
 for(const result of [first,second])for(const key of ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified'])assert.equal(result[key],true)
 for(const result of [upgrade,prepare,fixturePrepare])assert.equal(result.passed,true)
 assert.deepEqual(first.phases.upgrade,upgrade);assert.deepEqual(first.phases.prepare,prepare);assert.deepEqual(second.phases['continuation-prepare'],fixturePrepare)
 assert.equal(second.finalSnapshotSha256,sourceSnapshotSha256);assert.equal(audit.passed,true);assert.equal(audit.snapshotSha256,sourceSnapshotSha256)
 assert.equal(Object.keys(snapshot.columns).length,217);assert.equal(Object.values(snapshot.projection).reduce((n,x)=>n+x.rows,0),6651)
 assert.equal(snapshot.projection.training_attempt_checkpoints.rows,20)
 assert.equal(audit.continuationRetainedFacts.allFailedRowsRetained,true);assert.equal(audit.continuationRetainedFacts.oldRows,6582)
 assert.equal(audit.retainedFacts.allOriginalRowsRetained,true);assert.equal(audit.retainedFacts.oldRows,6529)
 assert.equal(scheduled.passed,false);assert.equal(scheduled.checks.length,1)
 assert.equal(scheduled.schedule.closedFinishedAt,undefined);assert.equal(scheduled.schedule.observedOpenAt,undefined)
 assert.equal(scheduled.windowDiagnostic.failed,true);assert.equal(scheduled.windowDiagnostic.releaseAtNeverAdjusted,true)
 assert.deepEqual(scheduled.windowDiagnostic.schedule,scheduled.schedule)
 assertTerminalBatch({baseline,before,after,expectedTypes:['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL']})
 assert.deepEqual(scheduled.measurements.map(m=>[m.case,m.stage,m.exactOriginalBodies,m.acceptedFactsJobsCheckpointUnchanged]),[
  ['B','CLOSED_TERMINAL_FINAL_REPLAY',true,true],['C','CLOSED_TERMINAL_FINAL_REPLAY',true,true]])
 assert.equal(scheduled.requests.length,143);assert.equal(scheduled.teacherExport.rows,2);assert.equal(scheduled.teacherExport.originalJob,true)
 const closed=scheduled.requests.filter(r=>Date.parse(r.receivedAt)>=Date.parse(scheduled.schedule.closedStartedAt));assert.equal(closed.length,81)
 const observed=scheduled.windowDiagnostic.observedAt;assert.equal(observed,'2026-10-19T10:27:39.104Z')
 assert.ok(Date.parse(observed)>=Math.max(...closed.map(r=>Date.parse(r.receivedAt))))
 // Use the real catch-time PG clock only as an inherited HTTP observation bound.
 // It does not create closedFinishedAt or a successful scheduled/consumer phase.
 assertWindow({...scheduled.schedule,requests:closed})
 assert.ok(Date.parse(observed)-Date.parse(scheduled.schedule.closedStartedAt)<=60000)
 assert.ok(Date.parse(observed)<Date.parse(scheduled.schedule.t0)+240000)
 return {upgrade:'INHERITED',immediateA:'INHERITED',newSjtFixture:'INHERITED',
  closedHttp:{execution:'INHERITED_COMPLETED_SUBCHECKS_ONLY',scheduledRequests:143,closedMatrixRequests:81,
   finalObservedPgTime:observed,closedFinishedAtMissing:true},
  typedFinals:8,exactReplayAndSingleSharedDrain:'INHERITED',teacherCsvRows:2,
  omitted:['original scheduled overall PASS','original closed compiled consumer','original natural release boundary','open FINAL replays']}
}
export function captureInherited(){
 const references={};const values={}
 for(const [folder,files] of [[originalFailure,originalFiles],[priorContinuation,continuationFiles]])for(const [name,expected]of Object.entries(files)){
  const file=path.join(folder,name),binding=privateBinding(file);assert.equal(binding.sha256,expected,'Pinned inherited evidence changed: '+name);references[file]=binding
  if(!name.endsWith('.jsonl')&&!name.includes('protected-rows')&&!name.includes('original-rows'))values[folder===originalFailure?'original:'+name:name]=JSON.parse(fs.readFileSync(file))
 }
 const accepted=validateInheritedFacts({first:values['original:c25-runtime-result.json'],second:values['c25-continuation-result.json'],upgrade:values['original:c25-upgrade-result.json'],prepare:values['original:c25-prepare-result.json'],fixturePrepare:values['c25-continuation-prepare-result.json'],scheduled:values['c25-scheduled-result.json'],baseline:values['c25-scheduled-baseline-private.json'],before:values['c25-scheduled-before-drain-private.json'],after:values['c25-scheduled-after-drain-private.json'],snapshot:values['c25-continuation-final-db-snapshot.json'],audit:values['c25-continuation-audit-final-result.json']})
 for(const [file,binding]of Object.entries(references))assert.deepEqual(privateBinding(file),binding,'Inherited evidence changed during parsing')
 return {schemaVersion:1,scope:'C25_MISSING_ONLY_EXPLICIT_INHERITED_SUBCHECKS_NOT_PRIOR_PHASE_PASS',sourceSnapshotSha256,sourceRows:6651,sourceCheckpoints:20,accepted,references,
  preservedFalseReceipts:[references[path.join(originalFailure,'c25-runtime-result.json')],references[path.join(priorContinuation,'c25-continuation-result.json')]],
  requiredNewPhases:['missing-open','missing-probe','missing-consumers','missing-guards','missing-restore']}
}
export function readMissingPrerequisites(state){
 assert.equal(path.resolve(state),missingState)
 const file=path.join(state,'c25-missing-prerequisites.json');privateBinding(file)
 const value=JSON.parse(fs.readFileSync(file)),actual=captureInherited();assert.deepEqual(value,actual)
 assert.equal(privateBinding(path.join(state,'c25-fixture-private.json')).sha256,continuationFiles['c25-fixture-private.json'])
 assert.equal(privateBinding(path.join(state,'c25-original-rows-private.json')).sha256,originalFiles['c25-original-rows-private.json'])
 return value
}
export function issueMissingPrerequisites(state){
 assert.equal(path.resolve(state),missingState);const value=captureInherited()
 fs.writeFileSync(path.join(state,'c25-missing-prerequisites.json'),JSON.stringify(value,null,2),{flag:'wx',mode:0o600})
 return readMissingPrerequisites(state)
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [action,state,...rest]=process.argv.slice(2);assert.equal(rest.length,0)
 assert.ok(['--issue-prerequisites','--validate-prerequisites'].includes(action))
 const result=action==='--issue-prerequisites'?issueMissingPrerequisites(state):readMissingPrerequisites(state)
 console.log(JSON.stringify({valid:true,scope:result.scope,sourceRows:result.sourceRows,sourceSnapshotSha256:result.sourceSnapshotSha256}))
}
