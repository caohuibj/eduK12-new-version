import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {participantAccessOutputs} from './participant-access-scope.mjs';

export const BRANCHES={'365':'scale-library-structure-20261027','366':'feat/cognitive-onboarding-structure-20261028','369':'perf/four-entry-feedback-baseline-20261028','372':'perf/four-entry-first-feedback-20261028','374':'fix/four-entry-scale-probe-20261028','376':'fix/education-observer-journeys-20261028'};
export const MARKER='.github/scripts/onboarding-bindings.json';
export const CONTROLS=Object.freeze([MARKER,'.github/scripts/pr376-browser.mjs','.github/scripts/pr374-evidence.mjs','.github/scripts/pr374-browser.mjs','.github/scripts/onboarding-evidence.json','.github/scripts/onboarding-scope.mjs','.github/scripts/onboarding-checks.mjs','.github/scripts/onboarding-controls.test.mjs','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml'].sort());
export const binding=JSON.parse(readFileSync(new URL('./onboarding-bindings.json',import.meta.url),'utf8'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sha=value=>assert.match(value??'',/^[a-f0-9]{40}$/);

/** One reviewed backend patch; route name retained for existing consumers. Unknown changes never select a broad fallback. */
export function allowedSourcePath(path,pr){
 if(pr==='376')return ['server-version/backend/src/__tests__/integration/educationObserverHttp.postgres.integration.test.ts','server-version/frontend/src/modules/reporting/report-ui.css'].includes(path)||path.startsWith('docs/performance/education-observer-journeys-20261028/');
 if(pr==='374')return ["server-version/backend/src/__tests__/assessment-run/start-admission.test.ts", "server-version/backend/src/__tests__/education-tools/assessment-resource.standard-marker.postgres.integration.test.ts", "server-version/backend/src/__tests__/measurement-content/education-content-scope.test.ts", "server-version/backend/src/__tests__/measurement-content/survey-participant-feedback.test.ts", "server-version/backend/src/modules/assessment-run/startAdmission.ts", "server-version/backend/src/modules/assessment-run/startExecution.ts", "server-version/backend/src/modules/composite/training-report-selection.ts", "server-version/backend/src/modules/survey/participant-feedback.ts", "server-version/frontend/src/components/FinalCompositeAssessment.tsx", "server-version/frontend/src/components/__tests__/FinalCompositeAssessment.test.tsx", "server-version/frontend/src/modules/reporting/ScaleUnitReportCard.legacy.tsx", "server-version/frontend/src/modules/reporting/report-ui.css", "server-version/frontend/src/survey/SurveyPublicApp.final.test.tsx", "server-version/frontend/src/survey/SurveyPublicApp.tsx"].includes(path)||path.startsWith('docs/performance/four-entry-scale-probe-20261028/');
 if(pr==='372')return ["server-version/backend/src/modules/survey/final.service.ts", "server-version/backend/src/modules/survey/participant-feedback-response.ts", "server-version/backend/src/__tests__/survey/research-request-local-final.contract.test.ts", "server-version/backend/src/__tests__/survey/situational-native-staged.postgres.integration.test.ts", "server-version/frontend/src/components/FinalCompositeAssessment.tsx", "server-version/frontend/src/components/__tests__/FinalCompositeAssessment.test.tsx", "server-version/frontend/src/survey/SurveyPublicApp.tsx", "server-version/frontend/src/survey/SurveyPublicApp.final.test.tsx"].includes(path)||path.startsWith('docs/performance/first-feedback-20261028/');
 if(pr==='369')return ['server-version/backend/src/modules/reporting/education-assessment-personal-report.service.ts','server-version/backend/src/__tests__/reporting/education-assessment-personal-report.service.test.ts'].includes(path)||path.startsWith('docs/performance/shared-report-planning-20261028/');
 if(pr==='366')return path.startsWith('server-version/backend/src/modules/cognitive/')||path.startsWith('server-version/backend/src/__tests__/cognitive/')||['server-version/backend/src/scripts/cognitive-onboarding-check.ts','server-version/backend/src/scripts/install-cognitive-configs.ts'].includes(path)||path.startsWith('docs/cognitive-library/onboarding-structure-20261028/');
 return path.startsWith('server-version/backend/src/modules/scale/')||path.startsWith('server-version/backend/src/__tests__/scale/')||['server-version/backend/prisma/seeds/scales.ts','server-version/backend/scripts/audit-scale-candidate-structure.ts','server-version/backend/scripts/check-scale-source-qualification.ts'].includes(path)||path.startsWith('docs/scale-library-structure-20261027/');
}
export function onboardingPlan(entries,base,head,read=git,env=process.env,b=binding){
 const ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 const number=String(env.CI_PR_NUMBER),branch=BRANCHES[String(b.pr)];
 if(!Object.values(BRANCHES).includes(ref)&&!Object.hasOwn(BRANCHES,number)&&!entries.some(e=>e.file===MARKER))return null;
 assert(branch,'Unsupported onboarding PR');
 assert.equal(b.enabled,true,'Onboarding candidate pending independent activation review');
 assert.equal(base,b.base);sha(base);sha(head);sha(b.product);sha(b.controlCheckpoint);
 assert.equal(env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
 assert(['pull_request','push'].includes(env.CI_EVENT),'Manual/full execution is not this route');
 assert.notEqual(env.CI_FORCE_FULL,'true');assert.notEqual(env.CI_FULL_ACCEPTANCE,'true');
 const postMerge=env.CI_EVENT==='push';let sourceHead=env.CI_SOURCE_HEAD;
 if(postMerge){
  assert.equal(env.GITHUB_REF_NAME,'main');read('fetch','--no-tags','--depth=2','origin',head);
  const parents=read('cat-file','-p',head).split('\n').filter(row=>row.startsWith('parent ')).map(row=>row.slice(7));
  assert.equal(parents.length,2);assert.equal(parents[0],base);sourceHead=parents[1];
 }else{
  assert.equal(ref,branch);assert.equal(number,String(b.pr));
  assert.equal(env.CI_PR_REPOSITORY,'caohuibj/eduK12-new-version');
 }
 const object=(commit,suffix)=>{
  sha(commit);
  try{return read('rev-parse',commit+suffix);}catch{
   // Scope checkout is shallow. Fetch only the immutable object requested;
   // never substitute the moving branch or weaken source/merge equality.
   read('fetch','--no-tags','--depth=1','origin',commit);
   return read('rev-parse',commit+suffix);
  }
 };
 sha(sourceHead);assert.equal(object(sourceHead,'^{tree}'),read('rev-parse',head+'^{tree}'),'Source/merge tree drift');
 assert.deepEqual(Object.keys(b.controlBefore).sort(),CONTROLS);
 const changedControls=CONTROLS.filter(path=>read('ls-tree',base,'--',path)!==read('ls-tree',head,'--',path));
 const expected=[...Object.keys(b.source),...changedControls];assert.equal(new Set(expected).size,expected.length);
 assert.deepEqual(entries.map(e=>e.file).sort(),expected.sort(),'Complete change inventory drift');
 for(const e of entries){
  assert.equal(e.newMode,'100644');const source=b.source[e.file],before=source?.before??b.controlBefore[e.file];
  assert.equal(e.status,before?'M':'A');assert.equal(e.oldMode,before?'100644':'000000');
  if(before)assert.equal(read('rev-parse',base+':'+e.file),before);
  if(source){assert(allowedSourcePath(e.file,String(b.pr)),'Source outside onboarding scope');sha(source.after);assert.equal(read('rev-parse',head+':'+e.file),source.after);}
  else if(e.file!==MARKER){
   let checkpoint;try{checkpoint=read('ls-tree',b.controlCheckpoint,'--',e.file);}catch{read('fetch','--no-tags','--depth=1','origin',b.controlCheckpoint);checkpoint=read('ls-tree',b.controlCheckpoint,'--',e.file);}
   assert(checkpoint.startsWith('100644 blob '));assert.equal(read('ls-tree',head,'--',e.file),checkpoint,'Control checkpoint drift');
  }
 }
 for(const path of CONTROLS.filter(path=>path!==MARKER&&!changedControls.includes(path)))assert.equal(read('ls-tree',head,'--',path),read('ls-tree',b.controlCheckpoint,'--',path));
 assert.deepEqual(Object.keys(b.components).sort(),['backend','frontend']);
 if(![372,374,376].includes(b.pr))assert.equal(read('rev-parse',head+':server-version/frontend'),read('rev-parse',base+':server-version/frontend'),'No frontend change in backend onboarding route');
 for(const [component,tree]of Object.entries(b.components)){
  sha(tree);assert.equal(read('rev-parse',head+':server-version/'+component),tree);
  assert.equal(object(b.product,':server-version/'+component),tree);
 }
 return {schema:1,route:'onboarding-structure',base,head,sourceHead,tree:read('rev-parse',head+'^{tree}'),product:b.product,components:b.components,controlCheckpoint:b.controlCheckpoint,pr:b.pr,postMerge,draft:!postMerge&&env.CI_IS_DRAFT==='true'};
}
export function onboardingOutputs(plan){const o=participantAccessOutputs(plan);delete o.participant_access_plan;return {...o,application_route:'onboarding-structure',scenario:'onboarding-structure',onboarding_plan:JSON.stringify(plan)};}
