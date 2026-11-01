import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {participantAccessOutputs} from './participant-access-scope.mjs';
export const branch='fix/post356-reference-kind-picker-20261027';
export const controlBranch='fix/post358-shallow-ci-20261027';
export const controlBase='6bb3a4d008a30b125e9b1ffa705a07548bbad72b';
export const productMerge='6bb3a4d008a30b125e9b1ffa705a07548bbad72b';
export const controlMerge='04a8d994207d7b831b874d4be4f5c31640466458';
export const controlFiles=['.github/scripts/post356-scope.mjs','.github/scripts/post356-scope.test.mjs','.github/workflows/ci.yml'];
export const baseSHA='83955b898b84722a6518a908d6d1038e44e08a7d';
export const files=Object.freeze([
 'server-version/backend/src/modules/assessment-reference/longitudinal.ts',
 'server-version/backend/src/modules/assessment-runtime/unit-result.ts',
 'server-version/backend/src/modules/measurement-content/standard-combination-use.ts',
 'server-version/backend/src/__tests__/assessment-reference/scale-wave1-longitudinal.test.ts',
 'server-version/backend/src/__tests__/measurement-content/training-standard-source.test.ts',
 '.github/scripts/post356-scope.mjs','.github/scripts/post356-scope.test.mjs',
 '.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml',
 'docs/development/post356-repair.md',
]);
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function post356Plan(entries,base,head,read=git,env=process.env){
 const ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 const historicalPush=env.CI_EVENT==='push'&&(env.GITHUB_REF_NAME||ref)==='main'&&[productMerge,controlMerge].includes(head);
 if(ref!==branch&&ref!==controlBranch&&!historicalPush)return null;
 if(!entries.some(e=>e.file==='.github/scripts/post356-scope.mjs'))throw Error('Post356 scope missing; no full-platform fallback');
 const controlOnly=historicalPush?head===controlMerge:ref===controlBranch;
 assert.equal(base,controlOnly?controlBase:baseSHA,'Frozen base drift');assert.match(head,/^[a-f0-9]{40}$/);
 assert(['pull_request','push'].includes(env.CI_EVENT),'No manual/full fallback');
 assert.notEqual(env.CI_FORCE_FULL,'true');assert.notEqual(env.CI_FULL_ACCEPTANCE,'true');
 if(env.CI_EVENT==='pull_request'){
  assert.equal(ref,controlOnly?controlBranch:branch);assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
  assert.match(String(env.CI_PR_NUMBER),/^[1-9][0-9]*$/);assert.match(env.CI_SOURCE_HEAD||'',/^[a-f0-9]{40}$/);
  assert.equal(read('rev-parse',env.CI_SOURCE_HEAD+'^{tree}'),read('rev-parse',head+'^{tree}'));
 }else{
  assert.equal(env.GITHUB_REF_NAME||ref,'main');
  // Checkout depth 1 hides parents from git show even though the raw commit
  // records them. Fetch only this immutable merge plus its two parents.
  read('fetch','--no-tags','--depth=2','origin',head);
  const parents=read('cat-file','-p',head).split('\n').filter(line=>line.startsWith('parent ')).map(line=>line.slice(7));assert.equal(parents.length,2);assert.equal(parents[0],base);
  assert.equal(read('rev-parse',parents[1]+'^{tree}'),read('rev-parse',head+'^{tree}'));
 }
 assert.deepEqual(entries.map(e=>e.file).sort(),[...(controlOnly?controlFiles:files)].sort(),'Exact complete changed paths required');
 for(const e of entries){assert.equal(e.newMode,'100644');assert(['A','M'].includes(e.status));assert.equal(e.oldMode,e.status==='A'?'000000':'100644');}
 if(controlOnly)assert.equal(read('rev-parse',base+':server-version/backend'),read('rev-parse',head+':server-version/backend'));
 assert.equal(read('rev-parse',base+':server-version/frontend'),read('rev-parse',head+':server-version/frontend'));
 return {schema:1,route:'post356',base,head,controlOnly,postMerge:env.CI_EVENT==='push',changes:entries};
}
export function post356Outputs(p){const o=participantAccessOutputs(p);delete o.participant_access_plan;return {...o,application_route:'post356',scenario:'post356',post356_plan:JSON.stringify(p)};}
