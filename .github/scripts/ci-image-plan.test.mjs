import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeRefreshPlan, verifyResolvedPlan } from './ci-image-plan.mjs';
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
      for (const key of ['context','dockerfile','tags','args']) assert.deepEqual(target[key],before.target[name][key]);
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
