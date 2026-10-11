import {execFileSync} from 'node:child_process';
const front='server-version/frontend/src/school/';
const back='server-version/backend/src/';
export const campusFiles=new Set([
 ...['SchoolApp.tsx','SchoolMark.tsx','SchoolMark.test.tsx','SchoolParentPortal.tsx','SchoolParentPortal.test.tsx','SchoolEntryMfa.test.tsx','SchoolLanding.tsx','SchoolLanding.test.tsx','SchoolWorkspace.test.tsx','SchoolWorkspaceShell.tsx','SchoolWorkspaceShell.test.tsx','school-navigation.ts','school-features.ts','school-landing.css','school-workspace.css','huischool-a1-emblem.svg','huischool-wordmark.svg','huischool-campus-sunlight.png'].map(p=>front+p),
 back+'routes/auth.ts',back+'__tests__/campus/local-auth-origin.test.ts',
 back+'modules/campus/admission.routes.ts',back+'modules/campus/registration-code.ts',back+'__tests__/campus/registration-code.test.ts',back+'__tests__/integration/campusRegistrationCode.postgres.integration.test.ts',
 '.github/scripts/campus-reuse.py','.github/scripts/test_campus_reuse.py','.github/scripts/campus-reuse-request.json',
 '.github/scripts/campus-scope.mjs','.github/scripts/campus-scope.test.mjs','.github/scripts/campus-candidate.py','.github/scripts/campus-browser.mjs','.github/workflows/ci-campus.yml',
 '.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml',
 'docs/release/campus-ci.md','docs/release/README.md',
]);
export function admitsCampus(entries){
 return entries.length>0 && entries.some(e=>e.file.startsWith(front)||e.file===back+'modules/campus/registration-code.ts') && entries.every(e=>campusFiles.has(e.file)&&e.newMode==='100644'&&((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')));
}
// Admit only this non-production origin guard, not arbitrary authentication edits.
export function admitsLocalCampusOriginGuard(before,after){
 const productionGuard="  if(host==='school.eduk12.top'||origin==='https://school.eduk12.top') {";
 const localGuard=String.raw`  const localSchool=process.env.NODE_ENV!=='production'
    && (host==='school.localhost'||/^https?:\/\/school\.localhost(?::[0-9]+)?$/.test(origin))
  if(host==='school.eduk12.top'||origin==='https://school.eduk12.top'||localSchool) {`;
 return before.split(productionGuard).length===2
  && after===before.replace(productionGuard,localGuard);
}
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function campusPlan(entries,base,head){
 if(!admitsCampus(entries))return null;
 const legacyAuth=back+'routes/auth.ts';
 if(entries.some(e=>e.file===legacyAuth)){
  if(!admitsLocalCampusOriginGuard(git('show',base+':'+legacyAuth),git('show',head+':'+legacyAuth)))return null;
  if(!entries.some(e=>e.file===back+'__tests__/campus/local-auth-origin.test.ts'))return null;
 }
 // Admission router is allowed only to add discovery. Existing registration,
 // login, MFA and protected handlers must remain byte-for-byte identical.
 const router=back+'modules/campus/admission.routes.ts';
 if(entries.some(e=>e.file===router)){
  const before=git('show',base+':'+router);
  let after=git('show',head+':'+router);
  after=after.replace("import { createRedisRateLimiter } from '../../middleware/redisRateLimit'\nimport { resolveCampusRegistrationCode, CampusRegistrationCodeError } from './registration-code'\n",'');
  after=after.replace("    if (e instanceof CampusRegistrationCodeError)\n      return res.status(e.statusCode).json({code:e.code,message:e.message,data:null})\n",'');
  after=after.replace(/const discoveryRate=createRedisRateLimiter[\s\S]*?\n\n(?=router.post\('\/register')/,'');
  if(before!==after)return null;
 }

 const changed=['frontend','backend'].filter(c=>entries.some(e=>e.file.startsWith('server-version/'+c+'/')));
 return {schema:1,route:'campus',base,head,changed,changes:entries,components:Object.fromEntries(changed.map(c=>[c,git('rev-parse',head+':server-version/'+c)])),required:['campus-contracts','candidate-browser','runtime-scans','sast']};
}
