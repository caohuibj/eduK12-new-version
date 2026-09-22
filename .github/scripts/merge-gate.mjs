import { pathToFileURL } from 'node:url';
export function requiredChecks(needs, draft) {
  return ['scope', ...(needs.scope?.outputs?.content === 'true' ? ['content'] : draft
    ? ['pr-light-backend', 'pr-light-frontend'] : ['backend', 'frontend', 'browser', 'docker', 'codeql'])];
}
export function failedChecks(needs, draft) {
  const failed = requiredChecks(needs, draft).filter(name => needs[name]?.result !== 'success');
  if (!['true', 'false'].includes(needs.scope?.outputs?.content) && !failed.includes('scope')) failed.unshift('scope');
  return failed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const needs = JSON.parse(process.env.NEEDS_JSON);
  const draft = process.env.IS_DRAFT === 'true';
  const failed = failedChecks(needs, draft);
  console.log(JSON.stringify({ required: requiredChecks(needs, draft), failed }));
  if (failed.length) process.exit(1);
}
