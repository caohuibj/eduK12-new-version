import test from 'node:test';
import assert from 'node:assert/strict';
import {validationPlan,verifyPlan,planFailures,LANES,categoryFor} from './ci-validation-plan.mjs';
const expected={sha:'a'.repeat(40),base:'b'.repeat(40),runId:'42'};
const entry=(file,extra={})=>({file,status:'M',oldMode:'100644',newMode:'100644',...extra});
const plan=(files,options={})=>validationPlan(files.map(x=>typeof x==='string'?entry(x):x),{...expected,acceptance:{},...options});
const fe='server-version/frontend/src/',be='server-version/backend/src/';
test('ordinary engineering docs and local styling have explicit omitted checks',()=>{
 const docs=plan(['README.md']);assert.deepEqual(docs.required,['preflight','documentation']);assert.ok(docs.omitted.includes('codeql'));
 const css=plan([fe+'pages/teacher/assessment-workbench.css']);for(const id of ['frontend-static','frontend-production'])assert.ok(css.required.includes(id));for(const id of ['backend-regression','media','recovery','codeql'])assert.ok(css.omitted.includes(id));
});
test('mixed frontend/docs/backend scopes take the union without hiding checks',()=>{
 const mixed=plan(['README.md',fe+'pages/CourseList.tsx',be+'utils/logger.ts']);
 assert.equal(mixed.scenario,'mixed');for(const id of ['documentation','frontend-static','frontend-regression','backend-regression','api','images','codeql'])assert.ok(mixed.required.includes(id),id);
 assert.ok(mixed.omitted.includes('recovery'));
});
test('shared sessions, persistence, scientific runtimes and unknown paths expand to full',()=>{
 for(const f of [fe+'utils/session.ts',fe+'utils/authStorage.ts',fe+'contexts/AuthContext.tsx',fe+'services/persistence/finalDraftStore.ts',fe+'modules/cognitive/pages/Runner.tsx',be+'controllers/courseStudentPasswordController.ts','server-version/backend/prisma/schema.prisma','.github/workflows/ci.yml','mystery.ts']){
 const p=plan([f]);assert.equal(p.scenario,'platform',f);for(const id of ['backend-regression','ui-cross-browser','performance','recovery','media','codeql'])assert.ok(p.required.includes(id),f+':'+id);}
});
test('deletion, rename sides, symlink, executable and mode changes cannot shrink scope',()=>{
 for(const extra of [{status:'D',newMode:'000000'},{status:'T',newMode:'120000'},{newMode:'100755'},{oldMode:'100755'},{status:'R'}])assert.equal(plan([entry('README.md',extra)]).scenario,'platform');
 const rename=plan([entry('old.ts',{status:'D',newMode:'000000'}),entry('README.md',{status:'A',oldMode:'000000'})]);assert.equal(rename.scenario,'platform');
});
test('test-only routes retain modified tests and correct tool/runtime consumers',()=>{
 const feTest=plan([fe+'pages/Courses.test.tsx']);assert.ok(feTest.required.includes('frontend-unit'));assert.deepEqual(feTest.testFiles,[fe+'pages/Courses.test.tsx']);assert.ok(feTest.omitted.includes('frontend-production'));
 const beTest=plan([be+'__tests__/controllers/courseLibrary.test.ts']);assert.ok(beTest.required.includes('backend-unit'));assert.ok(beTest.omitted.includes('images'));
 const ui=plan(['server-version/e2e/qa-round5-workbench-browser-e2e.cjs']);for(const id of ['frontend-ui-lab','ui-round5','codeql'])assert.ok(ui.required.includes(id));assert.ok(ui.omitted.includes('backend-build'));
 const ci=plan(['.github/scripts/ci-timing-report.mjs']);assert.equal(ci.scenario,'ci-component');assert.ok(ci.omitted.includes('api'));
});
test('shared CSS expands layout and preserves each producer',()=>{
 const p=plan([fe+'index.css']);for(const id of ['frontend-ui-lab','ui-critical','ui-screenshots','ui-interactions','ui-round5','ui-cross-browser'])assert.ok(p.required.includes(id));
 for(const [id,j]of Object.entries(p.jobs))for(const artifact of j.consumes??[])assert.ok(Object.values(p.jobs).some(x=>x.produces===artifact),id);
});
test('dependency runtime changes add browser/media while pure tool upgrades stay scoped',()=>{
 const p=plan([],{dependencyOnly:true});assert.ok(p.required.includes('performance'));assert.ok(p.omitted.includes('api'));
 const runtime=plan([],{dependencyOnly:true,runtimeDependencies:true});for(const id of ['api','media','ui-cross-browser'])assert.ok(runtime.required.includes(id));assert.equal(runtime.media.length,5);
});
test('draft does not activate whole platform; explicit force retains complete checks',()=>{
 const draft=plan(['unknown.ts'],{draft:true});assert.ok(draft.required.includes('backend-static'));assert.ok(draft.omitted.includes('performance'));
 const full=plan(['README.md'],{draft:true,forceFull:true});assert.ok(full.required.includes('performance'));
});
test('exact source/run, complete inventory and every selected conclusion fail closed',()=>{
 const p=plan([fe+'pages/Courses.tsx']);verifyPlan(p,expected);const green=Object.fromEntries(p.required.map(id=>[id,'success']));assert.deepEqual(planFailures(p,green,expected),[]);
 for(const result of ['failure','cancelled','skipped',undefined]){const states={...green,api:result};assert.deepEqual(planFailures(p,states,expected),['api']);}
 for(const key of ['sha','base','runId'])assert.throws(()=>verifyPlan(p,{...expected,[key]:'different'}),/mismatch/);
 const copy=structuredClone(p);copy.required.pop();assert.throws(()=>verifyPlan(copy,expected),/Malformed/);
});
test('lane labels are exclusive and never a generic host target',()=>{
 for(const lane of ['mac-light','mac-heavy','win-light','win-heavy'])assert.ok(LANES[lane].includes('eduk12-'+lane));assert.equal(new Set(Object.values(LANES).map(x=>x.at(-1))).size,4);
 const p=plan(['unknown.ts']);assert.equal(p.jobs.codeql.lane,'win-light');assert.equal(p.jobs.performance.exclusive,true);assert.equal(p.jobs['frontend-production'].lane,'mac-heavy');
});
test('malformed paths and missing provenance cannot be classified optimistically',()=>{
 for(const file of ['../README.md','docs//a.md','README.md\n','.github\\scripts\\ci-timing-report.mjs'])assert.equal(categoryFor(entry(file)),'platform');
 assert.throws(()=>plan(['README.md'],{sha:'abc'}),/Exact/);
});

test('a recomputed digest cannot suppress a required consumer or forge the complete diff',async()=>{
 const {createHash}=await import('node:crypto');const {verifyDerivedPlan}=await import('./ci-validation-plan.mjs');
 const input=[{file:'server-version/frontend/src/theme.css',status:'M',oldMode:'100644',newMode:'100644'}];
 const options={sha:'a'.repeat(40),base:'b'.repeat(40),runId:'123'};const original=validationPlan(input,options);
 verifyDerivedPlan(original,input,options);
 const forged=structuredClone(original);forged.required=forged.required.filter(x=>x!=='ui-cross-browser');forged.omitted.push('ui-cross-browser');delete forged.jobs['ui-cross-browser'];delete forged.digest;forged.digest=createHash('sha256').update(JSON.stringify(forged)).digest('hex');
 assert.throws(()=>verifyDerivedPlan(forged,input,options),/complete source diff/);
 const duplicated=structuredClone(original);duplicated.omitted[1]=duplicated.omitted[0];delete duplicated.digest;duplicated.digest=createHash('sha256').update(JSON.stringify(duplicated)).digest('hex');
 assert.throws(()=>verifyPlan(duplicated,{}),/inventory/);
});
