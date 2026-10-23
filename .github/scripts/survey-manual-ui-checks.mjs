import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {binding,surveyManualUIPlan} from './survey-manual-ui-scope.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function verifyReviewedEvidence(read=readFileSync){
 const bytes=read('.github/evidence/survey-manual-ui/reviewed-local.json');
 assert.equal(sha(bytes),binding.evidenceSHA256,'Evidence bytes changed');
 const record=JSON.parse(bytes);assert.equal(record.kind,'reviewed-local-evidence');assert.equal(record.product,binding.product);assert.equal(record.base,binding.base);
 assert.equal(record.ciExecuted,false);assert.equal(record.originalExecutionSigned,false);
 const reports={};
 for(const[name,r]of Object.entries(record.reports)){
  const raw=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:12*1024*1024});assert.equal(raw.length,r.bytes);assert.equal(sha(raw),r.sha256,name);
  reports[name]=name.endsWith('.json')?JSON.parse(raw):raw.toString('utf8');
  if(r.originalCounts)for(const[k,v]of Object.entries(r.originalCounts))assert.equal(reports[name][k],v,name+':'+k);
 }
 const seen=new Set();
 for(const c of record.acceptedCases){
  const id=c.file+'\n'+c.name;assert.ok(!seen.has(id),'Duplicate assertion');seen.add(id);
  const suite=reports[c.report]?.testResults.find(s=>s.name.endsWith(c.file));assert.ok(suite,c.file);
  assert.equal(suite.assertionResults.find(t=>t.fullName===c.name)?.status,'passed',id);
 }
 assert.equal(record.acceptedCases.length,binding.acceptedCases);assert.ok(seen.size>=80);
 assert.equal(reports['unit-current.json'].numPassedTests,25);assert.equal(reports['unit-current.json'].numFailedTests,0);
 assert.equal(reports['navigation.json'].numPassedTests,2);assert.equal(reports['navigation.json'].numPendingTests,66);
 assert.equal(reports['initial-unit-failure.json'].numFailedTests,1);
 assert.equal(reports['unit-cleanup-retry.json'].numPassedTests,1);assert.equal(reports['unit-cleanup-retry.json'].numFailedTests,0);
 const rows=reports['browser.json'].results;assert.equal(rows.length,6);
 assert.deepEqual(rows.map(r=>[r.width,r.mode].join(':')).sort(),[1920,1280,390].flatMap(w=>['light','dark'].map(m=>w+':'+m)).sort());
 for(const r of rows){assert.equal(r.status,'passed');assert.equal(r.inviteWrites,2);assert.ok(r.tooltipBounds&&r.verificationBounds);assert.ok(r.requests.every(q=>q.method==='GET'||['/api/admin/security/step-up/options','/api/admin/security/totp/step-up/verify','/api/platform/survey/researcher-invitations'].includes(q.path)));}
 assert.ok(reports['browser-before-tooltip-fix.json'].results.some(r=>r.status==='failed'));
 assert.ok(reports['browser-before-pointer-fix.json'].results.some(r=>r.status==='failed'));
 const types=reports['types.json'];assert.equal(types.head,'be73b6c680021a695092e443789dc1f9abf28320');assert.equal(types.checks.find(c=>c.name==='app-types')?.exitCode,0);
 const build=reports['build.json'];assert.equal(build.head,binding.product);assert.equal(build.exitCode,0);assert.equal(build.status,'passed');assert.match(reports['build.log'],/built in /);
 for(const[file,digest]of Object.entries(record.controlSHA256))assert.equal(sha(read(file)),digest,'Control drift: '+file);
 assert.deepEqual(Object.keys(record.controlSHA256).sort(),binding.controls.filter(f=>f!=='.github/scripts/survey-manual-ui-bindings.json'&&!f.startsWith('.github/evidence/')).sort());
 return {kind:record.kind,ciExecuted:false,originalExecutionSigned:false,acceptedUniqueCases:seen.size,browserScenarios:6,typesAccepted:true,buildAccepted:true,originalFailuresRetained:true,closureReview:record.closureReview,limits:record.limits};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const {changedEntries}=await import('./content-scope.mjs');
 const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(),head=git('rev-parse','HEAD');
 assert.deepEqual(surveyManualUIPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
 assert.deepEqual(git('diff','--name-only','be73b6c680021a695092e443789dc1f9abf28320',binding.product).split('\n'),['server-version/frontend/src/pages/admin/survey-admin.css'],'Type consumer inputs changed after local types');
 mkdirSync('survey-manual-ui-evidence',{recursive:true});const result={...verifyReviewedEvidence(),head,components:binding.components};
 writeFileSync('survey-manual-ui-evidence/local-admission.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
