import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {binding,sharedAuthoringPlan} from './shared-authoring-scope.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function verifyReviewedEvidence(read=readFileSync){
 const bytes=read('.github/evidence/shared-authoring/reviewed-local.json');
 assert.equal(sha(bytes),binding.evidenceSHA256,'Reviewed evidence bytes changed');
 const record=JSON.parse(bytes);assert.equal(record.kind,'reviewed-local-evidence');assert.equal(record.product,binding.evidenceProduct);assert.equal(record.base,binding.base);
 assert.equal(record.ciExecuted,false);assert.equal(record.originalExecutionSigned,false);
 const reports={};
 for(const[name,r]of Object.entries(record.reports)){
  const raw=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:12*1024*1024});assert.equal(raw.length,r.bytes);assert.equal(sha(raw),r.sha256,name);
  reports[name]=name.endsWith('.json')?JSON.parse(raw):raw.toString('utf8');
  if(r.originalCounts)for(const[k,v]of Object.entries(r.originalCounts))assert.equal(reports[name][k],v,name+':'+k);
 }
 assert.ok(record.acceptedCases.length>=200);const seen=new Set();
 for(const c of record.acceptedCases){
  const id=c.file+'\n'+c.name;assert.ok(!seen.has(id),'Duplicate case');seen.add(id);
  const suite=reports[c.report]?.testResults.find(s=>s.name.endsWith(c.file));assert.ok(suite,c.file);
  assert.equal(suite.assertionResults.find(t=>t.fullName===c.name)?.status,'passed',id);
 }
 for(const name of ['shared-material-first-tests.json','shared-authoring-postgres.json','shared-material-route-admission.json','shared-report-material-disclosure.json'])assert.ok(reports[name].numFailedTests>0,'Preserve initial failure: '+name);
 for(const name of ['shared-flow-controls-final.json','shared-material-participant-consumers.json','shared-report-material-disclosure-native-blob.json','shared-material-backend-tests.json'])assert.equal(reports[name].numFailedTests,0,name);
 for(const[name,count]of [['shared-authoring-browser/results.json',16],['shared-authoring-flow-browser/results.json',8]]){
  const rows=reports[name].results;assert.equal(rows.length,count);assert.ok(rows.every(r=>r.status==='passed'));assert.equal(new Set(rows.map(r=>[r.product,r.width,r.theme,r.mode??'flow'].join(':'))).size,count);
  assert.ok(rows.some(r=>r.product==='training'&&r.width===390&&r.theme==='dark'));
 }
 const state=reports['shared-authoring-current-state.json'];assert.equal(state.head,binding.evidenceProduct);assert.equal(state.checks.appTypesExit,0);assert.equal(state.checks.backendTypesExit,0);assert.equal(state.checks.changedComponentsLintExit,0);
 // Empty type logs cannot independently establish success; this is the explicitly
 // reviewed local execution receipt, not a fabricated CI or signed execution.
 for(const name of ['shared-authoring-final-app-types-after-adapters.log','shared-authoring-final-backend-types.log','shared-authoring-final-lint.log'])assert.equal(reports[name],'');
 const controls=record.controlReview;assert.ok(controls);assert.equal(controls.routingAssertions,83);
 assert.match(reports['shared-authoring-routing-regression.log'],/pass 83/);assert.match(reports['shared-authoring-routing-regression.log'],/fail 0/);
 assert.equal(controls.acceptedCases.length,10);assert.equal(new Set(controls.acceptedCases.map(c=>c.name)).size,10);
 for(const c of controls.acceptedCases)assert.ok(reports[c.report].includes('\u2714 '+c.name),'Control assertion not actually passed: '+c.name);
 if(controls.reuseReview){
  assert.equal(controls.reuseReview.cases.length,9);
  for(const name of controls.reuseReview.cases)assert.ok(reports[controls.reuseReview.report].includes('\u2714 '+name),'Reuse rejection assertion missing: '+name);
 }
 const expectedControls=binding.controls.filter(file=>!['.github/scripts/shared-authoring-bindings.json','.github/evidence/shared-authoring/reviewed-local.json'].includes(file));
 assert.deepEqual(Object.keys(controls.sourceSHA256).sort(),expectedControls.sort());
 for(const[file,digest]of Object.entries(controls.sourceSHA256))assert.equal(sha(read(file)),digest,'Control input drift: '+file);
 return {kind:record.kind,ciExecuted:false,originalExecutionSigned:false,acceptedUniqueCases:seen.size,acceptedControlCases:10,routingControlAssertions:83,originalFailuresRetained:true,sourceClosureReview:record.closureReview,limits:record.limits};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const {changedEntries}=await import('./content-scope.mjs');
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.deepEqual(sharedAuthoringPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
 mkdirSync('shared-authoring-evidence',{recursive:true});const result={...verifyReviewedEvidence(),head,components:binding.components};
 writeFileSync('shared-authoring-evidence/local-admission.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
