import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {binding,trainingManualUIPlan} from './training-manual-ui-scope.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
export function verifyReviewedEvidence(read=readFileSync){
 const bytes=read('.github/evidence/training-manual-ui/reviewed-local.json');assert.equal(sha(bytes),binding.evidenceSHA256,'Evidence bytes changed');
 const r=JSON.parse(bytes);assert.equal(r.kind,'reviewed-local-evidence');assert.equal(r.product,binding.product);assert.equal(r.base,binding.base);assert.equal(r.ciExecuted,false);assert.equal(r.originalExecutionSigned,false);
 const reports={};for(const[name,v]of Object.entries(r.reports)){const raw=gunzipSync(Buffer.from(v.gzipBase64,'base64'),{maxOutputLength:8*1024*1024});assert.equal(raw.length,v.bytes);assert.equal(sha(raw),v.sha256);reports[name]=JSON.parse(raw);}
 assert.equal(reports['targeted-tests.json'].numPassedTests,78);assert.equal(reports['targeted-tests.json'].numFailedTests,0);assert.equal(reports['targeted-tests-execution.json'].exitCode,0);
 const seen=new Set();for(const c of r.acceptedCases){const id=c.file+'\n'+c.name;assert.ok(!seen.has(id));seen.add(id);const suite=reports[c.report].testResults.find(s=>s.name.endsWith(c.file));assert.equal(suite?.assertionResults.find(t=>t.fullName===c.name)?.status,'passed');}
 assert.equal(seen.size,11);assert.equal(binding.acceptedCases,11);
 for(const[file,digest]of Object.entries(r.controlSHA256))assert.equal(sha(read(file)),digest,'Control drift: '+file);
 assert.deepEqual(Object.keys(r.controlSHA256).sort(),binding.controls.filter(f=>f!=='.github/scripts/training-manual-ui-bindings.json'&&!f.startsWith('.github/evidence/')).sort());
 return {kind:r.kind,ciExecuted:false,originalExecutionSigned:false,acceptedUniqueCases:seen.size,originalInvocationCases:78,invalidatedShellCases:67,originalFailuresRetained:true,limits:r.limits};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const {changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');
 assert.deepEqual(trainingManualUIPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
 for(const[file,object]of Object.entries(binding.reuseClosure)){assert.equal(git('rev-parse',binding.evidenceSource+':'+file),object);assert.equal(git('rev-parse',head+':'+file),object,'Reused case input changed: '+file);}
 mkdirSync('training-manual-ui-evidence',{recursive:true});writeFileSync('training-manual-ui-evidence/local-admission.json',JSON.stringify({...verifyReviewedEvidence(),head,components:binding.components},null,2)+'\n');
}
