import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import {reviewedCandidatePlan, reviewedCandidateTools, validReviewedCandidatePlan} from './reviewed-candidate-scope.mjs';
import {requiredChecks, failedChecks} from './merge-gate.mjs';

const manifest = JSON.parse(readFileSync(new URL('./reviewed-candidate-source.json', import.meta.url)));
const head = 'a'.repeat(40);
const digest = text => createHash('sha1').update(text).digest('hex');
const existingTools = new Set(['.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','docs/release/README.md']);
const entries = () => [
  ...Object.entries({...manifest.files, ...Object.fromEntries(Object.entries({...manifest.frontendPatch.files, ...manifest.testFix.files}).filter(([file]) => !Object.hasOwn(manifest.files, file)))}).map(([file, binding]) => ({file, status:binding.status, oldMode:binding.oldMode, newMode:binding.newMode})),
  ...reviewedCandidateTools.map(file => ({file, status:existingTools.has(file) ? 'M' : 'A', oldMode:existingTools.has(file) ? '100644' : '000000', newMode:'100644'})),
].sort((a, b) => a.file.localeCompare(b.file));
const read = (ref, file) => {
  if (![head, manifest.base, manifest.source.head, manifest.frontendAssemblyReceipt.head].includes(ref)) throw Error('Unexpected ref');
  const assembled = ref === manifest.frontendAssemblyReceipt.head;
  const fix = manifest.testFix.files[file];
  if (fix && ref === head) return fix.after;
  if (fix && (assembled || !Object.hasOwn(manifest.files, file))) return fix.before;
  const patch = manifest.frontendPatch.files[file];
  if (patch && (ref === head || assembled)) return patch.after;
  if (Object.hasOwn(manifest.files, file)) return manifest.files[file][ref === manifest.base ? 'before' : 'after'];
  if (patch) throw Error('New patch path absent in original source/main');
  if (Object.hasOwn(manifest.unchangedConsumers, file)) return manifest.unchangedConsumers[file];
  for (const component of ['frontend','backend'])
    if (file === `server-version/${component}`) return ref === head && component === 'frontend'
      ? manifest.testFix.afterTree : assembled && component === 'frontend'
        ? manifest.frontendPatch.afterTree : manifest.components[component];
  if (file === '' && assembled) return manifest.frontendAssemblyReceipt.tree;
  if (file === '' || file === '.github/scripts/reviewed-candidate-source.json') return digest(file);
  throw Error(`Unexpected object: ${file}`);
};
const plan = () => reviewedCandidatePlan(entries(), manifest.base, head, read);

test('only the complete reviewed source patch plus every exact tool is admitted', () => {
  const admitted = plan();
  assert.ok(admitted);
  assert.equal(admitted.changes.length, 63);
  assert.ok(validReviewedCandidatePlan(admitted));
  assert.deepEqual(admitted.source, manifest.source);
  assert.deepEqual(admitted.components, {...manifest.components, frontend:manifest.testFix.afterTree});
  assert.deepEqual(admitted.frontendPatch, manifest.frontendPatch);
  assert.deepEqual(admitted.testFix, manifest.testFix);
  assert.deepEqual(admitted.frontendAssemblyReceipt, manifest.frontendAssemblyReceipt);
  assert.deepEqual(admitted.raceReceipt, manifest.raceReceipt);
  for (const entry of entries())
    assert.equal(reviewedCandidatePlan(entries().filter(item => item.file !== entry.file), manifest.base, head, read), null, `missing ${entry.file}`);
  assert.equal(reviewedCandidatePlan([...entries(), entries()[0]], manifest.base, head, read), null);
  const unknown = {file:'.github/scripts/unreviewed-executor.mjs', status:'A', oldMode:'000000', newMode:'100644'};
  assert.equal(reviewedCandidatePlan([...entries(), unknown], manifest.base, head, read), null);
  assert.equal(reviewedCandidatePlan([...entries().slice(1), unknown], manifest.base, head, read), null);
});

test('raw diff status and regular modes fail closed for source and tooling entries', () => {
  for (const file of [Object.keys(manifest.files)[0], ...Object.keys(manifest.frontendPatch.files), ...Object.keys(manifest.testFix.files), ...reviewedCandidateTools]) {
    for (const delta of [{status:'D'}, {status:'R100'}, {status:'T'}, {status:'C100'}, {status:'X'},
      {oldMode:'100755'}, {newMode:'100755'}, {newMode:'120000'}, {newMode:'160000'}, {newMode:'000000'}]) {
      const changed = entries().map(entry => entry.file === file ? {...entry, ...delta} : entry);
      assert.equal(reviewedCandidatePlan(changed, manifest.base, head, read), null, `${file}: ${JSON.stringify(delta)}`);
    }
  }
});

