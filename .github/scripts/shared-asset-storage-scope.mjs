import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const bindings=JSON.parse(readFileSync(new URL('./shared-asset-storage-bindings.json',import.meta.url),'utf8'));
export const sharedAssetStorageTests=["src/__tests__/integration/student-upload-staging.postgres.integration.test.ts", "src/__tests__/integration/asset-upload-deduplication.postgres.integration.test.ts", "src/__tests__/utils/cos.test.ts", "src/__tests__/integration/shared-asset-storage.postgres.integration.test.ts", "src/__tests__/integration/legacy-asset-domain.postgres.integration.test.ts", "src/__tests__/services/assetStorage.test.ts", "src/__tests__/assessment-media/assessment-asset.test.ts", "src/__tests__/assessment-media/assessment-image.test.ts", "src/__tests__/assessment-media/assessment-video.test.ts", "src/__tests__/assessment-media/assessment-video-capability-issuance.test.ts", "src/__tests__/assessment-media/media-2-retention-lifecycle.contract.test.ts"];
export const sharedAssetStorageRequired=["frozen-boundary", "backend-compile", "shared-media-permissions", "new-schema-restore", "runtime-scan", "sast"];
const allowed=new Set(["server-version/scripts/asset-upload-cleanup/run_test.py", ".github/scripts/shared-asset-storage-scope.mjs", ".github/scripts/shared-asset-storage-scope.test.mjs", ".github/scripts/shared-asset-storage-bindings.json", ".github/scripts/shared-asset-storage-candidate.py", ".github/scripts/content-scope.mjs", ".github/scripts/merge-gate.mjs", ".github/workflows/ci.yml", ".github/workflows/ci-shared-asset-storage.yml", "docs/release/README.md", "server-version/scripts/cos-cleanup/recovery.test.mjs"].concat(sharedAssetStorageTests.map(f=>'server-version/backend/'+f)));
const blob=(ref,file)=>execFileSync('git',['rev-parse',ref+':'+file],{encoding:'utf8'}).trim();
export function admitsSharedAssetStorage(entries,read,approved=bindings){
 if(approved?.schema!==1||!approved.files||!Object.keys(approved.files).length||!entries.length)return false;
 if(!Object.keys(approved.files).every(f=>entries.some(e=>e.file===f)))return false;
 for(const e of entries){
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))return false;
  const b=approved.files[e.file];
  if(b){if(read('head',e.file)!==b.after||!/^[a-f0-9]{40}$/.test(b.after)||
   (b.before===null?e.status!=='A':e.status!=='M'||read('base',e.file)!==b.before))return false;}
  else if(!allowed.has(e.file))return false;
 }
 return true;
}
export function sharedAssetStoragePlan(entries,base,head){
 if(!/^[a-f0-9]{40}$/.test(base)||!/^[a-f0-9]{40}$/.test(head))throw Error('Full source SHAs required');
 if(!admitsSharedAssetStorage(entries,(ref,file)=>blob(ref==='base'?base:head,file)))return null;
 for(const f of ['server-version/frontend','server-version/backend/package-lock.json','server-version/backend/Dockerfile'])if(blob(base,f)!==blob(head,f))return null;
 return {schema:1,route:'shared-asset-storage',base,head,changes:entries,changed:['backend'],components:{backend:blob(head,'server-version/backend')},tests:sharedAssetStorageTests,focusedTests:[],required:sharedAssetStorageRequired};
}
