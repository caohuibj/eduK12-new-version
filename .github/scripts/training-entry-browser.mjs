// Actual compiled Training UI only. No Vite dev server, backend, DB or real account.
// Prepare once with the repository's existing pinned tools (official npm/browser sources):
// npm ci --ignore-scripts --prefix .github/release-tools
// google-chrome --version (official Chrome already present on ubuntu-24.04 hosted runner)
// FRONTEND_DIST=server-version/frontend/dist node .github/scripts/training-entry-browser.mjs
// The caller supplies the already-built candidate dist; this script never builds it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(process.env.FRONTEND_DIST || resolve(root, 'server-version/frontend/dist'));
const evidence = resolve(process.env.TRAINING_ENTRY_EVIDENCE || resolve(root, 'training-entry-evidence'));
const require = createRequire(new URL('../release-tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const playwrightVersion = require('playwright-core/package.json').version;
assert.equal(playwrightVersion, require('./package.json').dependencies['playwright-core']);
const origin = 'https://training.eduk12.top';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const componentFiles = execFileSync('git', ['ls-files', '-z', '--', 'server-version/frontend'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
const componentManifest = await Promise.all(componentFiles.map(async path => {
  const bytes = await readFile(resolve(root, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}));
const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter(file => file.isFile()).map(file => resolve(file.parentPath, file.name)).sort();
assert.ok(files.includes(resolve(dist, 'index.html')), 'Actual dist/index.html is required');
const manifest = await Promise.all(files.map(async file => {
  const bytes = await readFile(file);
  return { path: relative(dist, file).split(sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) };
}));
const chunk = name => {
  const matches = manifest.filter(file => new RegExp(`^assets/${name}-[^/]+\\.js$`).test(file.path));
  assert.equal(matches.length, 1, `Expected one separate ${name} chunk, not a silent coverage skip`);
  return '/' + matches[0].path;
};
// Verify the named split points exist, so "no request" cannot pass vacuously.
const managementChunks = ['SurveyAdminShell', 'EducationAdminShell', 'OrganizationProductRoutes'].map(chunk);
const exportChunk = chunk('AssessmentDataExport');
await mkdir(evidence, { recursive: true });
await writeFile(resolve(evidence, 'dist-manifest.json'), JSON.stringify(manifest, null, 2));
await writeFile(resolve(evidence, 'component-source-manifest.json'), JSON.stringify(componentManifest, null, 2));

const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(dist, '.' + path);
    assert.ok(file === dist || file.startsWith(dist + sep), 'Static path escaped dist');
    try { assert.ok((await stat(file)).isFile()); }
    catch { if (extname(path)) { response.writeHead(404).end(); return; } file = resolve(dist, 'index.html'); }
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(file));
  } catch { response.writeHead(400).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const local = `http://127.0.0.1:${server.address().port}`;
const teacher = { id: 'synthetic-teacher', username: 'synthetic-teacher', nickname: '合成培训师', role: 'TEACHER', platformRole: 'STANDARD', mustChangePassword: false };
const learner = { ...teacher, id: 'synthetic-learner', username: 'synthetic-learner', nickname: '合成学员', role: 'STUDENT' };
const course = { id: 'course', title: '合成 Training 课程', creatorId: teacher.id, courseCode: 'SYNTHETIC', status: 'PUBLISHED', studentCount: 51, description: '' };
const task = id => ({ id, title: `合成任务 ${id}`, courseId: course.id, course, status: 'PUBLISHED', description: '仅供浏览器合成验收', content: '<p>合成任务说明</p><script>window.syntheticInjection=true</script><strong onclick="window.syntheticInjection=true">安全文字</strong>', questions: [], images: [], videos: [], documents: [], tags: [], allowViewOthers: false, mySubmission: null, _count: { submissions: 51 } });
const catalogQuery = 'page=1&pageSize=20&search=&tags=&dateField=created';
const nextCursor = 'next+cursor/with=padding';
const nextQuery = '?cursor=' + encodeURIComponent(nextCursor);
const submission = (id, status = 'SUBMITTED') => ({ id, revision: 2, studentId: id, student: { id, username: id }, status, content: `合成答案 ${id}`, submittedAt: '2026-10-01T00:00:00.000Z' });
const reviewPage = (second = false) => ({ list: second ? [submission('page-two')] : [submission('page-one'), submission('already-graded', 'GRADED')], total: 51, gradedCount: 1, ungradedCount: 50, nextCursor: second ? null : nextCursor });
const snapshot = (scope = 'all-ungraded') => ({ selectionId: scope, count: scope === 'page' ? 1 : 50, expiresAt: '2099-01-01T00:15:00Z', chunks: scope === 'page' ? ['page-proof'] : ['chunk-zero', 'chunk-one'] });
const requiredScenarios = [
  ...['survey', 'huischool', 'huiteacher'].flatMap(entry => ['granted', 'no-grant', 'anonymous'].map(access => `management-${entry}-${access}`)),
  'organization-entry-authenticated', 'organization-entry-anonymous', 'entry-login-1440', 'entry-login-390',
  ...['assignments', 'checkins'].flatMap(kind => ['detail', 'submit'].flatMap(phase => ['success', 'failure'].map(outcome => `learner-${kind}-${phase}-${outcome}`))),
  'checkin-late-upload', 'teacher-assignments-lazy-courses', 'teacher-checkins-lazy-courses',
  'assignment-review-paging-batch-download', 'assessment-deferred-export-retry',
];
const report = {
  status: 'RUNNING', startedAt: new Date().toISOString(), syntheticOnly: true, physicalBrowser: false, browserChannel: 'chrome', chromiumSandbox: true, playwrightVersion, nodeVersion: process.version,
  command: { argv: [process.execPath, ...process.argv.slice(1)], cwd: process.cwd(), dist, evidence },
  sourceSha: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'), githubSha: process.env.GITHUB_SHA || null,
  frontendGitTree: git('rev-parse', 'HEAD:server-version/frontend'), componentSourceManifestSha256: sha256(JSON.stringify(componentManifest)),
  harnessSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  distManifestSha256: sha256(JSON.stringify(manifest)), requiredScenarios, scenarios: [],
  limitations: [
    'Chromium synthetic UI contracts only; not backend authorization, database, production, native Safari or a quantitative performance benchmark.',
    'Management coverage is limited to actual lazy Survey/School/Teacher frame mounting, anonymous/no-grant boundaries and the Organization entry; no full management workflow, security-key/MFA operation or authority proof.',
    'Learner races use real course links and same-document browser history through unmount/remount. Same-mounted route-param swaps, raw legacy-answer fallback and sanitizer/media invocation counts remain targeted unit-test coverage.',
    'Teacher authoring opens and retries course choices but does not publish content. Review/export mutations reach synthetic routes only.',
    'Public entry/login is checked at 1440px and 390px; detailed learner/review/export journeys run at 1440px, not a full responsive or accessibility audit.',
  ],
};
let browser;
const deadline = setTimeout(() => { report.status = 'TIMEOUT'; void writeReport(); server.closeAllConnections(); server.close(); void browser?.close(); process.exitCode = 1; }, 240_000);
async function writeReport() {
  report.notExecuted = requiredScenarios.filter(name => !report.scenarios.some(scenario => scenario.name === name));
  await writeFile(resolve(evidence, 'browser.json'), JSON.stringify(report, null, 2));
}
const tick = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

async function scenario(name, identity, run, width = 1440, expectedManagement = []) {
  const result = { name, width, startedAt: new Date().toISOString(), status: 'RUNNING', checks: [], requests: [], assets: [], expectedFailures: [], unexpected: [], errors: [], consoleErrors: [], dialogs: [], downloads: [] };
  report.scenarios.push(result);
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 1000 }, locale: 'zh-CN', timezoneId: 'UTC', acceptDownloads: true });
  await context.addCookies([{ name: 'ptool_csrf', value: 'synthetic-csrf', url: origin, secure: true, sameSite: 'Strict' }]);
  const page = await context.newPage();
  page.setDefaultTimeout(12_000); page.setDefaultNavigationTimeout(20_000);
  const handlers = new Map(), holds = [], expectedFailures = new Set();
  let chunkHandler, activeIdentity = identity;
  const expectFailure = url => { expectedFailures.add(url); result.expectedFailures.push(url); };
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push({ text: message.text(), url: message.location().url }); });
  page.on('dialog', async dialog => { result.dialogs.push(dialog.message()); await dialog.dismiss(); });
  page.on('download', download => result.downloads.push(download.suggestedFilename()));
  page.on('requestfailed', request => { if (!expectedFailures.has(request.url())) result.unexpected.push(`Request failed: ${request.method()} ${request.url()} ${request.failure()?.errorText}`); });
  await context.routeWebSocket('**/*', socket => { result.unexpected.push(`Unexpected WebSocket: ${socket.url()}`); socket.close(); });
  const on = (key, handler) => { assert.ok(!handlers.has(key), `Duplicate fixture ${key}`); handlers.set(key, handler); };
  const json = (data, code = 0, message = '') => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ code, data, message }) });
  const hold = () => {
    let release, observed;
    const observedRequest = new Promise(done => { observed = done; });
    const response = new Promise(done => { release = done; });
    const value = {
      get received() { return new Promise((done, reject) => {
        const timer = setTimeout(() => reject(Error('Expected held synthetic request was not issued within 12 seconds')), 12_000);
        observedRequest.then(request => { clearTimeout(timer); done(request); });
      }); },
      release, respond: async request => { observed(request); return response; },
    };
    holds.push(value); return value;
  };
  on('GET /api/auth/me', () => activeIdentity ? json(activeIdentity) : { ...json(null, 401, '请先登录'), status: 401 });
  on('GET /api/auth/csrf', () => json({ csrfToken: 'synthetic-csrf' }));
  on('GET /api/capabilities', () => json({ cognitive: false, parentPortal: false }));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    try {
      if (url.origin !== origin) throw Error(`Unexpected origin ${url.origin}`);
      if (url.pathname.startsWith('/api/')) {
        const key = `${request.method()} ${url.pathname}${url.search}`;
        let body = null;
        if (request.postData() && /application\/json/i.test(request.headers()['content-type'] || '')) body = request.postDataJSON();
        result.requests.push({ key, body, idempotencyKey: request.headers()['idempotency-key'] || null, exportRequestKey: request.headers()['x-export-request-key'] || null });
        const handler = handlers.get(key);
        if (!handler) throw Error(`Unmocked API ${key}`);
        const response = await handler({ request, body, json });
        assert.ok(response, `No response fixture for ${key}`);
        if (response.status >= 400) expectFailure(request.url());
        return await route.fulfill(response);
      }
      assert.equal(request.method(), 'GET', 'Static requests must be GET');
      result.assets.push(url.pathname);
      if (chunkHandler && await chunkHandler(route, url)) return;
      const response = await fetch(local + url.pathname + url.search, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200, `Static ${response.status}: ${url.pathname}`);
      return await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await response.arrayBuffer()) });
    } catch (error) {
      result.unexpected.push(String(error));
      await route.abort().catch(() => {});
    }
  });
  const count = key => result.requests.filter(request => request.key === key).length;
  const proof = async label => {
    await tick(page);
    assert.deepEqual(result.unexpected, [], 'Unmocked or failed network');
    assert.deepEqual(result.errors, [], 'Unexpected browser exception');
    const unexpectedConsole = result.consoleErrors.filter(error => !expectedFailures.has(error.url) || !/^Failed to load resource:/.test(error.text));
    assert.deepEqual(unexpectedConsole, [], 'Unexpected browser console error');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: viewport overflow`);
    assert.deepEqual(result.assets.filter(path => managementChunks.includes(path) && !expectedManagement.includes(path)), [], 'Wrong management frame loaded');
    const screenshot = `${name}-${label}.png`;
    await page.screenshot({ path: resolve(evidence, screenshot), fullPage: true });
    result.checks.push({ label, screenshot });
  };
  try {
    await run({ page, context, result, on, json, hold, count, proof, setIdentity: value => { activeIdentity = value; }, setChunkHandler: handler => { chunkHandler = handler; }, expectFailure });
    await page.waitForLoadState('networkidle');
    await proof('finished');
    assert.deepEqual([...new Set(result.assets.filter(path => managementChunks.includes(path)))].sort(), [...expectedManagement].sort(), 'Expected management split point was not loaded');
    assert.deepEqual(result.dialogs, [], 'Unexpected browser dialog (including stale submission success)');
    assert.ok(result.checks.length >= 1, 'Empty scenario cannot pass');
    result.status = 'PASS';
    console.log(`PASS ${name}`);
  } catch (error) {
    result.status = 'FAIL'; result.failure = error.stack || String(error);
    if (!page.isClosed()) {
      result.url = page.url();
      await page.screenshot({ path: resolve(evidence, `${name}-failure.png`), fullPage: true }).catch(() => {});
    }
    throw error;
  } finally {
    // Always settle deliberately held requests; do not leave browser cleanup hanging.
    for (const pending of holds) pending.release(json(null, -1, 'Harness cleanup'));
    await context.close();
    result.finishedAt = new Date().toISOString();
    await writeReport();
  }
}

try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
  report.browserVersion = browser.version();

  // These mount only the changed management presentation boundaries, on the
  // same intercepted Training origin. No credentials, grants or product data change.
  const frames = [
    { entry: 'SURVEY', path: '/admin/survey-researchers', chunk: managementChunks[0], selector: '.survey-admin-frame', title: '研究者与授权', loginTitle: '管理员登录' },
    { entry: 'HUISCHOOL', path: '/admin/huischool', chunk: managementChunks[1], selector: '.education-admin-shell[data-product="School"]', title: '校园心理健康产品治理', loginTitle: 'School 管理员登录' },
    { entry: 'HUITEACHER', path: '/admin/huiteacher', chunk: managementChunks[1], selector: '.education-admin-shell[data-product="Teacher"]', title: '教师发展与学校改进治理', loginTitle: 'Teacher 管理员登录' },
  ];
  for (const frame of frames) for (const access of ['granted', 'no-grant', 'anonymous']) {
    const identity = access === 'anonymous' ? null : access === 'granted' ? { ...teacher, entryGrants: [{ entry: frame.entry }] } : teacher;
    await scenario(`management-${frame.entry.toLowerCase()}-${access}`, identity, async ({ page, on, json, result, proof }) => {
      if (access === 'granted' && frame.entry === 'SURVEY') {
        on('GET /api/platform/survey/researchers?page=1', () => json({ list: [] }));
        on('GET /api/platform/survey/researcher-invitations?page=1', () => json({ list: [] }));
      }
      await page.goto(origin + frame.path);
      if (access === 'granted') {
        await page.locator(frame.selector).waitFor();
        await page.getByRole('heading', { name: frame.title, exact: true }).waitFor();
        assert.equal(await page.locator('#hui-main').count(), 1, 'Lazy frame duplicated its main landmark');
        assert.equal(await page.getByRole('button', { name: '退出登录', exact: true }).isVisible(), true);
        if (frame.entry === 'SURVEY') {
          await page.getByText('暂无可见研究者。', { exact: true }).waitFor();
          const nav = page.getByRole('navigation', { name: '主要导航', exact: true });
          assert.equal(await nav.getByRole('link', { name: '研究者与授权', exact: true }).getAttribute('aria-current'), 'page');
        } else {
          assert.equal(await page.getByRole('button', { name: '查询学校产品授权', exact: true }).isDisabled(), true);
        }
      } else if (access === 'no-grant') {
        await page.getByText('当前账号没有此入口的管理权限', { exact: true }).waitFor();
        assert.equal(await page.locator(frame.selector).count(), 0, 'Ungrantable management frame mounted');
      } else {
        await page.getByRole('heading', { name: frame.loginTitle, exact: true }).waitFor();
        assert.equal(new URL(page.url()).pathname, '/admin/login');
        assert.equal(new URL(page.url()).searchParams.get('returnTo'), frame.path);
        assert.equal(await page.getByLabel('管理员账号', { exact: true }).isVisible(), true);
      }
      assert.ok(result.requests.every(request => request.key.startsWith('GET ')), 'Frame mount caused a write');
      if (access !== 'granted') assert.equal(result.requests.some(request => request.key.startsWith('GET /api/platform/')), false, 'Denied entry fetched management data');
      await proof('access-boundary');
    }, 1440, access === 'granted' ? [frame.chunk] : []);
  }
  for (const identity of [teacher, null]) await scenario(`organization-entry-${identity ? 'authenticated' : 'anonymous'}`, identity, async ({ page, on, json, proof, result }) => {
    if (identity) for (const size of [24, 100]) on(`GET /api/organizations?page=1&pageSize=${size}`, () => json({ list: [], total: 0, page: 1, pageSize: size, platformRole: 'STANDARD', allowedActions: [] }));
    await page.goto(origin + '/organizations');
    await page.getByText(identity ? '暂无可访问组织' : '需要登录', { exact: true }).waitFor();
    assert.equal(await page.locator('#hui-main').count(), 1);
    assert.ok(result.requests.every(request => request.key.startsWith('GET ')));
    if (!identity) assert.equal(result.requests.some(request => request.key.includes('/api/organizations')), false);
    await proof('organization-boundary');
  }, 1440, [managementChunks[2]]);

  for (const width of [1440, 390]) await scenario(`entry-login-${width}`, null, async ({ page, on, json, count, proof, result, setIdentity }) => {
    let attempts = 0;
    on('POST /api/auth/training-login', ({ body, request }) => {
      assert.deepEqual(body, { username: 'synthetic-learner', password: 'not-a-real-password' });
      assert.equal(request.headers()['x-csrf-token'], 'synthetic-csrf');
      attempts++;
      if (attempts > 1) setIdentity(learner);
      return attempts === 1 ? json(null, -1, '合成登录拒绝') : json({ user: learner });
    });
    on('GET /api/courses/course', () => json(course));
    on('GET /api/courses/course/assignments', () => json({ list: [task('one'), task('two')] }));
    await page.goto(origin + '/?returnTo=' + encodeURIComponent('/student/courses/course?section=assignments'));
    await page.locator('#training-title').waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(result.assets.includes(exportChunk), false);
    assert.equal(result.requests.some(request => /organizations|relational/.test(request.key)), false);
    await proof('public');
    await page.getByRole('navigation', { name: 'Training 入口导航' }).getByRole('link', { name: '登录', exact: true }).click();
    await page.getByRole('heading', { name: '登录 Huitraining', exact: true }).waitFor();
    await page.getByLabel('用户名', { exact: true }).fill('synthetic-learner');
    await page.getByLabel('密码', { exact: true }).fill('not-a-real-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '合成登录拒绝' }).waitFor();
    assert.equal(count('POST /api/auth/training-login'), 1);
    assert.equal(new URL(page.url()).pathname, '/login');
    await proof('login-rejected');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('heading', { name: course.title, exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/student/courses/course');
    assert.equal(new URL(page.url()).searchParams.get('section'), 'assignments');
    assert.equal(count('POST /api/auth/training-login'), 2);
    await proof('login-return');
  }, width);

  // Course links + real same-document back navigation, not React mocks or injected routers.
  for (const kind of ['assignments', 'checkins']) for (const phase of ['detail', 'submit']) for (const outcome of ['success', 'failure']) {
    await scenario(`learner-${kind}-${phase}-${outcome}`, learner, async ({ page, on, json, hold, count, proof, result }) => {
      const old = hold(), current = hold();
      const detailKey = `GET /api/${kind}/one`, submitKey = `POST /api/${kind}/one/submit`;
      on('GET /api/courses/course', () => json(course));
      on(`GET /api/courses/course/${kind}`, () => json({ list: [task('one'), task('two')] }));
      on(detailKey, phase === 'detail' ? old.respond : () => json(task('one')));
      on(`GET /api/${kind}/two`, () => json(task('two')));
      if (kind === 'checkins') for (const id of ['one', 'two']) on(`GET /api/checkins/${id}/my-submission`, () => json(null));
      on(submitKey, old.respond);
      on(`POST /api/${kind}/two/submit`, current.respond);
      const coursePath = `/student/courses/course?section=${kind}`;
      await page.goto(origin + coursePath);
      const openTask = id => page.locator('article').filter({ has: page.getByRole('heading', { name: `合成任务 ${id}`, exact: true }) }).getByRole('link').click();
      await openTask('one');
      const input = () => page.getByRole('textbox', { name: kind === 'assignments' ? '作答内容' : '打卡内容', exact: true });
      const submitLabel = kind === 'assignments' ? '提交练习' : '提交打卡';
      if (phase === 'submit') {
        await input().fill('旧任务答案');
        await page.getByRole('button', { name: submitLabel, exact: true }).click();
      }
      await old.received;
      // Playwright goBack uses the browser's history traversal. A document token
      // proves this was SPA navigation, not a reload that masks stale work.
      const token = await page.evaluate(() => { window.syntheticDocumentToken = crypto.randomUUID(); return window.syntheticDocumentToken; });
      await page.goBack();
      await page.getByRole('heading', { name: course.title, exact: true }).waitFor();
      await openTask('two');
      await input().fill('新任务草稿');
      assert.equal(await page.evaluate(() => window.syntheticDocumentToken), token);
      assert.equal(new URL(page.url()).searchParams.get('courseId'), 'course');
      const instructions = page.getByRole('region', { name: kind === 'assignments' ? '练习说明' : '打卡说明', exact: true });
      await instructions.getByText('安全文字', { exact: true }).waitFor();
      assert.equal(await instructions.locator('script, [onclick]').count(), 0, 'Instructions were not sanitized');
      const reads = result.requests.filter(request => request.key.startsWith('GET ')).length;
      for (let index = 1; index <= 20; index++) await input().fill('新任务草稿' + '答'.repeat(index));
      assert.equal(result.requests.filter(request => request.key.startsWith('GET ')).length, reads, 'Typing refetched static task data');
      if (phase === 'submit') {
        await page.getByRole('button', { name: submitLabel, exact: true }).click();
        await current.received;
      }
      const response = page.waitForResponse(response => new URL(response.url()).pathname === `/api/${kind}/one${phase === 'submit' ? '/submit' : ''}`);
      old.release(outcome === 'success' ? json(phase === 'detail' ? { ...task('one'), mySubmission: { id: 'old', content: '不能显示的旧答案', revision: 8 } } : {}) : { ...json(null, -1, '合成旧请求失败'), status: 503 });
      await (await response).finished(); await tick(page);
      await page.getByRole('heading', { name: '合成任务 two', exact: true }).waitFor();
      assert.equal(await input().inputValue(), '新任务草稿' + '答'.repeat(20));
      assert.equal(await page.getByText('不能显示的旧答案', { exact: true }).count(), 0);
      assert.equal(count(detailKey), 1);
      assert.equal(count(`GET /api/${kind}/two`), 1, 'Old completion refreshed the new task');
      assert.deepEqual(result.dialogs, []);
      if (phase === 'submit') {
        const pendingButton = page.getByRole('button', { name: /提交中/ });
        assert.equal(await pendingButton.isDisabled(), true, 'Old completion cleared the new pending state');
        const posts = result.requests.filter(request => request.key.endsWith('/submit'));
        assert.equal(posts.length, 2);
        assert.ok(posts.every(post => post.idempotencyKey));
        assert.notEqual(posts[0].idempotencyKey, posts[1].idempotencyKey);
        assert.ok(posts.every(post => post.body.expectedRevision === 0));
        await proof('late-old-result');
        // Keep the new request pending until leaving the form, then finish it.
        await page.getByRole('button', { name: '返回当前课程', exact: true }).click();
        await page.getByRole('heading', { name: course.title, exact: true }).waitFor();
        current.release(json(null, -1, '离开后的合成请求完成'));
      } else await proof('late-old-result');
    });
  }

  await scenario('checkin-late-upload', learner, async ({ page, on, json, hold, proof }) => {
    const upload = hold();
    on('GET /api/courses/course', () => json(course));
    on('GET /api/courses/course/checkins', () => json({ list: [task('one'), task('two')] }));
    for (const id of ['one', 'two']) {
      on(`GET /api/checkins/${id}`, () => json(task(id)));
      on(`GET /api/checkins/${id}/my-submission`, () => json(null));
    }
    on('POST /api/checkins/one/submission-image', upload.respond);
    await page.goto(origin + '/student/courses/course?section=checkins');
    const openTask = id => page.locator('article').filter({ has: page.getByRole('heading', { name: `合成任务 ${id}`, exact: true }) }).getByRole('link').click();
    await openTask('one');
    await page.getByRole('textbox', { name: '打卡内容', exact: true }).waitFor();
    await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlC4AAAAASUVORK5CYII=', 'base64') });
    await upload.received;
    await page.getByRole('button', { name: '返回当前课程', exact: true }).click();
    await openTask('two');
    await page.getByRole('textbox', { name: '打卡内容', exact: true }).fill('保留新草稿');
    const response = page.waitForResponse(response => response.url().endsWith('/api/checkins/one/submission-image'));
    upload.release(json({ assetId: 'old-asset', url: '/uploads/should-never-load.png' }));
    await (await response).finished(); await tick(page);
    assert.equal(await page.getByRole('button', { name: '移除打卡图片 1' }).count(), 0);
    assert.equal(await page.getByRole('textbox', { name: '打卡内容', exact: true }).inputValue(), '保留新草稿');
    assert.equal(await page.getByRole('button', { name: '添加图片', exact: true }).isEnabled(), true);
    await proof('upload-isolated');
  });

  for (const kind of ['assignments', 'checkins']) await scenario(`teacher-${kind}-lazy-courses`, teacher, async ({ page, on, json, count, proof }) => {
    let courseReads = 0;
    on(`GET /api/${kind}?view=summary&${catalogQuery}`, () => json({ list: [task('review')], total: 1 }));
    on('GET /api/courses', () => ++courseReads === 1 ? json(null, -1, '合成课程读取失败') : json({ list: [course] }));
    await page.goto(origin + '/' + kind);
    await page.getByRole('heading', { name: kind === 'assignments' ? '练习管理' : '打卡管理', exact: true }).waitFor();
    await page.getByText('合成任务 review', { exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(count('GET /api/courses'), 0, 'Task listing eagerly fetched authoring course choices');
    await proof('list-without-courses');
    const opener = kind === 'assignments' ? '布置练习' : '创建打卡';
    const title = kind === 'assignments' ? '发布练习' : '发布打卡';
    await page.getByRole('button', { name: opener, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await dialog.getByRole('alert').filter({ hasText: '合成课程读取失败' }).waitFor();
    assert.equal(count('GET /api/courses'), 1);
    await dialog.getByRole('button', { name: '重试课程列表', exact: true }).click();
    await dialog.getByRole('combobox', { name: '选择课程 *', exact: true }).locator('option[value="course"]').waitFor({ state: 'attached' });
    assert.equal(count('GET /api/courses'), 2);
    await proof('course-retry');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: opener, exact: true }).click();
    await dialog.waitFor(); await page.waitForLoadState('networkidle');
    assert.equal(count('GET /api/courses'), 2, 'Successfully loaded choices were refetched on reopen');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
  });

  await scenario('assignment-review-paging-batch-download', teacher, async ({ page, on, json, hold, count, proof, result }) => {
    let pageTwo = 0, failedChunk = false, downloads = 0;
    const downloadPending = hold();
    on('GET /api/assignments?view=summary&' + catalogQuery, () => json({ list: [task('review')], total: 1 }));
    on('GET /api/assignments/review/submissions', () => json(reviewPage()));
    on('GET /api/assignments/review/submissions' + nextQuery, () => ++pageTwo === 1 ? json(null, -1, '合成下一页失败') : json(reviewPage(true)));
    on('POST /api/assignments/review/review-selection', ({ body }) => {
      assert.ok(['page', 'all-ungraded'].includes(body.scope));
      assert.deepEqual(body, body.scope === 'page' ? { scope: 'page', items: [{ id: 'page-one', revision: 2 }] } : { scope: 'all-ungraded' });
      return json(snapshot(body.scope));
    });
    on('POST /api/assignments/review/batch-grade', ({ body }) => {
      assert.equal(body.comment, '保留合成批复');
      assert.ok(['page-proof', 'chunk-zero', 'chunk-one'].includes(body.selectionToken));
      if (body.selectionToken === 'chunk-one' && !failedChunk) { failedChunk = true; return json(null, -1, '合成批次失败'); }
      return json({ gradedCount: body.selectionToken === 'page-proof' ? 1 : 25, skippedCount: 0 });
    });
    on('GET /api/assignments/review/export', async request => {
      downloads++;
      if (downloads === 1) return downloadPending.respond(request);
      if (downloads === 2) return { status: 503, contentType: 'text/html', body: '<h1>Private error body must not be rendered</h1>' };
      if (downloads === 3) return { ...json(null, -1, '合成导出暂不可用'), status: 503 };
      return { status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'synthetic-download-bytes' };
    });
    await page.goto(origin + '/assignments');
    await page.getByRole('button', { name: '查看提交', exact: true }).click();
    const review = page.getByRole('dialog', { name: '练习提交列表', exact: true });
    await review.getByText('page-one', { exact: true }).waitFor();
    await review.getByText('共 51 份提交', { exact: true }).waitFor();
    await review.getByText('50 待批改', { exact: true }).waitFor();
    await review.getByText('第 1 页 · 本页 2 份', { exact: true }).waitFor();
    assert.equal(count('GET /api/courses'), 0);
    await review.getByRole('button', { name: '下一页', exact: true }).click();
    await review.getByRole('alert').filter({ hasText: '合成下一页失败' }).waitFor();
    await review.getByRole('button', { name: '重试提交列表', exact: true }).click();
    await review.getByText('page-two', { exact: true }).waitFor();
    assert.equal(count('GET /api/assignments/review/submissions' + nextQuery), 2);
    assert.equal(await review.getByRole('button', { name: '下一页', exact: true }).isDisabled(), true);
    await review.getByRole('button', { name: '上一页', exact: true }).click();
    await review.getByText('page-one', { exact: true }).waitFor();
    await proof('cursor-retry-and-back');
    const batch = page.getByRole('dialog', { name: '一键批量批复', exact: true });
    await review.getByRole('button', { name: '一键批量批复', exact: true }).click();
    await batch.getByText('本页待批改练习 (1)', { exact: true }).waitFor();
    await batch.getByPlaceholder('请输入评语...').fill('保留合成批复');
    await batch.getByRole('button', { name: '确认批复 (1份)', exact: true }).click();
    await batch.waitFor({ state: 'hidden' });
    await review.getByText('page-one', { exact: true }).waitFor();
    assert.equal(count('POST /api/assignments/review/review-selection'), 1);
    await review.getByRole('button', { name: '一键批量批复', exact: true }).click();
    await batch.getByRole('button', { name: '选择全部未批改', exact: true }).click();
    await batch.getByText('已冻结选择 50 份；批改时跳过已变化或已处理记录。', { exact: true }).waitFor();
    await batch.getByRole('button', { name: '确认批复 (50份)', exact: true }).click();
    await page.getByText(/合成批次失败。已确认 25 份/).waitFor({ state: 'attached' });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('确认批复 (50份)') && !button.disabled));
    assert.equal(await batch.getByPlaceholder('请输入评语...').inputValue(), '保留合成批复');
    await proof('failed-chunk-retained');
    await batch.getByRole('button', { name: '确认批复 (50份)', exact: true }).click();
    await batch.waitFor({ state: 'hidden' });
    assert.deepEqual(result.requests.filter(request => request.key.endsWith('/batch-grade')).map(request => request.body.selectionToken), ['page-proof', 'chunk-zero', 'chunk-one', 'chunk-one']);
    assert.equal(count('POST /api/assignments/review/review-selection'), 2, 'Chunk retry must reuse the frozen selection');
    await review.getByRole('button', { name: '关闭练习提交列表', exact: true }).click();
    const exportButton = async () => {
      await page.getByRole('button', { name: '合成任务 review 的更多操作', exact: true }).click();
      return page.getByRole('button', { name: '导出提交', exact: true });
    };
    await (await exportButton()).click(); await downloadPending.received;
    await page.getByRole('button', { name: '合成任务 review 的更多操作', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '导出中…', exact: true }).isDisabled(), true);
    assert.equal(downloads, 1);
    await page.keyboard.press('Escape');
    downloadPending.release({ status: 200, contentType: 'application/octet-stream', body: '' });
    await page.getByText('导出文件为空，请重新导出', { exact: true }).waitFor();
    assert.deepEqual(result.downloads, []);
    await (await exportButton()).click();
    await page.getByText('导出失败', { exact: true }).waitFor();
    assert.equal(await page.getByText('Private error body must not be rendered', { exact: true }).count(), 0);
    assert.deepEqual(result.downloads, []);
    await (await exportButton()).click();
    await page.getByText('合成导出暂不可用', { exact: true }).waitFor();
    assert.deepEqual(result.downloads, []);
    await proof('download-errors');
    const saved = page.waitForEvent('download');
    await (await exportButton()).click();
    const download = await saved;
    assert.equal(download.suggestedFilename(), '合成任务 review_提交数据.xlsx');
    const file = resolve(evidence, 'synthetic-task-download.xlsx');
    await download.saveAs(file);
    assert.equal((await readFile(file)).toString(), 'synthetic-download-bytes');
    assert.equal(downloads, 4);
    assert.equal(count('GET /api/courses'), 0, 'Review/export must not load authoring course choices');
  });

  await scenario('assessment-deferred-export-retry', teacher, async ({ page, on, json, hold, count, proof, result, setChunkHandler, expectFailure }) => {
    let codeAttempts = 0;
    const codeGate = hold();
    on('GET /api/courses/course', () => json(course));
    on('GET /api/courses/course/training-assessments?includeManaged=true&view=summary&' + catalogQuery, () => json({ list: [{ id: 'assessment', key: 'assessment', kind: 'QUESTIONNAIRE', typeLabel: '组合测评', name: '合成课程测评', description: '', status: 'PUBLISHED', unitCount: 1, unitLabel: '单元', manageHref: '/questionnaire-products/assessment', tags: [] }], total: 1 }));
    on('POST /api/composite-assessments/assessment/export', ({ body, request }) => {
      assert.deepEqual(body, { detail: 'summary', format: 'csv', anonymize: true, courseId: 'course' });
      assert.ok(request.headers()['x-export-request-key']);
      return json({ artifacts: [{ id: 'artifact', format: 'csv', fileName: 'synthetic-assessment.csv', downloadUrl: '/api/synthetic-export/artifact' }] });
    });
    on('GET /api/synthetic-export/artifact/status', () => json({ status: 'READY' }));
    on('GET /api/synthetic-export/artifact', () => ({ status: 200, contentType: 'text/csv', body: 'participant,score\nsynthetic,1\n' }));
    setChunkHandler(async (route, url) => {
      if (url.pathname !== exportChunk) return false;
      codeAttempts++;
      if (codeAttempts === 1) {
        await codeGate.respond(route.request());
        expectFailure(url.href);
        await route.fulfill({ status: 503, contentType: 'application/javascript', body: '// synthetic code-download failure' });
        return true;
      }
      return false;
    });
    await page.goto(origin + '/courses/course/detail?section=assessments');
    await page.getByRole('heading', { name: '合成课程测评', exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(codeAttempts, 0, 'Assessment export code was eagerly fetched');
    await page.getByRole('button', { name: '导出本课程数据', exact: true }).click();
    await codeGate.received;
    await page.getByRole('status').filter({ hasText: '正在读取数据导出…' }).waitFor();
    assert.equal(count('POST /api/composite-assessments/assessment/export'), 0);
    await proof('deferred-loading');
    codeGate.release(null);
    await page.getByRole('alert').filter({ hasText: '数据导出组件加载失败，尚未提交导出。' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '合成课程测评', exact: true }).isVisible(), true);
    assert.equal(count('POST /api/composite-assessments/assessment/export'), 0);
    await proof('code-failure');
    await page.getByRole('button', { name: '重试加载导出', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '导出脱敏摘要', exact: true });
    await dialog.waitFor();
    assert.equal(codeAttempts, 2, 'Explicit retry must actually reload the failed chunk');
    assert.equal(count('POST /api/composite-assessments/assessment/export'), 0, 'Opening export must not submit it');
    await dialog.getByRole('button', { name: '关闭数据导出', exact: true }).click();
    await page.getByRole('button', { name: '导出本课程数据', exact: true }).click();
    await dialog.waitFor(); assert.equal(codeAttempts, 2, 'Successful export code must be reused');
    const downloaded = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '导出 CSV', exact: true }).click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), 'synthetic-assessment.csv');
    const file = resolve(evidence, 'synthetic-assessment.csv');
    await download.saveAs(file);
    assert.equal((await readFile(file)).toString(), 'participant,score\nsynthetic,1\n');
    await dialog.getByText('已请求下载，请查看浏览器下载列表。', { exact: true }).waitFor();
    assert.equal(count('POST /api/composite-assessments/assessment/export'), 1);
    assert.deepEqual(result.downloads, ['synthetic-assessment.csv']);
    await proof('explicit-export');
  });

  assert.deepEqual(report.scenarios.map(item => item.name).sort(), [...requiredScenarios].sort(), 'Required browser scenario missing or duplicated');
  assert.ok(report.scenarios.every(item => item.status === 'PASS'));
  report.status = 'PASS';
} catch (error) {
  report.status = report.status === 'TIMEOUT' ? 'TIMEOUT' : 'FAIL';
  report.failure = error.stack || String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  clearTimeout(deadline);
  await browser?.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  report.finishedAt = new Date().toISOString();
  await writeReport();
}
