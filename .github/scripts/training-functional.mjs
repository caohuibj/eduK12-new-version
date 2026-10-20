import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TRAINING_FUNCTIONAL_CONFIG = '.github/config/training-functional-ci.json';
export const TRAINING_FUNCTIONAL_BASE = '167478dda6d30df212cb141494c75dd106f04d45';
export const TRAINING_FUNCTIONAL_OMISSIONS = ['aggregate-report-200-completion', 'perf-phase0-smoke'];
export const TRAINING_FUNCTIONAL_TOOLS = [
  TRAINING_FUNCTIONAL_CONFIG,
  '.github/scripts/training-functional.mjs',
  '.github/scripts/training-functional.test.mjs',
  '.github/scripts/training-functional-report.mjs',
  '.github/scripts/training-functional-report.test.mjs',
  '.github/scripts/content-scope.mjs',
  '.github/scripts/merge-gate.mjs',
  '.github/workflows/ci.yml',
  '.github/workflows/ci-backend.yml',
  '.github/workflows/ci-browser.yml',
];
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const canonical = value => typeof value === 'string' && !/[\\\x00-\x1f\x7f]/.test(value)
  && !value.split('/').some(part => !part || part === '.' || part === '..');
const sourcePath = path => canonical(path) && (
  path === 'server-version/e2e/training-draft-transactions-browser.cjs'
  ||
  /^server-version\/(backend|frontend)\/src\/.+\.(ts|tsx|css)$/.test(path)
  || path === 'server-version/backend/prisma/schema.prisma'
  || /^server-version\/backend\/prisma\/migrations\/202610190[456]0000_training_(public_rounds|persistence|feedback_release)\/migration\.sql$/.test(path)
  || path === 'server-version/backend/scripts/runtime-table-policy.json'
  || path === 'docs/recovery/training-20261018/progress.md'
  || /^docs\/release\/training-[a-z0-9-]+\.md$/.test(path)
);
const regularChange = entry => entry.newMode === '100644'
  && ((entry.status === 'A' && entry.oldMode === '000000')
    || (entry.status === 'M' && entry.oldMode === '100644'));

// An explicit, reviewed configuration addition activates this single integration.
// Branch names, labels and arbitrary environment booleans cannot grant it.
// The base has no marker; after merge, ordinary subsequent PRs keep the defaults.
export function validateTrainingFunctional(entries, config, { base, head, event, forceFull = false }) {
  const marker = entries.find(entry => entry.file === TRAINING_FUNCTIONAL_CONFIG);
  if (!marker) return null;
  if (marker.status !== 'A' || !regularChange(marker))
    throw new Error('Training functional configuration must be a new regular file in this integration');
  if (!['pull_request', 'push'].includes(event) || forceFull)
    throw new Error('Training functional qualification does not admit manual or forced performance execution');
  if (base !== TRAINING_FUNCTIONAL_BASE || !sha(head) || config?.schema !== 1
      || config.mode !== 'training-functional-only' || config.base !== base
      || typeof config.reason !== 'string' || !config.reason.trim()
      || !Array.isArray(config.sourcePaths) || !config.sourcePaths.length
      || config.sourcePaths.some(path => !sourcePath(path))
      || new Set(config.sourcePaths).size !== config.sourcePaths.length)
    throw new Error('Invalid or moved Training functional scope declaration');
  const allowed = new Set([...TRAINING_FUNCTIONAL_TOOLS, ...config.sourcePaths]);
  if (!entries.length || new Set(entries.map(entry => entry.file)).size !== entries.length
      || entries.some(entry => !regularChange(entry) || !allowed.has(entry.file)))
    throw new Error('Unknown path, deletion or file-mode change in Training functional integration');
  for (const required of [
    'server-version/backend/src/modules/composite/training-checkpoint.service.ts',
    'server-version/frontend/src/services/persistence/finalDraftStore.ts',
    'server-version/backend/prisma/schema.prisma',
  ]) if (!entries.some(entry => entry.file === required))
    throw new Error('Training functional integration is missing its application scope');
  return { schema: 1, mode: 'training-functional-only', base, head,
    changedPaths: entries.map(entry => entry.file).sort(),
    omittedPerformance: [...TRAINING_FUNCTIONAL_OMISSIONS] };
}

export function trainingFunctionalPlan(entries, base, head, options = {}) {
  if (!entries.some(entry => entry.file === TRAINING_FUNCTIONAL_CONFIG)) return null;
  if (!sha(base) || !sha(head)) throw new Error('Exact Git base/head required for Training scope');
  const config = JSON.parse(execFileSync('git', ['show', `${head}:${TRAINING_FUNCTIONAL_CONFIG}`], { encoding: 'utf8' }));
  return validateTrainingFunctional(entries, config, { base, head,
    event: options.event ?? process.env.CI_EVENT,
    forceFull: options.forceFull ?? process.env.CI_FORCE_FULL === 'true' });
}

export function validTrainingFunctionalPlan(plan) {
  return plan?.schema === 1 && plan.mode === 'training-functional-only'
    && plan.base === TRAINING_FUNCTIONAL_BASE && sha(plan.head)
    && Array.isArray(plan.changedPaths) && plan.changedPaths.includes(TRAINING_FUNCTIONAL_CONFIG)
    && plan.changedPaths.every(canonical)
    && new Set(plan.changedPaths).size === plan.changedPaths.length
    && JSON.stringify(plan.omittedPerformance) === JSON.stringify(TRAINING_FUNCTIONAL_OMISSIONS);
}

async function main() {
  if (process.argv[2] !== 'verify-backend') throw new Error('Expected verify-backend');
  const { changedEntries } = await import('./content-scope.mjs');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const base = process.env.CI_BASE_SHA;
  const plan = trainingFunctionalPlan(changedEntries(base, head), base, head);
  if (!plan) throw new Error('Disabling backend performance requires the explicit Training functional scope');
  console.log(JSON.stringify({ mode: plan.mode, base, head, omittedPerformance: plan.omittedPerformance }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Do not await main at module scope: content-scope imports this module too.
  // Finish initializing our exports before its dynamic import can evaluate.
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
