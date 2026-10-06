// Operator-only synthetic COS probe; not installed as a production entry point.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { CosApi } from './store.mjs';
import { need, hash, id } from './model.mjs';

const input=JSON.parse(fs.readFileSync(0,'utf8'));
need(input.command==='synthetic_version_delete','SYNTHETIC_PROBE_REQUIRED');
const require=createRequire(import.meta.url),COS=require('/app/node_modules/cos-nodejs-sdk-v5');
const client=new COS({SecretId:input.credentials.COS_SECRET_ID,SecretKey:input.credentials.COS_SECRET_KEY,...(input.credentials.COS_SECURITY_TOKEN?{SecurityToken:input.credentials.COS_SECURITY_TOKEN}:{}),Timeout:60000});
const c={backupBucket:'eduk12-backups-1393949445',region:'ap-beijing',maxInventoryVersions:10000};
const api=new CosApi(c,client,client),key='host-backups/v1/'+crypto.randomUUID().replaceAll('-','')+'/database.edubackup.enc';
const bodies=[Buffer.from('synthetic-old-'+crypto.randomUUID()),Buffer.from('synthetic-retained-'+crypto.randomUUID())];
const owned=[];
try {
  await api.privateVersioned();
  need(!(await api.versions()).some(r=>r.key===key),'SYNTHETIC_NAMESPACE_ALREADY_EXISTS');
  owned.push(await api.put(key,bodies[0]));owned.push(await api.put(key,bodies[1]));
  await api.deleteVersion(owned[0]);await api.check(owned[1]);
  const rows=(await api.versions()).filter(r=>r.key===key);
  need(rows.length===1&&id(rows[0])===id(owned[1])&&rows[0].kind==='object','SYNTHETIC_VERSION_ISOLATION_FAILED');
} finally {
  // Only this unpredictable key with one of these exact synthetic hashes can be reclaimed.
  for(const r of (await api.versions()).filter(r=>r.key===key)) {
    need(r.kind==='object','UNEXPECTED_SYNTHETIC_DELETE_MARKER');
    const header=await api.call('headObject',{Key:r.key,VersionId:r.versionId});
    const digest=header.headers?.['x-cos-meta-sha256'];need(bodies.some(b=>hash(b)===digest),'SYNTHETIC_OWNERSHIP_MISMATCH');
    await api.deleteVersion({...r,sha256:digest});
  }
}
need(!(await api.versions()).some(r=>r.key===key),'SYNTHETIC_CLEANUP_INCOMPLETE');
console.log(JSON.stringify({specificVersionDelete:'PASS',unrelatedVersionPreserved:true,deleteMarkersCreated:0,ownedVersionsRemaining:0}));
