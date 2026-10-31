import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeRefreshPlan, verifyResolvedPlan } from './ci-image-plan.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const selections=[
  {frontendOnly:true,backendOnly:false,targets:['frontend'],scenario:'frontend'},
  {frontendOnly:false,backendOnly:true,targets:['backend','worker'],scenario:'backend'},
  {frontendOnly:false,backendOnly:false,targets:['backend','worker','frontend'],scenario:'platform'},
];
const fixture = (frontendOnly,backendOnly=false) => ({ target: Object.fromEntries(selections.find(mode=>mode.frontendOnly===frontendOnly&&mode.backendOnly===backendOnly).targets.map(name => [name, {
  context: `./${name === 'frontend' ? 'frontend' : 'backend'}`, dockerfile: 'Dockerfile',
  tags: [name === 'frontend' ? 'server-version-frontend' : 'server-version-backend:latest'],
  args: { VITE_COGNITIVE_MODULE_ENABLED: 'true' },
}])) });
const resolved = plan => { for (const target of Object.values(plan.target)) {target.pull = true; target.output = [{type:'docker'}];} return plan;};
test('runtime refresh preserves source, tags and build arguments without mutating Compose input', () => {
  for (const {frontendOnly,backendOnly,targets} of selections) {
    const input = fixture(frontendOnly,backendOnly);
    for (const [name,target] of Object.entries(input.target)) {
      if (name !== 'frontend') { target.context='/work/repo/server-version/backend'; target.dockerfile=target.context+'/Dockerfile'; }
    }
    const before = structuredClone(input);
    const plan = runtimeRefreshPlan(input,frontendOnly,backendOnly);
    assert.deepEqual(Object.keys(plan.target),targets);
    assert.deepEqual(input,before);
    for (const [name,target] of Object.entries(plan.target)) {
      assert.deepEqual(target['no-cache-filter'],['runtime']); assert.equal(target['no-cache'],false);
      assert.deepEqual(target.args, name === 'frontend' ? before.target[name].args
        : {...before.target[name].args, DEBIAN_MIRROR: 'deb.debian.org'});
      for (const key of ['context','dockerfile','tags']) assert.deepEqual(target[key],before.target[name][key]);
    }
    verifyResolvedPlan(resolved(plan),frontendOnly,backendOnly);
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
  assert.throws(()=>runtimeRefreshPlan(fixture(false),false,true));
  assert.throws(()=>runtimeRefreshPlan(fixture(true),true,true));
  const plan=fixture(false);delete plan.target.worker;
  assert.throws(()=>runtimeRefreshPlan(plan,false));
});

test('frontend backend and full selection reaches shell targets and only the matching runtime checks',()=>{
  const script=readFileSync(new URL('./build-ci-images.sh',import.meta.url),'utf8');
  const selection=script.match(/^case [\s\S]+?^esac/m)?.[0];assert(selection);
  const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  const images=readFileSync(new URL('../workflows/ci-images.yml',import.meta.url),'utf8');
  const docker=ci.split('\n  docker:\n')[1].split(/\n  [a-z][a-z0-9-]*:\n/)[0];
  const step=name=>images.split('      - name: '+name+'\n')[1]?.split('\n      - ')[0];
  const permits=(name,inputs)=>new Function('inputs','return ('+step(name).match(/^        if: (.+)$/m)[1]+')')(inputs);
  for(const {frontendOnly,backendOnly,targets,scenario} of selections){
    const actual=execFileSync('bash',['-c',selection+'\nprintf "%s\\n" "${images[@]}"'],{encoding:'utf8',env:{...process.env,FRONTEND_ONLY:String(frontendOnly),BACKEND_ONLY:String(backendOnly)}}).trim().split('\n');
    assert.deepEqual(actual,targets);
    const needs={scope:{outputs:{scenario,frontend:String(frontendOnly),dependencies_frontend_only:'false'}}};
    for(const [input,expected] of [['frontend_only',frontendOnly],['backend_only',backendOnly]]){
      const expression=docker.match(new RegExp(input+': \\$\\{\\{ (.+) \\}\\}'))[1];
      assert.equal(new Function('needs','return ('+expression+')')(needs),expected,input+' '+scenario);
    }
    const inputs={frontend_only:frontendOnly,backend_only:backendOnly};
    assert.equal(permits('scan backend image (high and critical)',inputs),targets.includes('backend'));
    for(const name of ['scan frontend image (high and critical)','verify production Nginx static asset MIME and security headers'])assert.equal(permits(name,inputs),targets.includes('frontend'));
  }
  assert.match(step('scan backend image (high and critical)'),/severity: CRITICAL,HIGH/);
  assert.match(images,/BACKEND_ONLY: \$\{\{ inputs.backend_only \}\}/);
});

test('Debian mirror applies to both API and worker and cannot disappear from the resolved build', () => {
  const input=fixture(false);
  input.target.backend.args.DEBIAN_MIRROR='untrusted.invalid';
  const plan=runtimeRefreshPlan(input,false);
  for (const name of ['backend','worker']) {
    assert.equal(plan.target[name].args.DEBIAN_MIRROR,'deb.debian.org');
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
