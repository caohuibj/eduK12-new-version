import {sharedAuthoringPlan,sharedAuthoringOutputs} from './shared-authoring-scope.mjs';
import {schoolTeacherPlan,schoolTeacherOutputs} from './school-teacher-scope.mjs';
import {surveyWorkspacePlan,surveyWorkspaceOutputs} from './survey-workspace-scope.mjs';
import {trainingAppearancePlan,trainingAppearanceOutputs} from './training-appearance-scope.mjs';
import {surveyCloudPlan,surveyCloudOutputs} from './survey-cloud-scope.mjs';
import {authenticatorPlan,authenticatorOutputs} from './admin-authenticator-scope.mjs';
import {surveyExperiencePlan} from './survey-experience-scope.mjs';
import {scaleLibraryGovernancePlan} from './scale-library-governance-scope.mjs';
import {compositeCsvMemoryPlan} from './composite-csv-memory-scope.mjs';
import {trainingWorkspacePlan} from './training-workspace-scope.mjs';
import {validExactPlan,exactCandidatePlan,exactCandidateOutputs} from './exact-candidate-scope.mjs';
import {trainingFunctionalPlan,validTrainingFunctionalPlan,TRAINING_FUNCTIONAL_BASE,TRAINING_FOLLOWUP_BASE,TRAINING_FOLLOWUP_MODE} from './training-functional.mjs';
import {adminFunctionalPlan,validAdminFunctionalPlan,ADMIN_FUNCTIONAL_BASE} from './admin-permissions-functional.mjs';
import {validSurveyMacPlan,recheckSurveyMac} from './survey-mac-ui-scope.mjs';
import {validReviewedCandidatePlan} from './reviewed-candidate-scope.mjs';
import { pathToFileURL } from 'node:url';
import { openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { mediaPlan } from './ci-media-plan.mjs';

export const MAX_NEEDS_BYTES = 4 * 1024 * 1024;
export function readNeeds(env = process.env) {
  let serialized;
  if (Object.hasOwn(env, 'NEEDS_JSON_FILE')) {
    if (!env.NEEDS_JSON_FILE) throw new Error('Missing merge-gate input file path');
    const fd = openSync(env.NEEDS_JSON_FILE, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size < 2 || stat.size > MAX_NEEDS_BYTES) throw new Error('Invalid merge-gate input file size/type');
      const buffer = Buffer.alloc(stat.size + 1);
      const bytes = readSync(fd, buffer, 0, buffer.length, 0);
      if (bytes !== stat.size) throw new Error('Merge-gate input file changed while reading');
      serialized = buffer.subarray(0, bytes).toString('utf8');
    } finally { closeSync(fd); }
  } else serialized = env.NEEDS_JSON;
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_NEEDS_BYTES) throw new Error('Missing or oversized merge-gate inputs');
  const needs = JSON.parse(serialized);
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) throw new Error('Merge-gate inputs must be an object');
  return needs;
}

const acceptanceJobs = {
  media2: 'accept-media', media7: 'accept-media',
  situational_video: 'accept-media', situational_branching: 'accept-media',
  video_core: 'accept-media', app_shell: 'accept-ui',
  canonical_visual: 'accept-ui', perf_smoke: 'accept-perf', ops: 'accept-ops',
};