test('every original source before/after blob, both complete component trees and unchanged consumers are bound', () => {
  for (const [file, binding] of Object.entries(manifest.files)) {
    for (const ref of [head, manifest.source.head, manifest.frontendAssemblyReceipt.head, ...(binding.before === null ? [] : [manifest.base])]) {
      const altered = (r, f) => r === ref && f === file ? 'f'.repeat(40) : read(r, f);
      assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, altered), null, `${ref}:${file}`);
    }
  }
  for (const component of ['frontend','backend']) {
    const file = `server-version/${component}`;
    assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, (r, f) => f === file ? 'f'.repeat(40) : read(r, f)), null);
  }
  for (const file of Object.keys(manifest.unchangedConsumers)) for (const ref of [manifest.base, head])
    assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, (r, f) => r === ref && f === file ? 'f'.repeat(40) : read(r, f)), null);
  for (const base of ['HEAD','b'.repeat(40),'',null]) assert.equal(reviewedCandidatePlan(entries(), base, head, read), null);
  for (const badHead of ['HEAD','',null]) assert.equal(reviewedCandidatePlan(entries(), manifest.base, badHead, read), null);
  assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, () => {throw Error('missing Git object');}), null);
});

test('the exact frontend overlay rejects stale blobs, old frontend trees and unexpected new paths', () => {
  const files = Object.keys(manifest.frontendPatch.files);
  assert.deepEqual(files.sort(), ['server-version/frontend/src/pages/ScaleEdit.css', 'server-version/frontend/src/pages/ScaleEdit.tsx']);
  for (const [file, binding] of Object.entries(manifest.frontendPatch.files)) {
    const stale = (r, f) => r === head && f === file ? (binding.before ?? 'f'.repeat(40)) : read(r, f);
    assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, stale), null);
    if (binding.before === null) for (const ref of [manifest.base, manifest.source.head]) {
      const unexpected = (r, f) => r === ref && f === file ? binding.after : read(r, f);
      assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, unexpected), null);
    }
  }
  const oldTree = (r, f) => r === head && f === 'server-version/frontend' ? manifest.components.frontend : read(r, f);
  assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, oldTree), null);
  const css = entries().find(x => x.file.endsWith('/ScaleEdit.css'));
  assert.equal(reviewedCandidatePlan(entries().map(x => x.file === css.file ? {...x, file:'server-version/frontend/src/pages/Global.css'} : x), manifest.base, head, read), null);
  for (const key of ['frontendPatch','testFix','frontendAssemblyReceipt','raceReceipt']) {
    const changed = structuredClone(plan()); changed[key] = {};
    assert.equal(validReviewedCandidatePlan(changed), false);
  }
});

test('the two exact test fixes preserve the assembled product and bind every source, base and current test blob', () => {
  assert.deepEqual(Object.keys(manifest.testFix.files).sort(), [
    'server-version/e2e/visual-interaction-states-browser-e2e.cjs',
    'server-version/frontend/src/pages/__tests__/TrainingTaskDeepLinks.test.tsx',
  ]);
  assert.equal(manifest.testFix.beforeTree, manifest.frontendPatch.afterTree);
  assert.notEqual(manifest.testFix.afterTree, manifest.testFix.beforeTree);
  assert.equal(manifest.frontendAssemblyReceipt.componentTree, manifest.frontendPatch.afterTree);
  for (const [file, binding] of Object.entries(manifest.testFix.files)) {
    assert.equal(binding.status, 'M');
    assert.equal(binding.oldMode, '100644');
    assert.equal(binding.newMode, '100644');
    const sourceEntry = manifest.files[file];
    assert.equal(entries().find(entry => entry.file === file).status, sourceEntry?.status ?? 'M');
    for (const ref of [head, manifest.source.head, manifest.frontendAssemblyReceipt.head,
      ...(!sourceEntry ? [manifest.base] : [])]) {
      const altered = (r, f) => r === ref && f === file ? 'f'.repeat(40) : read(r, f);
      assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, altered), null, `${ref}:${file}`);
    }
    const stale = (r, f) => r === head && f === file ? binding.before : read(r, f);
    assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, stale), null);
    const substituted = entries().map(entry => entry.file === file ? {...entry, file:`${file}.unreviewed`} : entry);
    assert.equal(reviewedCandidatePlan(substituted, manifest.base, head, read), null);
  }
  for (const file of ['', 'server-version/frontend', 'server-version/backend']) {
    const altered = (r, f) => r === manifest.frontendAssemblyReceipt.head && f === file ? 'f'.repeat(40) : read(r, f);
    assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, altered), null, `assembled ${file}`);
  }
  const staleTree = (r, f) => r === head && f === 'server-version/frontend' ? manifest.frontendPatch.afterTree : read(r, f);
  assert.equal(reviewedCandidatePlan(entries(), manifest.base, head, staleTree), null);
});

