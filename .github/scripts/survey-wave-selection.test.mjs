import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {surveyWaveSelectionScope,requireSurveyWaveSelectionScope,surveyWaveSelectionFiles,surveyWaveSelectionTools} from './content-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const entry=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const changes=[...surveyWaveSelectionFiles,...surveyWaveSelectionTools].map(entry);
test('complete bounded source/control list only; no backend or permission wildcard',()=>{
 assert.equal(surveyWaveSelectionScope(changes),true);
 for(const file of ['server-version/backend/prisma/schema.prisma','server-version/backend/package-lock.json','server-version/backend/src/modules/survey/publication.service.ts','server-version/backend/src/modules/survey/participant-feedback.ts','.github/workflows/ci-browser.yml'])assert.equal(surveyWaveSelectionScope([...changes,entry(file)]),false);
 for(const delta of [{status:'D',newMode:'000000'},{status:'R100'},{newMode:'100755'},{newMode:'120000'}])assert.equal(surveyWaveSelectionScope([{...changes[0],...delta},...changes.slice(1)]),false);
 assert.equal(surveyWaveSelectionScope([]),false);
 assert.equal(surveyWaveSelectionScope([...surveyWaveSelectionTools].map(entry)),false);
});
test('known branch never falls back to platform on drift/full/manual',()=>{
 assert.throws(()=>requireSurveyWaveSelectionScope(true,false,'pull_request','false'));
 assert.throws(()=>requireSurveyWaveSelectionScope(true,true,'workflow_dispatch','false'));
 assert.throws(()=>requireSurveyWaveSelectionScope(true,true,'pull_request','true'));
 assert.doesNotThrow(()=>requireSurveyWaveSelectionScope(true,true,'pull_request','false'));
});
const outputs={scenario:'survey-wave-selection',application_route:'legacy',codeql:'true',runner_profile:'hosted',media_selection:'[]',media_groups:'[]',...Object.fromEntries(['maintenance','content','presentation','frontend','frontend_test','frontend_build','documentation','ui_required','visual_hosted','media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'].map(k=>[k,'false']))};
const needs=()=>({scope:{result:'success',outputs:{...outputs}},...Object.fromEntries(['backend-regression','frontend','docker','codeql'].map(k=>[k,{result:'success'}]))});
test('only selected existing jobs qualify; missing, skipped, draft and forged flags fail closed',()=>{
 assert.deepEqual(requiredChecks(needs(),false),['scope','backend-regression','frontend','docker','codeql']);assert.deepEqual(failedChecks(needs(),false),[]);
 for(const job of requiredChecks(needs(),false))for(const result of ['skipped','cancelled','failure',undefined]){const n=needs();n[job].result=result;assert.ok(failedChecks(n,false).includes(job));}
 assert.ok(failedChecks(needs(),true).includes('scope'));
 for(const flag of ['frontend_build','frontend','perf_smoke','ops']){const n=needs();n.scope.outputs[flag]='true';assert.ok(failedChecks(n,false).includes('scope'));}
});
test('existing jobs run focused checks and browser consumes actual runtime; no duplicate producer',()=>{
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 for(const job of ['backend','backend-browser-build','browser','miniprogram','post-merge-smoke','pr-light-backend','pr-light-frontend']){
  const section=ci.split('\n  '+job+':')[1].split(/\n  [a-z]/)[0];assert.match(section,/scenario != 'survey-wave-selection'/);
 }
 for(const block of ci.split(/\n  (?=probe-)/).slice(1))assert.match(block.split(/\n  [a-z]/)[0],/!\(github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/fix\/survey-wave-content-selection-20261021'\)/);
 assert.match(ci,/CI_SURVEY_SELECTION_REQUIRED:.*fix\/survey-wave-content-selection-20261021/);
 const backend=readFileSync(new URL('../workflows/ci-backend-regression.yml',import.meta.url),'utf8');
 assert.match(backend,/survey-content-options.postgres.integration.test.ts/);assert.match(backend,/assert-release-test-report.mjs/);assert.match(backend,/npx tsc --noEmit --incremental false/);
 const frontend=readFileSync(new URL('../workflows/ci-frontend.yml',import.meta.url),'utf8');assert.match(frontend,/if: inputs.survey_selection != true/);assert.match(frontend,/assert-release-test-report.mjs/);
 const images=readFileSync(new URL('../workflows/ci-images.yml',import.meta.url),'utf8');assert.match(images,/node .github\/scripts\/survey-wave-selection-browser.mjs/);
});
