// Frontend-only compiled Chromium smoke. All API data is synthetic; no backend or DB.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(process.env.FRONTEND_DIST || resolve(root, 'server-version/frontend/dist'));
const require = createRequire(new URL('../release-tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
assert.equal(require('playwright-core/package.json').version, require('./package.json').dependencies['playwright-core']);
await stat(resolve(dist, 'index.html'));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(dist, '.' + pathname);
    assert.ok(file === dist || file.startsWith(dist + sep));
    try { if (!(await stat(file)).isFile()) throw new Error('not a file'); }
    catch { if (extname(pathname)) { res.writeHead(404); res.end(); return; } file = resolve(dist, 'index.html'); }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(400); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const local = `http://127.0.0.1:${server.address().port}`;
const publicId = '11111111-1111-4111-8111-111111111111';
const apps = ['App', 'SchoolApp', 'HuiteacherApp', 'SurveyApp', 'SurveyPublicApp'];
const productChunk = pathname => apps.find(name => new RegExp(`/assets/${name}-[^/]+\\.js$`).test(pathname));
const scale = n => ({ id: `scale-${n}`, code: `SMOKE-${n}`, name: `Synthetic scale ${n}`, status: 'DRAFT', source: 'owned', createdAt: '2026-01-01T00:00:00Z', creator: { id: 'smoke-teacher', username: 'smoke', nickname: null }, _count: { assessments: 0 }, tags: [] });
let browser;
const deadline = setTimeout(async () => {
  console.error('Frontend browser smoke exceeded 120 seconds');
  server.closeAllConnections();
  server.close();
  await browser?.close();
  process.exit(1);
}, 120_000);
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  async function scenario({ host, path = '/', app, selector, authenticated = false, failChunk = false }, check) {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1365, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(15_000);
    const unexpected = [], errors = [], modules = new Set(), pages = [];
    let blockChunk = failChunk, failedPageTwo = false;
    page.on('pageerror', error => { if (!blockChunk) errors.push(error.message); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      const json = (data, status = 200, message = '') => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status === 200 ? 0 : status, data, message }) });
      if (url.hostname !== host) { unexpected.push(`Unexpected origin ${url.origin}`); return route.abort(); }
      if (url.pathname.startsWith('/api/')) {
        const key = `${request.method()} ${url.pathname}${url.search}`;
        if (key === 'GET /api/auth/me') return authenticated
          ? json({ id: 'smoke-teacher', username: 'smoke', nickname: 'Synthetic teacher', role: 'TEACHER', platformRole: 'STANDARD', mustChangePassword: false })
          : json(null, 401, '请先登录');
        if (['GET /api/campus/auth/me', 'GET /api/huiteacher/auth/me', 'GET /api/survey/auth/me'].includes(key)) return json(null, 401, '请先登录');
        if (key === 'GET /api/capabilities') return json({ cognitive: false, parentPortal: false });
        if (authenticated && key === 'GET /api/organizations?page=1&pageSize=100') return json({ list: [], total: 0, page: 1, pageSize: 100, platformRole: 'STANDARD', allowedActions: [] });
        // AppShell discovery reads these two {list} envelopes for the synthetic teacher.
        // Empty lists keep relational navigation unavailable without changing its contract.
        if (authenticated && key === 'GET /api/relational-assessments/catalog') return json({ list: [] });
        if (authenticated && key === 'GET /api/relational-assessments/tasks') return json({ list: [] });
        if (authenticated && key === 'GET /api/scales/tags') return json({ tags: [] });
        if (authenticated && key === 'GET /api/scales?page=1&pageSize=100') { pages.push(1); return json({ list: Array.from({ length: 100 }, (_, n) => scale(n + 1)), total: 101 }); }
        if (authenticated && key === 'GET /api/scales?page=2&pageSize=100') {
          pages.push(2);
          if (!failedPageTwo) { failedPageTwo = true; return json(null, 503, 'Synthetic page-two failure'); }
          return json({ list: [scale(101)], total: 101 });
        }
        if (key === `GET /api/public/survey/r/${publicId}/info`) return json({ project: { name: 'Synthetic public study', description: 'Browser smoke fixture', collectionMode: 'SINGLE_UNLINKED', status: 'ACTIVE' }, waves: [] });
        unexpected.push(key);
        return json(null, 500, `Unmocked endpoint: ${key}`);
      }
      if (request.method() !== 'GET') { unexpected.push(`${request.method()} ${url.pathname}`); return route.abort(); }
      const module = productChunk(url.pathname);
      if (module) { modules.add(module); if (blockChunk && module === app) return route.abort('failed'); }
      // Keep the real hostname in the browser while serving only local built assets.
      try {
        const response = await fetch(local + url.pathname + url.search, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) unexpected.push(`Static ${response.status} ${url.pathname}`);
        await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await response.arrayBuffer()) });
      } catch (error) { unexpected.push(String(error)); await route.abort(); }
    });
    try {
      await page.goto(`http://${host}${path}`);
      if (failChunk) {
        await page.getByRole('alert').filter({ hasText: '页面加载失败' }).waitFor();
        blockChunk = false;
        await page.getByRole('button', { name: '重新加载', exact: true }).click();
      }
      await page.locator(selector).waitFor({ state: 'visible' });
      await page.waitForLoadState('networkidle');
      // Huiteacher statically reuses SurveyPublicApp's TaskForm, not its router.
      const expectedModules = app === 'HuiteacherApp' ? ['HuiteacherApp', 'SurveyPublicApp'] : [app];
      assert.deepEqual([...modules].sort(), expectedModules, `${host}${path}: unexpected product entry closure`);
      const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--hui-ds-color-ink').trim());
      assert.ok(token, `${host}${path}: shared design tokens missing`);
      assert.ok(await page.locator('button:visible, a:visible').count(), 'No rendered controls');
      if (check) await check(page, pages);
      assert.deepEqual(unexpected, [], 'Unmocked network requests');
      assert.deepEqual(errors, [], 'Unexpected browser errors');
      console.log(`PASS ${host}${path}${failChunk ? ' (chunk failure + reload recovery)' : ''}`);
    } finally { await context.close(); }
  }
  await scenario({ host: 'school.eduk12.top', app: 'SchoolApp', selector: '#hs-landing-title' }, async page => {
    const image = page.locator('img[src*="huischool-campus-sunlight"]').first();
    await image.waitFor({ state: 'visible' });
    const decoded = await image.evaluate(async img => { await img.decode(); return { src: img.currentSrc, width: img.naturalWidth, height: img.naturalHeight }; });
    assert.match(decoded.src, /\.webp$/);
    assert.deepEqual([decoded.width, decoded.height], [1536, 1024], 'School WebP decoded dimensions changed');
  });
  await scenario({ host: 'teacher.eduk12.top', app: 'HuiteacherApp', selector: '#ht-journal-title' });
  await scenario({ host: 'survey.eduk12.top', app: 'SurveyApp', selector: '.survey-landing-copy h1' });
  await scenario({ host: 'survey.eduk12.top', path: `/r/${publicId}`, app: 'SurveyPublicApp', selector: 'h2:has-text("Synthetic public study")' });
  await scenario({ host: 'www.eduk12.top', app: 'App', selector: '#hui-entry-title' });
  await scenario({ host: 'training.eduk12.top', app: 'App', selector: '#training-title' });
  await scenario({ host: 'school.eduk12.top', app: 'SchoolApp', selector: '#hs-landing-title', failChunk: true });
  await scenario({ host: 'www.eduk12.top', path: '/scales', app: 'App', selector: 'h1:has-text("心理量表管理")', authenticated: true }, async (page, requests) => {
    assert.deepEqual(requests, [1], 'ScaleList must not prefetch later pages');
    assert.equal(await page.locator('tbody tr').count(), 100);
    await page.getByRole('button', { name: '加载更多量表', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Synthetic page-two failure' }).waitFor();
    assert.deepEqual(requests, [1, 2]);
    assert.equal(await page.locator('tbody tr').count(), 100, 'Failed append discarded rows');
    await page.getByRole('button', { name: '重试加载更多量表', exact: true }).click();
    await page.getByText('Synthetic scale 101', { exact: true }).waitFor();
    assert.deepEqual(requests, [1, 2, 2], 'Retry must request the failed page only');
    assert.equal(await page.locator('tbody tr').count(), 101, 'Append lost or duplicated rows');
    assert.equal(await page.getByRole('button', { name: '加载更多量表', exact: true }).count(), 0);
  });
} finally {
  clearTimeout(deadline);
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