test('original 49-file receipts, images and reports remain an unchanged baseline', () => {
  const keys = ["schema", "repository", "base", "source", "required", "components", "files", "unchangedConsumers", "images", "reportDigests"];
  const baseline = Object.fromEntries(keys.map(key => [key, manifest[key]]));
  assert.equal(Object.keys(manifest.files).length, 49);
  assert.equal(createHash('sha256').update(JSON.stringify(baseline)).digest('hex'), '9a568c34521482a27cefa3c831ee61e6b9be5db5ab1590f2149292f9a315de55');
  assert.equal(manifest.raceReceipt.run, 39054194991);
  assert.equal(manifest.raceReceipt.job.id, 117458745733);
  assert.equal(manifest.raceReceipt.artifact.id, 12109046588);
  assert.deepEqual(Object.keys(manifest.raceReceipt.reportDigests).sort(), ['official-admission.json','race-verification.json','recovery-bootstrap.json','scale-race.json']);
  assert.equal(manifest.raceReceipt.backendTree, manifest.components.backend);
  assert.deepEqual(Object.keys(manifest.raceReceipt.functionHashes).sort(), ['container','probe','runtime_environment','wait_api','wait_services']);
  assert.equal(manifest.frontendAssemblyReceipt.run, 39076589264);
  assert.equal(manifest.frontendAssemblyReceipt.head, '1ffb8eeb02fac5bf2969f8536cffe8837ceda18e');
  assert.equal(manifest.frontendAssemblyReceipt.artifact.id, 12117506265);
});

const falseFlags = ['maintenance','content','presentation','frontend','frontend_test','documentation','frontend_build','ui_required','visual_hosted',
  'media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'];
const fixture = () => ({
  scope:{result:'success', outputs:{application_route:'reviewed-candidate', scenario:'reviewed-candidate',
    reviewed_candidate_plan:JSON.stringify(plan()), codeql:'true', runner_profile:'hosted', media_selection:'[]', media_groups:'[]',
    ...Object.fromEntries(falseFlags.map(key => [key, 'false']))}},
  'reviewed-candidate':{result:'success'}, codeql:{result:'success'},
});

test('the stable gate requires actual success of scope, every selected reusable job and SAST; drafts cannot merge', () => {
  assert.deepEqual(requiredChecks(fixture(), false), ['scope','reviewed-candidate','codeql']);
  assert.deepEqual(failedChecks(fixture(), false), []);
  assert.ok(failedChecks(fixture(), true).includes('scope'));
  for (const job of ['scope','reviewed-candidate','codeql']) {
    for (const result of ['failure','cancelled','skipped','neutral',undefined]) {
      const needs = fixture(); needs[job].result = result;
      assert.ok(failedChecks(needs, false).includes(job), `${job}: ${result}`);
    }
    const needs = fixture(); delete needs[job];
    assert.ok(failedChecks(needs, false).includes(job), `missing ${job}`);
  }
});

test('flags, receipt bindings and incomplete plans cannot turn missing evidence green', () => {
  for (const key of [...falseFlags,'codeql','runner_profile','scenario','media_selection','media_groups']) {
    const needs = fixture(); needs.scope.outputs[key] = 'unexpected';
    assert.ok(failedChecks(needs, false).includes('scope'), key);
  }
  for (const value of ['{', '{}', 'null']) {
    const needs = fixture(); needs.scope.outputs.reviewed_candidate_plan = value;
    assert.ok(failedChecks(needs, false).includes('scope'));
  }
  for (const key of ['schema','route','base','head','tree','manifestBlob','source','components','frontendPatch','testFix','frontendAssemblyReceipt','raceReceipt','changed','required','changes']) {
    const needs = fixture(), changed = plan(); delete changed[key];
    needs.scope.outputs.reviewed_candidate_plan = JSON.stringify(changed);
    assert.ok(failedChecks(needs, false).includes('scope'), key);
  }
  const needs = fixture(), changed = plan(); changed.source = {...changed.source, run:changed.source.run + 1};
  needs.scope.outputs.reviewed_candidate_plan = JSON.stringify(changed);
  assert.ok(failedChecks(needs, false).includes('scope'));
});

