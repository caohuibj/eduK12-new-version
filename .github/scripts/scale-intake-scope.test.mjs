import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,statSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {selectScaleIntake,readScaleIntakeDiff,scaleIntakeToolingChanged} from './scale-intake-scope.mjs';
import {classifyChanges,contentCodeqlRequired} from './content-scope.mjs';
import {requiredChecks,failedChecks,recheckContentSast} from './merge-gate.mjs';
import {renderManifest} from '../../server-version/backend/scripts/generate-situational-instruments.mjs';
import {componentFingerprint} from '../../server-version/scripts/release/policy.mjs';
const file='server-version/backend/src/modules/scale/instruments/test_scale/1.0.0/instrument.ts';
const add=f=>({file:f,status:'A',oldMode:'000000',newMode:'100644'});
const mod=f=>({...add(f),status:'M',oldMode:'100644'});
const scaleIndex='server-version/backend/src/modules/scale/onboarding/instruments.generated.ts';
const json=file.replace('instrument.ts','source.json');
const wrapperText="import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'; import source from './source.json'; export const SCALE_INSTRUMENT_SOURCE = source as unknown as ScaleInstrumentSourceV1;";
const renderScaleInstrumentManifest=paths=>paths.map((path,i)=>`import { SCALE_INSTRUMENT_SOURCE as source${i} } from '${path}';`).join('\n')+"\nimport type { ScaleInstrumentSourceV1, ScalePackageV2, VersionedScorerRegistration } from './types';\nexport const GENERATED_EXECUTABLE_SCALE_PACKAGES: readonly ScalePackageV2[] = [];\nexport const GENERATED_SCALE_SCORER_PLUGINS: readonly VersionedScorerRegistration[] = [];\nexport const GENERATED_SCALE_INSTRUMENT_SOURCES: readonly ScaleInstrumentSourceV1[] = ["+paths.map((_,i)=>'source'+i).join(',')+"];\n";
const declarationFixture=()=>{
 const files={[file]:wrapperText,[json]:JSON.stringify({identity:{instrumentKey:'test_scale',instrumentVersion:'1.0.0'}}),[scaleIndex]:renderScaleInstrumentManifest(['../instruments/test_scale/1.0.0/instrument'])};
 const previous={[scaleIndex]:renderScaleInstrumentManifest([])};
 const readers={readHeadFile:path=>files[path],readBaseFile:path=>previous[path],listHeadFiles:()=>Object.keys(files).filter(path=>path!==scaleIndex).map(file=>({file,mode:'100644'})),listBaseFiles:()=>[]};
 return {files,readers,entries:[add(file),add(json),mod(scaleIndex)]};
};

test('proven JSON wrappers and canonical registry select real content without blanket SAST',()=>{
 const {files,readers,entries}=declarationFixture();
 assert.equal(contentCodeqlRequired(entries,readers),false);
 assert.equal(recheckContentSast({scope:{outputs:{codeql:'false'}},content:{result:'success'}},entries,readers).length,0);
 for(const result of ['failure','skipped','cancelled',undefined])assert(recheckContentSast({scope:{outputs:{codeql:'false'}},content:{result}},entries,readers).includes('content'));
 assert(recheckContentSast({scope:{outputs:{codeql:'true'}},content:{result:'success'}},entries,readers).includes('recomputed-content-sast'));
 files[scaleIndex]+='\nexport const run = () => fetch("https://example.invalid");';
 assert.equal(contentCodeqlRequired(entries,readers),true);
 assert(recheckContentSast({scope:{outputs:{codeql:'false'}},content:{result:'success'}},entries,readers).includes('recomputed-content-sast'));
});

test('unknown syntax imports functions custom scorers modes and mixed controls retain SAST',()=>{
 for(const changed of [wrapperText+'export const extra=1;',wrapperText.replace('source as unknown','source.map(x=>x) as unknown'),wrapperText+'export function score(){}',wrapperText.replace("import source from './source.json'","import source from './runtime'"),wrapperText+'import "./runtime";',wrapperText+'const broken = {']){
  const {files,readers,entries}=declarationFixture();files[file]=changed;assert.equal(contentCodeqlRequired(entries,readers),true,changed);
 }
 for(const executable of [{definition:{scoring:{scorerKey:'custom'}}},{scorerPlugins:[{key:'custom'}]}]){
  const {files,readers,entries}=declarationFixture();files[json]=JSON.stringify({identity:{instrumentKey:'test_scale',instrumentVersion:'1.0.0'},executable});assert.equal(contentCodeqlRequired(entries,readers),true);
 }
 const {readers,entries}=declarationFixture();
 for(const extra of ['.github/workflows/ci.yml','server-version/backend/src/controllers/test.ts','server-version/backend/src/modules/scale/instruments/test_scale/1.0.0/scorer.ts'])assert.equal(contentCodeqlRequired([...entries,mod(extra)],readers),true);
 for(const mode of ['120000','100755'])assert.equal(contentCodeqlRequired([{...entries[0],newMode:mode},...entries.slice(1)],readers),true);
 assert.equal(contentCodeqlRequired(entries,{...readers,listHeadFiles:()=>readers.listHeadFiles().map(row=>({...row,mode:row.file===json?'120000':row.mode}))}),true);
});

