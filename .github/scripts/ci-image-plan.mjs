import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export function selectedTargets(frontendOnly, backendOnly = false) {
  assert.equal(typeof frontendOnly, 'boolean');
  assert.equal(typeof backendOnly, 'boolean');
  assert.ok(!(frontendOnly && backendOnly), 'Select one component mode');
  return frontendOnly ? ['frontend'] : backendOnly ? ['backend', 'worker'] : ['backend', 'worker', 'frontend'];
}
export function buildSources(env = {}) {
  const sources = {
    DEBIAN_MIRROR: env.DEBIAN_MIRROR || 'deb.debian.org',
    NPM_REGISTRY: env.NPM_REGISTRY || 'https://registry.npmjs.org',
    ALPINE_MIRROR: env.ALPINE_MIRROR || '',
  };
  // Debian's existing Dockerfile argument replaces the host, retaining /debian.
  assert.ok(/^[a-z0-9.-]+(?::\d+)?$/i.test(sources.DEBIAN_MIRROR), 'DEBIAN_MIRROR must be a host without a path');
  for (const name of ['NPM_REGISTRY', 'ALPINE_MIRROR']) {
    if (!sources[name]) continue;
    let url;
    try { url = new URL(sources[name]); }
    catch { throw new Error(`${name} must be a valid HTTPS URL`); }
    assert.ok(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
      `${name} must be an HTTPS URL without credentials, query or fragment`);
    if (name === 'ALPINE_MIRROR')
      assert.ok(/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[a-z0-9._~-]+)*\/?$/i.test(sources[name]), 'ALPINE_MIRROR must be a repository prefix');
  }
  return sources;
}
function sourceArguments(name, sources) {
  return name === 'frontend'
    ? { NPM_REGISTRY: sources.NPM_REGISTRY, ALPINE_MIRROR: sources.ALPINE_MIRROR }
    : { NPM_REGISTRY: sources.NPM_REGISTRY, DEBIAN_MIRROR: sources.DEBIAN_MIRROR };
}
function validateTargets(plan, frontendOnly, backendOnly) {
  const expected = selectedTargets(frontendOnly, backendOnly);
  assert.deepEqual(Object.keys(plan.target ?? {}).sort(), [...expected].sort(), 'Unexpected Compose build targets');
  for (const name of expected) {
    const target = plan.target[name];
    assert.equal(typeof target.context, 'string');
    assert.equal(typeof target.dockerfile, 'string');
    assert.equal(path.resolve(target.context, target.dockerfile), path.resolve(target.context, 'Dockerfile'), 'Dockerfile must stay inside its Compose context');
    const tag = name === 'frontend' ? 'server-version-frontend' : 'server-version-backend';
    assert.ok(target.tags?.some(value => value === tag || value === `${tag}:latest`), 'Scanned image tag must match build');
    assert.ok(!target.push, 'CI must not publish images');
  }
  return expected;
}
export function runtimeRefreshPlan(input, frontendOnly, backendOnly = false, env = {}) {
  const plan = structuredClone(input);
  const sources = buildSources(env);
  for (const name of validateTargets(plan, frontendOnly, backendOnly)) {
    plan.target[name].args = { ...plan.target[name].args, ...sourceArguments(name, sources) };
    plan.target[name]['no-cache-filter'] = ['runtime'];
    plan.target[name]['no-cache'] = false;
  }
  return plan;
}
export function verifyResolvedPlan(plan, frontendOnly, backendOnly = false, env = {}) {
  const sources = buildSources(env);
  for (const name of validateTargets(plan, frontendOnly, backendOnly)) {
    const target = plan.target[name];
    for (const [arg, value] of Object.entries(sourceArguments(name, sources)))
      assert.equal(target.args?.[arg], value, `Resolved build source changed: ${arg}`);
    assert.deepEqual(target['no-cache-filter'], ['runtime'], 'Runtime security refresh was lost');
    assert.ok(!target['no-cache'], 'Dependency/build caches must remain reusable');
    assert.equal(target.pull, true, 'Base image refresh must be enabled');
    assert.ok(target.output?.length > 0);
    assert.ok(target.output.every(value => typeof value === 'string'
      ? value === 'type=docker' : value.type === 'docker' && !value.push), 'Only local Docker image outputs are allowed');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(['true', 'false'].includes(process.env.FRONTEND_ONLY));
  assert.ok(['true', 'false'].includes(process.env.BACKEND_ONLY || 'false'));
  const frontendOnly = process.env.FRONTEND_ONLY === 'true';
  const backendOnly = process.env.BACKEND_ONLY === 'true';
  const file = process.argv[2];
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (process.argv[3] === '--verify') verifyResolvedPlan(input, frontendOnly, backendOnly, process.env);
  else {
    const plan = runtimeRefreshPlan(input, frontendOnly, backendOnly, process.env);
    for (const name of selectedTargets(frontendOnly, backendOnly)) {
      const target = plan.target[name];
      const dockerfile = fs.readFileSync(path.resolve(target.context, target.dockerfile), 'utf8');
      assert.match(dockerfile, /^FROM\s+.*\s+AS\s+runtime\s*$/mi, 'Runtime filter must select an actual Dockerfile stage');
    }
    fs.writeFileSync(file, JSON.stringify(plan, null, 2) + '\n');
  }
  console.log(JSON.stringify({ targets: selectedTargets(frontendOnly, backendOnly), buildSources: buildSources(process.env), runtimeSecurityRefresh: true, verify: process.argv[3] === '--verify' }));
}