const workflow = name => readFileSync(new URL(`../workflows/${name}.yml`, import.meta.url), 'utf8');
const job = (text, name) => text.split(`  ${name}:\n`)[1]?.split(/\n  [a-z][a-z0-9-]*:\n/)[0] ?? '';
test('workflow admits the exact assembly, runs missing checks and requires every selected browser scope', () => {
  const text = workflow('ci-reviewed-candidate');
  for (const required of ['action: [browser, race, interaction-chromium, interaction-firefox, interaction-webkit]','fail-fast: false','ubuntu-24.04','timeout-minutes: 15','timeout-minutes: 20',"CI: 'true'",'sleep 300',
    'fetch-depth: 0','persist-credentials: false',"node-version: '24.21.0'",'github.event.pull_request.head.sha',
    'github.event.pull_request.base.sha','github.event.pull_request.number','https://registry.npmjs.org','NPM_CONFIG_REPLACE_REGISTRY_HOST: always',
    'npm ci --ignore-scripts --prefix .github/release-tools','playwright-core/cli.js install --with-deps "$engine"',
    'python3 -B .github/scripts/reviewed-candidate-admission.py "$PROBE_ACTION"','reviewed-candidate-evidence/*.json',
    'reviewed-candidate-evidence/screenshots/*.png','reviewed-candidate-evidence/interaction-*/interaction-states/qa.json',
    'reviewed-candidate-evidence/interaction-*/interaction-states/*.png','github.run_id','github.run_attempt','if-no-files-found: error']) assert.ok(text.includes(required), required);
  assert.doesNotMatch(text, /secrets: inherit|self-hosted|continue-on-error|npm (?:run build|test)|working-directory: server-version/);
  assert.doesNotMatch(text, /CURRENT_FRONTEND_ARTIFACT|reviewed-current-frontend|frontend-runtime\.tar|outputs:/);
  const producer = job(text, 'frontend'), consumers = job(text, 'verify');
  assert.match(producer, /name: admitted frontend \/ missing types contracts and scan/);
  assert.match(producer, /reviewed-candidate-admission\.py frontend/);
  assert.match(producer, /path: reviewed-candidate-evidence\/\*\.json/);
  assert.match(consumers, /needs: \[frontend\]/);
  assert.doesNotMatch(consumers, /uses: actions\/download-artifact/);
  assert.match(consumers, /browser\) engine=chromium/);
  assert.match(consumers, /interaction-chromium\|interaction-firefox\|interaction-webkit\) engine="\$\{PROBE_ACTION#interaction-\}"/);
  assert.match(consumers, /race\) engine= ;;/);
  const admission = readFileSync(new URL('./reviewed-candidate-admission.py', import.meta.url), 'utf8');
  assert.match(admission, /receipt = M\['frontendAssemblyReceipt'\]/);
  assert.match(admission, /directory = download\(receipt\['artifact'\], \['frontend-runtime.json', 'frontend-runtime.tar.zst'\]\)/);
  assert.match(admission, /require_current_frontend_qualification\(\)/);
  assert.doesNotMatch(admission, /\['docker', 'build'|\['npm', 'run', '(?:build|lint)'/);
  const qualification = admission.split('def qualify_frontend(')[1]?.split('\ndef require_current_frontend_qualification(')[0] ?? '';
  assert.match(qualification, /\['npm', 'ci', '--prefix', str\(frontend\)\]/);
  assert.match(qualification, /node_modules\/typescript\/bin\/tsc', '-p', 'tsconfig.app.json', '--noEmit'/);
  assert.match(qualification, /selected = \['src\/pages\/__tests__\/ScaleEdit.readonly.test.tsx', 'src\/pages\/__tests__\/TrainingTaskDeepLinks.test.tsx'\]/);
  assert.match(qualification, /node_modules\/vitest\/vitest.mjs', 'run', '--maxWorkers=2', \*selected/);
  assert.match(qualification, /'trivy', 'image', '--exit-code', '1'/);
  assert.match(qualification, /'--severity', 'HIGH,CRITICAL'/);
  assert.doesNotMatch(consumers, /frontend-runtime\.tar|setup-trivy|reviewed-candidate-admission\.py frontend/);
  const original = workflow('ci-shared-assessment-foundation');
  const trivy = /uses: aquasecurity\/setup-trivy@[a-f0-9]+\n        with:\n          version: v[0-9.]+\n          cache: false/;
  assert.equal(producer.match(trivy)?.[0], original.match(trivy)?.[0]);
  const lock = JSON.parse(readFileSync(new URL('../release-tools/package-lock.json', import.meta.url)));
  assert.equal(lock.packages['node_modules/playwright-core'].version, '1.62.1');
});

test('browser reports original assembly identity separately from the current test-only checkout', () => {
  const browser = readFileSync(new URL('./reviewed-candidate-browser.mjs', import.meta.url), 'utf8');
  assert.match(browser, /assert.equal\(report.sourceSha, SOURCE, 'baseline/);
  assert.match(browser, /assert.equal\(report.imageId, IMAGE, 'baseline/);
  assert.match(browser, /assert.equal\(report.sourceSha, assembly.head/);
  assert.match(browser, /assert.equal\(report.imageId, assembly.imageId/);
  assert.match(browser, /assert.equal\(assembly.componentTree, MANIFEST.frontendPatch.afterTree/);
  assert.match(browser, /assert.equal\(frontendTree\(checkoutSha\), MANIFEST.testFix.afterTree/);
  assert.match(browser, /report.runtimeBuiltForCurrentHead = report.sourceSha === report.currentHead/);
  assert.doesNotMatch(browser, /assert.equal\(report.sourceSha, report.currentHead/);
});

test('main wiring preserves legacy routes and limits new PR work to contracts, probes and tool SAST', () => {
  const main = workflow('ci');
  const call = job(main, 'reviewed-candidate');
  assert.match(call, /github.event_name == 'pull_request' && github.event.pull_request.draft == false/);
  assert.match(call, /needs.scope.outputs.application_route == 'reviewed-candidate'/);
  assert.match(call, /uses: \.\/\.github\/workflows\/ci-reviewed-candidate.yml/);
  assert.match(job(main, 'merge-gate'), /name: merge gate \/ ready PR/);
  assert.match(job(main, 'merge-gate'), /needs: \[.*reviewed-candidate/);
  assert.match(job(main, 'scope'), /application_route == 'reviewed-candidate' && github.event_name == 'pull_request'/);
  const classification = job(main, 'scope');
  assert.match(classification, /git fetch --no-tags --depth=1 origin 1b388507c5eaaada29bbb3d6a0eb7bb7589ad46c/);
  assert.match(classification, /1b388507c5eaaada29bbb3d6a0eb7bb7589ad46c\^\{tree\}/);
  assert.match(classification, /8bebe1e6111eb08030af65df9f2bd25691b685e4/);
  assert.match(classification, /git fetch --no-tags --depth=1 origin 1ffb8eeb02fac5bf2969f8536cffe8837ceda18e/);
  assert.match(classification, /1ffb8eeb02fac5bf2969f8536cffe8837ceda18e\^\{tree\}/);
  assert.match(classification, /4402bab18001d7307399016d7cd81b072ffc65e7/);
  assert.match(classification, /CI_REVIEWED_CANDIDATE_REQUIRED: .*head.ref == 'fix\/shared-assessment-foundation-merge-20261017'/);
  const scopeScript = readFileSync(new URL('./content-scope.mjs', import.meta.url), 'utf8');
  assert.match(scopeScript, /process.env.CI_REVIEWED_CANDIDATE_REQUIRED === 'true' && !reviewedCandidate/);
  assert.match(scopeScript, /throw new Error\('Known reviewed candidate/);
  assert.match(job(main, 'scope'), /node --test \.github\/scripts\/reviewed-candidate-scope.test.mjs/);
  assert.match(job(main, 'scope'), /python3 -B \.github\/scripts\/reviewed-candidate-admission.test.py/);
  for (const name of ['backend','backend-regression','frontend','frontend-build','browser','docker','accept-ui','accept-media','accept-ops','accept-perf'])
    assert.match(job(main, name), /needs.scope.outputs.application_route == 'legacy'/, name);
  const codeql = job(main, 'codeql');
  assert.match(codeql, /application_route == 'reviewed-candidate'/);
  assert.match(codeql, /"reviewed-candidate".*javascript-typescript,python/);
  const paths = codeql.split("application_route == 'reviewed-candidate' && 'paths: [")[1]?.split(']')[0];
  assert.equal(paths, '.github/scripts, server-version/frontend/src/pages, server-version/e2e');
  for (const directory of paths.split(', '))
    assert.ok(statSync(new URL('../../' + directory, import.meta.url)).isDirectory());
  const gate = readFileSync(new URL('./merge-gate.mjs', import.meta.url), 'utf8');
  const recompute = gate.split("if (needs.scope?.outputs?.application_route === 'reviewed-candidate')")[1]?.split("if(needs.scope?.outputs?.application_route==='survey-candidate')")[0];
  assert.match(recompute, /execFileSync\('git', \['rev-parse','HEAD'\]/);
  assert.match(recompute, /plan.head !== head/);
  assert.match(recompute, /reviewedCandidatePlan\(changedEntries\(plan.base, head\), plan.base, head\)/);
});
