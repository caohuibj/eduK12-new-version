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
  for (const name of ['backend', 'backend-regression', 'frontend', 'browser', 'docker', 'codeql', 'merge-gate'])
    assert.match(job(ci, name), /vars.CI_FORCE_FULL == 'true'/, name);
  for (const name of ['pr-light-backend', 'pr-light-frontend', 'post-merge-smoke'])
    assert.match(job(ci, name), /vars.CI_FORCE_FULL != 'true'/, name);
  assert.match(job(ci, 'merge-gate'), /IS_DRAFT:.*vars.CI_FORCE_FULL != 'true'/);
});


test('automatic performance smoke only follows runtime hot paths', () => {
  const workflow = 'perf-phase0-smoke';
  const cold = [
    'server-version/backend/src/modules/cognitive/public.service.ts',
    'server-version/backend/src/modules/reporting/service.ts',
    'server-version/backend/src/modules/scale/instruments/example/1.0.0/instrument.json',
  ];
  const hot = [
    'server-version/backend/src/modules/cognitive/final-submit.service.ts',
    'server-version/backend/src/modules/scale/scale-final-submit.service.ts',
    'server-version/backend/src/modules/situational/situational-final-submit.service.ts',
    'server-version/backend/src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts',
    'server-version/backend/src/services/unitSubmitAdmission.ts',
  ];
  assert.equal(triggered(workflow, cold), false, workflow);
  for (const file of hot) assert.equal(triggered(workflow, [file]), true, `${workflow}: ${file}`);
  assert.equal(triggered(workflow, [`.github/workflows/${workflow}.yml`]), true, workflow);
});
test('Cognitive management changes do not trigger the video gate', () => {
  const workflow = 'media-7-cross-runtime-acceptance';
  assert.equal(triggered(workflow, ['server-version/backend/src/modules/cognitive/public.service.ts']), false);
  assert.equal(triggered(workflow, ['server-version/backend/src/modules/cognitive/cognitive.controller.ts']), false);
  assert.equal(triggered(workflow, ['server-version/backend/src/modules/cognitive/cognitive-video.service.ts']), true);
  assert.equal(triggered(workflow, ['server-version/frontend/src/modules/cognitive/video-presentation.ts']), true);
});

test('all CI jobs use isolated GitHub-hosted Ubuntu runners and preserve full gates', () => {
  const directory = new URL('../workflows/', import.meta.url);
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.yml'))) {
    const text = fs.readFileSync(new URL(name, directory), 'utf8');
    const runners = [...text.matchAll(/^    runs-on: (.+)$/gm)].map(match => match[1]);
    assert.ok(runners.length, `${name}: no executable jobs found`);
    for (const runner of runners) assert.equal(runner, 'ubuntu-24.04', name);
    assert.doesNotMatch(text, /self-hosted|eduk12-(mac|win)-ci|hosted_runner/, name);
    assert.doesNotMatch(text, /^    runs-on:\s*$/m, name);
  }
  const ci = source('ci');
  const backend = job(ci, 'backend');
  const regression = job(ci, 'backend-regression');
  assert.match(regression, /--exclude=src\/__tests__\/questionnaire\/aggregate-report\.postgres\.integration\.test\.ts/);
  assert.match(backend, /run: npm test -- src\/__tests__\/questionnaire\/aggregate-report\.postgres\.integration\.test\.ts/);
  assert.match(job(ci, 'browser'), /needs: \[scope, backend, frontend\]/);
  for (const name of ['codeql', 'docker']) assert.match(job(ci, name), /needs: \[scope\]/);
  assert.match(job(ci, 'merge-gate'), /needs: \[scope, content, visual, pr-light-backend, pr-light-frontend, backend, backend-regression, frontend, browser, docker, codeql, miniprogram\]/);
});



test('Phase 0 closure is manual targeted evidence and never competes with PR CI', () => {
  const text = source('perf-phase0-closure');
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /ab_groups:/);
  assert.match(text, /scope:/);
  assert.doesNotMatch(text, /\n  pull_request:/);
  assert.equal(triggered('perf-phase0-closure', [
    'server-version/backend/src/modules/cognitive/final-submit.service.ts',
    '.github/workflows/perf-phase0-closure.yml',
  ]), false);
});

test('Phase 0 exploratory work is manual evidence only', () => {
  const text = source('perf-phase0-exploratory');
  assert.match(text, /workflow_dispatch:/);
  assert.match(job(text, 'invariants'), /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(job(text, 'curve'), /if: github\.event_name == 'workflow_dispatch'/);
});

test('mixed A-B ordering is stable across independent BASE and HEAD fixture seeds', () => {
  const text = fs.readFileSync(new URL('../../server-version/backend/scripts/current-main-seed-fixtures.ts', import.meta.url), 'utf8');
  assert.match(text, /const mixKey = \(fixtureId: string\) => createHash\('sha256'\)\.update\(fixtureId\)/);
  assert.doesNotMatch(text, /update\(.*runId.*fixtureId/);
});


test('browser build restore retries retain exact-run authority and fail closed', () => {
  const browser = job(source('ci'), 'browser');
  for (const kind of ['frontend', 'backend']) {
    const names = [`restore tested ${kind} build`, `retry tested ${kind} build download`, `final tested ${kind} build download`];
    const steps = browser.split('      - name: ');
    const downloads = names.map(name => steps.find(step => step.startsWith(`${name}\n`)));
    for (const step of downloads) {
      assert.ok(step);
      assert.match(step, /uses: actions\/download-artifact@v4/);
      assert.ok(step.includes(`name: ${kind}-dist-` + '${{ github.sha }}'));
      // Omitting run-id/repository/token keeps downloads scoped to the current run.
      assert.doesNotMatch(step, /\n          (run-id|repository|github-token):/);
    }
    assert.match(downloads[0], /continue-on-error: true/);
    assert.match(downloads[1], new RegExp(`steps\\.${kind}-build-download\\.outcome == 'failure'`));
    assert.match(downloads[2], new RegExp(`steps\\.${kind}-build-download-retry\\.outcome == 'failure'`));
    assert.doesNotMatch(downloads[2], /continue-on-error:/);
    const guard = steps.find(step => step.startsWith(`verify restored ${kind} entry point\n`));
    assert.ok(guard);
    assert.doesNotMatch(guard, /continue-on-error:|\n        if:/);
    assert.ok(guard.includes(`run: test -s ${kind}/dist/index.`));
  }
});

test('parent authority has draft unit coverage and non-skipping full integration gates', () => {
  const ci = source('ci');
  assert.match(job(ci, 'pr-light-backend'), /vitest run src\/__tests__\/parent-portal/);
  const regression = job(ci, 'backend-regression');
  for (const file of ['parentPortal', 'miniprogramParentHttp']) {
    assert.ok(regression.includes('src/__tests__/integration/' + file + '.postgres.integration.test.ts'));
  }
});
