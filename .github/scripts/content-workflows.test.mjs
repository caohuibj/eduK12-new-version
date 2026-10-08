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
const job = (text, name) => text.split(`  ${name}:\n`)[1]?.split(/\n  [a-z][a-z0-9-]*:\n/)[0] ?? '';
test('Bundle validation is mandatory on content and platform routes with stable aggregate', () => {
  const ci = source('ci'), content = source('scale-onboarding-boundary');
  assert.match(job(ci, 'merge-gate'), /name: merge gate \/ ready PR/);
  assert.match(job(ci, 'scope'), /bundle: \$\{\{ steps.scope.outputs.bundle/);
  assert.match(job(ci, 'content'), /bundle: \$\{\{ needs.scope.outputs.bundle/);
  for (const name of ['backend', 'pr-light-backend', 'post-merge-smoke']) {
    assert.match(job(name === 'backend' ? source('ci-backend') : ci, name), /run: npx tsx scripts\/bundle-content-check.ts/, name);
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

test('scenario CI uses early artifacts and hosted Ubuntu for every lane', () => {
  const ci=source('ci');
  assert.match(job(ci,'scope'),/runs-on: ubuntu-24\.04/);
  assert.match(job(ci,'merge-gate'),/runs-on: ubuntu-24\.04/);
  for(const name of ['backend','backend-regression','browser','backend-browser-build']) {
    assert.ok(job(ci,name).includes('runner_labels: \'["ubuntu-24.04"]\''));
    assert.match(source('ci-'+name),/runs-on: ubuntu-24\.04/);
  }
  assert.match(job(ci,'frontend-build'),/uses: \.\/\.github\/workflows\/ci-frontend-build\.yml/);
  assert.match(job(ci,'frontend'),/needs: scope/);
  assert.match(job(ci,'browser'),/needs: \[scope, backend, backend-browser-build, frontend-build\]/);
  assert.doesNotMatch(job(ci,'browser'),/needs\.frontend\.result/);
  assert.match(job(ci,'accept-ui'),/runner_labels: '\["ubuntu-24.04"\]'/);
  assert.match(job(ci,'accept-visual'),/engine: \[chromium, firefox, webkit\]/);
  assert.match(job(ci,'accept-media'),/media_selection/);
  for(const name of ['accept-perf','accept-ops','docker']) assert.match(job(ci,name),/needs: scope/);
  assert.match(job(source('ci-images'),'images'),/runs-on: ubuntu-24\.04/);
  assert.match(job(ci,'codeql'),/runs-on: ubuntu-24\.04/);
  const backend=job(source('ci-backend'),'backend'), regression=job(source('ci-backend-regression'),'backend-regression');
  assert.match(regression,/--exclude=src\/__tests__\/questionnaire\/aggregate-report\.postgres\.integration\.test\.ts/);
  assert.match(backend,/run: npm test -- src\/__tests__\/questionnaire\/aggregate-report\.postgres\.integration\.test\.ts/);
  for(const name of ['accept-media','accept-ui','accept-visual','accept-ops']) assert.ok(job(ci,'merge-gate').includes(name));
});
test('visual partition retains three engines and once-only AppShell/QA within the original budget', () => {
  const ci = source('ci');
  for (const name of ['accept-ui', 'probe-ui-mac']) {
    const ui = job(ci, name);
    assert.match(ui, /fail-fast: false/);
    assert.match(ui, /engine:.*chromium.*firefox.*webkit/);
    assert.match(ui, /engine: \$\{\{ matrix\.engine \}\}/);
    for (const flag of ['app_shell', 'qa_round3']) {
      assert.match(ui, new RegExp(flag + ":.*matrix\\.engine == 'chromium'"));
    }
    assert.doesNotMatch(ui, /engine: all/);
  }
  assert.match(job(ci, 'probe-ui-hosted'), /inputs\.step_probe == 'ui-chromium'/);
  const standalone = job(source('visual-canonical-qa'), 'acceptance');
  assert.match(standalone, /engine:.*chromium.*firefox.*webkit/);
  assert.match(standalone, /engine: \$\{\{ matrix\.engine \}\}/);
  assert.match(source('visual-canonical-qa'), /group: visual-canonical-qa-.*inputs\.engine \|\| 'all'/);
  assert.match(job(ci, 'accept-ui'), /runner_labels: '\["ubuntu-24.04"\]'/);
  for (const ui of [job(ci, 'probe-ui-mac'), standalone]) {
    assert.match(ui, /runner_labels: '\["ubuntu-24.04"\]'/);
  }
  assert.match(source('ci-ui'), /timeout-minutes: 20/);
  assert.ok(job(ci, 'merge-gate').includes('accept-ui'));
});

test('frontend route builds only the frontend image but preserves scan, CSP and API evidence', () => {
  const docker=job(source('ci-images'),'images');
  const build=fs.readFileSync(new URL('./build-ci-images.sh',import.meta.url),'utf8');
  assert.match(build,/true\) images=\(frontend\)/);
  assert.match(build,/false\) images=\(backend worker frontend\)/);
  assert.match(build,/docker compose --env-file \/dev\/null build --print/);
  assert.ok(build.indexOf('compose.json" --print') < build.indexOf('ci-image-plan.mjs"'));
  assert.match(build,/ci-image-plan\.mjs.*--verify/);
  assert.ok(build.includes("--pull '--set=*.output=type=docker' --print"));
  assert.doesNotMatch(build,/^docker buildx bake .*--load/m);
  assert.match(docker,/build-ci-images\.sh/);
  assert.match(job(source('ci'),'docker'),/frontend_only:.*frontend == 'true'/);
  assert.match(docker,/FRONTEND_ONLY:/);
  assert.match(docker,/scan frontend image \(high and critical\)/);
  assert.match(docker,/frontend-nginx-static-smoke/);
  const browser=job(source('ci-browser'),'browser');
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
  const browser = job(source('ci-browser'), 'browser');
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
    assert.ok(guard.includes(`ci-artifact.mjs\" verify ${kind}`));
  }
});

test('parent authority has draft unit coverage and non-skipping full integration gates', () => {
  const ci = source('ci');
  assert.match(job(ci, 'pr-light-backend'), /vitest run src\/__tests__\/parent-portal/);
  const regression = job(source('ci-backend-regression'), 'backend-regression');
  assert.match(regression, /MINI_OPERATIONS_TEST_REDIS_URL: redis:\/\/localhost:6379/);
  const release = fs.readFileSync(new URL('../../server-version/scripts/release-verify-local.sh', import.meta.url), 'utf8');
  assert.ok(release.includes('export MINI_OPERATIONS_TEST_REDIS_URL="$REDIS_URL"'));
  assert.ok(release.includes('src/__tests__/integration/miniprogramOperationsHttp.postgres.integration.test.ts'));
  for (const file of ['parentPortal', 'miniprogramParentHttp', 'miniprogramOperationsHttp']) {
    assert.ok(regression.includes('src/__tests__/integration/' + file + '.postgres.integration.test.ts'));
  }
});

test('media probes and grouped execution share scenarios, fresh databases and exact-run artifacts', () => {
  const media=source('ci-media');
  for(const kind of ['backend','frontend']) assert.ok(media.includes(kind+'-dist-${{ github.sha }}'));
  assert.doesNotMatch(media,/\n\s+(run-id|repository|github-token):/);
  assert.match(media,/postgres:/);assert.match(media,/redis:/);
  for(const [name,key] of [['media-2-acceptance','media2'],['media-7-cross-runtime-acceptance','media7'],['situational-video-acceptance','situational_video'],['situational-branching-acceptance','situational_branching'],['assessment-video-core-acceptance','video_core']]) {
    assert.match(source(name),/uses: \.\/\.github\/workflows\/ci-media\.yml/);
    assert.ok(source(name).includes(`selected: '["${key}"]'`));
    const action=fs.readFileSync(new URL('../actions/accept-'+key+'/action.yml',import.meta.url),'utf8');
    assert.match(action,/ci-reset-media-services\.mjs/);assert.match(action,/db:migrate:guarded/);
    assert.ok(action.includes('browser acceptance'));
  }
  assert.match(source('ci-ui'),/frontend-ui-lab-dist-\$\{\{ github\.sha \}\}/);
  assert.match(source('ci-ui'),/verify frontend-ui-lab/);
});

test('frontend compilation and checks are separate while both remain required',()=>{
  const ci=source('ci'),front=job(source('ci-frontend'),'frontend');
  for(const name of ['backend','backend-regression','codeql','frontend-build']) assert.match(job(ci,name),/needs: scope/);
  assert.match(front,/name: lint/);assert.match(front,/name: typecheck/);assert.match(front,/full frontend tests/);
  assert.match(front,/--frontend/);assert.match(front,/3072/);assert.match(front,/mac-ci-cleanup/);
  assert.doesNotMatch(front,/npm ci --ignore-scripts/);
  for(const name of ['backend','backend-browser-build']) assert.match(source('ci-'+name),/cognitive-ci-diagnostics\.sh/);
  assert.match(job(ci,'scope'),/head\.repo\.full_name == github\.repository/);
  const diagnostic=fs.readFileSync(new URL('./cognitive-ci-diagnostics.sh',import.meta.url),'utf8');
  assert.match(diagnostic,/server-version\/frontend[\s\S]*npm ci[\s\S]*server-version\/backend[\s\S]*cognitive:onboarding-check -- --all --json/);
  assert.match(job(source('ci-cognitive-step'),'cognitive'),/cognitive-ci-diagnostics\.sh/);
});

test('manual step probes select one shared component and cannot schedule full CI or CodeQL', () => {
  const ci=source('ci');
  assert.match(ci,/options: \[none, images, cognitive, frontend, backend, backend-regression, assessment-repair, reporting, browser, media, ui, ui-chromium, qa-ui, ops, maintenance, perf\]/);
  for(const name of ['scope','merge-gate']) assert.match(job(ci,name),/inputs\.step_probe == '' \|\| inputs\.step_probe == 'none'/);
  assert.match(job(ci,'probe-images'),/inputs\.step_probe == 'images'/);
  assert.match(job(ci,'probe-images'),/uses: \.\/\.github\/workflows\/ci-images\.yml/);
  assert.match(job(ci,'probe-cognitive'),/inputs\.step_probe == 'cognitive'/);
  assert.match(job(ci,'probe-cognitive'),/uses: \.\/\.github\/workflows\/ci-cognitive-step\.yml/);
  assert.match(job(ci,'probe-frontend'),/inputs\.step_probe == 'frontend'/);
  assert.match(job(ci,'probe-frontend'),/uses: \.\/\.github\/workflows\/ci-frontend\.yml/);
  assert.match(job(ci,'probe-maintenance'),/inputs\.step_probe == 'maintenance'/);
  assert.match(job(ci,'probe-maintenance'),/uses: \.\/\.github\/workflows\/ci-maintenance\.yml/);
  assert.match(source('ci-frontend'),/runs-on: ubuntu-24\.04/);
  for(const name of ['backend','backend-regression','codeql']) assert.match(job(ci,name),/needs: scope/);
});

test('different component probes have independent concurrency groups while same-route updates cancel stale runs', () => {
  const ci=source('ci');
  assert.match(ci,/group:.*inputs\.step_probe \|\| 'none'/);
  assert.match(ci,/group:.*inputs\.step_probe == 'images' && inputs\.probe_frontend_only && 'frontend' \|\| 'all'/);
  assert.match(ci,/cancel-in-progress: true/);
});

test('all versioned jobs are pinned to hosted Ubuntu and cannot accept local runner overrides',()=>{
  const dir=new URL('../workflows/',import.meta.url);
  const files=fs.readdirSync(dir).filter(name=>/\.ya?ml$/.test(name));
  assert.ok(files.length>=26);
  for(const name of files) {
    const text=fs.readFileSync(new URL(name,dir),'utf8');
    assert.doesNotMatch(text,/self-hosted|eduk12-(mac|win)-ci|vars\.CI_(RUNNER_PROFILE|MAC_LIGHT_ENABLED)/,name);
    for(const line of text.split('\n')) {
      if(/^\s*runs-on:/.test(line)) assert.equal(line.trim(),'runs-on: ubuntu-24.04',name);
      if(/^\s*(?:runner_labels|ui_runner_labels): ./.test(line)) assert.match(line,/: '\["ubuntu-24.04"\]'$/,name);
      if(/^\s*(?:default: (local|speed|economy)$|options:.*(?:local|speed|economy)|- (?:local|speed|economy)$)/.test(line)) assert.fail(`${name}: obsolete profile default`);
    }
  }
});

test('hosted CI starts independent checks in parallel and bounds media setup without skipping coverage',()=>{
  const ci=source('ci'),media=source('ci-media');
  for(const name of ['frontend','docker','accept-perf','accept-ops'])
    assert.match(job(ci,name),/needs: scope/);
  assert.match(job(ci,'accept-ui'),/needs: \[scope, frontend-build\]/);
  for(const name of ['backend','backend-regression','frontend','docker','accept-perf','accept-ops','browser','accept-media'])
    assert.ok(job(ci,'merge-gate').includes(name),name);
  assert.match(job(ci,'browser'),/needs: \[scope, backend, backend-browser-build, frontend-build\]/);
  assert.match(job(ci,'accept-media'),/needs: \[scope, backend, backend-browser-build, frontend-build\]/);
  assert.match(media,/browser-npm-\$\{\{ runner\.os \}\}/);
  assert.match(media,/browser-chromium-\$\{\{ runner\.os \}\}/);
  for(const name of ['prepare native Canvas libraries','install backend dependencies',
    'install frontend dependencies','install pinned Chromium and system dependencies',
    'ensure FFmpeg is present','generate Prisma client']) {
    assert.ok(media.includes(name),name);
  }
  for(const command of ['npm ci --prefix server-version/backend','npm ci --prefix server-version/frontend',
    'npx playwright-core install --with-deps chromium','npx prisma generate'])
    assert.ok(media.includes('timeout -k 10s 240s '+command)
      || media.includes('timeout -k 10s 120s '+command),command);
  for(const scenario of ['media2','video_core','media7','situational_video','situational_branching'])
    assert.ok(media.includes(scenario+' independent scenario'),scenario);
  assert.match(media,/ci-artifact\.mjs verify backend/);
  assert.match(media,/ci-artifact\.mjs verify frontend/);
  assert.match(media,/ci-cleanup-services\.sh/);
});

test('test-only UI code runs frontend regression without production/backend builds',()=>{
  const ci=source('ci');
  const frontend=job(ci,'frontend');
  assert.match(frontend,/needs: scope/);
  assert.match(frontend,/scenario == 'frontend-test'/);
  assert.match(frontend,/uses: \.\/\.github\/workflows\/ci-frontend\.yml/);
  assert.match(job(ci,'merge-gate'),/needs: .*frontend/);
  const scope=fs.readFileSync(new URL('./content-scope.mjs',import.meta.url),'utf8');
  const gate=fs.readFileSync(new URL('./merge-gate.mjs',import.meta.url),'utf8');
  assert.match(scope,/frontendTestOnly/);
  assert.match(gate,/scope\.scenario === 'frontend-test'/);
  assert.match(gate,/checks\.push\('frontend'\)/);
});
