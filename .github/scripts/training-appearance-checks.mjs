import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {binding,trainingAppearancePlan} from './training-appearance-scope.mjs';
import {changedEntries} from './content-scope.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyLocalEvidence(read=file=>readFileSync(file)){
 const file='.github/evidence/training-appearance/reviewed-local.json',bytes=read(file);
 assert.equal(sha(bytes),binding.evidence[file],'Reviewed evidence bytes changed');
 const record=JSON.parse(bytes);assert.equal(record.kind,'reviewed-local-evidence');
 assert.equal(record.ciExecuted,false);assert.equal(record.originalExecutionSigned,false);
 assert.equal(record.product,binding.product);assert.equal(record.base,binding.base);
 const reports={};for(const[name,r]of Object.entries(record.reports)){
  const b=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:8*1024*1024});
  assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256,name);
  reports[name]=name.endsWith('.json')?JSON.parse(b):b.toString('utf8');
 }
 assert.match(reports['appearance-default-auto-tests.log'],/Tests\s+13 passed \(13\)/);
 assert.match(reports['appearance-shell-final.log'],/Tests\s+67 passed \(67\)/);
 assert.match(reports['appearance-tests-final.log'],/Tests\s+11 passed \(11\)/);
 assert.match(reports['appearance-tests-current.log'],/Tests\s+1 failed \| 77 passed \(78\)/);
 assert.equal(reports['appearance-default-auto-lint.log'].trim(),'');
 assert.match(reports['appearance-lint-final.log'],/0 errors, 2 warnings/);
 const initial=reports['appearance-browser-initial.json'];assert.deepEqual(initial.pageErrors,[]);
 for(const key of ['persisted','cognitiveBoundary','moonImage'])assert.equal(initial.checks[key],true);
 for(const name of ['appearance-editor-verification.json','appearance-composition-final.json']){
  const r=reports[name];assert.deepEqual(r.pageErrors,[]);assert.ok(r.checks.editorSurfaces.length);
  for(const surface of r.checks.editorSurfaces)assert.deepEqual(surface.bright,[]);
 }
 for(const name of ['dashboard-dark-verification.json','dashboard-hover-final-verification.json']){
  const r=reports[name];assert.equal(r.status,'passed');assert.deepEqual(r.pageErrors,[]);
  assert.ok(r.checks.length);for(const c of r.checks){assert.equal(c.overflow,false);assert.ok(c.colors.length);for(const text of c.colors)assert.ok(text.contrast>=4.5);}
 }
 assert.deepEqual(reports['appearance-extended-partial.json'].checks,{autoClock:true,lightPrint:true,crossTab:true});
 // These are failed historical runs, never treated as current successes.
 for(const name of ['dashboard-dark-initial-failure.json','dashboard-dark-copy-hover-failure.json']){
  const r=reports[name];assert.notEqual(r.status,'passed');assert.ok(r.checks.some(c=>c.colors.some(t=>t.contrast<4.5)));
 }
 return {status:'REVIEWED_LOCAL_EVIDENCE',originalExecutionSigned:false,ciExecuted:false,countsAreNotAdditive:true,
  currentAppearanceCases:13,historicalShellCases:67,supersededAppearanceCases:11,
  historicalLocatorFailureRetained:true,historicalContrastFailuresRetained:2,
  freshCIRequired:['scope and aggregate contracts','integrated frontend app types','one frontend compilation','changed JavaScript/TypeScript SAST'],limits:record.limits};
}
function main(){
 assert.equal(process.version,'v24.21.0');const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.deepEqual(trainingAppearancePlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
 mkdirSync('training-appearance-evidence',{recursive:true});
 const receipt={...verifyLocalEvidence(),head,components:binding.components};
 writeFileSync('training-appearance-evidence/local-admission.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
