import {execFileSync} from 'node:child_process';
// Version 1 admits this reviewed immutable patch, not arbitrary future code.
export const reviewedSurveyFiles=Object.freeze({
  "server-version/frontend/public/survey/asset-provenance.json": {
    "before": null,
    "after": "e904f93970223a2f1ec6d3d6d4a3a199b304d7c0"
  },
  "server-version/frontend/public/survey/huisurvey-w2-emblem.png": {
    "before": null,
    "after": "cdd6331711722f5d39f5c813af31c683ef75b692"
  },
  "server-version/frontend/public/survey/huisurvey-w2-emblem.svg": {
    "before": null,
    "after": "936d51032926a765bcd5a04a491a088733e79921"
  },
  "server-version/frontend/public/survey/wind-observation-small.webp": {
    "before": null,
    "after": "20802168045f0c3414925824dfc35e1e81784d2e"
  },
  "server-version/frontend/public/survey/wind-observation.webp": {
    "before": null,
    "after": "31a93220d8f45cc9ac01e13a2889b54d4293f3c4"
  },
  "server-version/frontend/src/survey/SurveyApp.entry.test.tsx": {
    "before": null,
    "after": "6d84dca18b18bee3b3115d19a20c7848c4843396"
  },
  "server-version/frontend/src/survey/SurveyApp.tsx": {
    "before": "36dfa3a79884c447201e9874a6269b9c140e55df",
    "after": "99f8d9bb69992b2f7ebc728c69a597e0a8e9e37e"
  },
  "server-version/frontend/src/survey/SurveyBrand.tsx": {
    "before": null,
    "after": "4a93792b92c87393428a99a6e53ba27738bcef3f"
  },
  "server-version/frontend/src/survey/SurveyBuilder.tsx": {
    "before": "4f4923339ac182431a5fdd7dcefc55640744ddf9",
    "after": "987950dbde39c5ccd9b037aa46af7edf16dd4216"
  },
  "server-version/frontend/src/survey/SurveyFeaturePage.tsx": {
    "before": null,
    "after": "ba6396da9a09aa94733e04fd8c035d311034867f"
  },
  "server-version/frontend/src/survey/SurveyLanding.tsx": {
    "before": null,
    "after": "4460c1ede053144ed9594f8068e2f71e5035e69a"
  },
  "server-version/frontend/src/survey/SurveyWaveStudio.tsx": {
    "before": "b146f833cb11b16dd4a987f87d3bc6ac7436116e",
    "after": "d1eafb2495705bdafbbb68982c842a16c5102652"
  },
  "server-version/frontend/src/survey/survey-features.ts": {
    "before": null,
    "after": "1c3962a3147e49d7a4920ecb42c1915dc9e16ffd"
  },
  "server-version/frontend/src/survey/survey-landing.css": {
    "before": null,
    "after": "c0109c7ed2d570452369bf3a5cb0f7775e56726e"
  }
});
const tooling=new Set([
 '.github/scripts/survey-home-scope.mjs','.github/scripts/survey-home.test.mjs',
 '.github/scripts/survey-home-candidate.py','.github/scripts/survey-home-browser.mjs',
 '.github/workflows/ci-survey-home.yml','.github/scripts/content-scope.mjs',
 '.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','docs/release/README.md',
]);
export const surveyRequired=Object.freeze(['survey-entry-contracts','frontend-candidate','runtime-scan','survey-browser','sast']);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function surveyHomePlan(entries,base,head,read=git){
 if(!/^[a-f0-9]{40}$/.test(base||'')||!/^[a-f0-9]{40}$/.test(head||''))return null;
 if(!entries.length||!entries.some(e=>Object.hasOwn(reviewedSurveyFiles,e.file)))return null;
 if(entries.some(e=>!Object.hasOwn(reviewedSurveyFiles,e.file)&&!tooling.has(e.file)))return null;
 for(const e of entries){
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))return null;
  const s=reviewedSurveyFiles[e.file];
  if(s&&(e.status!==(s.before?'M':'A')||read('rev-parse',head+':'+e.file)!==s.after
    ||(s.before&&read('rev-parse',base+':'+e.file)!==s.before)))return null;
 }
 for(const [file,s] of Object.entries(reviewedSurveyFiles)){
  if(read('rev-parse',head+':'+file)!==s.after)return null;
  if(!entries.some(e=>e.file===file)&&read('rev-parse',base+':'+file)!==s.after)return null;
 }
 if(read('rev-parse',base+':server-version/backend')!==read('rev-parse',head+':server-version/backend'))return null;
 return {schema:1,route:'survey-home',base,head,changed:['frontend'],changes:entries,
  frontendTree:read('rev-parse',head+':server-version/frontend'),required:[...surveyRequired]};
}
