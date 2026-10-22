import {verifyOfficial} from './survey-workspace-reuse.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {binding,surveyWorkspacePlan} from './survey-workspace-scope.mjs';
import {changedEntries} from './content-scope.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyLocalEvidence(read=file=>readFileSync(file)){
 const file='.github/evidence/survey-workspace/reviewed-local.json',bytes=read(file);
 assert.equal(sha(bytes),binding.evidence[file],'Reviewed evidence bytes changed');
 const record=JSON.parse(bytes);assert.equal(record.kind,'reviewed-local-evidence');
 assert.equal(record.ciExecuted,false);assert.equal(record.originalExecutionSigned,false);
 assert.equal(record.product,binding.product);assert.equal(record.base,binding.base);
 const reports={};for(const[name,r]of Object.entries(record.reports)){
  const b=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:12*1024*1024});
  assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256,name);
  reports[name]=name.endsWith('.json')?JSON.parse(b):b.toString('utf8');
  if(r.counts){for(const[k,v]of Object.entries(r.counts))assert.equal(reports[name][k],v,name+':'+k);}
 }
 assert.match(reports['survey-workspace-ci-controls-initial.log'],/pass 73/);
 assert.match(reports['survey-workspace-ci-controls-initial.log'],/fail 0/);
 assert.ok(record.acceptedCases.length>100);assert.ok(record.acceptedCases.some(x=>x.name.includes('completion')||x.name.includes('complete')));
 for(const c of record.acceptedCases){
  const file=reports[c.report].testResults.find(f=>f.name.endsWith(c.file));assert.ok(file,c.file);
  const test=file.assertionResults.find(a=>a.fullName===c.name);assert.equal(test?.status,'passed',c.name);
 }
 const browser=reports['survey-integrated-dark-review.json'];assert.equal(browser.status,'passed');
 assert.ok(browser.checks.length>=9);for(const c of browser.checks){assert.equal(c.theme,'dark');assert.equal(c.overflow,false);assert.deepEqual(c.low,[]);assert.deepEqual(c.white,[]);}
 assert.equal(reports['survey-dark-tests.json'].numPassedTests,25);
 assert.equal(reports['survey-integrated-workspace-tests.json'].numFailedTests,1,'Original stale-label failure retained');
 assert.equal(reports['survey-integrated-workspace-recheck.json'].numPassedTests,1);
 return {status:'REVIEWED_LOCAL_EVIDENCE',ciExecuted:false,originalExecutionSigned:false,countsAreNotAdditive:true,acceptedUniqueCases:record.acceptedCases.length,originalFailuresRetained:true,limits:record.limits};
}
async function main(){
 assert.equal(process.version,'v24.21.0');const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.deepEqual(surveyWorkspacePlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
 mkdirSync('survey-workspace-evidence',{recursive:true});
 const receipt={...verifyLocalEvidence(),head,components:binding.components};
 await verifyOfficial('admission');
 writeFileSync('survey-workspace-evidence/local-admission.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