export function requiredChecks(needs, draft) {
  const scope = needs.scope?.outputs ?? {};
  if(scope.application_route==='shared-authoring')return ['scope','shared-authoring','codeql'];
  if(scope.application_route==='school-teacher')return ['scope','school-teacher','codeql'];
  if(scope.application_route==='survey-workspace')return ['scope','survey-workspace','codeql'];
  if(scope.application_route==='training-appearance')return ['scope','training-appearance','codeql'];
  if(scope.application_route==='survey-cloud')return ['scope','survey-cloud','codeql'];
  if(scope.application_route==='admin-authenticator')return ['scope','admin-authenticator','codeql'];
  if(scope.application_route==='survey-experience')return ['scope','survey-experience','codeql'];
  if(scope.application_route==='scale-library-governance')return ['scope','scale-library-governance','codeql'];
  if(scope.application_route==='composite-csv-memory')return ['scope','composite-csv-memory','codeql'];
  if(scope.application_route === 'training-workspace') return ['scope','training-workspace','codeql'];
  if(scope.scenario === 'survey-wave-selection') return ['scope','backend-regression','frontend','docker','codeql'];
  if(scope.scenario === 'frontend-performance') return ['scope','frontend','frontend-build','docker','codeql'];
  if(scope.application_route==='exact-candidate') return ['scope','exact-candidate','codeql'];
  if (scope.application_route === 'survey-mac-ui') return ['scope','survey-mac-ui','codeql'];
  if (scope.application_route === 'reviewed-candidate') return ['scope','reviewed-candidate','codeql'];
  if (scope.application_route === 'survey-candidate') return ['scope','survey-candidate','codeql'];
  if (scope.application_route === 'assessment-capacity') return ['scope',...(!draft?['assessment-capacity','codeql']:[])];
  if (scope.application_route === 'teacher-survey') return ['scope',...(!draft?['teacher-survey','codeql']:[])];
  if (scope.application_route === 'access-efficiency') return ['scope',...(!draft?['access-efficiency','codeql']:[])];
  if (scope.application_route === 'backend-security-efficiency') return ['scope',...(!draft?['backend-security-efficiency','codeql']:[])];
  if (scope.application_route === 'shared-asset-storage') return ['scope',...(!draft?['shared-asset-storage','codeql']:[])];
  if (scope.application_route === 'teacher-home') return ['scope','teacher-home','codeql'];
  if (scope.application_route === 'survey-home') return ['scope','survey-home','codeql'];
  if (scope.application_route === 'homepage-copy') {
    let p; try { p=JSON.parse(scope.homepage_copy_plan); } catch {}
    return ['scope',...(!draft ? ['homepage-copy',...(p?.toolsChanged ? ['codeql'] : [])] : [])];
  }
  if (scope.application_route === 'campus') return ['scope','campus','codeql'];
  if (['A','B'].includes(scope.application_route)) {
    let p; try { p = JSON.parse(scope.release_plan || '{}'); } catch { p = {}; }
    return ['scope','scoped-release', ...(p.required?.includes('sast') ? ['codeql'] : [])];
  }
  if (scope.scenario === 'release-tooling') return ['scope','release-tools',...(!draft?['codeql']:[])];
  const dependencies = scope.scenario === 'dependencies';
  let checks = ['scope'];
  if (dependencies) checks.push('maintenance','backend','backend-regression','frontend-build','frontend','docker');
  if (scope.scenario === 'frontend-test') checks.push('frontend');
  if (scope.maintenance === 'true') checks.push('maintenance');
  else if (scope.documentation === 'true') checks.push('documentation');
  else if (scope.content === 'true') checks.push('content');
  if (dependencies) { /* Whole affected units and production images; no unrelated browser/media. */ }
  else if (scope.maintenance === 'true') { /* Dedicated host-only checks. */ }
  else if (scope.documentation === 'true') { /* No runtime lane for ordinary docs. */ }
  else if (scope.presentation === 'true') checks.push('visual');
  else if (scope.frontend === 'true') {
    if (draft) checks.push('pr-light-frontend');
    if (!draft) checks.push('backend-browser-build', 'frontend', 'browser', 'docker');
  } else if (scope.content !== 'true' && scope.scenario !== 'frontend-test') {
    checks.push('maintenance','miniprogram');
    if (draft) checks.push('pr-light-frontend');
    checks.push(...(draft ? ['pr-light-backend']
      : ['backend', 'backend-regression', 'frontend', 'browser', 'docker']));
  }
  if (!draft && scope.frontend_build === 'true') checks.push('frontend-build');
  if (!draft && scope.canonical_visual === 'true' && scope.visual_hosted === 'true') checks.push('accept-visual');
  if ((!draft || dependencies) && scope.codeql === 'true') checks.push('codeql');
  if (!draft) for (const [output, job] of Object.entries(acceptanceJobs))
    if (scope[output] === 'true') checks.push(job);
  return [...new Set(checks)];
}

