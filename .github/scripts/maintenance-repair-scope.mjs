import {execFileSync} from 'node:child_process';
import {lstatSync,readdirSync} from 'node:fs';
import {posix} from 'node:path';
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
 const raw=execFileSync('git',['diff','--raw','--no-renames','--no-abbrev','-z',base,head],{encoding:'utf8'}).split('\0'),entries=[];
 for(let i=0;i<raw.length-1;i+=2){const m=/^:(\d{6}) (\d{6}) [a-f0-9]{40} [a-f0-9]{40} ([AMDT])$/.exec(raw[i]);if(!m)return false;entries.push({file:raw[i+1],oldMode:m[1],newMode:m[2],status:m[3]});}
 const read=ref=>file=>{try{return execFileSync('git',['show',ref+':'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{return null;}};
 return maintenanceRepairScope(entries,read(base),read(head));
}
export function maintenanceRepairOutputs(){
 const flags=['maintenance','content','presentation','frontend','frontend_test','documentation','frontend_build','ui_required','visual_hosted','scale','scale_intake_light','cognitive_intake_light','cognitive','situational','bundle','codeql','media2','video_core','media7','situational_video','situational_branching','app_shell','canonical_visual','perf_smoke','ops'];
 return {...Object.fromEntries(flags.map(k=>[k,false])),application_route:'maintenance-repair',scenario:'maintenance-repair',runner_profile:'hosted',media_selection:'[]',media_groups:'[]',light_runner:'["ubuntu-24.04"]'};
}
export function maintenanceRepairCodeqlConfig(){
 const selected=[...files].filter(p=>/\.(ts|mjs|cjs|py)$/.test(p)&&!p.includes('/__tests__/')&&!p.includes('/tests/')&&!/test[_.]/.test(p));
 for(const file of selected)if(!lstatSync(file).isFile())throw Error('Missing regular CodeQL input: '+file);
 // Python walks directory roots even in a mixed-language scan. Keep the same file scope.
 const paths=[...new Set(selected.map(file=>posix.dirname(file)))].sort();
 const ignored=paths.flatMap(directory=>{
  if(!lstatSync(directory).isDirectory())throw Error('CodeQL paths must be directories: '+directory);
  return readdirSync(directory).sort().map(name=>posix.join(directory,name)).filter(file=>!selected.includes(file));
 });
 return {paths,'paths-ignore':ignored};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href&&process.argv[2]==='--codeql-config')console.log(JSON.stringify(maintenanceRepairCodeqlConfig()));
