import { pathToFileURL } from 'node:url';

const acceptanceJobs = {
  media2: 'accept-media2', media7: 'accept-media7',
  situational_video: 'accept-situational-video', situational_branching: 'accept-situational-branching',
  video_core: 'accept-video-core', app_shell: 'accept-app-shell',
  canonical_visual: 'accept-visual', perf_smoke: 'accept-perf', ops: 'accept-ops',
};

export function requiredChecks(needs, draft) {
  const scope = needs.scope?.outputs ?? {};
  let checks = ['scope'];
  if (scope.documentation === 'true') checks.push('documentation');
  else if (scope.content === 'true') checks.push('content');
  if (scope.documentation === 'true') { /* No runtime lane for ordinary docs. */ }
  else if (scope.presentation === 'true') checks.push('visual');
  else if (scope.frontend === 'true') {
    if (draft) checks.push('pr-light-frontend');
    if (!draft) checks.push('backend-browser-build', 'frontend', 'browser', 'docker');
  } else if (scope.content !== 'true') {
    checks.push('miniprogram');
    if (draft) checks.push('pr-light-frontend');
    checks.push(...(draft ? ['pr-light-backend']
      : ['backend', 'backend-regression', 'frontend', 'browser', 'docker']));
  }
  if (!draft && scope.codeql === 'true') checks.push('codeql');
  if (!draft) for (const [output, job] of Object.entries(acceptanceJobs))
    if (scope[output] === 'true') checks.push(job);
  return [...new Set(checks)];
}

export function failedChecks(needs, draft) {
  const scope = needs.scope?.outputs ?? {};
  const failed = requiredChecks(needs, draft).filter(name => needs[name]?.result !== 'success');
  const flags = ['content', 'presentation', 'frontend', 'documentation', 'codeql', ...Object.keys(acceptanceJobs)];
  const scenarios = {documentation: ['false','false','false','true'], content: ['true','false','false','false'], 'content-frontend': ['true','false','true','false'],
    presentation: ['false','true','false','false'], frontend: ['false','false','true','false'], platform: ['false','false','false','false']};
  const expected = scenarios[scope.scenario];
  const requiresCodeql = ['platform','frontend','content-frontend'].includes(scope.scenario);
  if ((requiresCodeql && scope.codeql !== 'true') || (scope.documentation === 'true' && scope.codeql !== 'false')) {
    if (!failed.includes('scope')) failed.unshift('scope');
  }
  if ((flags.some(flag => !['true','false'].includes(scope[flag])) || !expected
      || expected.some((value, index) => value !== scope[['content','presentation','frontend','documentation'][index]]))
      && !failed.includes('scope')) failed.unshift('scope');
  return failed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const needs = JSON.parse(process.env.NEEDS_JSON);
  const draft = process.env.IS_DRAFT === 'true';
  const failed = failedChecks(needs, draft);
  console.log(JSON.stringify({ required: requiredChecks(needs, draft), failed }));
  if (failed.length) process.exit(1);
}
