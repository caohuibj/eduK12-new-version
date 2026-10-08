import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeRefreshPlan, verifyResolvedPlan } from './ci-image-plan.mjs';
import { readFileSync } from 'node:fs';
const fixture = frontendOnly => ({ target: Object.fromEntries((frontendOnly ? ['frontend'] : ['backend','worker','frontend']).map(name => [name, {
  context: `./${name === 'frontend' ? 'frontend' : 'backend'}`, dockerfile: 'Dockerfile',
  tags: [name === 'frontend' ? 'server-version-frontend' : 'server-version-backend:latest'],
  args: { VITE_COGNITIVE_MODULE_ENABLED: 'true' },
}])) });
const resolved = plan => { for (const target of Object.values(plan.target)) {target.pull = true; target.output = [{type:'docker'}];} return plan;};
test('runtime refresh preserves source, tags and build arguments without mutating Compose input', () => {
  for (const frontendOnly of [true,false]) {
    const input = fixture(frontendOnly);
    for (const [name,target] of Object.entries(input.target)) {
      if (name !== 'frontend') { target.context='/work/repo/server-version/backend'; target.dockerfile=target.context+'/Dockerfile'; }
    }
    const before = structuredClone(input);
    const plan = runtimeRefreshPlan(input,frontendOnly);
    assert.deepEqual(input,before);
    for (const [name,target] of Object.entries(plan.target)) {
      assert.deepEqual(target['no-cache-filter'],['runtime']); assert.equal(target['no-cache'],false);
      assert.deepEqual(target.args, name === 'frontend' ? before.target[name].args
        : {...before.target[name].args, DEBIAN_MIRROR: 'mirrors.tuna.tsinghua.edu.cn'});
      for (const key of ['context','dockerfile','tags']) assert.deepEqual(target[key],before.target[name][key]);
    }
    verifyResolvedPlan(resolved(plan),frontendOnly);
  }
});
test('missing refresh, whole-image cache bypass, wrong tags or publishing cannot pass resolved validation', () => {
  for (const change of [t=>delete t['no-cache-filter'],t=>t['no-cache']=true,t=>t.pull=false,
    t=>t.tags=['other-image'],t=>t.dockerfile='../other/Dockerfile',t=>t.push=true,t=>t.output=[{type:'registry'}],t=>t.output=[]]) {
    const plan=resolved(runtimeRefreshPlan(fixture(true),true)); change(plan.target.frontend);
    assert.throws(()=>verifyResolvedPlan(plan,true));
  }
});
test('UI route cannot secretly build backend; full route cannot omit a production target', () => {
  assert.throws(()=>runtimeRefreshPlan(fixture(false),true));
  const plan=fixture(false);delete plan.target.worker;
  assert.throws(()=>runtimeRefreshPlan(plan,false));
});

test('Debian mirror applies to both API and worker and cannot disappear from the resolved build', () => {
  const input=fixture(false);
  input.target.backend.args.DEBIAN_MIRROR='untrusted.invalid';
  const plan=runtimeRefreshPlan(input,false);
  for (const name of ['backend','worker']) {
    assert.equal(plan.target[name].args.DEBIAN_MIRROR,'mirrors.tuna.tsinghua.edu.cn');
    for (const change of [t=>delete t.args.DEBIAN_MIRROR,t=>t.args.DEBIAN_MIRROR='untrusted.invalid']) {
      const altered=resolved(structuredClone(plan));change(altered.target[name]);
      assert.throws(()=>verifyResolvedPlan(altered,false));
    }
  }
  assert.equal(Object.hasOwn(plan.target.frontend.args,'DEBIAN_MIRROR'),false);
  verifyResolvedPlan(resolved(plan),false);
});

// Regression: Buildx --load can preserve an image exporter and add a docker exporter.
// CI must explicitly override *all* target outputs and enforce that exact plan.
test('CI image script forces only local Docker export for printed and executed builds', () => {
  const script = readFileSync(new URL('./build-ci-images.sh', import.meta.url), 'utf8');
  const commands = script.split('\n').filter(line => line.startsWith('docker buildx bake --file "$ci_task_bake_dir/plan.json" --pull'));
  assert.equal(commands.length, 2);
  for (const command of commands) {
    assert.match(command, /'--set=\*\.output=type=docker'/);
    assert.doesNotMatch(command, /--load|--push/);
  }
  assert.match(commands[0], /--print/);
  assert.doesNotMatch(commands[1], /--print/);
  const resolved = runtimeRefreshPlan(fixture(true), true);
  resolved.target.frontend.pull = true;
  resolved.target.frontend.output = [{type:'image',push:false},{type:'docker'}];
  assert.throws(() => verifyResolvedPlan(resolved,true), /Only local Docker image outputs are allowed/);
  resolved.target.frontend.output = [{type:'docker'}];
  verifyResolvedPlan(resolved,true);
});
