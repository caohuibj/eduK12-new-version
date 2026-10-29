import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {recheckCognitiveIntake,requiredChecks,failedChecks} from './merge-gate.mjs';
import {acceptanceFor} from './content-scope.mjs';
import {runInNewContext} from 'node:vm';
import {toolingOnly,componentFingerprint} from '../../server-version/scripts/release/policy.mjs';
import {cognitiveTaskRoot as root,selectCognitiveIntake,readCognitiveIntakeDiff,cognitiveIntakeToolingInputs,cognitiveIntakeToolingChanged} from './cognitive-intake-scope.mjs';
const repo=path.resolve(import.meta.dirname,'../..');
const actual=task=>fs.readFileSync(path.join(repo,root,task,'task-package.json'),'utf8');
const entry=(file,more={})=>({file,oldMode:'100644',newMode:'100644',status:'M',...more});
const select=(entries,{current=actual,previous=actual}={})=>selectCognitiveIntake(entries,file=>current(file.slice(root.length).split('/')[0]),{readBaseFile:file=>previous(file.slice(root.length).split('/')[0])});
test('four literal declaration paths select data per exact task',()=>{for(const name of ['seeds.ts','participant-presentation.ts','governance.ts','scientific.ts']){const p=select([entry(root+'reaction/'+name)]);assert.equal(p.selected,true);assert.equal(p.mode,'data');assert.deepEqual(p.tasks,['reaction']);}});
test('backend task implementation and fixture select task, never data',()=>{for(const name of ['definitions.ts','package.ts','fixtures/1.0.0-1.1.0.json'])assert.equal(select([entry(root+'reaction/'+name)]).mode,'task');});
test('all current standard packages keep their real pre-existing shared suites',()=>{const tasks=fs.readdirSync(path.join(repo,root)).filter(t=>fs.existsSync(path.join(repo,root,t,'task-package.json')));assert.ok(tasks.length>=25);for(const task of tasks)assert.equal(select([entry(root+task+'/seeds.ts')]).selected,true,task);});
test('frontend runner UI and stimuli require unsupported real browser',()=>{for(const file of ['server-version/frontend/src/modules/cognitive/tasks/reaction/ReactionTask.tsx',root+'reaction/assets/stimulus.webp','server-version/frontend/src/modules/cognitive/generated/runners.ts']){const p=select([entry(root+'reaction/seeds.ts'),entry(file)]);assert.equal(p.status,'UNSUPPORTED_SELECTED_BROWSER');assert.deepEqual(p.browserTasks,['reaction']);}});
test('new engine or new task cannot enter backend-only intake',()=>{
  const current=task=>{const p=JSON.parse(actual(task));p.identities.push({...p.identities[0],engineVersion:'2.0.0'});return JSON.stringify(p);};
  assert.equal(select([entry(root+'reaction/task-package.json')],{current}).status,'UNSUPPORTED_SELECTED_BROWSER');
  assert.equal(select([entry(root+'reaction/task-package.json')],{previous:()=>null}).status,'NOT_SELECTED');
  const own=task=>{const p=JSON.parse(actual(task));p.acceptance.frontendSuites=['src/modules/cognitive/tasks/reaction/Reaction.test.tsx'];return JSON.stringify(p);};
  assert.equal(select([entry(root+'reaction/task-package.json')],{previous:()=>null,current:own}).status,'UNSUPPORTED_SELECTED_BROWSER');
});
test('existing suite removal substitution and unrelated new suite reject',()=>{for(const suites of [[],['src/modules/cognitive/tasks/stroop/Foo.test.tsx'],[...JSON.parse(actual('reaction')).acceptance.frontendSuites,'src/modules/cognitive/Other.test.tsx']]){const current=t=>JSON.stringify({...JSON.parse(actual(t)),acceptance:{frontendSuites:suites}});assert.equal(select([entry(root+'reaction/task-package.json')],{current}).selected,false);}});
test('same-engine historical scorer identity removal cannot pass intake',()=>{const current=t=>{const p=JSON.parse(actual(t));p.identities=p.identities.filter(id=>id.scoringVersion!=='1.1.0');return JSON.stringify(p);};const p=select([entry(root+'reaction/task-package.json')],{current});assert.equal(p.selected,false);assert.equal(p.reason,'existing-identity-removed');});
test('shared core schemas dependencies control and mixed domains cannot use intake',()=>{for(const file of ['server-version/backend/src/modules/cognitive/schemas/reaction.config.ts','server-version/backend/src/modules/cognitive/tasks/shared/helper.ts','server-version/backend/package-lock.json','.github/scripts/merge-gate.mjs','server-version/backend/src/modules/scale/instruments/a/1.0.0/instrument.ts'])assert.equal(select([entry(root+'reaction/seeds.ts'),entry(file)]).selected,false);});
test('unknown generated paths and generated-only disguise reject',()=>{assert.equal(select([entry('server-version/backend/src/modules/cognitive/generated/execution.ts')]).selected,false);assert.equal(select([entry(root+'reaction/seeds.ts'),entry('server-version/backend/src/modules/cognitive/generated/unknown.ts')]).selected,false);assert.equal(select([entry(root+'reaction/seeds.ts'),entry('server-version/backend/src/modules/cognitive/generated/seeds.ts')]).mode,'task');});
test('raw scope rejects deletion symlink executable duplicate and malformed paths',()=>{for(const e of [entry(root+'reaction/seeds.ts',{newMode:'120000'}),entry(root+'reaction/seeds.ts',{newMode:'100755'}),entry(root+'reaction/seeds.ts',{status:'D',newMode:'000000'}),entry(root+'reaction/../seeds.ts')])assert.equal(select([e]).selected,false);assert.equal(select([entry(root+'reaction/seeds.ts'),entry(root+'reaction/seeds.ts')]).selected,false);});
test('task prefix never exempts database dependency or control files',()=>{for(const file of ['schema.prisma','migration.sql','package-lock.json','package.json','tsconfig.json','.github/control.mjs','scripts/unknown.cjs'])assert.equal(select([entry(root+'reaction/'+file)]).selected,false,file);});
test('real complete Git diff binds actual checkout and detects dirty index/worktree',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cognitive-scope-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const put=(file,text)=>{const p=path.join(dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
  git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');put(root+'reaction/task-package.json',actual('reaction'));put(root+'reaction/seeds.ts','export const seeds=[]');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
  put(root+'reaction/seeds.ts','export const seeds=[1]');git('add','.');git('commit','-qm','candidate');const head=git('rev-parse','HEAD');
  assert.equal(readCognitiveIntakeDiff(base,head,{cwd:dir}).mode,'data');assert.throws(()=>readCognitiveIntakeDiff(head,base,{cwd:dir}),/identity/);
  put(root+'reaction/seeds.ts','dirty');assert.throws(()=>readCognitiveIntakeDiff(base,head,{cwd:dir}),/Dirty/);git('add','.');assert.throws(()=>readCognitiveIntakeDiff(base,head,{cwd:dir}),/Dirty/);
  git('reset','--hard',head);put('unrelated.txt','leave untracked');assert.equal(readCognitiveIntakeDiff(base,head,{cwd:dir}).selected,true);
  put('server-version/backend/package-lock.json','{}');git('add','.');git('commit','-qm','mixed');assert.equal(readCognitiveIntakeDiff(base,git('rev-parse','HEAD'),{cwd:dir}).selected,false);
});
test('tooling inputs are a fixed pure contract',()=>{assert.equal(cognitiveIntakeToolingChanged(['server-version/backend/src/scripts/cognitive-onboarding-check.ts']),true);assert.equal(cognitiveIntakeToolingChanged(['server-version/backend/src/index.ts']),false);assert.equal(new Set(cognitiveIntakeToolingInputs).size,cognitiveIntakeToolingInputs.length);});
test('formal Git scope CLI selects only content/security and refuses mixed shared dependency and native candidates',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cognitive-route-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const put=(file,text)=>{const p=path.join(dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
  git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');put(root+'reaction/task-package.json',actual('reaction'));put(root+'reaction/seeds.ts','export const seeds=[]');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
  const run=()=>spawnSync(process.execPath,[path.join(repo,'.github/scripts/content-scope.mjs')],{cwd:dir,env:{...process.env,CI_BASE_SHA:base,GITHUB_EVENT_NAME:'pull_request',CI_FORCE_FULL:'false',GITHUB_HEAD_REF:'synthetic-cognitive',CI_HEAD_REF:'synthetic-cognitive',GITHUB_REF_NAME:'synthetic-cognitive',GITHUB_OUTPUT:''},encoding:'utf8'});
  put(root+'reaction/seeds.ts','export const seeds=[1]');git('add','.');git('commit','-qm','declaration');const good=git('rev-parse','HEAD');
  const successful=run();assert.equal(successful.status,0,successful.stderr);const scope=JSON.parse(successful.stdout);assert.equal(scope.cognitive_intake_light,true);assert.equal(scope.content,true);assert.equal(scope.frontend_build,false);assert.equal(scope.codeql,true);for(const flag of Object.keys(acceptanceFor([])))assert.equal(scope[flag],false,flag);
  const outputs=Object.fromEntries(Object.entries(scope).map(([k,v])=>[k,typeof v==='string'?v:String(v)]));
  const needs={scope:{result:'success',outputs},content:{result:'success'},codeql:{result:'success'}};
  assert.deepEqual(requiredChecks(needs,false),['scope','content','codeql']);assert.deepEqual(failedChecks(needs,false),[]);assert.deepEqual(recheckCognitiveIntake(needs,{base,head:good,cwd:dir}),[]);
  for(const value of [undefined,'false']) {const falseNeeds={scope:{result:'success',outputs:{...outputs,cognitive:value,cognitive_intake_light:value}},codeql:{result:'success'}};assert.ok(recheckCognitiveIntake(falseNeeds,{base,head:good,cwd:dir}).includes('recomputed-cognitive-intake'));assert.ok(recheckCognitiveIntake(falseNeeds,{base,head:good,cwd:dir}).includes('content'));}
  for(const name of ['scope','content','codeql'])for(const result of [undefined,'failure','skipped','cancelled'])assert.ok(recheckCognitiveIntake({...needs,[name]:{result}},{base,head:good,cwd:dir}).includes(name));
  for(const file of ['server-version/backend/package-lock.json','server-version/backend/src/modules/cognitive/schemas/reaction.config.ts','server-version/backend/src/modules/scale/instruments/a/1.0.0/instrument.ts']) {git('reset','--hard',good);put(file,'{}');git('add','.');git('commit','-qm','unsupported mixed');const result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/UNSUPPORTED_COGNITIVE_INTAKE:shared-or-mixed-input/);}
  git('reset','--hard',good);put(root+'hearts-and-flowers/package.ts','export const nativeCandidate=1');git('add','.');git('commit','-qm','unregistered native');const native=run();assert.notEqual(native.status,0);assert.match(native.stderr,/missing-task-package/);
  git('reset','--hard',good);put('server-version/backend/src/modules/cognitive/content-candidates/hearts-flowers/instrument.ts','export const candidate=1');git('add','.');git('commit','-qm','actual native boundary');const realNative=run();assert.notEqual(realNative.status,0);assert.match(realNative.stderr,/native-candidate-not-registered-in-task-packages/);assert.equal(JSON.parse(realNative.stdout).status,'UNSUPPORTED_NATIVE_CANDIDATE');
  git('reset','--hard',good);put('server-version/frontend/src/modules/cognitive/tasks/reaction/ReactionTask.tsx','export const Runner=1');git('add','.');git('commit','-qm','browser');const browser=run();assert.equal(browser.status,0,browser.stderr);const browserScope=JSON.parse(browser.stdout);assert.equal(JSON.parse(browserScope.cognitive_intake_plan).status,'UNSUPPORTED_SELECTED_BROWSER');assert.ok(recheckCognitiveIntake({scope:{result:'success',outputs:Object.fromEntries(Object.entries(browserScope).map(([k,v])=>[k,typeof v==='string'?v:String(v)]))},content:{result:'success'},codeql:{result:'success'}},{base,head:git('rev-parse','HEAD'),cwd:dir}).includes('unsupported-or-mixed-cognitive-intake'));
});
test('workflow lane isolation dependency preparation and CodeQL cover the fixed checker inputs',()=>{
  const content=fs.readFileSync(path.join(repo,'.github/workflows/scale-onboarding-boundary.yml'),'utf8');
  const lane=content.split('  cognitive-intake:\n')[1].split('\n  scale-intake:')[0];
  assert.doesNotMatch(lane,/services:|postgres:|redis:|docker |--all|npm run typecheck/);assert.match(lane,/node .github\/scripts\/cognitive-intake-scope.mjs/);assert.match(lane,/env -u DATABASE_URL node .github\/scripts\/cognitive-intake-check.mjs/);assert.match(content,/!inputs.scale_intake_light && !inputs.cognitive_intake_light/);
  for(const file of ['.github/scripts/local-validation.mjs','.github/workflows/ci-release-tools.yml'])assert.match(fs.readFileSync(path.join(repo,file),'utf8'),/cognitiveIntakeToolingChanged\(files\)/);
  const ci=fs.readFileSync(path.join(repo,'.github/workflows/ci.yml'),'utf8');const paths=ci.split("scenario == 'release-tooling' && 'paths: [")[1].split(']')[0];for(const file of ['server-version/backend/src/scripts/cognitive-onboarding-check.ts','server-version/scripts/cognitive'])assert.ok(paths.includes(file));assert.match(ci,/steps.cognitive-codeql-config.outputs.config/);
});
test('actual selected CodeQL generator includes changed allowed generated TypeScript',()=>{
  const ci=fs.readFileSync(path.join(repo,'.github/workflows/ci.yml'),'utf8');
  const block=ci.split('      - name: bound selected cognitive analysis to task inputs and checker controls\n')[1].split('\n      - name:')[0];
  const code=block.split('        run: |\n')[1].split('\n').map(l=>l.startsWith('          ')?l.slice(10):l).join('\n');
  let output='';const generated='server-version/backend/src/modules/cognitive/generated/seeds.ts';
  runInNewContext(code,{require:name=>name==='node:fs'?{existsSync:()=>true,appendFileSync:(_,text)=>{output+=text;}}:assert,process:{env:{COGNITIVE_PLAN:JSON.stringify({selected:true,tasks:['reaction'],files:[generated]}),GITHUB_OUTPUT:'unused'}}});
  const config=JSON.parse(output.trim().slice('config='.length));assert.ok(config.paths.includes(generated));assert.ok(config.paths.includes(root+'reaction'));assert.ok(config.paths.includes('server-version/backend/src/scripts/cognitive-onboarding-check.ts'));assert.ok(config.paths.includes('server-version/scripts/cognitive'));
});
test('only fixed cognitive controls leave application fingerprints unchanged',t=>{
  assert.equal(toolingOnly(cognitiveIntakeToolingInputs.map(file=>entry(file))),true);
  assert.equal(toolingOnly([entry('server-version/backend/src/scripts/unknown.ts')]),false);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cognitive-fingerprint-'));const previous=process.cwd();t.after(()=>{process.chdir(previous);fs.rmSync(dir,{recursive:true,force:true});});
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const put=(file)=>{const p=path.join(dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'export const value=1;');};
  git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');put('server-version/backend/src/app.ts');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
  put('server-version/backend/src/scripts/cognitive-onboarding-check.ts');git('add','.');git('commit','-qm','tool');const head=git('rev-parse','HEAD');process.chdir(dir);assert.equal(componentFingerprint(base,'backend'),componentFingerprint(head,'backend'));
  put('server-version/backend/src/scripts/unknown.ts');git('add','.');git('commit','-qm','unknown');assert.notEqual(componentFingerprint(head,'backend'),componentFingerprint(git('rev-parse','HEAD'),'backend'));
});
