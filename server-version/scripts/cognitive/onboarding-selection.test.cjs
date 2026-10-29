const {test}=require('node:test'),assert=require('node:assert/strict');
const {selectOnboarding}=require('./onboarding-selection.cjs');
const packages=[{task:'reaction',acceptance:{frontendSuites:['shared','reaction']}},{task:'stroop',acceptance:{frontendSuites:['shared','stroop']}}];
test('batch selects exact tasks and deduplicates shared acceptance',()=>{
  const p=selectOnboarding(['--tasks','stroop,reaction','--json'],packages);
  assert.deepEqual(p.tasks,['reaction','stroop']);assert.deepEqual(p.frontendSuites,['reaction','shared','stroop']);assert.equal(p.batch,true);
});
test('JSON object tasks does not grant scope authority',()=>{assert.deepEqual(selectOnboarding(['--tasks-json',JSON.stringify({tasks:['reaction'],selected:true})],packages).tasks,['reaction']);});
test('legacy task and all preserve their non-batch reporting',()=>{assert.equal(selectOnboarding(['reaction','--json'],packages).batch,false);assert.equal(selectOnboarding(['--all'],packages).selected.length,2);});
test('invalid whole batches are rejected',()=>{for(const tasks of ['',',','reaction,','reaction,reaction','reaction,unknown',' reaction'])assert.throws(()=>selectOnboarding(['--tasks',tasks],packages));});
test('JSON empty wrong shape duplicates and unknown reject the whole batch',()=>{for(const value of [null,[],{}, {tasks:[]},{tasks:['reaction','unknown']},{tasks:['reaction','reaction']},{tasks:'reaction'}])assert.throws(()=>selectOnboarding(['--tasks-json',JSON.stringify(value)],packages));});
test('mixed selection sources and unknown flags reject',()=>{for(const args of [['reaction','--all'],['--all','--tasks','reaction'],['--tasks','reaction','--tasks-json','{"tasks":["reaction"]}'],['--task','reaction'],['--json','--json','reaction']])assert.throws(()=>selectOnboarding(args,packages));});
test('legacy content-only needs full base and does not accept orphan base',()=>{assert.equal(selectOnboarding(['reaction','--content-only','--base','a'.repeat(40)],packages).base,'a'.repeat(40));for(const args of [['reaction','--content-only'],['reaction','--base','a'.repeat(40)],['reaction','--content-only','--base','main']])assert.throws(()=>selectOnboarding(args,packages));});
