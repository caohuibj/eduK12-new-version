import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isAssetApiGet } = require('../../server-version/e2e/helpers/asset-request.cjs');
const request = (path, method = 'GET') => ({ url: () => `http://127.0.0.1:5173${path}`, method: () => method });
test('protected media includes direct, public and embedded asset APIs', () => {
  for (const path of ['/api/assets/a/content', '/api/public/assets/a/content', '/api/public/composite-assessments/attempts/a/items/i/situational/b/assets/c/content']) assert.equal(isAssetApiGet(request(path)), true);
});
test('frontend bundles and query text are not protected media requests', () => {
  for (const path of ['/assets/app.js', '/assets/app.css', '/student/login?returnTo=/api/assets/a/content', '/api/auth/me']) assert.equal(isAssetApiGet(request(path)), false);
  assert.equal(isAssetApiGet(request('/api/assets/a/content', 'POST')), false);
});
