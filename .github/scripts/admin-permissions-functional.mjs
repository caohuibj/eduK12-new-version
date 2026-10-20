import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateFunctionalScope, TRAINING_FUNCTIONAL_OMISSIONS } from './training-functional.mjs';

export const ADMIN_FUNCTIONAL_CONFIG = '.github/config/admin-permissions-functional-ci.json';
export const ADMIN_FUNCTIONAL_BASE = 'c3f9a7e77447c706f4a83a93c7429a7bcb164e94';
export const ADMIN_FUNCTIONAL_MODE = 'admin-permissions-functional-only';
export const ADMIN_FUNCTIONAL_OMISSIONS = [...TRAINING_FUNCTIONAL_OMISSIONS];
export const ADMIN_FUNCTIONAL_TOOLS = [ADMIN_FUNCTIONAL_CONFIG,
  '.github/scripts/admin-permissions-functional.mjs', '.github/scripts/admin-permissions-functional.test.mjs',
  '.github/scripts/training-functional.mjs', '.github/scripts/content-scope.mjs', '.github/scripts/merge-gate.mjs',
  '.github/workflows/ci.yml', '.github/workflows/ci-backend.yml', '.github/workflows/ci-browser.yml'];
const canonical = path => typeof path === 'string' && !/[\\\x00-\x1f\x7f]/.test(path)
  && !path.split('/').some(part => !part || part === '.' || part === '..');
const exactSources = new Set([
  ...['README','a05-workspaces','review-fixes-20261020','verification-20261020'].map(name => `docs/admin-permissions/${name}.md`),
  ...['.env.example','package.json','package-lock.json','prisma/schema.prisma','prisma/seeds/users.ts',
    'scripts/admin-permissions-fixture.ts','scripts/admin-permissions-measure.ts','scripts/admin-permissions-rehearsal.mjs',
    'scripts/admin-permissions-rollback-preflight.mjs','scripts/runtime-table-policy.json'].map(path => 'server-version/backend/'+path),
  'server-version/docs/frontend-convergence/routes.md','server-version/e2e/admin-permissions-browser.cjs',
  'server-version/frontend/scripts/product-route-inventory.mjs',
  'docs/miniprogram-v2/web-feature-inventory.json',
  'server-version/e2e/ops-export-worker-smoke.ts',
  'server-version/e2e/qa-round3-browser-e2e.cjs',
  'server-version/e2e/qa-round5-sjt-upload-browser-e2e.cjs',
  'server-version/miniprogram-v2/domains/account/service.js',
  'server-version/miniprogram-v2/tests/runtime.test.cjs',
]);
const sourcePath = path => canonical(path) && (exactSources.has(path)
  || /^server-version\/(backend|frontend)\/src\/.+\.(ts|tsx|css)$/.test(path)
  || /^server-version\/backend\/prisma\/migrations\/202610201[012]0000_(admin_entry_authority|admin_security_keys|training_entry_authority)\/migration\.sql$/.test(path));
const required = [
  'server-version/backend/src/modules/admin-permissions/service.ts',
  'server-version/backend/src/modules/admin-permissions/security.ts',
  'server-version/backend/src/modules/organization/principal.ts','server-version/backend/src/middleware/auth.ts',
  'server-version/backend/prisma/schema.prisma',
  'server-version/backend/src/__tests__/admin-permissions/business-overlap.postgres.integration.test.ts',
  'server-version/backend/src/modules/assessment-run/registeredResources.ts',
  'server-version/frontend/src/App.tsx','server-version/frontend/src/pages/admin/ReportingContent.tsx',
];

export function validateAdminFunctional(entries, config, context) {
  const plan = validateFunctionalScope(entries,config,context,{markerPath:ADMIN_FUNCTIONAL_CONFIG,
    baseSha:ADMIN_FUNCTIONAL_BASE,mode:ADMIN_FUNCTIONAL_MODE,label:'Admin permissions',
    tools:ADMIN_FUNCTIONAL_TOOLS,sourcePath,required,omissions:ADMIN_FUNCTIONAL_OMISSIONS});
  if (plan && config.sourcePaths.some(path => !plan.changedPaths.includes(path)))
    throw new Error('Admin functional declaration must match its complete source diff');
  return plan;
}
export function adminFunctionalPlan(entries,base,head,options={}) {
  if (!entries.some(entry=>entry.file===ADMIN_FUNCTIONAL_CONFIG)) return null;
  if (!/^[a-f0-9]{40}$/.test(base||'') || !/^[a-f0-9]{40}$/.test(head||'')) throw new Error('Exact admin Git base/head required');
  const config=JSON.parse(execFileSync('git',['show',`${head}:${ADMIN_FUNCTIONAL_CONFIG}`],{encoding:'utf8'}));
  return validateAdminFunctional(entries,config,{base,head,event:options.event??process.env.CI_EVENT,
    forceFull:options.forceFull??process.env.CI_FORCE_FULL==='true'});
}
export function validAdminFunctionalPlan(plan) {
  return plan?.schema===1 && plan.mode===ADMIN_FUNCTIONAL_MODE && plan.base===ADMIN_FUNCTIONAL_BASE
    && /^[a-f0-9]{40}$/.test(plan.head||'') && Array.isArray(plan.changedPaths)
    && plan.changedPaths.includes(ADMIN_FUNCTIONAL_CONFIG) && required.every(path=>plan.changedPaths.includes(path))
    && plan.changedPaths.every(canonical) && new Set(plan.changedPaths).size===plan.changedPaths.length
    && JSON.stringify(plan.omittedPerformance)===JSON.stringify(ADMIN_FUNCTIONAL_OMISSIONS);
}
async function main() {
  if(!['verify-backend','verify-browser'].includes(process.argv[2]))throw new Error('Expected verify-backend or verify-browser');
  const {changedEntries}=await import('./content-scope.mjs');
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base=process.env.CI_BASE_SHA;
  const plan=adminFunctionalPlan(changedEntries(base,head),base,head);
  if(!plan)throw new Error('Admin checks require their explicit independently reviewed functional scope');
  console.log(JSON.stringify({mode:plan.mode,base,head,omittedPerformance:plan.omittedPerformance}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{
  console.error(error instanceof Error?error.message:String(error));process.exitCode=1;
});
