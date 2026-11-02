import {execFileSync} from 'node:child_process';
import {appendFileSync,lstatSync,mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {posix,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const files=new Set([
  ".github/scripts/ci-topology.test.mjs",
  ".github/scripts/content-scope.mjs",
  ".github/scripts/content-scope.test.mjs",
  ".github/scripts/local-validation.mjs",
  ".github/scripts/local-validation.test.mjs",
  ".github/scripts/maintenance-repair-scope.mjs",
  ".github/scripts/maintenance-repair.test.mjs",
  ".github/scripts/merge-gate.mjs",
  ".github/scripts/post356-scope.mjs",
  ".github/scripts/post356-scope.test.mjs",
  ".github/workflows/ci-frontend.yml",
  ".github/workflows/ci.yml",
  "server-version/backend/package.json",
  "server-version/backend/src/__tests__/assessment-bundle/public-declarations.test.ts",
  "server-version/backend/src/__tests__/cognitive/acceptance-execution.test.ts",
  "server-version/backend/src/__tests__/controllers/password-change-canonical.test.ts",
  "server-version/backend/src/__tests__/integration/huiteacherConsensus.postgres.integration.test.ts",
  "server-version/backend/src/__tests__/integration/huiteacherFieldObservation.postgres.integration.test.ts",
  "server-version/backend/src/__tests__/reporting/group-service-disclosure.test.ts",
  "server-version/backend/src/__tests__/services/classroomSocketHandler.security.test.ts",
  "server-version/backend/src/__tests__/services/socketService.revalidation.test.ts",
  "server-version/backend/src/controllers/changePasswordController.ts",
  "server-version/backend/src/modules/assessment-bundle/onboarding/public-check.ts",
  "server-version/backend/src/modules/huiteacher/consensus.service.ts",
  "server-version/backend/src/modules/huiteacher/fieldEventAccess.ts",
  "server-version/backend/src/modules/huiteacher/observer.service.ts",
  "server-version/backend/src/modules/reporting/service.ts",
  "server-version/backend/src/scripts/bundle-onboarding.ts",
  "server-version/backend/src/services/classroomSocketHandler.ts",
  "server-version/backend/src/services/passwordChangeService.ts",
  "server-version/backend/src/services/socketService.ts",
  "server-version/docs/frontend-convergence/routes.md",
  "server-version/miniprogram-v2/scripts/feature-inventory.cjs",
  "server-version/miniprogram-v2/tests/feature-inventory.test.cjs",
  "server-version/monitoring/alert_rules.test.yml",
  "server-version/monitoring/alert_rules.yml",
  "server-version/scripts/cognitive/acceptance.cjs",
  "server-version/scripts/cognitive/frontend-tests.cjs",
  "server-version/scripts/host-ops/README.md",
  "server-version/scripts/host-ops/config.example.json",
  "server-version/scripts/host-ops/monitor.py",
  "server-version/scripts/host-ops/test_monitor.py"
]);
const backend='server-version/backend/';
const migration='prisma/migrations/20261101234500_campus_task_current_product_access/migration.sql';
// Reusable affected-source groups, independent of branch, PR number and commit.
// Each group names its consumers and the smallest existing regression surface.
const authorizationChecks=[
 {name:'student-projection',runtime:['src/controllers/questionnaireController.ts'],tests:[
  'src/__tests__/questionnaire/detail-student-projection.test.ts'],postgres:[{
  file:'src/__tests__/questionnaire/detail-student-projection.postgres.integration.test.ts'}]},
 {name:'school-access',runtime:['src/utils/courseAccess.ts','src/modules/campus/activity.tasks.ts'],extra:[migration],postgres:[{
  file:'src/__tests__/integration/campusActivity.postgres.integration.test.ts',pattern:'DA-S02 ',count:2}]},
 {name:'consensus-access',runtime:['src/modules/huiteacher/consensus.service.ts'],tests:[
  'src/__tests__/huiteacher/consensus-approval-once.test.ts'],postgres:[{
  file:'src/__tests__/integration/huiteacherConsensus.postgres.integration.test.ts',pattern:'requires current (organization|entitlement) access for exact-ID approvals',count:2}]},
 {name:'password-transition',runtime:['src/services/passwordChangeService.ts'],tests:[
  'src/__tests__/controllers/password-change-canonical.test.ts']},
 {name:'classroom-projection',runtime:['src/services/classroomSocketHandler.ts'],tests:[
  'src/__tests__/services/classroomSocketHandler.security.test.ts']},
 {name:'draft-publication',runtime:['src/modules/cognitive/assignment.service.ts'],tests:[
  'src/__tests__/cognitive/assignment.service.test.ts','src/__tests__/cognitive/assignment-publication-race.test.ts'],postgres:[{
  file:'src/__tests__/cognitive/assignment-publication-race.postgres.integration.test.ts'}]},
 {name:'system-content-authority',runtime:['src/modules/bundle-product/routes.ts','src/modules/bundle-product/admin-authoring.ts',
  'src/modules/bundle-product/package-release.ts','src/modules/cognitive/cognitive.routes.ts'],tests:[
  'src/__tests__/bundle-product/system-authority.routes.test.ts','src/__tests__/bundle-product/system-authority.release.test.ts',
  'src/__tests__/bundle-onboarding/profile-actions.test.ts','src/__tests__/bundle-onboarding/profile-native-setup.test.ts'],extra:[
  'src/__tests__/assessment-bundle/child-cross-method.postgres.integration.test.ts',
  'src/__tests__/bundle-onboarding/content.postgres.integration.test.ts',
  'src/__tests__/bundle-onboarding/lifecycle.postgres.integration.test.ts',
  'src/__tests__/bundle-onboarding/profile-continuation.postgres.integration.test.ts',
  'src/__tests__/bundle-onboarding/profile-lifecycle.postgres.integration.test.ts',
  'src/__tests__/bundle-onboarding/teacher-jdr-lifecycle.postgres.integration.test.ts']},
];
const inputs=check=>[...check.runtime,...(check.tests??[]),...(check.postgres??[]).map(p=>p.file),...(check.extra??[])].map(p=>backend+p);
const authorizationFiles=new Set(authorizationChecks.flatMap(inputs));
authorizationFiles.add('docs/bundle-declarative-onboarding/runbook.md');
const legacyFiles=new Set(files);
for(const file of authorizationFiles)files.add(file);

export function maintenanceRepairPlan(entries,readBase,readHead){
 if(!maintenanceRepairScope(entries,readBase,readHead))return null;
 const changed=new Set(entries.map(e=>e.file));
 const selected=authorizationChecks.filter(check=>inputs(check).some(file=>changed.has(file))||
  check.name==='system-content-authority'&&changed.has('docs/bundle-declarative-onboarding/runbook.md'));
 const legacy=entries.some(e=>legacyFiles.has(e.file)&&!authorizationFiles.has(e.file)&&!e.file.startsWith('.github/'));
 const tests=selected.flatMap(check=>check.tests??[]),postgres=new Map(selected.flatMap(check=>check.postgres??[]).map(p=>[p.file,p]));
 if(legacy){
  tests.push(...[
   'reporting/group-service-disclosure','reporting/reporting-leaf-source','reporting/campus-absent-disclosure',
   'services/classroomSocketHandler.security','services/socketService.revalidation','controllers/password-change-canonical',
   'assessment-bundle/public-declarations','cognitive/acceptance-execution',
  ].map(p=>'src/__tests__/'+p+'.test.ts'));
  for(const file of ['huiteacherFieldObservation','huiteacherConsensus']){
   const p={file:'src/__tests__/integration/'+file+'.postgres.integration.test.ts'};
   postgres.set(p.file,p); // A complete legacy suite supersedes a filtered selection.
  }
 }
 const runtime=selected.flatMap(check=>check.runtime.map(p=>backend+p));
 const sast=[...(legacy?legacyFiles:[]),...runtime,...entries.map(e=>e.file).filter(p=>p.startsWith('.github/')),
  '.github/scripts/maintenance-repair-scope.mjs'];
 const sources=[...new Set(sast.filter(p=>/\.(ts|mjs|cjs|py)$/.test(p)&&!p.includes('/__tests__/')&&!p.includes('/tests/')&&!/test[_.]/.test(p)))].sort();
 return {checks:selected.map(check=>check.name),legacy,tests:[...new Set(tests)].sort(),postgres:[...postgres.values()],sources,
  languages:sources.some(p=>p.endsWith('.py'))?'javascript-typescript,python':'javascript-typescript'};
}
export function maintenanceRepairScope(entries,readBase,readHead){
 if(!entries.length||entries.some(e=>!files.has(e.file)||!['A','M'].includes(e.status)||e.newMode!=='100644'||!['100644','000000'].includes(e.oldMode)))return false;
 if(!entries.some(e=>e.file.startsWith('server-version/')))return false;
 const packagePath='server-version/backend/package.json';
 if(entries.some(e=>e.file===packagePath)){
  try{
   const before=JSON.parse(readBase(packagePath)),after=JSON.parse(readHead(packagePath));
   if(after.scripts.build!==before.scripts.build.replace('npm run bundle:onboarding:check &&','npm run bundle:declarations:check &&')||after.scripts['bundle:declarations:check']!=='tsx src/scripts/bundle-onboarding.ts check-public')return false;
   after.scripts.build=before.scripts.build;delete after.scripts['bundle:declarations:check'];
   if(JSON.stringify(after)!==JSON.stringify(before))return false;
  }catch{return false;}
 }
 return true;
}
export function readMaintenanceRepairScope(base,head='HEAD'){
 return Boolean(readMaintenanceRepairPlan(base,head));
}
export function readMaintenanceRepairPlan(base,head='HEAD'){
 const raw=execFileSync('git',['diff','--raw','--no-renames','--no-abbrev','-z',base,head],{encoding:'utf8'}).split('\0'),entries=[];
 for(let i=0;i<raw.length-1;i+=2){const m=/^:(\d{6}) (\d{6}) [a-f0-9]{40} [a-f0-9]{40} ([AMDT])$/.exec(raw[i]);if(!m)return false;entries.push({file:raw[i+1],oldMode:m[1],newMode:m[2],status:m[3]});}
 const read=ref=>file=>{try{return execFileSync('git',['show',ref+':'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{return null;}};
 return maintenanceRepairPlan(entries,read(base),read(head));
}
export function maintenanceRepairOutputs(){
 const flags=['maintenance','content','presentation','frontend','frontend_test','documentation','frontend_build','ui_required','visual_hosted','scale','scale_intake_light','cognitive_intake_light','cognitive','situational','bundle','codeql','media2','video_core','media7','situational_video','situational_branching','app_shell','canonical_visual','perf_smoke','ops'];
 return {...Object.fromEntries(flags.map(k=>[k,false])),application_route:'maintenance-repair',scenario:'maintenance-repair',runner_profile:'hosted',media_selection:'[]',media_groups:'[]',light_runner:'["ubuntu-24.04"]'};
}
export function maintenanceRepairCodeqlConfig(selected=[...legacyFiles].filter(p=>/\.(ts|mjs|cjs|py)$/.test(p)&&!p.includes('/__tests__/')&&!p.includes('/tests/')&&!/test[_.]/.test(p))){
 for(const file of selected)if(!lstatSync(file).isFile())throw Error('Missing regular CodeQL input: '+file);
 // Python walks directory roots even in a mixed-language scan. Keep the same file scope.
 const paths=[...new Set(selected.map(file=>posix.dirname(file)))].sort();
 const ignored=paths.flatMap(directory=>{
  if(!lstatSync(directory).isDirectory())throw Error('CodeQL paths must be directories: '+directory);
  return readdirSync(directory).sort().map(name=>posix.join(directory,name)).filter(file=>!selected.includes(file));
 });
 return {paths,'paths-ignore':ignored};
}
// Filtered suites deliberately retain unrelated assertions as pending. Qualify
// every selected assertion, never count those pending assertions as evidence.
export function assertMaintenanceTestReport(report,selection){
 assert.equal(report.success,true,'Test runner did not report success');
 const suites=(report.testResults??[]).filter(s=>s.name?.replaceAll('\\','/').endsWith('/'+selection.file));
 assert.equal(suites.length,1,'Missing or duplicate selected suite');
 const assertions=suites[0].assertionResults??[];
 const selected=selection.pattern?assertions.filter(a=>new RegExp(selection.pattern).test(a.fullName)):assertions;
 assert(selected.length>0,'Selected suite collected no assertions');
 if(selection.count!==undefined)assert.equal(selected.length,selection.count,'Selected assertion count changed');
 for(const a of selected)assert.equal(a.status,'passed','Selected assertion was skipped or failed: '+a.fullName);
 assert.equal(report.numFailedTests,0,'Test report contains failed assertions');
 return {file:selection.file,passed:selected.length,unselected:assertions.length-selected.length};
}
function runTests(plan){
 const cwd=resolve(backend),directory=process.env.REPAIR_RESULTS_DIR??'/tmp/maintenance-repair-results';
 mkdirSync(directory,{recursive:true});
 const groups=[...(plan.tests.length?[{files:plan.tests}]:[]),...plan.postgres.map(p=>({...p,files:[p.file]}))];
 assert(groups.length>0,'No affected checks were selected');
 for(const [index,group] of groups.entries()){
  const report=resolve(directory,'tests-'+index+'.json');
  const args=['node_modules/vitest/vitest.mjs','run',...group.files,'--maxWorkers=1','--no-file-parallelism',
   '--reporter=default','--reporter=json','--outputFile='+report,...(group.pattern?['--testNamePattern',group.pattern]:[])];
  execFileSync(process.execPath,args,{cwd,stdio:'inherit'});
  const result=JSON.parse(readFileSync(report,'utf8'));
  for(const file of group.files)console.log(JSON.stringify(assertMaintenanceTestReport(result,{...group,file})));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [command,base]=process.argv.slice(2);
 const plan=base?readMaintenanceRepairPlan(base):null;
 if(base&&!plan)throw Error('Diff is outside the bounded maintenance-repair scope');
 if(command==='--codeql-config')console.log(JSON.stringify(maintenanceRepairCodeqlConfig(plan?.sources)));
 else if(command==='--plan'&&plan){
  console.log(JSON.stringify(plan));
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'legacy='+plan.legacy+'\nlanguages='+plan.languages+'\n');
 }else if(command==='--test'&&plan)runTests(plan);
 else throw Error('Expected --plan, --test or --codeql-config and a diff base');
}
