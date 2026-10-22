import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {binding,studentPlan} from './training-student-scope.mjs';
import {changedEntries} from './content-scope.mjs';
export function verifyLocalEvidence(read=file=>readFileSync(file)){
 const reports={};
 for(const[file,sha]of Object.entries(binding.evidence)){
  const bytes=read(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),sha,'Local evidence changed: '+file);
  if(file.endsWith('.json')){
   reports[file]=JSON.parse(bytes);
   if(file.endsWith('-01.json')||file.endsWith('-remaining.json')||file.endsWith('-availability.json')||file.endsWith('-postgres.json')){
    const original=reports[file];assert.equal(createHash('sha256').update(original.originalText).digest('hex'),original.originalSha256,'Original console bytes drift');
   }
  }
 }
 const r=reports['.github/evidence/training-student/reviewed-local.json'];
 assert.equal(r.kind,'reviewed-local-evidence');assert.equal(r.originalExecutionSigned,false);assert.equal(r.ciExecuted,false);assert.equal(r.reviewedProduct,binding.product);
 const d=name=>{const x=r.reports[name];assert.match(x.originalReportSha256,/^[a-f0-9]{64}$/);return x.reviewed;};
 const fixes=d('training-fixes-validation.json');assert.equal(fixes.passed.frontendDistinctAssertions,22);assert.equal(fixes.passed.backendAvailabilityAssertions,11);assert.equal(fixes.passed.realPostgresScenarios,4);assert.equal(fixes.passed.actualChromePlayback.result,'PASS');
 const fixed=d('composition-report-boundary-validation.json');assert.equal(fixed.checks.backendCompositeTests,58);assert.equal(fixed.checks.frontendTargetedTests,19);assert.equal(fixed.checks.browserAndApi.result,'PASS');assert.deepEqual(fixed.checks.browserAndApi.cleanup,{created:2,deleted:2});
 const editor=d('questionnaire-editor-validation.json');assert.equal(editor.checks.targetedTests.passed,27);assert.equal(editor.checks.browser.result,'PASS');
 const home=d('student-home-conditional-validation.json');assert.equal(home.status,'passed');assert.equal(home.unitTests.passed,14);assert.deepEqual(home.pageErrors,[]);
 assert.ok(home.checks.some(x=>x.name==='desktop-empty'&&x.guideInsideHero&&x.courses===null));assert.ok(home.checks.some(x=>x.name==='desktop-courses'&&x.hero===null&&x.guide===null));
 const nav=d('student-navigation-validation.json');assert.equal(nav.status,'passed');assert.equal(nav.shellTests.passed,54);
 const picker=d('tool-picker-layout-validation.json');assert.equal(picker.result||picker.status,'PASS');assert.ok(picker.checks.length>=8);
 const form=d('form-editor-browser-validation.json');assert.equal(form.result,'PASS');assert.equal(form.checks.userFormUnchanged,true);
 // Counts can overlap earlier runs; never sum them into a fabricated distinct total.
 return {status:'REVIEWED_LOCAL_EVIDENCE',originalExecutionSigned:false,ciExecuted:false,countsAreNotAdditive:true,backendCompositeCases:58,archivedRealPostgresScenarios:4,videoAndAvailabilityFrontendCases:22,questionnaireEditorCases:27,latestHomeCases:14,latestShellCases:54,limitations:r.limits};
}
function main(){
 assert.equal(process.version,'v24.21.0');
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.deepEqual(studentPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
 mkdirSync('training-student-evidence',{recursive:true});
 const receipt={...verifyLocalEvidence(),head,components:binding.components};
 writeFileSync('training-student-evidence/local-admission.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
