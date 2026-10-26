// Only entry fences and owned-resource control stubs; never loads production.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const fixture=require('./pr356-exact-lazy-fixture.cjs');
function temporary(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pr356-exact-lazy-control-')),out=path.join(root,'result');fs.mkdirSync(out);
 return {root,out,env:{NODE_ENV:'test',PR356_EXACT_LAZY_ISOLATED:'1',BACKGROUND_WORKERS_ENABLED:'false',ASSESSMENT_REPORT_ASYNC_ENABLED:'false',DATABASE_URL:'postgresql://synthetic:unused@127.0.0.1:55439/pr356_exact_lazy_test_012345abcd',RUNNER_TEMP:root,PR356_DATABASE_OUTPUT_DIR:out,PR356_EXACT_LAZY_OUTPUT:path.join(out,'exact-lazy-result.json')}};
}
function scopedEnvironment(env){const previous={...process.env};for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,env);return()=>{for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,previous)}}
test('exact lazy fixture gates database/path identity before any service factory',async()=>{
 const f=temporary();try{
  assert.equal(fixture.assertIsolation(f.env).databaseName,'pr356_exact_lazy_test_012345abcd');
  for(const change of [{NODE_ENV:'production'},{PR356_EXACT_LAZY_ISOLATED:'0'},{DATABASE_URL:f.env.DATABASE_URL.replace('127.0.0.1','production.invalid')},{DATABASE_URL:f.env.DATABASE_URL.replace(':55439',':5432')},{DATABASE_URL:f.env.DATABASE_URL.replace('pr356_exact_lazy_test_012345abcd','unscoped')},{PR356_EXACT_LAZY_OUTPUT:path.join(f.root,'outside.json')}])assert.throws(()=>fixture.assertIsolation({...f.env,...change}));
  fs.writeFileSync(f.env.PR356_EXACT_LAZY_OUTPUT,'retained');assert.throws(()=>fixture.assertIsolation(f.env),/never overwritten/);assert.equal(fs.readFileSync(f.env.PR356_EXACT_LAZY_OUTPUT,'utf8'),'retained');
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
});
test('exact lazy fixture rejects unsafe environment before loading any actual module',async()=>{
 const f=temporary(),restore=scopedEnvironment({...f.env,PR356_EXACT_LAZY_ISOLATED:'0'});let loads=0;
 try{await assert.rejects(fixture.runFixture({load:async()=>{loads++;throw Error('not reached')}}));assert.equal(loads,0);assert(!fs.existsSync(f.env.PR356_EXACT_LAZY_OUTPUT))}
 finally{restore();fs.rmSync(f.root,{recursive:true,force:true})}
});
test('exact lazy fixture preserves a first database-probe failure and closes only owned fake resources',async()=>{
 const f=temporary(),restore=scopedEnvironment(f.env),events=[],failure=Error('fake database identity probe');
 const fake={db:{$queryRaw:async()=>{events.push('probe');throw failure},$disconnect:async()=>events.push('disconnect')},queues:{closeQueues:async value=>{assert.equal(value,true);events.push('queues-close')}}};
 try{
  await assert.rejects(fixture.runFixture({load:async()=>fake}),error=>error===failure);
  const result=JSON.parse(fs.readFileSync(f.env.PR356_EXACT_LAZY_OUTPUT,'utf8'));
  assert.equal(result.status,'failed');assert.equal(result.failure.stage,'verify-fresh-schema');assert.deepEqual(result.assertions,[]);assert.deepEqual(events,['probe','queues-close','disconnect']);
 }finally{restore();fs.rmSync(f.root,{recursive:true,force:true})}
});
