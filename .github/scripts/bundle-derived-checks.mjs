import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {changedEntries} from './content-scope.mjs';

export const baseSHA="8ae80a2323fddee756f521f9aff126b09f49f548";
export const sourceFiles=Object.freeze([
  "docs/development/bundle-scale-start-context-20261101.md",
  "docs/evidence/bundle-derived-adapters/README.md",
  "docs/evidence/bundle-derived-adapters/validation.json",
  "server-version/backend/src/__tests__/bundle-onboarding/derived-adapter.fixture.ts",
  "server-version/backend/src/__tests__/bundle-onboarding/derived-adapters.test.ts",
  "server-version/backend/src/__tests__/bundle-onboarding/derived-core.test.ts",
  "server-version/backend/src/__tests__/bundle-onboarding/derived-saved-read.test.ts",
  "server-version/backend/src/__tests__/bundle-onboarding/scale-start-context.test.ts",
  "server-version/backend/src/modules/assessment-bundle/bootstrap.ts",
  "server-version/backend/src/modules/assessment-bundle/onboarding/contract.ts",
  "server-version/backend/src/modules/assessment-bundle/onboarding/dependencies.ts",
  "server-version/backend/src/modules/assessment-bundle/onboarding/derivations.ts",
  "server-version/backend/src/modules/assessment-bundle/onboarding/derived-report.ts",
  "server-version/backend/src/modules/assessment-bundle/onboarding/engine.ts",
  "server-version/backend/src/modules/assessment-bundle/onboarding/fixtures.ts",
  "server-version/backend/src/modules/assessment-bundle/schema.ts",
  "server-version/backend/src/modules/assessment-bundle/types.ts",
  "server-version/backend/src/modules/bundle-product/analysis.ts",
  "server-version/backend/src/modules/bundle-product/context-submission.ts",
  "server-version/backend/src/modules/bundle-product/education-adapter.ts",
  "server-version/backend/src/modules/bundle-product/service.ts",
  "server-version/backend/src/modules/bundle-product/start-context.ts",
  "server-version/backend/src/modules/bundle-product/survey-native.ts",
  "server-version/backend/src/modules/bundle-product/survey-source.ts",
  "server-version/backend/src/modules/scale/scale-admission.service.ts",
  "server-version/backend/src/modules/survey/governed-package.reports.ts",
  "server-version/frontend/src/components/education-tools/EducationAssessmentReport.bundle.test.tsx",
  "server-version/frontend/src/components/education-tools/EducationAssessmentReport.tsx",
  "server-version/frontend/src/modules/reporting/BundleDerivedReport.fixture.ts",
  "server-version/frontend/src/modules/reporting/BundleDerivedReport.test.tsx",
  "server-version/frontend/src/modules/reporting/BundleDerivedReport.tsx",
  "server-version/frontend/src/pages/bundle/BundleReport.tsx",
  "server-version/frontend/src/survey/StoredPackageReports.test.tsx",
  "server-version/frontend/src/survey/StoredPackageReports.tsx",
  "server-version/frontend/src/survey/SurveyPublicApp.final.test.tsx",
  "server-version/frontend/src/survey/SurveyPublicApp.tsx"
]);
export const controlFiles=Object.freeze(['.github/scripts/bundle-derived-checks.mjs','.github/scripts/bundle-derived-checks.test.mjs','.github/workflows/ci-bundle-derived.yml','.github/workflows/ci.yml']);
const production=file=>/\.tsx?$/.test(file)&&!file.includes('/__tests__/')&&!/\.(?:test|fixture|spec)\.tsx?$/.test(file);
export function assertTargetedEntries(entries){
 const allowed=new Set([...sourceFiles,...controlFiles]);
 assert(entries.length&&entries.some(e=>sourceFiles.includes(e.file)&&production(e.file)),'Runtime source changes required');
 for(const e of entries){
  assert(allowed.has(e.file),'Outside Bundle derived scope: '+e.file);
  assert(e.newMode==='100644'&&((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')),'Regular added/modified files only');
 }
}
export function scopedPlan(base=baseSHA,head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()){
 assert.match(base,/^[a-f0-9]{40}$/);assert.match(head,/^[a-f0-9]{40}$/);
 execFileSync('git',['merge-base','--is-ancestor',base,head]);
 const entries=changedEntries(base,head);assertTargetedEntries(entries);
 return {base,head,files:entries.map(e=>e.file),productionFiles:entries.filter(e=>production(e.file)&&e.file.startsWith('server-version/')).map(e=>e.file),
  scope:'Runtime core, frozen DTO/adapters and Scale START context; no source instruments, DB migration or unrelated platform execution'};
}
export function typecheck(component,plan){
 assert(['backend','frontend'].includes(component));
 const root=resolve('server-version',component),load=createRequire(root+'/package.json'),ts=load('typescript');
 process.chdir(root);
 const configName=component==='backend'?'tsconfig.json':'tsconfig.app.json';
 const config=ts.readConfigFile(root+'/'+configName,ts.sys.readFile);if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
 const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
 const roots=plan.productionFiles.filter(p=>p.startsWith('server-version/'+component+'/')).map(p=>resolve(root,'../../',p));
 if(component==='backend')roots.push(root+'/src/middleware/auth.ts',root+'/src/middleware/requestId.ts');
 roots.push(...parsed.fileNames.filter(p=>p.endsWith('.d.ts')));
 const program=ts.createProgram([...new Set(roots)],{...parsed.options,noEmit:true});
 const diagnostics=[...parsed.errors,...ts.getPreEmitDiagnostics(program)].map(d=>({file:d.file?.fileName,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}));
 return {component,base:plan.base,head:plan.head,roots,loadedFiles:program.getSourceFiles().length,diagnostics};
}
export function sastConfig(plan){return {name:'Bundle derived runtime and consumers',paths:[...plan.productionFiles,'.github/scripts/bundle-derived-checks.mjs','.github/scripts/bundle-derived-checks.test.mjs']};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const plan=scopedPlan(process.env.BUNDLE_DERIVED_BASE||baseSHA),out=resolve('bundle-derived-ci');mkdirSync(out,{recursive:true});
 if(process.env.GITHUB_SHA)assert.equal(plan.head,process.env.GITHUB_SHA,'Checkout must match the workflow source');
 writeFileSync(out+'/scope.json',JSON.stringify(plan,null,2)+'\n');
 const command=process.argv[2]||'scope';
 if(command==='types'){
  const result=typecheck(process.argv[3],plan);writeFileSync(out+'/types-'+result.component+'.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({component:result.component,roots:result.roots.length,loadedFiles:result.loadedFiles,diagnostics:result.diagnostics.length}));process.exitCode=result.diagnostics.length?1:0;
 }else if(command==='sast-config'){
  assert(process.env.GITHUB_OUTPUT,'GitHub output path required');appendFileSync(process.env.GITHUB_OUTPUT,'config='+JSON.stringify(sastConfig(plan))+'\n');
 }else{assert.equal(command,'scope');console.log(JSON.stringify(plan));}
}
