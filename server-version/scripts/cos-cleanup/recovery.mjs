import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { seal, unseal, verifyEncrypted, atomicJson } from '../attachment-backup/core.mjs';
import { config, need, hash, id, protectedGraph, validRecord } from './model.mjs';
import { CosApi, METADATA_CIPHER_LIMIT } from './store.mjs';
import { Cleanup } from './engine.mjs';

export function referenceIndex(manifest) {
  need(manifest?.scope==='attachment_inventory_only'&&manifest.complete===true&&Array.isArray(manifest.entries),'RECOVERY_MANIFEST_INVALID');
  const sources=new Map(),assets=new Map();
  for(const e of manifest.entries) {
    need(e.source&&['cos','local'].includes(e.source.provider)&&typeof e.source.key==='string','RECOVERY_SOURCE_INVALID');
    const key=JSON.stringify([e.source.provider,e.source.key]);need(!sources.has(key),'RECOVERY_SOURCE_DUPLICATE');sources.set(key,e);
  }
  return {sources,assets,needed:new Map(),rows:0,references:0,externalUrls:0};
}
const keyFor=(provider,key)=>JSON.stringify([provider,key]);
function safeKey(value) {
  need(typeof value==='string'&&value.length>0&&!/[\\\x00-\x1f]/.test(value),'RECOVERY_REFERENCE_PATH_INVALID');
  const key=value.replace(/^\/+/, '');need(!key.split('/').some(p=>!p||p==='.'||p==='..'),'RECOVERY_REFERENCE_PATH_INVALID');return key;
}
function matchSource(index,provider,key,expected=null) {
  const e=index.sources.get(keyFor(provider,safeKey(key)));need(e,'RECOVERY_REFERENCE_MISSING');
  if(expected)need(e.sha256===expected.sha256&&e.bytes===expected.size_bytes,'RECOVERY_REFERENCE_CONTENT_CHANGED');
  index.references++;index.needed.set(id({key:e.blob,versionId:e.versionId}),e);return e;
}
function matchAsset(index,assetId) {
  const a=index.assets.get(assetId);need(a,'RECOVERY_ASSET_REFERENCE_MISSING');
  // Soft-deleted assets are deliberately inaccessible in the restored application.
  if(!a.deleted_at)matchSource(index,a.provider,a.object_key,a);
}
export function addAsset(index,row) {
  need(typeof row.id==='string'&&!index.assets.has(row.id)&&['cos','local'].includes(row.provider),'RECOVERY_ASSET_METADATA_INVALID');
  index.assets.set(row.id,row);
  if(!row.deleted_at) {
    need(/^[a-f0-9]{64}$/.test(row.sha256||'')&&Number.isSafeInteger(row.size_bytes)&&row.size_bytes>0,'RECOVERY_ASSET_METADATA_INVALID');
    matchSource(index,row.provider,row.object_key,row);
  }
}
function managedString(index,value,hosts) {
  const candidates=value.match(/https?:\/\/[^\s<>"']+|\/(?:uploads|videos|api\/assets)\/[^\s<>"']+/g)||[];
  for(const raw of candidates) {
    let url;try{url=new URL(raw,'https://recovery-local.invalid');}catch{throw Error('RECOVERY_REFERENCE_URL_INVALID');}
    if(url.hostname!=='recovery-local.invalid'&&!hosts.cos.includes(url.hostname)&&!hosts.site.includes(url.hostname)){index.externalUrls++;continue;}
    const pathname=decodeURIComponent(url.pathname);
    // Reject dot-segments before URL parsing normalizes them away.
    const rawPath=decodeURIComponent(raw.split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/,''));
    if(hosts.cos.includes(url.hostname)||/^\/(uploads|videos|api\/assets)\//.test(rawPath))safeKey(rawPath);
    if(hosts.cos.includes(url.hostname))matchSource(index,'cos',pathname);
    else if(pathname.startsWith('/uploads/'))matchSource(index,'local',pathname.slice('/uploads/'.length));
    else if(pathname.startsWith('/videos/'))matchSource(index,'cos',pathname);
    else if(pathname.startsWith('/api/assets/')) {
      const assetId=pathname.slice('/api/assets/'.length).split('/')[0];matchAsset(index,assetId);
    }
  }
}
export function addReferenceRow(index,table,row,hosts) {
  need(typeof table==='string'&&row&&typeof row==='object'&&!Array.isArray(row),'RECOVERY_ROW_INVALID');index.rows++;
  if(table==='stored_assets'||row.deleted_at||row.is_deleted===true)return;
  const directAsset=row.asset_id;
  const explicitCos=row.cos_key||row.original_cos_key;
  function visit(value,field) {
    if(Array.isArray(value)){for(const e of value)visit(e,field);return;}
    if(value&&typeof value==='object'){for(const [k,v]of Object.entries(value))visit(v,k);return;}
    if(typeof value!=='string'||!value)return;
    if(/(?:^|_)asset_id$/.test(field)||/AssetId$/.test(field)||field==='assetId'){matchAsset(index,value);return;}
    if(['cos_key','original_cos_key','cosKey','originalCosKey'].includes(field)){matchSource(index,'cos',value);return;}
    if(table==='documents'&&field==='file_path') {
      if(directAsset||explicitCos)return;
      if(/^https?:\/\//.test(value)){managedString(index,value,hosts);return;}
      const key=value.includes('/uploads/')?value.slice(value.lastIndexOf('/uploads/')+9):value.replace(/^uploads\//,'');matchSource(index,'local',key);return;
    }
    managedString(index,value,hosts);
  }
  for(const [k,v]of Object.entries(row))visit(v,k);
}
export async function readRows(file,onRow,maxBytes=536870912) {
  const s=await fsp.lstat(file);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=maxBytes,'RECOVERY_ROWS_LIMIT');
  const input=fs.createReadStream(file),lines=readline.createInterface({input,crlfDelay:Infinity});let count=0;
  try{for await(const line of lines){need(Buffer.byteLength(line)<=4*1024**2&&++count<=1000000,'RECOVERY_ROW_LIMIT');if(line)await onRow(JSON.parse(line));}}
  finally{lines.close();input.destroy();}
}
export async function download(api,r,file,limit) {
  validRecord(r);need(r.bytes<=limit,'RECOVERY_DOWNLOAD_LIMIT');await api.check(r);
  let bytes=0;const digest=crypto.createHash('sha256'),output=await fsp.open(file,'wx',0o600);
  try {
    await pipeline(api.stream(r),new Transform({transform(b,_,cb){bytes+=b.length;if(bytes>r.bytes)return cb(Error('RECOVERY_DOWNLOAD_LIMIT'));digest.update(b);cb(null,b);}}),output.createWriteStream());
    need(bytes===r.bytes&&digest.digest('hex')===r.sha256,'RECOVERY_DOWNLOAD_HASH_MISMATCH');
  } catch(e){await fsp.rm(file,{force:true});throw e;}
  finally{await output.close().catch(()=>{});}
}
async function manifest(api,s,secret,identity,work) {
  const r={key:s.remote.key,versionId:s.remote.versionId,bytes:s.remote.encryptedBytes,sha256:s.remote.encryptedSha256};
  const cipher=path.join(work,'manifest.gcm'),plain=cipher+'.json';
  try {
    await download(api,r,cipher,METADATA_CIPHER_LIMIT);await verifyEncrypted(cipher,s.remote,secret,identity.keyId,plain);
    const m=JSON.parse(await fsp.readFile(plain));need(m.id===s.id,'RECOVERY_MANIFEST_ID_CHANGED');return m;
  } finally{await fsp.rm(cipher,{force:true});await fsp.rm(plain,{force:true});}
}
export function cachedBinding(proof,point,snapshots,records,identity,verifierSha256) {
  if(proof?.status!=='VERIFIED'||proof.schema!==1||!['databaseRestore','attachmentDecrypt','databaseReferences'].every(k=>proof.checks?.[k]===true)||!Array.isArray(proof.bindings)
    ||proof.referenceVerifierSha256!==verifierSha256||JSON.stringify(proof.identity)!==JSON.stringify(identity))return null;
  const b=proof.bindings.find(b=>b.hostPointId===point.id),s=b&&snapshots.find(s=>s.id===b.attachmentSnapshotId);
  if(!s||b.databaseVersionId!==point.objects[0].versionId||b.databaseSha256!==point.objects[0].sha256
    ||b.snapshotVersionId!==s.remote.versionId||b.snapshotSha256!==s.remote.encryptedSha256
    ||!Number.isFinite(Date.parse(b.databaseRestoredAt))||Date.parse(b.databaseRestoredAt)>Date.now()
    ||b.databaseRestore?.status!=='PASS'||b.databaseRestore.network!=='none'||b.databaseRestore.failedMigrations!==0
    ||!Number.isInteger(b.databaseRestore.appliedMigrations)||b.databaseRestore.appliedMigrations<1)return null;
  const available=new Map(records.map(r=>[id(r),r]));
  if(!Array.isArray(b.verifiedBlobIds)||!b.verifiedBlobIds.every(key=>available.has(key)&&b.verifiedBlobHashes?.[key]===hash(available.get(key).receipt)))return null;
  return {binding:b,snapshot:s,records:b.verifiedBlobIds.map(key=>available.get(key))};
}
export async function verifyReferenceExports(api,repo,p,secret,work,hosts,databaseRestore) {
  const s=repo.snapshots.find(s=>s.id===repo.latestSnapshotId);need(s,'RECOVERY_SNAPSHOT_MISSING');
  const m=await manifest(api,s,secret,repo.identity,work),index=referenceIndex(m);
  await readRows(path.join(work,'assets.jsonl'),row=>addAsset(index,row));
  await readRows(path.join(work,'references.jsonl'),row=>addReferenceRow(index,row.table,row.data,hosts));
  const records=new Map(repo.records.map(r=>[id(r),r]));let bytes=0;
  for(const [key,e]of index.needed) {
    const r=records.get(key);need(r?.kind==='blob'&&r.receipt&&r.receipt.sha256===e.sha256&&r.receipt.bytes===e.bytes,'RECOVERY_BLOB_RECEIPT_MISMATCH');
    const file=path.join(work,'attachment.gcm'),plain=path.join(work,'attachment.plain');
    try {await download(api,r,file,536870912+4096);await verifyEncrypted(file,r.receipt,secret,repo.identity.keyId,plain);bytes+=r.bytes;}
    finally{await fsp.rm(file,{force:true});await fsp.rm(plain,{force:true});}
  }
  const binding={hostPointId:p.id,databaseVersionId:p.objects[0].versionId,databaseSha256:p.objects[0].sha256,attachmentSnapshotId:s.id,snapshotVersionId:s.remote.versionId,snapshotSha256:s.remote.encryptedSha256,databaseRestoredAt:databaseRestore?.at,databaseRestore:databaseRestore,verifiedBlobHashes:Object.fromEntries([...index.needed.keys()].map(key=>[key,hash(records.get(key).receipt)])),verifiedBlobIds:[...index.needed.keys()],referenceRows:index.rows,referenceCount:index.references,attachmentBytesVerified:bytes};
  need(Number.isFinite(Date.parse(binding.databaseRestoredAt))&&binding.databaseRestore?.status==='PASS'&&binding.databaseRestore.network==='none'&&binding.databaseRestore.failedMigrations===0&&binding.databaseRestore.appliedMigrations>0,'RECOVERY_RESTORE_EVIDENCE_REQUIRED');
  return binding;
}
async function cli() {
  process.umask(0o077);const input=JSON.parse(fs.readFileSync(0,'utf8')),c=config(input.config),secret=input.secret;
  need(typeof secret==='string'&&secret.length>=32,'BACKUP_KEY_REQUIRED');
  const require=createRequire(import.meta.url),COS=require('/app/node_modules/cos-nodejs-sdk-v5');
  const api=new CosApi(c,new COS({SecretId:input.credentials.COS_SECRET_ID,SecretKey:input.credentials.COS_SECRET_KEY,...(input.credentials.COS_SECURITY_TOKEN?{SecurityToken:input.credentials.COS_SECURITY_TOKEN}:{}),Timeout:60000}));
  const paths={state:'/work',work:'/work',host:'/host/catalog.json',hostStatus:'/host/status.json',attachment:'/attachments/catalog.json',proof:'/proof/recovery-proof.json',launcherFailure:'/attachments/launcher-failure.json'};
  if(['repository','readiness'].includes(input.command)) {
    const task=new Cleanup(c,api,secret,paths),state=await task.inspect(),g=protectedGraph(c,state,Date.now());
    if(input.command==='readiness'){console.log(JSON.stringify({ready:g.blocked.length===0,blocked:g.blocked}));return;}
    const blocked=g.blocked.filter(x=>!['JOINT_RECOVERY_PROOF_REQUIRED','RETAINED_HOST_POINT_NOT_JOINTLY_VERIFIED'].includes(x));
    if(blocked.length){console.log(JSON.stringify({blocked}));return;}
    const repo={schema:1,identity:state.attachment.identity,sourceHashes:state.sourceHashes,points:state.host.points.filter(p=>g.keepHost.has(p.id)),snapshots:[...state.snapshots.values()],records:[...state.records.values()],latestSnapshotId:state.attachment.snapshots.at(-1).id,previousProof:state.proof};
    await atomicJson('/work/repository.json',seal(repo,secret));console.log(JSON.stringify({retainedPoints:repo.points.length}));return;
  }
  const repo=unseal(JSON.parse(await fsp.readFile('/work/repository.json')),secret),p=repo.points.find(p=>p.id===input.pointId);need(p,'RECOVERY_POINT_NOT_RETAINED');
  if(input.command==='database') {
    const file='/work/database.edubackup.enc';await download(api,p.objects[0],file,536870912);await fsp.writeFile(file+'.sha256',p.objects[0].sha256+'  database.edubackup.enc\n',{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({downloadHashVerified:true}));return;
  }
  const cached=cachedBinding(repo.previousProof,p,repo.snapshots,repo.records,repo.identity,hash(await fsp.readFile(new URL('./recovery.mjs',import.meta.url))));
  if(input.command==='cached') {
    if(!cached){console.log(JSON.stringify({cached:false}));return;}
    await api.check(p.objects[0]);await api.check({key:cached.snapshot.remote.key,versionId:cached.snapshot.remote.versionId,bytes:cached.snapshot.remote.encryptedBytes,sha256:cached.snapshot.remote.encryptedSha256});
    for(const r of cached.records)await api.check(r);
    await atomicJson('/work/binding.json',seal(cached.binding,secret));console.log(JSON.stringify({cached:true}));return;
  }
  need(input.command==='attachments','RECOVERY_COMMAND_REFUSED');
  const binding=await verifyReferenceExports(api,repo,p,secret,'/work',input.hosts,input.databaseRestore);
  await atomicJson('/work/binding.json',seal(binding,secret));console.log(JSON.stringify({referenceRows:binding.referenceRows,referenceCount:binding.referenceCount,attachmentVersionsVerified:binding.verifiedBlobIds.length,attachmentBytesVerified:binding.attachmentBytesVerified}));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)cli().catch(e=>{console.error(JSON.stringify({failed:true,error:/^[A-Z][A-Z0-9_]{2,80}$/.test(e.message)?e.message:'JOINT_RECOVERY_FAILED'}));process.exitCode=1;});
