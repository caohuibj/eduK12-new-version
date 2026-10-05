import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const scopes = JSON.parse(fs.readFileSync(new URL('../config/acceptance-scopes.json', import.meta.url), 'utf8'));
const { matchesGlob: match } = require('node:path').posix;
function triggered(workflow, files) {
  const paths = Object.values(scopes).find(scope => scope.workflow === `${workflow}.yml`)?.paths ?? [];
  return files.some(file => paths.reduce((included, pattern) => {
    const exclude = pattern.startsWith('!');
    return match(file, exclude ? pattern.slice(1) : pattern) ? !exclude : included;
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
  for (const name of ['pr-light-backend', 'post-merge-smoke'])
    assert.match(job(ci, name), /vars.CI_FORCE_FULL != 'true'/, name);
  assert.match(job(ci, 'pr-light-frontend'), /vars.CI_FORCE_FULL == 'true'/);
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

test('local CI distributes Mac and Windows work and retains hosted CodeQL only', () => {
  const ci=source('ci');
  assert.match(job(ci,'scope'),/runs-on: .*eduk12-mac-ci/);
  assert.match(job(ci,'merge-gate'),/runs-on: .*eduk12-mac-ci/);
  for(const name of ['backend','backend-regression','browser','backend-browser-build'])
    assert.match(job(ci,name),/fromJSON\(needs\.scope\.outputs\.heavy_runner\)/,name);
  for(const name of ['visual','pr-light-frontend'])
    assert.match(job(ci,name),/fromJSON\(needs\.scope\.outputs\.frontend_runner\)/,name);
  assert.match(job(ci,'miniprogram'),/fromJSON\(needs\.scope\.outputs\.light_runner\)/);
  assert.match(job(ci,'frontend'),/fromJSON\(needs\.scope\.outputs\.frontend_runner\)/);
  assert.match(job(ci,'docker'),/fromJSON\(needs\.scope\.outputs\.docker_runner\)/);
  assert.match(job(ci,'codeql'),/fromJSON\(needs\.scope\.outputs\.codeql_runner\)/);
  const classifier=fs.readFileSync(new URL('./content-scope.mjs',import.meta.url),'utf8');
  assert.match(classifier,/eduk12-win-ci/); assert.match(classifier,/CI_MAC_LIGHT_ENABLED/);
  assert.match(classifier,/External PRs require/);
  for(const {workflow} of Object.values(scopes)){
    const text=fs.readFileSync(new URL('../workflows/'+workflow,import.meta.url),'utf8');
    assert.match(text,/workflow_call:/,workflow); assert.doesNotMatch(text,/\n  pull_request:/,workflow);
    assert.match(text,/runner_profile:/,workflow); assert.match(text,/eduk12-win-ci/,workflow);
    assert.match(text,/github\.event\.pull_request\.draft == false/,workflow);
  }
  const backend=job(ci,'backend'), regression=job(ci,'backend-regression');
  assert.match(regression,/--exclude=src\/__tests__\/questionnaire\/aggregate-report\.postgres\.integration\.test\.ts/);
  assert.match(backend,/run: npm test -- src\/__tests__\/questionnaire\/aggregate-report\.postgres\.integration\.test\.ts/);
  assert.match(job(ci,'browser'),/needs: \[scope, backend, backend-browser-build, frontend\]/);
  assert.match(job(ci,'browser'),/!cancelled\(\).*backend-browser-build\.result == 'success'/);
  assert.match(job(ci,'frontend'),/needs: scope/);
  for(const name of ['codeql','docker']) assert.match(job(ci,name),/needs: scope/);
  assert.match(job(ci,'merge-gate'),/accept-media7/);
  assert.match(job(ci,'merge-gate'),/accept-visual/);
  assert.match(job(ci,'merge-gate'),/accept-ops/);
});
test('frontend route builds only the frontend image but preserves scan, CSP and API evidence', () => {
  const docker=job(source('ci'),'docker');
  assert.match(docker,/images=\(frontend\)/);
  assert.match(docker,/images=\(backend worker frontend\)/);
  assert.match(docker,/docker compose build --print/);
  assert.match(docker,/ci-image-plan\.mjs.*--verify/);
  assert.match(docker,/--pull --load --print/);
  assert.match(docker,/FRONTEND_ONLY:/);
  assert.match(docker,/scan frontend image \(high and critical\)/);
  assert.match(docker,/frontend-nginx-static-smoke/);
  const browser=job(source('ci'),'browser');
  for(const check of ['storage fault','four-role','Organization cross-role','production CSP'])
    assert.ok(browser.includes(check),check);
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
  assert.match(regression, /MINI_OPERATIONS_TEST_REDIS_URL: redis:\/\/localhost:6379/);
  const release = fs.readFileSync(new URL('../../server-version/scripts/release-verify-local.sh', import.meta.url), 'utf8');
  assert.ok(release.includes('export MINI_OPERATIONS_TEST_REDIS_URL="$REDIS_URL"'));
  assert.ok(release.includes('src/__tests__/integration/miniprogramOperationsHttp.postgres.integration.test.ts'));
  for (const file of ['parentPortal', 'miniprogramParentHttp', 'miniprogramOperationsHttp']) {
    assert.ok(regression.includes('src/__tests__/integration/' + file + '.postgres.integration.test.ts'));
  }
});

test('reusable media/browser consumers use only exact-current-run artifacts and preserve independent databases', () => {
  for(const name of ['media-2-acceptance','media-7-cross-runtime-acceptance','situational-video-acceptance','situational-branching-acceptance','fe-11-app-shell-acceptance']){
    const text=source(name);
    assert.match(text,/use_build_artifacts:/,name);
    assert.match(text,/name: frontend-dist-\$\{\{ github\.sha \}\}/,name);
    assert.doesNotMatch(text,/\n          (run-id|repository|github-token):/,name);
    if(name !== 'fe-11-app-shell-acceptance') assert.match(text,/      postgres:/,name);
  }
  // Visual UI lab has different build flags: do not reuse the ordinary production artifact.
  assert.match(source('visual-canonical-qa'),/VITE_UI_LAB_ENABLED: 'true'/);
  assert.doesNotMatch(source('visual-canonical-qa'),/use_build_artifacts:/);
});

test('only the CodeQL plan uses hosted labels and Mac Ready frontend installs once',()=>{
  const ci=source('ci');
  for(const name of ['backend','backend-regression','docker','codeql'])
    assert.match(job(ci,name),/needs: scope/);
  const front=job(ci,'frontend');
  assert.match(front,/name: lint/);assert.match(front,/name: typecheck/);
  assert.match(front,/--frontend/);assert.match(front,/3072/);assert.match(front,/mac-ci-cleanup/);
  assert.doesNotMatch(front,/pr-light-frontend/);
  assert.doesNotMatch(front,/server-version\/backend|npm ci --ignore-scripts/);
  for(const name of ['backend','backend-browser-build'])
    assert.match(job(ci,name),/cognitive:onboarding-check -- --all --json/);
  assert.match(job(ci,'pr-light-frontend'),/github\.event\.pull_request\.draft == true/);
  assert.match(job(ci,'scope'),/head\.repo\.full_name == github\.repository/);
  for(const {workflow} of Object.values(scopes)) {
    const text=fs.readFileSync(new URL('../workflows/'+workflow,import.meta.url),'utf8');
    assert.doesNotMatch(text,/ubuntu-24/);assert.match(text,/runs-on: \[self-hosted, Linux, X64, eduk12-win-ci\]/);
  }
});