test('canonical registries cannot introduce an executable source through an unchanged-path claim',()=>{
 const {files,readers}=declarationFixture();
 assert.equal(contentCodeqlRequired([mod(scaleIndex)],readers),false);
 files[file]='export const SCALE_INSTRUMENT_SOURCE = buildSource();';
 assert.equal(contentCodeqlRequired([mod(scaleIndex)],readers),true);
 assert.equal(contentCodeqlRequired([mod(scaleIndex)],{...readers,readBaseFile:()=>undefined}),true);
});

test('SJT canonical JSON registry and native bundle Form data remain declarations, drift does not',()=>{
 const root='server-version/backend/src/modules/situational/instruments/example/1.0.0/',index='server-version/backend/src/modules/situational/onboarding/instruments.generated.ts';
 const files=Object.fromEntries(['instrument','publication','scientific'].map(name=>[root+name+'.json','{}']));
 files[index]=renderManifest([{relative:'example/1.0.0'}]);
 const readers={readHeadFile:file=>files[file],readBaseFile:()=>renderManifest([]),listHeadFiles:()=>Object.keys(files).filter(file=>file!==index).map(file=>({file,mode:'100644'})),listBaseFiles:()=>[]};
 const entries=Object.keys(files).map(add);
 assert.equal(contentCodeqlRequired(entries,readers),false);
 const form='server-version/backend/src/modules/assessment-bundle/packages/example/1.0.0/context.json';files[form]='{}';
 assert.equal(contentCodeqlRequired([...entries,add(form)],readers),false);
 files[index]+='\nrun();';assert.equal(contentCodeqlRequired(entries,readers),true);
 const injected="x'; globalThis.pwned=true; void '",badRoot=root.replace('/example/','/'+injected+'/');
 const bad=Object.fromEntries(['instrument','publication','scientific'].map(name=>[badRoot+name+'.json','{}']));
 bad[index]=renderManifest([{relative:injected+'/1.0.0'}]);
 assert.equal(contentCodeqlRequired(Object.keys(bad).map(add),{...readers,readHeadFile:file=>bad[file],listHeadFiles:()=>Object.keys(bad).filter(file=>file!==index).map(file=>({file,mode:'100644'}))}),true);
});
test('inline and JSON-backed declarations share one selected identity, normal metadata and generated index',()=>{
 const e=[add(file),add(file.replace('instrument.ts','source.json')),add(file.replace('instrument.ts','THIRD_PARTY_LICENSE.md')),
  mod('server-version/backend/src/modules/scale/onboarding/instruments.generated.ts'),add('docs/scale-intake/batch/record.json'),add('docs/scale-intake/batch/receipt.txt')];
 assert.deepEqual(selectScaleIntake(e).sources,[file]);assert.equal(classifyChanges(e).scale_intake_light,true);
 assert.equal(classifyChanges(e,true).scale_intake_light,false);
});
test('control and runtime changes cannot declare themselves pure content',()=>{
 for(const other of ['.github/scripts/scale-intake-scope.mjs','.github/workflows/ci.yml',
  'server-version/backend/scripts/scale-intake-selected-check.ts','server-version/backend/package-lock.json',
  'server-version/backend/prisma/schema.prisma',file.replace('instrument.ts','scorer.ts'),
  'server-version/frontend/src/components/ScaleReport.tsx'])assert.equal(selectScaleIntake([add(file),mod(other)]),null,other);
 assert.equal(selectScaleIntake([add('docs/scale-intake/batch.md')]),null);
});
test('mixed cognitive/bundle changes keep established heavier affected-content lane',()=>{
 for(const other of ['server-version/backend/src/modules/cognitive/tasks/STROOP/seeds.ts',
 'server-version/backend/src/modules/assessment-bundle/packages/new/1.0.0/manifest.json']){
  const result=classifyChanges([add(file),add(other)]);assert.equal(result.content,true);assert.equal(result.scale_intake_light,false);
 }
});
test('deletions renames symlinks executables duplicates and noncanonical paths cannot enter',()=>{
 for(const e of [{...add(file),newMode:'120000'},{...add(file),newMode:'100755'},{...mod(file),status:'D',newMode:'000000'},
 {...mod(file),status:'R'},{...mod(file),oldMode:'120000'},add(file.replace('/test_scale/','/../')),add(file+'\n')])assert.equal(selectScaleIntake([e]),null);
 assert.equal(selectScaleIntake([add(file),add(file)]),null);
});
test('required merge gate consumes content and actual CodeQL, never standalone focused success',()=>{
 const disabled=Object.fromEntries(['maintenance','presentation','frontend','documentation','media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'].map(k=>[k,'false']));
 const needs={scope:{result:'success',outputs:{...disabled,application_route:'legacy',scenario:'content',content:'true',scale:'true',scale_intake_light:'true',codeql:'true',runner_profile:'hosted',frontend_test:'false',frontend_build:'false',ui_required:'false',visual_hosted:'false',media_selection:'[]',media_groups:'[]'}},content:{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','content','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const state of ['skipped','failure','cancelled',undefined]){const n=structuredClone(needs);n.content={result:state};n.focused={result:'success'};assert.ok(failedChecks(n,false).includes('content'));}
 for(const flag of ['invalid',null]){const n=structuredClone(needs);n.scope.outputs.scale_intake_light=flag;assert.ok(failedChecks(n,false).includes('scope'));}
 const q=structuredClone(needs);q.codeql.result='skipped';assert.ok(failedChecks(q,false).includes('codeql'));
});
test('exact actual checkout and paired wrappers checked with real Git, no PR-number binding',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scale-intake-scope-'));const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
 try{
  git('init','-q');git('config','user.name','Synthetic test');git('config','user.email','test@example.invalid');writeFileSync(join(dir,'base.txt'),'base');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
  mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),'export const SCALE_INSTRUMENT_SOURCE = {};\n');git('add','.');git('commit','-qm','candidate');const head=git('rev-parse','HEAD');
  assert.deepEqual(readScaleIntakeDiff(base,head,{cwd:dir}).sources,[file]);assert.deepEqual(readScaleIntakeDiff(base,head,{cwd:join(dir,'server-version/backend')}).sources,[file]);assert.throws(()=>readScaleIntakeDiff(base,base,{cwd:dir}));assert.throws(()=>readScaleIntakeDiff(head,base,{cwd:dir}));
  const orphan=file.replace('test_scale','orphan').replace('instrument.ts','source.json');mkdirSync(dirname(join(dir,orphan)),{recursive:true});writeFileSync(join(dir,orphan),'{}');git('add','.');git('commit','-qm','orphan');assert.throws(()=>readScaleIntakeDiff(head,git('rev-parse','HEAD'),{cwd:dir}),/wrapper/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('dependency preparation and selected tooling tests use the same exact inputs, not document substrings',()=>{
 assert.equal(scaleIntakeToolingChanged(['docs/development/scale-intake-ci-20261029.md','.github/workflows/ci.yml']),false);
 assert.equal(scaleIntakeToolingChanged(['server-version/backend/scripts/scale-intake-selected-check.ts']),true);
 const recipe=readFileSync(new URL('./local-validation.mjs',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../workflows/ci-release-tools.yml',import.meta.url),'utf8');
 assert.ok(recipe.includes('scaleIntakeToolingChanged(files)'));assert.ok(workflow.includes('scaleIntakeToolingChanged(files)'));
});
test('only the exact registered Scale CI tools are excluded from application fingerprints',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scale-tool-fingerprint-')),original=process.cwd();
 const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
 const put=(p,content)=>{mkdirSync(dirname(join(dir,p)),{recursive:true});writeFileSync(join(dir,p),content);};
 try{
  git('init','-q');git('config','user.name','Synthetic test');git('config','user.email','test@example.invalid');
  put('server-version/backend/src/app.ts','export const app=1;');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
  put('server-version/backend/scripts/scale-intake-selected-check.ts','export const tool=1;');
  put('server-version/backend/scripts/scale-intake-selected-check.test.ts','export const test=1;');git('add','.');git('commit','-qm','tools');const head=git('rev-parse','HEAD');
  process.chdir(dir);assert.equal(componentFingerprint(base,'backend'),componentFingerprint(head,'backend'));
  put('server-version/backend/scripts/unknown.ts','export const other=1;');git('add','.');git('commit','-qm','unknown');
  assert.notEqual(componentFingerprint(head,'backend'),componentFingerprint(git('rev-parse','HEAD'),'backend'));
 }finally{process.chdir(original);rmSync(dir,{recursive:true,force:true});}
});

 test('release tooling CodeQL includes the exact backend Scale checker and regression source',()=>{
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const block=ci.split('      - name: select affected component analysis paths\n')[1].split('\n      - name:')[0];
 const code=block.split('        run: |\n')[1].split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
 let output='';runInNewContext(code,{require:()=>({appendFileSync:(_,text)=>{output+=text}}),process:{env:{RELEASE_TOOLING:'true',GITHUB_OUTPUT:'unused'}}});
 const paths=JSON.parse(output.trim().slice('config='.length)).paths;
 assert.deepEqual(paths,['.github/scripts','server-version/scripts/release','server-version/backend/scripts','server-version/backend/src/scripts','server-version/scripts/cognitive']);
 for(const file of ['.github/scripts','server-version/scripts/release','server-version/backend/scripts/scale-intake-selected-check.ts','server-version/backend/scripts/scale-intake-selected-check.test.ts','server-version/backend/src/scripts/cognitive-onboarding-check.ts','server-version/scripts/cognitive'])assert.ok(paths.some(dir=>file===dir||file.startsWith(dir+'/')),file);
 for(const dir of paths)assert.ok(statSync(new URL('../../'+dir,import.meta.url)).isDirectory(),'Python SAST root must be a directory: '+dir);
 });
