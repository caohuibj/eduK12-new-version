import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCALE26_BASE,SCALE26_SOURCE,SCALE26_TREE,SCALE26_BRANCH,SCALE26_CONTROLS,
  SCALE26_REGISTRY,SCALE26_SCORER,validateScale26Diff,scale26IntakePlan,scale26IntakeOutputs
} from './scale26-intake-scope.mjs';

const original=Array.from({length:266},(_,i)=>'docs/scale-instruments/exact-source-'+String(i).padStart(3,'0')+'.json');
const regular=file=>({file,status:'A',oldMode:'000000',newMode:'100644'});
const entries=[...original,...SCALE26_CONTROLS].map(regular);
const head='a'.repeat(40),sourceHead='b'.repeat(40),mergedTree='c'.repeat(40);
const env={CI_EVENT:'pull_request',CI_PR_NUMBER:'379',CI_HEAD_REF:SCALE26_BRANCH,
  CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',GITHUB_REPOSITORY:'caohuibj/eduK12-new-version',
  CI_SOURCE_HEAD:sourceHead,CI_IS_DRAFT:'false',CI_FORCE_FULL:'false',CI_FULL_ACCEPTANCE:'false'};
const read=(...args)=>{
  const key=args.join(' ');
  if(key==='rev-parse '+SCALE26_SOURCE+'^{tree}')return SCALE26_TREE;
  if(key==='rev-parse '+sourceHead+'^{tree}')return mergedTree;
  if(key==='rev-parse '+head+'^{tree}')return mergedTree;
  if(key==='rev-parse '+head+':server-version/backend/src/modules/scale/onboarding/instruments.generated.ts')return SCALE26_REGISTRY;
  if(key==='rev-parse '+head+':server-version/backend/src/modules/scale/packages/spane12-balance-scorer.ts')return SCALE26_SCORER;
  if(key==='diff --name-only --no-renames '+SCALE26_BASE+' '+SCALE26_SOURCE+' --')return original.join('\n');
  if(key==='diff --name-only --no-renames '+SCALE26_SOURCE+' '+head+' --')return SCALE26_CONTROLS.join('\n');
  throw new Error('Unexpected Git command: '+key);
};

test('only the exact 266 frozen sources plus six reviewed CI controls admit Scale26',()=>{
  assert.deepEqual(validateScale26Diff(entries,original),{originalPaths:266,ciControlPaths:6});
  const plan=scale26IntakePlan(entries,SCALE26_BASE,head,read,env);
  assert.equal(plan.route,'scale26-intake');assert.equal(plan.source,SCALE26_SOURCE);
  assert.equal(plan.tree,mergedTree);assert.equal(plan.pr,379);
  const output=scale26IntakeOutputs(plan);
  assert.equal(output.application_route,'scale26-intake');
  assert.equal(output.scale,true);assert.equal(output.codeql,true);
  assert.equal(output.content,false);assert.equal(output.frontend,false);
  assert.equal(JSON.parse(output.scale26_intake_plan).tree,mergedTree);
});

test('unknown files, missing originals, deletion, symlinks, executable modes and duplicates fail closed',()=>{
  for(const candidate of [
    [...entries,regular('server-version/backend/src/modules/scale/onboarding/install.ts')],
    entries.slice(1),
    [...entries.slice(0,-1),{...entries.at(-1),status:'D',newMode:'000000'}],
    [...entries.slice(0,-1),{...entries.at(-1),newMode:'120000'}],
    [...entries.slice(0,-1),{...entries.at(-1),newMode:'100755'}],
    [...entries,entries[0]],
    [...entries,regular('../outside')],
  ])assert.throws(()=>validateScale26Diff(candidate,original));
});

test('invalid source, repository, event, PR, branch, force-full and moved main cannot select the lane',()=>{
  for(const variant of [
    {CI_EVENT:'workflow_dispatch'},{CI_PR_NUMBER:'378'}, {CI_HEAD_REF:'not-the-reviewed-branch'},
    {CI_PR_REPOSITORY:'someone-else/fork'}, {GITHUB_REPOSITORY:'someone-else/fork'},
    {CI_FORCE_FULL:'true'}, {CI_FULL_ACCEPTANCE:'true'}, {CI_SOURCE_HEAD:'not-a-sha'},
  ])assert.throws(()=>scale26IntakePlan(entries,SCALE26_BASE,head,read,{...env,...variant}));
  assert.throws(()=>scale26IntakePlan(entries,'f'.repeat(40),head,read,env));
  assert.equal(scale26IntakePlan(entries,SCALE26_BASE,head,read,{...env,CI_PR_NUMBER:'400',CI_HEAD_REF:'other-feature'}),null);
});

test('modified frozen product, source tree drift, registry, scorer, and PR merge-tree mismatch are rejected',()=>{
  const overrides=[
    (...args)=>args.join(' ')==='diff --name-only --no-renames '+SCALE26_SOURCE+' '+head+' --'
      ? [...SCALE26_CONTROLS,original[0]].join('\n'):read(...args),
    (...args)=>args.join(' ')==='rev-parse '+SCALE26_SOURCE+'^{tree}'?'f'.repeat(40):read(...args),
    (...args)=>args.join(' ')==='rev-parse '+sourceHead+'^{tree}'?'f'.repeat(40):read(...args),
    (...args)=>args.join(' ')==='rev-parse '+head+':server-version/backend/src/modules/scale/onboarding/instruments.generated.ts'?'f'.repeat(40):read(...args),
    (...args)=>args.join(' ')==='rev-parse '+head+':server-version/backend/src/modules/scale/packages/spane12-balance-scorer.ts'?'f'.repeat(40):read(...args),
  ];
  for(const fake of overrides)assert.throws(()=>scale26IntakePlan(entries,SCALE26_BASE,head,fake,env));
});
