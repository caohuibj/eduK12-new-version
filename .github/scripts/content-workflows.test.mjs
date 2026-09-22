import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const match = require('../../server-version/backend/node_modules/picomatch');
function triggered(workflow, files) {
  const text = fs.readFileSync(new URL(`../workflows/${workflow}.yml`, import.meta.url), 'utf8');
  const paths = [...text.split('  workflow_dispatch:')[0].matchAll(/^      - '([^']+)'$/gm)].map(row => row[1]);
  return files.some(file => paths.reduce((included, pattern) => {
    const exclude = pattern.startsWith('!');
    return match(exclude ? pattern.slice(1) : pattern)(file) ? !exclude : included;
  }, false));
}
test('Cognitive declarations cannot trigger the independent video gate', () => {
  const workflow = 'media-7-cross-runtime-acceptance';
  const root = 'server-version/backend/src/modules/cognitive/';
  for (const file of ['seeds', 'participant-presentation', 'governance', 'scientific']) {
    assert.equal(triggered(workflow, [`${root}tasks/STROOP/${file}.ts`]), false);
  }
  assert.equal(triggered(workflow, [`${root}tasks/STROOP/seeds.ts`, `${root}tasks/STROOP/package.ts`]), true);
  assert.equal(triggered(workflow, [`.github/workflows/${workflow}.yml`]), true);
});
test('SJT content is targeted, while runtime and mixed changes retain browser gates', () => {
  const root = 'server-version/backend/src/modules/situational/';
  for (const workflow of ['situational-branching-acceptance', 'situational-video-acceptance']) {
    const files = ['instrument','publication','scientific'].map(name => `${root}instruments/example/1.0.0/${name}.json`);
    files.push(`${root}onboarding/instruments.generated.ts`);
    assert.equal(triggered(workflow, files), false);
    assert.equal(triggered(workflow, [...files, `${root}situational-final-submit.service.ts`]), true);
    assert.equal(triggered(workflow, [`.github/workflows/${workflow}.yml`]), true);
  }
});
test('Bundle JSON does not duplicate independent browser workflows; mixed triggers remain', () => {
  const files = [
    'server-version/backend/src/modules/assessment-bundle/packages/example/1.0.0/manifest.json',
    'server-version/backend/src/modules/assessment-bundle/generated/packages.json',
    'server-version/backend/src/modules/assessment-bundle/ci-fixtures/example/1.0.0.json',
  ];
  for (const workflow of ['media-2-acceptance', 'media-7-cross-runtime-acceptance',
    'situational-branching-acceptance', 'situational-video-acceptance',
    'assessment-video-core-acceptance', 'fe-11-app-shell-acceptance']) {
    assert.equal(triggered(workflow, files), false, workflow);
    assert.equal(triggered(workflow, [...files, `.github/workflows/${workflow}.yml`]), true, workflow);
  }
});
const source = name => fs.readFileSync(new URL(`../workflows/${name}.yml`, import.meta.url), 'utf8');
const job = (text, name) => text.split(`  ${name}:\n`)[1]?.split(/\n  [a-z][a-z-]*:\n/)[0] ?? '';
test('Bundle validation is mandatory on content and platform routes with stable aggregate', () => {
  const ci = source('ci'), content = source('scale-onboarding-boundary');
  assert.match(job(ci, 'merge-gate'), /name: merge gate \/ ready PR/);
  assert.match(job(ci, 'scope'), /bundle: \$\{\{ steps.scope.outputs.bundle/);
  assert.match(job(ci, 'content'), /bundle: \$\{\{ needs.scope.outputs.bundle/);
  for (const name of ['backend', 'pr-light-backend', 'post-merge-smoke']) {
    assert.match(job(ci, name), /run: npx tsx scripts\/bundle-content-check.ts/, name);
  }
  const steps = content.split('      - name: ');
  for (const command of ['scripts/bundle-content-check.ts', 'db:migrate:guarded', 'src/__tests__/bundle-onboarding', 'scripts/assert-release-test-report.mjs', 'tsc --noEmit']) {
    const step = steps.find(s => s.includes(command));
    assert.ok(step, command); assert.doesNotMatch(step, /\n        if:/, command);
  }
  assert.match(content, /      postgres:/);
  assert.match(content, /      redis:/);
  assert.doesNotMatch(ci, /\n  pull_request_review:/);
  assert.match(source('situational-publication'), /\n  pull_request_review:/);
});

test('force-full override schedules full jobs and uses a full aggregate even for drafts/main', () => {
  const ci = source('ci');
  for (const name of ['backend', 'frontend', 'browser', 'docker', 'codeql', 'merge-gate'])
    assert.match(job(ci, name), /vars.CI_FORCE_FULL == 'true'/, name);
  for (const name of ['pr-light-backend', 'pr-light-frontend', 'post-merge-smoke'])
    assert.match(job(ci, name), /vars.CI_FORCE_FULL != 'true'/, name);
  assert.match(job(ci, 'merge-gate'), /IS_DRAFT:.*vars.CI_FORCE_FULL != 'true'/);
});