export function failedChecks(needs, draft) {
  const scope = needs.scope?.outputs ?? {};
  const failed = requiredChecks(needs, draft).filter(name => needs[name]?.result !== 'success');
  if(scope.application_route==='shared-authoring'){
    try{const p=JSON.parse(scope.shared_authoring_plan);if(draft||p.postMerge!==false||Object.entries(sharedAuthoringOutputs(p)).some(([k,v])=>scope[k]!==String(v)))failed.push('scope');}catch{failed.push('scope');}
    return [...new Set(failed)];
  }
  if(scope.application_route==='school-teacher'){
    try{const p=JSON.parse(scope.school_teacher_plan);if(draft||Object.entries(schoolTeacherOutputs(p)).some(([k,v])=>scope[k]!==String(v)))failed.push('scope');}catch{failed.push('scope');}
    return [...new Set(failed)];
  }
  if(scope.application_route==='survey-workspace'){
    try{const p=JSON.parse(scope.survey_workspace_plan);if(draft||Object.entries(surveyWorkspaceOutputs(p)).some(([k,v])=>scope[k]!==String(v)))failed.push('scope');}catch{failed.push('scope');}
    return [...new Set(failed)];
  }
  if(scope.application_route==='training-appearance'){
    try{const p=JSON.parse(scope.training_appearance_plan);if(draft||Object.entries(trainingAppearanceOutputs(p)).some(([k,v])=>scope[k]!==String(v)))failed.push('scope');}catch{failed.push('scope');}
    return [...new Set(failed)];
  }
  if(scope.application_route==='survey-cloud'){
    try{const p=JSON.parse(scope.survey_cloud_plan);if(draft||Object.entries(surveyCloudOutputs(p)).some(([k,v])=>scope[k]!==String(v)))failed.push('scope');}catch{failed.push('scope');}
    return [...new Set(failed)];
  }
  if(scope.application_route==='admin-authenticator'){
    try{const p=JSON.parse(scope.admin_authenticator_plan);if(draft||p.postMerge!==false||Object.entries(authenticatorOutputs(p)).some(([k,v])=>scope[k]!==String(v)))failed.push('scope');}catch{failed.push('scope');}
    return [...new Set(failed)];
  }
  if(scope.application_route==='scale-library-governance'){
    if(draft||scope.scenario!=='scale-library-governance'||scope.codeql!=='true'||scope.runner_profile!=='hosted'||scope.media_selection!=='[]'||scope.media_groups!=='[]'||['frontend_build','ui_required','maintenance','content','presentation','frontend','frontend_test','documentation','visual_hosted',...Object.keys(acceptanceJobs)].some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if(scope.application_route==='survey-experience'){
    if(draft||scope.scenario!=='survey-experience'||scope.codeql!=='true'||scope.runner_profile!=='hosted'||scope.media_selection!=='[]'||scope.media_groups!=='[]'||['frontend_build','ui_required','maintenance','content','presentation','frontend','frontend_test','documentation','visual_hosted',...Object.keys(acceptanceJobs)].some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if(scope.application_route==='composite-csv-memory'){
    if(draft||scope.scenario!=='composite-csv-memory'||scope.codeql!=='true'||scope.runner_profile!=='hosted'||scope.media_selection!=='[]'||scope.media_groups!=='[]'||['frontend_build','ui_required','maintenance','content','presentation','frontend','frontend_test','documentation','visual_hosted',...Object.keys(acceptanceJobs)].some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if(scope.application_route==='training-workspace'){
    if(draft||scope.scenario!=='training-workspace'||scope.codeql!=='true'||scope.runner_profile!=='hosted'||scope.media_selection!=='[]'||scope.media_groups!=='[]'||['frontend_build','ui_required','maintenance','content','presentation','frontend','frontend_test','documentation','visual_hosted',...Object.keys(acceptanceJobs)].some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.scenario === 'survey-wave-selection') {
    if (draft || scope.application_route !== 'legacy' || scope.codeql !== 'true'
      || scope.runner_profile !== 'hosted' || scope.media_selection !== '[]' || scope.media_groups !== '[]'
      || ['maintenance','content','presentation','frontend','frontend_test','frontend_build','documentation','ui_required','visual_hosted',...Object.keys(acceptanceJobs)].some(k => scope[k] !== 'false')) failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.scenario === 'frontend-performance') {
    if (draft || scope.application_route !== 'legacy' || scope.frontend !== 'true'
      || scope.frontend_build !== 'true' || scope.codeql !== 'true'
      || scope.runner_profile !== 'hosted' || scope.media_selection !== '[]' || scope.media_groups !== '[]'
      || ['maintenance','content','presentation','frontend_test','documentation','ui_required','visual_hosted',...Object.keys(acceptanceJobs)].some(k => scope[k] !== 'false')) failed.push('scope');
    return [...new Set(failed)];
  }
  if(scope.application_route==='exact-candidate') {
    let p;try {p=JSON.parse(scope.exact_candidate_plan);}catch{}
    if(draft||!validExactPlan(p)||p.postMerge!==false) failed.push('scope');
    else {
      const expected=exactCandidateOutputs(p);
      if(Object.entries(expected).some(([k,v])=>scope[k]!==String(v))) failed.push('scope');
    }
    return [...new Set(failed)];
  }
  const trainingFunctional = scope.training_functional_only === 'true';
  const adminFunctional = scope.admin_permissions_functional_only === 'true';
  let trainingPlan; try { trainingPlan = JSON.parse(scope.training_functional_plan || 'null'); } catch { failed.push('scope'); }
  let adminPlan; try { adminPlan = JSON.parse(scope.admin_permissions_functional_plan || 'null'); } catch { failed.push('scope'); }
  if (trainingFunctional && adminFunctional) failed.push('scope');
  if (trainingFunctional) {
    if (draft || !validTrainingFunctionalPlan(trainingPlan) || scope.application_route !== 'legacy'
        || scope.scenario !== 'platform' || scope.run_performance_tests !== 'false'
        || scope.perf_smoke !== 'false' || needs['accept-perf']?.result !== 'skipped'
        || (trainingPlan?.mode === TRAINING_FOLLOWUP_MODE
          && ['codeql','frontend_build','ui_required','visual_hosted',...Object.keys(acceptanceJobs).filter(key=>key!=='perf_smoke')]
            .some(key=>scope[key]!=='true'))) failed.push('scope');
  } else if ((scope.training_functional_only !== undefined && scope.training_functional_only !== 'false')
      || (!adminFunctional && scope.run_performance_tests !== undefined && scope.run_performance_tests !== 'true')
      || trainingPlan !== null) failed.push('scope');
  if (adminFunctional) {
    if (draft || !validAdminFunctionalPlan(adminPlan) || scope.application_route !== 'legacy'
        || scope.scenario !== 'platform' || scope.run_performance_tests !== 'false'
        || scope.perf_smoke !== 'false' || needs['accept-perf']?.result !== 'skipped'
        || ['codeql','frontend_build','ui_required','visual_hosted',...Object.keys(acceptanceJobs).filter(key=>key!=='perf_smoke')]
          .some(key=>scope[key]!=='true')) failed.push('scope');
  } else if ((scope.admin_permissions_functional_only !== undefined && scope.admin_permissions_functional_only !== 'false')
      || adminPlan !== null) failed.push('scope');
  if (scope.application_route === 'survey-mac-ui') {
    let p; try { p=JSON.parse(scope.survey_mac_ui_plan); } catch {}
    if(draft||!validSurveyMacPlan(p)||scope.scenario!=='survey-mac-ui'||scope.codeql!=='true'
      ||scope.frontend_build!=='false'||scope.ui_required!=='false'||scope.runner_profile!=='hosted'||scope.visual_hosted!=='false'
      ||scope.media_selection!=='[]'||scope.media_groups!=='[]'
      ||['maintenance','content','presentation','frontend','frontend_test','documentation','scale','cognitive','situational','bundle',...Object.keys(acceptanceJobs)].some(k=>scope[k]!=='false')) failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.application_route === 'reviewed-candidate') {
    let plan; try { plan = JSON.parse(scope.reviewed_candidate_plan); } catch {}
    if (draft || !validReviewedCandidatePlan(plan) || scope.scenario !== 'reviewed-candidate'
        || scope.codeql !== 'true' || scope.frontend_build !== 'false' || scope.ui_required !== 'false'
        || scope.runner_profile !== 'hosted' || scope.visual_hosted !== 'false'
        || scope.media_selection !== '[]' || scope.media_groups !== '[]'
        || ['maintenance','content','presentation','frontend','frontend_test','documentation',...Object.keys(acceptanceJobs)]
          .some(key => scope[key] !== 'false')) failed.push('scope');
    return [...new Set(failed)];
  }
  if(scope.application_route==='survey-candidate'){
    let p;try{p=JSON.parse(scope.survey_candidate_plan)}catch{}
    if(draft||!p||p.schema!==1||p.route!=='survey-candidate'||scope.scenario!=='survey-candidate'||scope.codeql!=='true'
      ||scope.frontend_build!=='true'||scope.ui_required!=='false'||scope.media_selection!=='[]'||scope.media_groups!=='[]'
      ||JSON.stringify(p.changed)!==JSON.stringify(['frontend','backend'])||!p.backendTests?.length||!p.frontendTests?.length
      ||!/^[a-f0-9]{40}$/.test(p.base||'')||!/^[a-f0-9]{40}$/.test(p.head||'')||!/^[a-f0-9]{40}$/.test(p.tree||'')
      ||!['frontend','backend'].every(c=>/^[a-f0-9]{40}$/.test(p.components?.[c]||''))
      ||JSON.stringify(p.required)!==JSON.stringify(['frozen-boundary','changed-builds-types','missing-survey-contracts','integrated-postgres-contracts','production-redis-limits','new-schema-restore','restricted-runtime','runtime-scans','three-role-browser','sast'])
      ||Object.keys(acceptanceJobs).some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if(scope.application_route==='assessment-capacity'){
    let p;try{p=JSON.parse(scope.assessment_capacity_plan)}catch{}
    if(!p||p.schema!==1||p.route!=='assessment-capacity'||scope.scenario!=='assessment-capacity'||scope.codeql!=='true'
      ||scope.frontend_build!=='true'||scope.ui_required!=='false'||scope.media_selection!=='[]'||scope.media_groups!=='[]'
      ||JSON.stringify(p.changed)!==JSON.stringify(['frontend','backend'])||!p.tests?.length||!p.frontendTests?.length||!p.focusedTests?.length
      ||!/^[a-f0-9]{40}$/.test(p.base||'')||!/^[a-f0-9]{40}$/.test(p.head||'')
      ||!['frontend','backend'].every(c=>/^[a-f0-9]{40}$/.test(p.components?.[c]||''))
      ||JSON.stringify(p.required)!==JSON.stringify(['frozen-boundary','affected-components-compile','canonical-submit-scoring-authority','durable-outbox-crash-recovery','new-schema-restore','compose-overrides','runtime-scans','report-feedback-browser','sast'])
      ||Object.keys(acceptanceJobs).some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if(scope.application_route==='teacher-survey'){
    let p;try{p=JSON.parse(scope.teacher_survey_plan)}catch{}
    if(!p||p.schema!==1||p.route!=='teacher-survey'||scope.scenario!=='teacher-survey'||scope.codeql!=='true'||JSON.stringify(p.changed)!==JSON.stringify(['frontend'])||!/^[a-f0-9]{40}$/.test(p.frontendTree||'')||!/^[a-f0-9]{40}$/.test(p.backendTree||'')||JSON.stringify(p.required)!==JSON.stringify(['bound-input-proof','frontend-build-once','affected-ui-contracts','runtime-scan','affected-runtime-browser','sast'])||Object.keys(acceptanceJobs).some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.application_route === 'access-efficiency') {
    let p;try{p=JSON.parse(scope.access_efficiency_plan);}catch{}
    if(!p||p.schema!==1||p.route!=='access-efficiency'||scope.scenario!=='access-efficiency'||scope.codeql!=='true'
      ||scope.frontend_build!=='true'||scope.ui_required!=='false'||scope.media_selection!=='[]'||scope.media_groups!=='[]'
      ||JSON.stringify(p.changed)!==JSON.stringify(['frontend','backend'])||!p.tests?.length||!p.frontendTests?.length||!p.focusedTests?.length
      ||!/^[a-f0-9]{40}$/.test(p.base||'')||!/^[a-f0-9]{40}$/.test(p.head||'')
      ||JSON.stringify(p.required)!==JSON.stringify(['frozen-boundary','affected-components-compile','focused-access-contracts','mobile-contracts','compose-overrides','runtime-scans','pagination-browser','sast'])
      ||Object.keys(acceptanceJobs).some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.application_route === 'backend-security-efficiency') {
    let p;try{p=JSON.parse(scope.backend_security_efficiency_plan);}catch{}
    if(!p||p.schema!==1||p.route!=='backend-security-efficiency'
      ||scope.scenario!=='backend-security-efficiency'||scope.codeql!=='true'
      ||scope.frontend_build!=='false'||scope.ui_required!=='false'
      ||scope.media_selection!=='[]'||scope.media_groups!=='[]'
      ||JSON.stringify(p.changed)!==JSON.stringify(['backend'])
      ||!Array.isArray(p.tests)||!p.tests.length
      ||!/^[a-f0-9]{40}$/.test(p.base||'')||!/^[a-f0-9]{40}$/.test(p.head||'')
      ||JSON.stringify(p.required)!==JSON.stringify(['frozen-boundary','backend-compile','focused-security-efficiency-contracts','runtime-scan','sast'])
      ||Object.keys(acceptanceJobs).some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.application_route === 'shared-asset-storage') {
    let p;try{p=JSON.parse(scope.shared_asset_storage_plan);}catch{}
    if(draft||!p||p.schema!==1||p.route!=='shared-asset-storage'
      ||scope.scenario!=='shared-asset-storage'||scope.codeql!=='true'
      ||scope.frontend_build!=='false'||scope.ui_required!=='false'
      ||scope.media_selection!=='[]'||scope.media_groups!=='[]'
      ||JSON.stringify(p.changed)!==JSON.stringify(['backend'])
      ||!Array.isArray(p.tests)||!p.tests.length
      ||!/^[a-f0-9]{40}$/.test(p.base||'')||!/^[a-f0-9]{40}$/.test(p.head||'')
      ||JSON.stringify(p.required)!==JSON.stringify(["frozen-boundary", "backend-compile", "shared-media-permissions", "new-schema-restore", "runtime-scan", "sast"])
      ||Object.keys(acceptanceJobs).some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.application_route === 'teacher-home') {
    let p;try{p=JSON.parse(scope.teacher_home_plan);}catch{}
    if(draft||!p||p.schema!==1||p.route!=='teacher-home'||scope.scenario!=='teacher-home'||scope.codeql!=='true'
      ||JSON.stringify(p.changed)!==JSON.stringify(['frontend','backend'])||!/^[a-f0-9]{40}$/.test(p.base||'')
      ||!/^[a-f0-9]{40}$/.test(p.head||'')||!['frontend','backend'].every(c=>/^[a-f0-9]{40}$/.test(p.components?.[c]||''))
      ||!Array.isArray(p.changes)||!p.changes.length
      ||JSON.stringify(p.required)!==JSON.stringify(['teacher-auth-contracts','frontend-candidate','backend-candidate','runtime-scans','teacher-browser','sast'])
      ||Object.keys(acceptanceJobs).some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.application_route === 'survey-home') {
    let p;try{p=JSON.parse(scope.survey_home_plan);}catch{}
    if(draft||!p||p.schema!==1||p.route!=='survey-home'||scope.scenario!=='survey-home'||scope.codeql!=='true'
      ||JSON.stringify(p.changed)!==JSON.stringify(['frontend'])||!/^[a-f0-9]{40}$/.test(p.base||'')
      ||!/^[a-f0-9]{40}$/.test(p.head||'')||!/^[a-f0-9]{40}$/.test(p.frontendTree||'')
      ||!Array.isArray(p.changes)||!p.changes.length
      ||JSON.stringify(p.required)!==JSON.stringify(['survey-entry-contracts','frontend-candidate','runtime-scan','survey-browser','sast'])
      ||Object.keys(acceptanceJobs).some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.application_route === 'homepage-copy') {
    let p; try { p=JSON.parse(scope.homepage_copy_plan); } catch {}
    if (!p || p.schema!==1 || p.route!=='homepage-copy' || scope.scenario!=='homepage-copy'
      || JSON.stringify(p.changed)!==JSON.stringify(['frontend']) || !Array.isArray(p.pages) || !p.pages.length
      || typeof p.toolsChanged!=='boolean' || !/^[a-f0-9]{40}$/.test(p.base||'') || !/^[a-f0-9]{40}$/.test(p.head||'')
      || JSON.stringify(p.required)!==JSON.stringify(['copy-boundary','frontend-candidate','runtime-scan','homepage-browser',...(p.toolsChanged?['sast']:[])])
      || Object.keys(acceptanceJobs).some(k=>scope[k]!=='false')) failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.application_route === 'campus') {
    let p;try{p=JSON.parse(scope.campus_plan);}catch{}
    if(!p||p.schema!==1||p.route!=='campus'||scope.scenario!=='campus'||scope.codeql!=='true'||!Array.isArray(p.changed)||!p.changed.length||!Array.isArray(p.required)||JSON.stringify(p.required)!==JSON.stringify(['campus-contracts','candidate-browser','runtime-scans','sast'])||Object.keys(acceptanceJobs).some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if (['A','B'].includes(scope.application_route)) {
    let p;try {p=JSON.parse(scope.release_plan);}catch {}
    if (!p || p.route !== scope.application_route || !Array.isArray(p.changed) || !p.changed.length || !Array.isArray(p.required) || !p.required.includes('compatibility') || !p.required.includes('rollback') || !p.required.includes('readiness') || (p.route === 'B' && !p.required.includes('login-contracts'))) failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.application_route && scope.application_route !== 'legacy') failed.push('scope');
  const flags = ['maintenance','frontend_test','frontend_build','ui_required','visual_hosted','content', 'presentation', 'frontend', 'documentation', 'codeql', ...Object.keys(acceptanceJobs)];
  const scenarios = {'release-tooling':['false','false','false','false'], 'frontend-test': ['false','false','false','false'], dependencies: ['false','false','false','false'], maintenance: ['false','false','false','false'], documentation: ['false','false','false','true'], content: ['true','false','false','false'], 'content-frontend': ['true','false','true','false'],
    presentation: ['false','true','false','false'], frontend: ['false','false','true','false'], platform: ['false','false','false','false']};
  const expected = scenarios[scope.scenario];
  const requiresCodeql = ['platform','dependencies','frontend','content-frontend','release-tooling'].includes(scope.scenario);
  if ((scope.scenario === 'dependencies' && Object.keys(acceptanceJobs).some(key=>scope[key] !== 'false'))
      || (scope.maintenance !== String(scope.scenario === 'maintenance'))
      || (scope.scenario === 'maintenance' && (scope.codeql !== 'false' || Object.keys(acceptanceJobs).some(key => scope[key] !== 'false')))
      || (requiresCodeql && scope.codeql !== 'true') || (scope.documentation === 'true' && scope.codeql !== 'false')) {
    if (!failed.includes('scope')) failed.unshift('scope');
  }
  if ((flags.some(flag => !['true','false'].includes(scope[flag])) || !expected
      || expected.some((value, index) => value !== scope[['content','presentation','frontend','documentation'][index]]))
      && !failed.includes('scope')) failed.unshift('scope');
  const selected = ['media2','video_core','media7','situational_video','situational_branching'].filter(key=>scope[key] === 'true');
  const uiRequired = scope.app_shell === 'true' || scope.canonical_visual === 'true';
  const buildRequired = scope.frontend === 'true' || ['platform','dependencies'].includes(scope.scenario) || uiRequired || selected.length > 0;
  const hostedVisual = scope.runner_profile === 'hosted' && scope.scenario === 'platform';
  const malformedTopology = scope.runner_profile !== 'hosted'
    || scope.frontend_test !== String(scope.scenario === 'frontend-test')
    || scope.frontend_build !== String(buildRequired) || scope.ui_required !== String(uiRequired)
    || scope.visual_hosted !== String(hostedVisual)
    || scope.media_selection !== JSON.stringify(selected)
    || scope.media_groups !== JSON.stringify(selected.length ? mediaPlan(selected) : [])
    || (scope.scenario === 'platform' && Object.keys(acceptanceJobs).some(key=>scope[key] !== ((trainingFunctional || adminFunctional) && key === 'perf_smoke' ? 'false' : 'true')));
  if (scope.scenario === 'release-tooling' && Object.keys(acceptanceJobs).some(key=>scope[key] !== 'false')) failed.push('scope');
  if (scope.scenario === 'frontend-test' && (scope.codeql !== 'false'
    || Object.keys(acceptanceJobs).some(key => scope[key] !== 'false')))
    if (!failed.includes('scope')) failed.unshift('scope');
  if (malformedTopology && !failed.includes('scope')) failed.unshift('scope');
  return failed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const needs = readNeeds();
  const draft = process.env.IS_DRAFT === 'true';
  const failed = failedChecks(needs, draft);
  if(needs.scope?.outputs?.application_route==='shared-authoring'){
    try{const {changedEntries}=await import('./content-scope.mjs');const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),p=JSON.parse(needs.scope.outputs.shared_authoring_plan);
      if(p.head!==head||p.base!==process.env.CI_BASE_SHA||JSON.stringify(sharedAuthoringPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-shared-authoring-plan');
    }catch{failed.push('recomputed-shared-authoring-plan');}
  }
  if(needs.scope?.outputs?.application_route==='school-teacher'){
    try{const {changedEntries}=await import('./content-scope.mjs');const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),p=JSON.parse(needs.scope.outputs.school_teacher_plan);
      if(p.head!==head||p.base!==process.env.CI_BASE_SHA||JSON.stringify(schoolTeacherPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-school-teacher-plan');
    }catch{failed.push('recomputed-school-teacher-plan');}
  }
  if(needs.scope?.outputs?.application_route==='survey-workspace'){
    try{const {changedEntries}=await import('./content-scope.mjs');const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),p=JSON.parse(needs.scope.outputs.survey_workspace_plan);
      if(p.head!==head||p.base!==process.env.CI_BASE_SHA||JSON.stringify(surveyWorkspacePlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-survey-workspace-plan');
    }catch{failed.push('recomputed-survey-workspace-plan');}
  }
  if(needs.scope?.outputs?.application_route==='training-appearance'){
    try{const {changedEntries}=await import('./content-scope.mjs');const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),p=JSON.parse(needs.scope.outputs.training_appearance_plan);
      if(p.head!==head||p.base!==process.env.CI_BASE_SHA||JSON.stringify(trainingAppearancePlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-training-appearance-plan');
    }catch{failed.push('recomputed-training-appearance-plan');}
  }
  if(needs.scope?.outputs?.application_route==='survey-cloud'){
    try{const {changedEntries}=await import('./content-scope.mjs');const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),p=JSON.parse(needs.scope.outputs.survey_cloud_plan);
      if(p.head!==head||p.base!==process.env.CI_BASE_SHA||JSON.stringify(surveyCloudPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-survey-cloud-plan');
    }catch{failed.push('recomputed-survey-cloud-plan');}
  }
  if(needs.scope?.outputs?.application_route==='admin-authenticator'){
    try{const {changedEntries}=await import('./content-scope.mjs');const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),p=JSON.parse(needs.scope.outputs.admin_authenticator_plan);
      if(p.head!==head||p.base!==process.env.CI_BASE_SHA||JSON.stringify(authenticatorPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-admin-authenticator-plan');
    }catch{failed.push('recomputed-admin-authenticator-plan');}
  }
  if (needs.scope?.outputs?.scenario === 'survey-wave-selection') {
    try {
      const {changedEntries,surveyWaveSelectionScope} = await import('./content-scope.mjs');
      if (process.env.CI_FORCE_FULL === 'true' || process.env.CI_EVENT !== 'pull_request'
        || !surveyWaveSelectionScope(changedEntries(process.env.CI_BASE_SHA))) failed.push('recomputed-survey-wave-selection-scope');
    } catch { failed.push('recomputed-survey-wave-selection-scope'); }
  }
  if(needs.scope?.outputs?.application_route==='scale-library-governance'){
    try{
      const {changedEntries}=await import('./content-scope.mjs');
      const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),p=JSON.parse(needs.scope.outputs.scale_library_governance_plan);
      if(p.head!==head||p.base!==process.env.CI_BASE_SHA||JSON.stringify(scaleLibraryGovernancePlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-scale-library-governance-plan');
    }catch{failed.push('recomputed-scale-library-governance-plan')}
  }
  if(needs.scope?.outputs?.application_route==='survey-experience'){
    try{
      const {changedEntries}=await import('./content-scope.mjs');
      const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),p=JSON.parse(needs.scope.outputs.survey_experience_plan);
      if(p.head!==head||p.base!==process.env.CI_BASE_SHA||JSON.stringify(surveyExperiencePlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-survey-experience-plan');
    }catch{failed.push('recomputed-survey-experience-plan')}
  }
  if(needs.scope?.outputs?.application_route==='composite-csv-memory'){
    try{
      const {changedEntries}=await import('./content-scope.mjs');
      const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),p=JSON.parse(needs.scope.outputs.composite_csv_memory_plan);
      if(p.head!==head||p.base!==process.env.CI_BASE_SHA||JSON.stringify(compositeCsvMemoryPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-composite-csv-memory-plan');
    }catch{failed.push('recomputed-composite-csv-memory-plan')}
  }
  if(needs.scope?.outputs?.application_route==='training-workspace'){
    try{
      const {changedEntries}=await import('./content-scope.mjs');
      const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),p=JSON.parse(needs.scope.outputs.training_workspace_plan);
      if(p.head!==head||p.base!==process.env.CI_BASE_SHA||JSON.stringify(trainingWorkspacePlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-training-workspace-plan');
    }catch{failed.push('recomputed-training-workspace-plan')}
  }
  // Recompute the complete raw-diff boundary, rather than trusting scope outputs.
  if (needs.scope?.outputs?.scenario === 'frontend-performance') {
    try {
      const {changedEntries,frontendPerformanceScope} = await import('./content-scope.mjs');
      const {execFileSync} = await import('node:child_process');
      if (process.env.CI_FORCE_FULL === 'true' || process.env.CI_EVENT !== 'pull_request'
        || !frontendPerformanceScope(changedEntries(process.env.CI_BASE_SHA),
          file => execFileSync('git',['show',`HEAD:${file}`], {maxBuffer:8 * 1024 * 1024})))
        failed.push('recomputed-frontend-performance-scope');
    } catch { failed.push('recomputed-frontend-performance-scope'); }
  }
  if(needs.scope?.outputs?.application_route==='exact-candidate') {
    const {execFileSync}=await import('node:child_process');
    const p=JSON.parse(needs.scope.outputs.exact_candidate_plan);
    const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(p.head!==head || JSON.stringify(exactCandidatePlan(p.base,head))!==JSON.stringify(p))
      failed.push('recomputed-exact-candidate-plan');
  }
  if (needs.scope?.outputs?.admin_permissions_functional_only === 'true' || process.env.CI_BASE_SHA === ADMIN_FUNCTIONAL_BASE) {
    try {
      const { changedEntries } = await import('./content-scope.mjs');
      const { execFileSync } = await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base=process.env.CI_BASE_SHA;
      const actual=adminFunctionalPlan(changedEntries(base,head),base,head);
      const emitted=JSON.parse(needs.scope.outputs.admin_permissions_functional_plan || 'null');
      if (JSON.stringify(actual)!==JSON.stringify(emitted)
          || (actual!==null)!==(needs.scope.outputs.admin_permissions_functional_only==='true'))
        failed.push('recomputed-admin-functional-plan');
    } catch { failed.push('recomputed-admin-functional-plan'); }
  }
  if (needs.scope?.outputs?.training_functional_only === 'true' || [TRAINING_FUNCTIONAL_BASE,TRAINING_FOLLOWUP_BASE].includes(process.env.CI_BASE_SHA)) {
    try {
      const { changedEntries } = await import('./content-scope.mjs');
      const { execFileSync } = await import('node:child_process');
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const base = process.env.CI_BASE_SHA;
      const actual = trainingFunctionalPlan(changedEntries(base, head), base, head);
      const emitted = JSON.parse(needs.scope.outputs.training_functional_plan || 'null');
      if (JSON.stringify(actual) !== JSON.stringify(emitted)
          || (actual !== null) !== (needs.scope.outputs.training_functional_only === 'true'))
        failed.push('recomputed-training-functional-plan');
    } catch { failed.push('recomputed-training-functional-plan'); }
  }
  if(needs.scope?.outputs?.application_route==='survey-mac-ui') {
    try { recheckSurveyMac(JSON.parse(needs.scope.outputs.survey_mac_ui_plan)); }
    catch { failed.push('recomputed-survey-mac-ui-plan'); }
  }
  if (['A','B'].includes(needs.scope?.outputs?.application_route) || needs.scope?.outputs?.scenario === 'release-tooling') {
    const {plan,toolingOnly}=await import('../../server-version/scripts/release/policy.mjs');
    const p=JSON.parse(needs.scope.outputs.release_plan);
    const actual=plan(p.base,p.head);
    if (JSON.stringify(actual) !== JSON.stringify(p)) failed.push('recomputed-plan');
    if (needs.scope.outputs.scenario==='release-tooling' && (actual.route!=='C' || actual.changed.length || !toolingOnly(actual.changes))) failed.push('mixed-or-unknown-tooling');
  }
  if (needs.scope?.outputs?.application_route === 'reviewed-candidate') {
    const {reviewedCandidatePlan} = await import('./reviewed-candidate-scope.mjs');
    const {changedEntries} = await import('./content-scope.mjs');
    const {execFileSync} = await import('node:child_process');
    try {
      const plan = JSON.parse(needs.scope.outputs.reviewed_candidate_plan);
      const head = execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim();
      if (plan.head !== head || JSON.stringify(reviewedCandidatePlan(changedEntries(plan.base, head), plan.base, head)) !== JSON.stringify(plan))
        failed.push('recomputed-reviewed-candidate-plan');
    } catch { failed.push('recomputed-reviewed-candidate-plan'); }
  }
  if(needs.scope?.outputs?.application_route==='survey-candidate'){
    const {surveyCandidatePlan}=await import('./survey-candidate-scope.mjs');
    const {changedEntries}=await import('./content-scope.mjs');
    const {execFileSync}=await import('node:child_process');
    const p=JSON.parse(needs.scope.outputs.survey_candidate_plan),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(p.head!==head||JSON.stringify(surveyCandidatePlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-survey-candidate-plan');
  }
  if(needs.scope?.outputs?.application_route==='assessment-capacity'){
    const {assessmentCapacityPlan}=await import('./assessment-capacity-scope.mjs');
    const {changedEntries}=await import('./content-scope.mjs');
    const {execFileSync}=await import('node:child_process');
    const p=JSON.parse(needs.scope.outputs.assessment_capacity_plan),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(p.head!==head||JSON.stringify(assessmentCapacityPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-assessment-capacity-plan');
  }
  if(needs.scope?.outputs?.application_route==='teacher-survey'){
    const {teacherSurveyPlan}=await import('./teacher-survey-scope.mjs');
    const {changedEntries}=await import('./content-scope.mjs');
    const {execFileSync}=await import('node:child_process');
    const p=JSON.parse(needs.scope.outputs.teacher_survey_plan),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(p.head!==head||JSON.stringify(teacherSurveyPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-teacher-survey-plan');
  }
  if(needs.scope?.outputs?.application_route==='access-efficiency'){
    const {accessEfficiencyPlan}=await import('./access-efficiency-scope.mjs');
    const {execFileSync}=await import('node:child_process');
    const {changedEntries}=await import('./content-scope.mjs');
    const p=JSON.parse(needs.scope.outputs.access_efficiency_plan);
    const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(p.head!==head||JSON.stringify(accessEfficiencyPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-access-efficiency-plan');
  }
  if(needs.scope?.outputs?.application_route==='backend-security-efficiency'){
    const {backendSecurityEfficiencyPlan}=await import('./backend-security-efficiency-scope.mjs');
    const {changedEntries}=await import('./content-scope.mjs');
    const {execFileSync}=await import('node:child_process');
    const p=JSON.parse(needs.scope.outputs.backend_security_efficiency_plan);
    const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(p.head!==head||JSON.stringify(backendSecurityEfficiencyPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-backend-security-efficiency-plan');
  }
  if(needs.scope?.outputs?.application_route==='shared-asset-storage'){
    const {sharedAssetStoragePlan}=await import('./shared-asset-storage-scope.mjs');
    const {changedEntries}=await import('./content-scope.mjs');
    const {execFileSync}=await import('node:child_process');
    const p=JSON.parse(needs.scope.outputs.shared_asset_storage_plan);
    const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(p.head!==head||JSON.stringify(sharedAssetStoragePlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-shared-asset-storage-plan');
  }
  if(needs.scope?.outputs?.application_route==='teacher-home'){
    const {teacherHomePlan}=await import('./teacher-home-scope.mjs');
    const {changedEntries}=await import('./content-scope.mjs');
    const {execFileSync}=await import('node:child_process');
    const p=JSON.parse(needs.scope.outputs.teacher_home_plan),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(p.head!==head||JSON.stringify(teacherHomePlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-teacher-home-plan');
  }
  if(needs.scope?.outputs?.application_route==='survey-home'){
    const {surveyHomePlan}=await import('./survey-home-scope.mjs');
    const {changedEntries}=await import('./content-scope.mjs');
    const {execFileSync}=await import('node:child_process');
    const p=JSON.parse(needs.scope.outputs.survey_home_plan),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(p.head!==head||JSON.stringify(surveyHomePlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p))failed.push('recomputed-survey-home-plan');
  }
  if(needs.scope?.outputs?.application_route==='campus'){
    const {campusPlan}=await import('./campus-scope.mjs');const {changedEntries}=await import('./content-scope.mjs');
    const p=JSON.parse(needs.scope.outputs.campus_plan);
    if(JSON.stringify(campusPlan(changedEntries(p.base,p.head),p.base,p.head))!==JSON.stringify(p))failed.push('recomputed-campus-plan');
  }
  if (needs.scope?.outputs?.application_route==='homepage-copy') {
    const {homepageCopyPlan}=await import('./homepage-copy-scope.mjs');
    const {changedEntries}=await import('./content-scope.mjs');
    const {execFileSync}=await import('node:child_process');
    const p=JSON.parse(needs.scope.outputs.homepage_copy_plan);
    const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if (p.head!==head || JSON.stringify(homepageCopyPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p)) failed.push('recomputed-homepage-copy-plan');
  }
  console.log(JSON.stringify({ required: requiredChecks(needs, draft), failed }));
  if (failed.length) process.exit(1);
}
