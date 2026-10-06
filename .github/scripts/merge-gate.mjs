import { pathToFileURL } from 'node:url';
import { mediaPlan } from './ci-media-plan.mjs';

const acceptanceJobs = {
  media2: 'accept-media', media7: 'accept-media',
  situational_video: 'accept-media', situational_branching: 'accept-media',
  video_core: 'accept-media', app_shell: 'accept-ui',
  canonical_visual: 'accept-ui', perf_smoke: 'accept-perf', ops: 'accept-ops',
};

export function requiredChecks(needs, draft) {
  const scope = needs.scope?.outputs ?? {};
  const dependencies = scope.scenario === 'dependencies';
  let checks = ['scope'];
  if (dependencies) checks.push('maintenance','backend','backend-regression','frontend-build','frontend','docker');
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
  } else if (scope.content !== 'true') {
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
  const flags = ['maintenance','frontend_build','ui_required','visual_hosted','content', 'presentation', 'frontend', 'documentation', 'codeql', ...Object.keys(acceptanceJobs)];
  const scenarios = {dependencies: ['false','false','false','false'], maintenance: ['false','false','false','false'], documentation: ['false','false','false','true'], content: ['true','false','false','false'], 'content-frontend': ['true','false','true','false'],
    presentation: ['false','true','false','false'], frontend: ['false','false','true','false'], platform: ['false','false','false','false']};
  const expected = scenarios[scope.scenario];
  const requiresCodeql = ['platform','dependencies','frontend','content-frontend'].includes(scope.scenario);
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
  const hostedVisual = scope.runner_profile === 'speed' && scope.scenario === 'platform';
  const malformedTopology = !['speed','economy','local'].includes(scope.runner_profile)
    || scope.frontend_build !== String(buildRequired) || scope.ui_required !== String(uiRequired)
    || scope.visual_hosted !== String(hostedVisual)
    || scope.media_selection !== JSON.stringify(selected)
    || scope.media_groups !== JSON.stringify(selected.length ? mediaPlan(selected) : [])
    || (scope.scenario === 'platform' && Object.keys(acceptanceJobs).some(key=>scope[key] !== 'true'));
  if (malformedTopology && !failed.includes('scope')) failed.unshift('scope');
  return failed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const needs = JSON.parse(process.env.NEEDS_JSON);
  const draft = process.env.IS_DRAFT === 'true';
  const failed = failedChecks(needs, draft);
  console.log(JSON.stringify({ required: requiredChecks(needs, draft), failed }));
  if (failed.length) process.exit(1);
}
