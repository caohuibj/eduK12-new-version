import {studentDiscoveryScope} from './student-discovery-scope.mjs';
import {unitOnly} from './ci-qualification.mjs';
import {readEdgeScope,edgeConfigOutputs} from './edge-config-scope.mjs';
import {cognitiveProductPlan,cognitiveProductOutputs} from './cognitive-product-scope.mjs';
import {catalogDiscoveryScope,bundleRuntimeSelectionMatches,authoringPolishScope} from './catalog-discovery-scope.mjs';
import {cognitiveMixedProductScope, acceptanceFor, classifyChanges, contentCodeqlRequired} from './content-scope.mjs';
import {execFileSync} from 'node:child_process';
import {readCognitiveIntakeDiff} from './cognitive-intake-scope.mjs';
import {verifiedFrontendRetest} from './ci-frontend-retest.mjs';
export function recheckCognitiveIntake(needs,{base,head,cwd=process.cwd(),draft=false}={}) {
  const actual=readCognitiveIntakeDiff(base,head,{cwd});
  const scope=needs.scope?.outputs||{};
  if(scope.application_route==='cognitive-product'){
    const read=ref=>file=>{try{return execFileSync('git',['show',ref+':'+file],{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{return null;}};
    const p=cognitiveProductPlan(actual.entries,base,head,read(head),read(base));
    if(!p||Object.entries(cognitiveProductOutputs(p)).some(([k,v])=>scope[k]!==String(v)))return ['recomputed-cognitive-product'];
    return requiredChecks(needs,draft).filter(name=>needs[name]?.result!=='success');
  }
  if(!actual.selected && scope.cognitive_intake_light!=='true') {
    const readHead = file => {try{return execFileSync('git',['show',head+':'+file],{cwd,encoding:'utf8'});}catch{return null;}};
    if (cognitiveMixedProductScope(actual.entries, readHead, file=>{try{return execFileSync('git',['show',base+':'+file],{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{return null;}})) {
      // Recompute platform scope; retain the event's Draft/Ready job selection.
      const scope = needs.scope?.outputs || {};
      if (scope.scenario !== 'platform' || scope.application_route !== 'legacy'
        || ['content','frontend','documentation','maintenance','presentation'].some(key=>scope[key]!=='false')
        || scope.cognitive!=='true' || scope.cognitive_intake_light!=='false'
        || scope.codeql!=='true' || scope.frontend_build!=='true'
        || Object.keys(acceptanceFor([])).some(key=>scope[key]!=='true')) return ['recomputed-cognitive-product-scope'];
      return requiredChecks(needs,draft).filter(name=>needs[name]?.result!=='success');
    }
    return actual.entries.some(e=>/^server-version\/(?:backend\/src\/modules\/cognitive\/(?:tasks|generated|content-candidates)\/|frontend\/src\/modules\/cognitive\/(?:(?:tasks|generated)\/|native-runners\.tsx$))/.test(e.file)) ? ['unsupported-cognitive-intake'] : [];
  }
  const {base:baseSHA,head:checkout,entries,...selection}=actual;
  const failed=[];
  if(!actual.selected || scope.cognitive_intake_light!=='true' || scope.cognitive!=='true' || scope.content!=='true' || scope.scenario!=='content' || JSON.stringify(selection)!==scope.cognitive_intake_plan) failed.push('recomputed-cognitive-intake');
  if(actual.requiresBrowser || scope.scale_intake_light==='true' || scope.scale==='true' || scope.situational==='true' || scope.bundle==='true') failed.push('unsupported-or-mixed-cognitive-intake');
  for(const name of ['scope','content','codeql']) if(needs[name]?.result!=='success')failed.push(name);
  return [...new Set(failed)];
}

export function recheckContentSast(needs,entries,readers) {
  const actual=classifyChanges(entries,false,readers),failed=[];
  if(!actual.content||actual.frontend||needs.scope.outputs.codeql!==String(contentCodeqlRequired(entries,readers)))failed.push('recomputed-content-sast');
  if(needs.content?.result!=='success')failed.push('content');
  return failed;
}
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
  if(needs.scope?.outputs?.application_route==='edge-config')return ['scope','edge-config'];
  const scope = needs.scope?.outputs ?? {};
  if(scope.application_route==='backend-unit')return ['scope','backend-unit'];
  if(scope.application_route==='cognitive-product')return draft?['scope']:['scope','cognitive-product','docker','codeql'];
  if(scope.scenario === 'catalog-discovery') return draft?['scope']:['scope','catalog-discovery','frontend','docker','codeql'];
  if (scope.application_route === 'homepage-copy') {
    let p; try { p=JSON.parse(scope.homepage_copy_plan); } catch {}
    return ['scope',...(!draft ? ['homepage-copy',...((p?.sast ?? p?.toolsChanged) ? ['codeql'] : [])] : [])];
  }
  if (['A','B'].includes(scope.application_route)) {
    let p; try { p = JSON.parse(scope.release_plan || '{}'); } catch { p = {}; }
    return ['scope','scoped-release', ...(p.required?.includes('sast') ? ['codeql'] : [])];
  }
  if (scope.scenario === 'release-tooling') return ['scope','release-tools',...(!draft&&scope.image_build==='true'?['docker']:[]),...(!draft?['codeql']:[])];
  if (scope.scenario === 'backend') return ['scope',...(draft?['pr-light-backend']:['backend',...(scope.backend_focus==='form-intake'?[]:['backend-regression']),'docker','codeql'])];
  if (scope.cognitive_intake_light === 'true') return ['scope','content',...(!draft?['codeql']:[])];
  const dependencies = scope.scenario === 'dependencies';
  let checks = ['scope'];
  if (dependencies) checks.push(...(scope.dependencies_frontend_only==='true'?[]:['maintenance','backend','backend-regression']),'frontend-build','frontend','docker');
  if (scope.scenario === 'frontend-test') checks.push('frontend');
  if (scope.maintenance === 'true') checks.push('maintenance');
  else if (scope.documentation === 'true') checks.push('documentation');
  else if (scope.content === 'true') checks.push('content');
  if (dependencies) { /* Whole affected units and production images; no unrelated browser/media. */ }
  else if (scope.maintenance === 'true') { /* Dedicated host-only checks. */ }
  else if (scope.documentation === 'true') { /* No runtime lane for ordinary docs. */ }
  else if (scope.presentation === 'true') checks.push('visual');
  else if (scope.frontend === 'true') {
    if (scope.frontend_affected === 'true') checks.push('frontend',...(!draft?['docker']:[]));
    else if (draft) checks.push('pr-light-frontend');
    else checks.push('backend-browser-build', 'frontend', 'browser', 'docker');
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
  if(scope.application_route==='legacy'&&scope.scenario==='platform'){
    checks.push('backend-regression-reuse');
    if(needs['backend-regression-reuse']?.result==='success'
      &&needs['backend-regression-reuse']?.outputs?.reuse_backend_regression==='true')
      checks=checks.filter(check=>check!=='backend-regression');
  }
  return [...new Set(checks)];
}

export function failedChecks(needs, draft) {
  const scope = needs.scope?.outputs ?? {};
  const required = requiredChecks(needs, draft);
  const failed = required.filter(name => needs[name]?.result !== 'success');
  if(required.includes('backend-regression-reuse')){
    const reuse=needs['backend-regression-reuse'];
    if(!['true','false'].includes(reuse?.outputs?.reuse_backend_regression))failed.push('backend-regression-reuse-output');
    if(reuse?.outputs?.reuse_backend_regression==='true'
      &&(!/^[0-9]+$/.test(reuse.outputs.source_run||'')
        ||!/^[a-f0-9]{64}$/.test(reuse.outputs.evidence_digest||'')
        ||reuse.result!=='success'))failed.push('backend-regression-reuse-evidence');
  }
  if(scope.application_route==='backend-unit'){
    if(scope.scenario!=='backend-unit'||scope.codeql!=='false'||scope.frontend!=='false'||scope.content!=='false'
      ||scope.presentation!=='false'||scope.documentation!=='false'||Object.keys(acceptanceJobs).some(k=>scope[k]!=='false'))failed.push('scope');
    return [...new Set(failed)];
  }
  if(scope.application_route==='edge-config'){if(draft||Object.entries(edgeConfigOutputs()).some(([k,v])=>scope[k]!==String(v)))failed.push('scope');return [...new Set(failed)];}
  if(scope.application_route==='cognitive-product'){
    try{const p=JSON.parse(scope.cognitive_product_plan);
      if(p.schema!==1||p.route!=='cognitive-product'||!Array.isArray(p.files)||!p.files.length||!Array.isArray(p.required)||JSON.stringify(p.required)!==JSON.stringify(['cognitive-contracts','runner-scorer-freeze-intake','production-images','runtime-scans','sast'])||Object.entries(cognitiveProductOutputs(p)).some(([k,v])=>scope[k]!==String(v)))failed.push('scope');
    }catch{failed.push('scope');}
    return [...new Set(failed)];
  }
  if (scope.application_route === 'homepage-copy') {
    let p; try { p=JSON.parse(scope.homepage_copy_plan); } catch {}
    if (!p || p.schema!==1 || p.route!=='homepage-copy' || scope.scenario!=='homepage-copy'
      || JSON.stringify(p.changed)!==JSON.stringify(['frontend']) || !Array.isArray(p.pages) || !p.pages.length
      || typeof p.toolsChanged!=='boolean' || !/^[a-f0-9]{40}$/.test(p.base||'') || !/^[a-f0-9]{40}$/.test(p.head||'')
      || JSON.stringify(p.required)!==JSON.stringify(['copy-boundary','frontend-candidate','runtime-scan','homepage-browser',...((p.sast ?? p.toolsChanged)?['sast']:[])])
      || Object.keys(acceptanceJobs).some(k=>scope[k]!=='false')) failed.push('scope');
    return [...new Set(failed)];
  }
  if (['A','B'].includes(scope.application_route)) {
    let p;try {p=JSON.parse(scope.release_plan);}catch {}
    if (!p || p.route !== scope.application_route || !Array.isArray(p.changed) || !p.changed.length || !Array.isArray(p.required) || !p.required.includes('compatibility') || !p.required.includes('rollback') || !p.required.includes('readiness') || (p.route === 'B' && !p.required.includes('login-contracts'))) failed.push('scope');
    return [...new Set(failed)];
  }
  if (scope.application_route && scope.application_route !== 'legacy') failed.push('scope');
  if(scope.scale_intake_light !== undefined && (!['true','false'].includes(scope.scale_intake_light)
    || scope.scale_intake_light === 'true' && (scope.content !== 'true' || scope.frontend === 'true' || scope.scenario !== 'content')))
    failed.push('scope');
  if(scope.cognitive_intake_light !== undefined && (!['true','false'].includes(scope.cognitive_intake_light) || scope.cognitive_intake_light==='true' &&
    (scope.content!=='true'||scope.cognitive!=='true'||scope.frontend!=='false'||scope.codeql!=='true'||scope.scenario!=='content'||scope.scale_intake_light==='true'||scope.scale==='true'||scope.situational==='true'||scope.bundle==='true')))
    failed.push('scope');
  if(scope.frontend_affected!==undefined&&(!['true','false'].includes(scope.frontend_affected)
    ||scope.frontend_affected==='true'&&scope.scenario!=='catalog-discovery'&&(scope.scenario!=='frontend'||scope.frontend!=='true')))failed.push('scope');
  if(scope.dependencies_frontend_only!==undefined&&(!['true','false'].includes(scope.dependencies_frontend_only)
    ||scope.dependencies_frontend_only==='true'&&scope.scenario!=='dependencies'))failed.push('scope');
  if(scope.image_build!==undefined&&(!['true','false'].includes(scope.image_build)
    ||scope.image_build==='true'&&scope.scenario!=='release-tooling'))failed.push('scope');
  const flags = ['maintenance','frontend_test','frontend_build','ui_required','visual_hosted','content', 'presentation', 'frontend', 'documentation', 'codeql', ...Object.keys(acceptanceJobs)];
  const scenarios = {'catalog-discovery':['false','false','false','false'],backend:['false','false','false','false'], 'release-tooling':['false','false','false','false'], 'frontend-test': ['false','false','false','false'], dependencies: ['false','false','false','false'], maintenance: ['false','false','false','false'], documentation: ['false','false','false','true'], content: ['true','false','false','false'], 'content-frontend': ['true','false','true','false'],
    presentation: ['false','true','false','false'], frontend: ['false','false','true','false'], platform: ['false','false','false','false']};
  const expected = scenarios[scope.scenario];
  const requiresCodeql = ['catalog-discovery','platform','backend','dependencies','frontend','content-frontend','release-tooling'].includes(scope.scenario);
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
  const buildRequired = scope.frontend === 'true' && scope.frontend_affected !== 'true' || ['platform','dependencies'].includes(scope.scenario) || uiRequired || selected.length > 0;
  const hostedVisual = scope.runner_profile === 'hosted' && scope.scenario === 'platform';
  const malformedTopology = scope.runner_profile !== 'hosted'
    || scope.frontend_test !== String(scope.scenario === 'frontend-test')
    || scope.frontend_build !== String(buildRequired) || scope.ui_required !== String(uiRequired)
    || scope.visual_hosted !== String(hostedVisual)
    || scope.media_selection !== JSON.stringify(selected)
    || scope.media_groups !== JSON.stringify(selected.length ? mediaPlan(selected) : [])
    || (scope.scenario === 'platform' && Object.keys(acceptanceJobs).some(key=>scope[key] !== 'true'));
  if (scope.scenario === 'release-tooling' && Object.keys(acceptanceJobs).some(key=>scope[key] !== 'false')) failed.push('scope');
  if (['backend','catalog-discovery'].includes(scope.scenario) && Object.keys(acceptanceJobs).some(key=>scope[key] !== 'false')) failed.push('scope');
  if (scope.scenario === 'frontend-test' && (scope.codeql !== 'false'
    || Object.keys(acceptanceJobs).some(key => scope[key] !== 'false')))
    if (!failed.includes('scope')) failed.unshift('scope');
  if(scope.frontend_retest!==undefined&&!['true','false'].includes(scope.frontend_retest))
    failed.push('frontend-retest-proof');
  if(scope.frontend_retest==='true'&&(
    scope.scenario!=='frontend-test'||scope.application_route!=='legacy'
    ||scope.frontend_test!=='true'||scope.frontend_build!=='false'
    ||scope.codeql!=='false'||scope.frontend!=='false'||scope.content!=='false'
    ||scope.maintenance!=='false'||scope.documentation!=='false'
    ||scope.presentation!=='false'||scope.frontend_affected!=='false'
    ||Object.keys(acceptanceJobs).some(key=>scope[key]!=='false')
    ||!/^src\/[a-zA-Z0-9_./-]+\.(?:test|spec)\.tsx?$/.test(scope.frontend_retest_file||'')
    ||!/^\d+$/.test(scope.frontend_retest_source_run||'')
    ||!/^([a-f0-9]{40})$/.test(scope.frontend_retest_source_sha||'')
    ||!/^([a-f0-9]{64})$/.test(scope.frontend_retest_gate_digest||'')
    ||!/^([a-f0-9]{64})$/.test(scope.frontend_retest_report_digest||'')
    ||!/^([A-Za-z0-9_-]{3,1024})$/.test(scope.frontend_retest_case||'')
  ))failed.push('frontend-retest-proof');
  if(scope.frontend_retest!=='true'&&(
    scope.frontend_retest_file||scope.frontend_retest_source_run
    ||scope.frontend_retest_source_sha||scope.frontend_retest_gate_digest
    ||scope.frontend_retest_report_digest||scope.frontend_retest_case))failed.push('frontend-retest-proof');
  if (malformedTopology && !failed.includes('scope')) failed.unshift('scope');
  return failed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const needs = readNeeds();
  const draft = process.env.IS_DRAFT === 'true';
  const failed = failedChecks(needs, draft);
  if(needs.scope?.outputs?.application_route==='backend-unit'){
    try {const {changedEntries}=await import('./content-scope.mjs');
      if(!unitOnly(changedEntries(process.env.CI_BASE_SHA)))failed.push('recomputed-backend-unit-scope');
    }catch{failed.push('recomputed-backend-unit-scope');}
  }
  if(needs.scope?.outputs?.scenario==='content'&&needs.scope.outputs.content==='true'){
    const {changedEntries}=await import('./content-scope.mjs');
    const {declarationReaders}=await import('./declarative-content.mjs');
    const entries=changedEntries(process.env.CI_BASE_SHA),readers=declarationReaders(process.env.CI_BASE_SHA);
    failed.push(...recheckContentSast(needs,entries,readers));
  }
  if(needs.scope?.outputs?.application_route==='edge-config'&&!readEdgeScope(process.env.CI_BASE_SHA))failed.push('recomputed-edge-scope');
  if(needs.scope?.outputs?.scenario==='catalog-discovery'){const {changedEntries}=await import('./content-scope.mjs');const entries=changedEntries(process.env.CI_BASE_SHA);const readers={readHeadFile:file=>execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}),readBaseFile:file=>execFileSync('git',['show',process.env.CI_BASE_SHA+':'+file],{encoding:'utf8'})};if(!catalogDiscoveryScope(entries,readers))failed.push('recomputed-catalog-discovery');if((needs.scope.outputs.student_discovery||'false')!==String(studentDiscoveryScope(entries,readers)))failed.push('recomputed-student-discovery');if((needs.scope.outputs.authoring_polish||'false')!==String(authoringPolishScope(entries)))failed.push('recomputed-authoring-polish');if(!bundleRuntimeSelectionMatches(entries,needs.scope.outputs))failed.push('recomputed-bundle-runtime');}
  // The actual Git diff decides whether emitted Cognitive flags need checking.
  if((!needs.scope?.outputs?.application_route || needs.scope.outputs.application_route==='legacy') && process.env.CI_FORCE_FULL!=='true') {
    try {
      const {execFileSync}=await import('node:child_process');
      const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
      failed.push(...recheckCognitiveIntake(needs,{base:process.env.CI_BASE_SHA,head,draft:process.env.IS_DRAFT==='true'}));
    } catch {failed.push('recomputed-cognitive-intake');}
  }
  if (['A','B'].includes(needs.scope?.outputs?.application_route) || needs.scope?.outputs?.scenario === 'release-tooling') {
    const {plan,toolingOnly,imageBuildOnly}=await import('../../server-version/scripts/release/policy.mjs');
    const p=JSON.parse(needs.scope.outputs.release_plan);
    const actual=plan(p.base,p.head);
    if (JSON.stringify(actual) !== JSON.stringify(p)) failed.push('recomputed-plan');
    if (needs.scope.outputs.scenario==='release-tooling' && (actual.route!=='C' || !toolingOnly(actual.changes)
      ||String(imageBuildOnly(actual.changes))!==needs.scope.outputs.image_build
      ||actual.changed.length&&!imageBuildOnly(actual.changes))) failed.push('mixed-or-unknown-tooling');
  }
  if (needs.scope?.outputs?.application_route==='homepage-copy') {
    const {homepageCopyPlan}=await import('./homepage-copy-scope.mjs');
    const {changedEntries}=await import('./content-scope.mjs');
    const {execFileSync}=await import('node:child_process');
    const p=JSON.parse(needs.scope.outputs.homepage_copy_plan);
    const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if (p.head!==head || JSON.stringify(homepageCopyPlan(changedEntries(p.base,head),p.base,head))!==JSON.stringify(p)) failed.push('recomputed-homepage-copy-plan');
  }
  // A source CI verdict is never pasted onto this head. Re-verify the
  // GitHub-hosted source artifacts, complete requirement manifest, original
  // failure, unchanged main and immediate single-test delta at merge time.
  if(needs.scope?.outputs?.frontend_retest==='true'){
    try{
      if(draft||process.env.CI_FORCE_FULL==='true')throw Error('Retest forbidden for draft/forced full');
      const scope=needs.scope.outputs;
      const proof=await verifiedFrontendRetest({
        token:process.env.GH_TOKEN,repo:process.env.GITHUB_REPOSITORY,
        pr:Number(process.env.CI_PR_NUMBER),branch:process.env.CI_HEAD_REF,
        prHead:process.env.CI_SOURCE_HEAD,baseSha:process.env.CI_BASE_SHA,
        currentRunId:Number(process.env.GITHUB_RUN_ID),
        sourceId:scope.frontend_retest_source_run
      });
      if(!proof||proof.testFile!==scope.frontend_retest_file
        ||String(proof.runId)!==scope.frontend_retest_source_run
        ||proof.sourceSha!==scope.frontend_retest_source_sha
        ||proof.gateDigest!==scope.frontend_retest_gate_digest
        ||proof.reportDigest!==scope.frontend_retest_report_digest
        ||proof.failedCase!==scope.frontend_retest_case)
        throw Error('Retest source proof cannot be reproduced');
    }catch(e){
      console.error('Frontend retest merge gate refused: '+String(e?.message||e).slice(0,350));
      failed.push('recomputed-frontend-retest-proof');
    }
  }
  console.log(JSON.stringify({ required: requiredChecks(needs, draft), failed }));
  if (failed.length) process.exit(1);
}
