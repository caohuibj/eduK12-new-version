import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { participantAccessOutputs } from './participant-access-scope.mjs';

// Fixed Scale26 intake source. Any unrelated or modified business file fails closed.
export const SCALE26_BASE = '9801107019d51a4af7ddb651789b674867539d24';
export const SCALE26_SOURCE = '191a187439af026f33d46fbdc2f9d7958340f789';
export const SCALE26_TREE = 'cffae9ecd3b0a3a786008b5e5a857785eb9bd1ff';
export const SCALE26_BRANCH = 'integration/scale-26-b0-main-20261028';
export const SCALE26_REGISTRY = 'de1f0d395c1ef6b712f89c5516642eccc139adcd';
export const SCALE26_SCORER = '2e7c5f46dec510d86cc64d4b3a0f28d924dc4024';
export const SCALE26_CONTROLS = Object.freeze([
  '.github/scripts/content-scope.mjs',
  '.github/scripts/merge-gate.mjs',
  '.github/scripts/scale26-intake-scope.mjs',
  '.github/scripts/scale26-intake-scope.test.mjs',
  '.github/workflows/ci.yml',
  '.github/workflows/ci-scale26-intake.yml',
].sort());

const git = (...args) => execFileSync('git', args, {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const list = value => value ? value.split('\n').filter(Boolean) : [];
const sha = value => assert.match(value??'',/^[0-9a-f]{40}$/);

export function validateScale26Diff(entries,originalFiles,controls=SCALE26_CONTROLS) {
  assert.equal(originalFiles.length,266,'Frozen Scale26 original difference must contain exactly 266 paths');
  assert.equal(new Set(originalFiles).size,266,'Duplicate original paths');
  const orig = new Set(originalFiles);
  const allowed = new Set(controls);
  assert.deepEqual([...allowed].sort(),[...SCALE26_CONTROLS],'Changed control allowlist');
  const seen = new Set();
  const extras = [];
  for (const entry of entries) {
    const {file,status,oldMode,newMode} = entry;
    assert.equal(typeof file,'string');
    assert(!file.split('/').some(p=>!p||p==='.'||p==='..')&&!/[\\\x00-\x1f\x7f]/.test(file),'Unsafe changed path');
    assert(!seen.has(file),'Duplicate changed path');
    seen.add(file);
    assert.equal(newMode,'100644','No symlinks or executable files');
    assert((status==='A'&&oldMode==='000000')||(status==='M'&&oldMode==='100644'),
      'Only ordinary additions and modifications');
    if (!orig.has(file)) {
      assert(allowed.has(file),'Unknown file outside frozen source and reviewed CI controls: '+file);
      extras.push(file);
    }
  }
  assert.deepEqual([...seen].filter(f=>orig.has(f)).sort(),[...originalFiles].sort(),
    'Original 266 exact changed paths must all remain present');
  assert.deepEqual(extras.sort(),[...controls].sort(),'Every new reviewed control must be included, no extras');
  return {originalPaths:266,ciControlPaths:controls.length};
}

export function scale26IntakePlan(entries,base,head,read=git,env=process.env) {
  const ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF;
  const relevant=ref===SCALE26_BRANCH||String(env.CI_PR_NUMBER)==='379';
  if (!relevant) return null;
  assert.equal(env.CI_EVENT,'pull_request','Only exact PR events qualify; no dispatch/postmerge fallback');
  assert.equal(env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
  assert.equal(env.CI_PR_REPOSITORY,'caohuibj/eduK12-new-version');
  assert.equal(String(env.CI_PR_NUMBER),'379');
  assert.equal(ref,SCALE26_BRANCH);
  assert.equal(base,SCALE26_BASE,'Base moved: re-freeze the exact candidate');
  assert.notEqual(env.CI_FORCE_FULL,'true','No implicit full-route retry');
  assert.notEqual(env.CI_FULL_ACCEPTANCE,'true','No implicit full-route retry');
  sha(head);sha(env.CI_SOURCE_HEAD);
  const object=(refAndPath,commit)=>{
    try{return read('rev-parse',refAndPath);}
    catch {
      read('fetch','--no-tags','--depth=1','origin',commit);
      return read('rev-parse',refAndPath);
    }
  };
  assert.equal(object(SCALE26_SOURCE+'^{tree}',SCALE26_SOURCE),SCALE26_TREE);
  const prSource=env.CI_SOURCE_HEAD;
  assert.equal(object(prSource+'^{tree}',prSource),read('rev-parse',head+'^{tree}'),
    'PR head and real merge checkout must have same content tree on current main');
  const originalPaths=list(read('diff','--name-only','--no-renames',base,SCALE26_SOURCE,'--'));
  const changedSinceFreeze=list(read('diff','--name-only','--no-renames',SCALE26_SOURCE,head,'--')).sort();
  assert.deepEqual(changedSinceFreeze,[...SCALE26_CONTROLS],'Frozen source files cannot be rewritten');
  const counts=validateScale26Diff(entries,originalPaths);
  assert.equal(read('rev-parse',head+':server-version/backend/src/modules/scale/onboarding/instruments.generated.ts'),SCALE26_REGISTRY);
  assert.equal(read('rev-parse',head+':server-version/backend/src/modules/scale/packages/spane12-balance-scorer.ts'),SCALE26_SCORER);
  return {schema:1,route:'scale26-intake',base,source:SCALE26_SOURCE,
    sourceTree:SCALE26_TREE,head,tree:read('rev-parse',head+'^{tree}'),
    prSource,branch:ref,pr:379,postMerge:false,draft:env.CI_IS_DRAFT==='true',...counts};
}
export function scale26IntakeOutputs(plan) {
  const out=participantAccessOutputs(plan);
  delete out.participant_access_plan;
  return {...out,application_route:'scale26-intake',scenario:'scale26-intake',
    scale:true,codeql:true,scale26_intake_plan:JSON.stringify(plan)};
}
