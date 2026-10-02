import { pathToFileURL } from 'node:url';
export function requiredChecks(needs, draft) {
  return ['scope', ...(needs.scope?.outputs?.content === 'true' ? ['content']
    : needs.scope?.outputs?.presentation === 'true' ? ['visual']
      : draft ? ['pr-light-backend', 'pr-light-frontend', 'miniprogram']
        : ['backend', 'backend-regression', 'frontend', 'browser', 'docker', 'codeql', 'miniprogram'])];
}
export function failedChecks(needs, draft) {
  const failed = requiredChecks(needs, draft).filter(name => needs[name]?.result !== 'success');
  if ((!['true', 'false'].includes(needs.scope?.outputs?.content)
      || !['true', 'false'].includes(needs.scope?.outputs?.presentation)) && !failed.includes('scope')) failed.unshift('scope');
  return failed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const needs = JSON.parse(process.env.NEEDS_JSON);
  const draft = process.env.IS_DRAFT === 'true';
  const failed = failedChecks(needs, draft);
  console.log(JSON.stringify({ required: requiredChecks(needs, draft), failed }));
  if (failed.length) process.exit(1);
}
