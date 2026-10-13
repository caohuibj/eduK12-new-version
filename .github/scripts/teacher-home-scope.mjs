import {execFileSync} from 'node:child_process';
// Admit this reviewed patch by Git object identity, never a broad Teacher directory.
export const reviewedTeacherFiles=Object.freeze({
  "server-version/backend/src/index.ts": {
    "before": "939716315cfacc1ede820a5513524cf60668eba5",
    "after": "e69d3fbca4b32664cc4ebf1892641236c4ce5884"
  },
  "server-version/frontend/public/huiteacher/asset-provenance.json": {
    "before": null,
    "after": "9d56c6293c8ca289e5e960e6da60db1de1105455"
  },
  "server-version/frontend/public/huiteacher/educator-journal-small.webp": {
    "before": null,
    "after": "8488317552c3ace03c2beb37ce268d7b04c22f65"
  },
  "server-version/frontend/public/huiteacher/educator-journal.webp": {
    "before": null,
    "after": "017cff6517cfb63fd956295d66eb53ee2a63a347"
  },
  "server-version/frontend/public/huiteacher/huiteacher-b3-emblem.png": {
    "before": null,
    "after": "aaf07fc57da21b38f120bf6d9141b80189fa459d"
  },
  "server-version/frontend/public/huiteacher/huiteacher-b3-emblem.svg": {
    "before": null,
    "after": "02c0f77ba4027269f95fac23f156f088898ad9c3"
  },
  "server-version/frontend/src/huiteacher/HuiteacherApp.tsx": {
    "before": "6f6e7f5a1dec522ba33501599468dcd4306ca09f",
    "after": "4c55c38ed387fb11599d705075be436266aa16f3"
  },
  "server-version/frontend/src/huiteacher/HuiteacherLanding.tsx": {
    "before": null,
    "after": "740bebcb2b97a57753d1513a328a46237250edf1"
  },
  "server-version/frontend/src/huiteacher/huiteacher-landing.css": {
    "before": null,
    "after": "297cdae85e58a95dc722bf1fcf069b13a5417451"
  },
  "server-version/frontend/src/huiteacher/huiteacher.css": {
    "before": "0b326ed785f3bc155c3b42549d4ea1016f36c31d",
    "after": "99965c8d8e0424baaa3d7e54c5e0cbbc244915ba"
  }
});
const tooling=new Set([
 '.github/scripts/teacher-home-scope.mjs','.github/scripts/teacher-home.test.mjs',
 '.github/scripts/teacher-home-candidate.py','.github/scripts/teacher-home-browser.mjs',
 '.github/scripts/teacher-home-fixture.cjs','.github/scripts/teacher-home-reuse.py','.github/workflows/ci-teacher-home.yml',
 '.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs',
 '.github/workflows/ci.yml','docs/release/README.md',
]);
export const teacherRequired=Object.freeze(['teacher-auth-contracts','frontend-candidate','backend-candidate','runtime-scans','teacher-browser','sast']);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function expertMountBoundary(before,after){
 const mount="app.use('/api/huiteacher',huiteacherExpertRegistrationRoutes)\n";
 const anchor="app.use('/api/huiteacher',huiteacherStaffInviteRoutes)\n";
 return before.split(mount).length===2 && before.split(anchor).length===2
  && after===before.replace(mount,'').replace(anchor,anchor+mount);
}
export function teacherHomePlan(entries,base,head,read=git){
 if(!/^[a-f0-9]{40}$/.test(base||'')||!/^[a-f0-9]{40}$/.test(head||''))return null;
 if(!entries.length||!entries.some(e=>Object.hasOwn(reviewedTeacherFiles,e.file)))return null;
 if(entries.some(e=>!Object.hasOwn(reviewedTeacherFiles,e.file)&&!tooling.has(e.file)))return null;
 for(const e of entries){
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))return null;
  const s=reviewedTeacherFiles[e.file];
  if(s&&(e.status!==(s.before?'M':'A')||read('rev-parse',head+':'+e.file)!==s.after
   ||(s.before&&read('rev-parse',base+':'+e.file)!==s.before)))return null;
 }
 for(const [file,s] of Object.entries(reviewedTeacherFiles)){
  if(read('rev-parse',head+':'+file)!==s.after)return null;
  if(!entries.some(e=>e.file===file)&&read('rev-parse',base+':'+file)!==s.after)return null;
 }
 const backend='server-version/backend/src/index.ts';
 if(!expertMountBoundary(read('show',base+':'+backend),read('show',head+':'+backend)))return null;
 return {schema:1,route:'teacher-home',base,head,changed:['frontend','backend'],changes:entries,
  components:Object.fromEntries(['frontend','backend'].map(c=>[c,read('rev-parse',head+':server-version/'+c)])),
  required:[...teacherRequired]};
}
