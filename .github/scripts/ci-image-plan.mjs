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
export function runtimeRefreshPlan(input, frontendOnly, backendOnly = false) {
  const plan = structuredClone(input);
  for (const name of validateTargets(plan, frontendOnly, backendOnly)) {
    if (name === 'backend' || name === 'worker')
      plan.target[name].args = { ...plan.target[name].args, DEBIAN_MIRROR: 'deb.debian.org' };
    plan.target[name]['no-cache-filter'] = ['runtime'];
    plan.target[name]['no-cache'] = false;
  }
  return plan;
}
export function verifyResolvedPlan(plan, frontendOnly, backendOnly = false) {
  for (const name of validateTargets(plan, frontendOnly, backendOnly)) {
    const target = plan.target[name];
    if (name === 'backend' || name === 'worker')
      assert.equal(target.args?.DEBIAN_MIRROR, 'deb.debian.org', 'CI official Debian source was lost');
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
  if (process.argv[3] === '--verify') verifyResolvedPlan(input, frontendOnly, backendOnly);
  else {
    const plan = runtimeRefreshPlan(input, frontendOnly, backendOnly);
    for (const name of selectedTargets(frontendOnly, backendOnly)) {
      const target = plan.target[name];
      const dockerfile = fs.readFileSync(path.resolve(target.context, target.dockerfile), 'utf8');
      assert.match(dockerfile, /^FROM\s+.*\s+AS\s+runtime\s*$/mi, 'Runtime filter must select an actual Dockerfile stage');
    }
    fs.writeFileSync(file, JSON.stringify(plan, null, 2) + '\n');
  }
  console.log(JSON.stringify({ targets: selectedTargets(frontendOnly, backendOnly), runtimeSecurityRefresh: true, verify: process.argv[3] === '--verify' }));
}
