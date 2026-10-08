import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { config, plan, detach, protectedGraph, validRecord, hash, id } from './model.mjs';
import { Cleanup } from './engine.mjs';
import { CosApi, scan, fingerprint } from './store.mjs';
import { seal, unseal, keyFingerprint, encryptStream } from '../attachment-backup/core.mjs';

const secret='synthetic-cleanup-backup-key-0123456789abcdef';
const now=Date.parse('2026-10-06T06:00:00Z'),at=offset=>new Date(now-offset).toISOString(),hour=3600000;
const c={schema:1,mode:'execute',backupBucket:'eduk12-backups-1393949445',sourceBucket:'ptool-videos-edu-1393949445',region:'ap-beijing',quarantineHours:24,maxDeleteObjects:20,maxDeleteBytes:536870912,maxInventoryVersions:10000,maxScanBytes:67108864,retention:{hourlyHours:48,dailyDays:30,weeklyWeeks:12,monthlyMonths:12}};
function fixture() {
  const records=new Map(),snapshots=new Map(),catalogs=new Map();let serial=0;
  const record=(key,kind,when=at(400*24*hour),extra={})=>{const r={key,versionId:'v'+(++serial),bytes:8,sha256:hash('content!'),at:when,kind,...extra};records.set(id(r),r);return r;};
  const blob=(digit)=>{const key=`attachments/v1/objects/key-v1/${digit.repeat(64)}.gcm`,r=record(key,'blob');r.blob=id(r);r.receipt={key,versionId:r.versionId,sha256:digit.repeat(64),encryptedSha256:r.sha256,bytes:1,encryptedBytes:r.bytes,verified:true,keyId:'key-v1'};record(key+'.receipt.json','blob_receipt',r.at,{blob:id(r)});return r;};
  const baseline=blob('a'),expired=blob('b');
  const snapshot=(uuid,when,b,protectedPoint=false)=>{const remote=record(`attachments/v1/snapshots/${uuid}.gcm`,'snapshot',when,{snapshotId:uuid});const r={id:uuid,at:when,complete:true,protected:protectedPoint,remote,blobs:[id(b)],blobKeys:[b.key]};snapshots.set(uuid,r);return r;};
  const ss=[snapshot('00000000-0000-0000-0000-000000000001',at(420*24*hour),baseline,true),snapshot('00000000-0000-0000-0000-000000000002',at(400*24*hour),expired),snapshot('00000000-0000-0000-0000-000000000003',at(5*60000),baseline),snapshot('00000000-0000-0000-0000-000000000004',at(60000),baseline)];
  const points=[];
  for(let n=1;n<=4;n++){const uuid=String(n).padStart(32,'0'),objects=['database.edubackup.enc','server-config.gcm'].map(file=>({...record(`host-backups/v1/${uuid}/${file}`,'host',ss[n-1].at,{pointId:uuid}),downloadVerified:true,authenticatedDecryptionVerified:true})),metadata=record(`host-backups/v1/${uuid}/receipt.json`,'host',ss[n-1].at,{pointId:uuid});points.push({id:uuid,at:ss[n-1].at,status:'VERIFIED',protected:n===1,restore:{status:'PASS'},objects,metadata,attachmentAssociation:{snapshot:{id:ss[n-1].id}}});}
  for(let n=1;n<=3;n++){
    const key=`attachments/v1/catalogs/10000000-0000-0000-0000-${String(n).padStart(12,'0')}.gcm`,when=n===1?at(399*24*hour):at((4-n)*60000),r=record(key,'catalog',when);
    catalogs.set(id(r),{blobs:n===1?[id(baseline),id(expired)]:[id(baseline)],snapshotIds:n===1?[ss[0].id,ss[1].id]:[ss[2].id,ss[3].id]});record('attachments/v1/catalog-latest.json','pointer',when,{catalog:id(r)});
  }
  const attachment={schema:1,identity:{sourceBucket:c.sourceBucket,backupBucket:c.backupBucket,region:c.region,prefix:'attachments/v1/',keyId:'key-v1',keyFingerprint:keyFingerprint(secret)},pending:false,lastFailure:null,lastFullVerificationAt:at(60000),snapshots:ss.map(s=>({...s,blobs:s.blobKeys})),receipts:Object.fromEntries([baseline,expired].map(b=>[b.key,b.receipt])),sources:{old:{blob:expired.key}},blobSets:{},candidates:{}};
  const host={schema:1,points};
  const proof={schema:1,status:'VERIFIED',bucket:c.backupBucket,region:c.region,at:at(0),checks:{databaseRestore:true,attachmentDecrypt:true,databaseReferences:true},bindings:points.map((p,n)=>({hostPointId:p.id,databaseVersionId:p.objects[0].versionId,attachmentSnapshotId:ss[n].id,snapshotVersionId:ss[n].remote.versionId}))};
  const inventory=[...records.values()].map(r=>({...r,kind:'object',latest:r.kind!=='pointer'||r.at===at(60000)}));
  return {records,snapshots,catalogs,host,attachment,proof,hostStatus:{status:'VERIFIED'},unknownMetadata:[],launcherFailure:false,sourceHashes:{},inventory,inventoryHash:fingerprint(inventory),baseline,expired};
}
// Observation tests start at the same clock, then shift each firstSeen (not data freshness).
const mature=f=>{const first=plan(c,f,null,now);for(const o of Object.values(first.observations)){o.firstSeen=at(25*hour);o.lastSeen=at(hour);}return plan(c,f,first,now);};
test('plans keep baseline, last two recovery points, host-pinned manifests and all their versions',()=>{
  const f=fixture(),p=mature(f);assert.deepEqual(p.blocked,[]);assert.ok(p.actions.length>0);
  for(const r of p.actions){assert.ok(!p.protectedVersionIds.includes(id(r)));assert.notEqual(r.key,f.baseline.key);}
  assert.ok(p.actions.some(r=>r.kind==='host'&&r.pointId==='2'.padStart(32,'0')));
  const d=detach(f,p);assert.equal(d.host.points[1].status,'RETIRED');assert.equal(d.host.points[0].status,'VERIFIED');
  assert.ok(!d.attachment.receipts[f.expired.key]);assert.ok(d.attachment.receipts[f.baseline.key]);
});
test('candidate quarantine and observation gaps prevent premature deletion',()=>{
  const f=fixture(),p=plan(c,f,null,now);assert.equal(p.actions.length,0);
  for(const o of Object.values(p.observations)){o.firstSeen=at(48*hour);o.lastSeen=at(37*hour);}
  assert.equal(plan(c,f,p,now).actions.length,0);
});
test('pending scan, stale verification, failed backup, unknown metadata and missing proof block all actions',()=>{
  const changes=[f=>f.attachment.pending=true,f=>f.attachment.lastFullVerificationAt=at(37*hour),f=>f.hostStatus.status='FAILED',f=>f.unknownMetadata.push('unknown'),f=>f.proof=null,f=>f.launcherFailure=true,f=>f.proof.checks.databaseReferences=false];
  for(const change of changes){const f=fixture();change(f);const p=mature(f);assert.ok(p.blocked.length>0);assert.equal(p.actions.length,0);}
});
test('proof version mismatch and protected historical host association prohibit retirement',()=>{
  const f=fixture();f.proof.bindings[0].databaseVersionId='wrong';assert.ok(mature(f).blocked.includes('RETAINED_HOST_POINT_NOT_JOINTLY_VERIFIED'));
  const g=fixture();g.host.points[1].protected=true;const p=mature(g);assert.ok(p.retainedSnapshotIds.includes(g.host.points[1].attachmentAssociation.snapshot.id));assert.ok(!p.actions.some(r=>r.key===g.expired.key));
});
test('namespace, version, retention and resource-limit guards refuse unsafe inputs',()=>{
  for(const patch of [{backupBucket:c.sourceBucket},{region:'ap-shanghai'},{quarantineHours:1},{maxDeleteObjects:101},{maxScanBytes:536870913},{maxScanBytes:0},{mode:'delete_all'}])assert.throws(()=>config({...c,...patch}));
  for(const patch of [{key:'media/original.pdf'},{versionId:'null'},{versionId:''},{sha256:'etag'}])assert.throws(()=>validRecord({...fixture().baseline,...patch}));
});
test('small batch never partially retires a host point or removes a referenced payload',()=>{
  const f=fixture(),cfg={...c,maxDeleteObjects:2},first=plan(cfg,f,null,now);for(const o of Object.values(first.observations)){o.firstSeen=at(25*hour);o.lastSeen=at(hour);}
  const p=plan(cfg,f,first,now);assert.ok(p.actions.length<=2);assert.ok(!p.actions.some(r=>r.kind==='host'||r.kind==='blob'));assert.ok(p.bytes<=cfg.maxDeleteBytes);
});
class MemoryApi {
  constructor(f){this.deleteClient={};this.rows=new Map(f.inventory.map(r=>[id(r),structuredClone(r)]));this.bodies=new Map(f.inventory.map(r=>[id(r),Buffer.from('content!')]));this.deleted=[];this.serial=100;}
  async privateVersioned(){}
  async versions(){return [...this.rows.values()].map(r=>structuredClone(r));}
  async check(r){assert.ok(this.rows.has(id(r)));assert.equal(this.rows.get(id(r)).bytes,r.bytes);assert.equal(hash(this.bodies.get(id(r))),r.sha256);}
  async buffer(r){return this.bodies.get(id(r));}
  async call(method,{Key,VersionId}){assert.equal(method,'headObject');const r=this.rows.get(JSON.stringify([Key,VersionId]));return {headers:{'x-cos-meta-sha256':hash(this.bodies.get(id(r)))}};}
  async put(key,body){const b=Buffer.isBuffer(body)?body:await fs.readFile(body);for(const r of this.rows.values())if(r.key===key)r.latest=false;const r={key,versionId:'v'+(++this.serial),bytes:b.length,sha256:hash(b),at:at(0),kind:'object',latest:true};this.rows.set(id(r),r);this.bodies.set(id(r),b);if(this.failAfterPut){this.failAfterPut=false;throw Error('SYNTHETIC_NETWORK_LOST_AFTER_PUT');}return r;}
  async deleteVersion(r){await this.check(r);this.deleted.push(id(r));this.rows.delete(id(r));this.bodies.delete(id(r));if(this.failAfterDelete){this.failAfterDelete=false;throw Error('SYNTHETIC_NETWORK_LOST_AFTER_DELETE');}return {deleted:true};}
}
async function diskFixture(t,mode='execute') {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cos-cleanup-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const f=fixture(),paths={state:dir,work:dir,host:path.join(dir,'host.json'),attachment:path.join(dir,'attachment.json'),proof:path.join(dir,'proof.json'),hostStatus:path.join(dir,'status.json'),launcherFailure:path.join(dir,'failure.json')};
  for(const [file,v]of [[paths.host,f.host],[paths.attachment,f.attachment],[paths.proof,f.proof]])await fs.writeFile(file,JSON.stringify(seal(v,secret))+'\n');
  await fs.writeFile(paths.hostStatus,JSON.stringify(f.hostStatus));
  const api=new MemoryApi(f),task=new Cleanup({...c,mode},api,secret,paths,{clock:()=>now,scanner:async(_,__,local)=>({...f,...local})});
  const first=await task.makePlan();for(const o of Object.values(first.p.observations)){o.firstSeen=at(25*hour);o.lastSeen=at(hour);}
  await fs.writeFile(task.planFile,JSON.stringify(seal(first.p,secret)));return {task,api,f,paths};
}
test('plan-only leaves producer catalogs and COS versions unchanged',async t=>{
  const {task,api,paths}=await diskFixture(t,'plan_only'),before=await fs.readFile(paths.host),ids=await api.versions();
  const r=await task.run();assert.equal(r.executed,false);assert.equal(api.deleted.length,0);assert.deepEqual(await fs.readFile(paths.host),before);assert.deepEqual(await api.versions(),ids);
});
test('execution replaces two checked encrypted indexes before exact-version deletion, preserving protected data',async t=>{
  const {task,api,f}=await diskFixture(t);const result=await task.run();assert.equal(result.executed,true);assert.ok(result.deletedVersions>0);
  const j=await task.read(task.journalFile);assert.equal(j.status,'COMPLETE');assert.equal(j.checkpoints.length,2);assert.ok(j.checkpoints.every(cp=>cp.complete));
  assert.ok(api.rows.has(id(f.baseline)));for(const key of j.plan.protectedVersionIds)assert.ok(api.rows.has(key));
  const expiredManifest=[...f.records.values()].find(r=>r.kind==='snapshot'&&r.snapshotId==='00000000-0000-0000-0000-000000000002');
  assert.ok(api.deleted.indexOf(id(f.expired))>api.deleted.indexOf(id(expiredManifest)));
});
test('lost DELETE response resumes from durable intent without deleting another version',async t=>{
  const {task,api}=await diskFixture(t);api.failAfterDelete=true;await assert.rejects(task.run(),/SYNTHETIC_NETWORK_LOST_AFTER_DELETE/);
  assert.notEqual((await task.read(task.journalFile)).status,'COMPLETE');const firstDeleted=api.deleted[0];
  await task.run();assert.equal((await task.read(task.journalFile)).status,'COMPLETE');assert.equal(api.deleted.filter(x=>x===firstDeleted).length,1);
});
test('lost checkpoint upload response adopts its authenticated ciphertext instead of overwriting',async t=>{
  const {task,api}=await diskFixture(t);api.failAfterPut=true;await assert.rejects(task.run(),/SYNTHETIC_NETWORK_LOST_AFTER_PUT/);
  assert.equal(api.deleted.length,0);await task.run();assert.equal((await task.read(task.journalFile)).status,'COMPLETE');
  const journal=await task.read(task.journalFile);for(const cp of journal.checkpoints)assert.equal(journal.owned.filter(r=>r.key===cp.key).length,1);
});
test('new foreign backup versions block resuming a pending transaction',async t=>{
  const {task,api}=await diskFixture(t);api.failAfterDelete=true;await assert.rejects(task.run());const count=api.deleted.length;
  await api.put('host-backups/v1/'+'f'.repeat(32)+'/receipt.json',Buffer.from('foreign!'));
  await assert.rejects(task.run(),/UNEXPECTED_REMOTE_VERSION/);assert.equal(api.deleted.length,count);
});
test('changed local catalog and newly written cloud versions stop pending deletion',async t=>{
  const {task,api,paths}=await diskFixture(t);api.failAfterDelete=true;await assert.rejects(task.run());const count=api.deleted.length;
  const value=unseal(JSON.parse(await fs.readFile(paths.host)),secret);value.extra='changed';await fs.writeFile(paths.host,JSON.stringify(seal(value,secret))+'\n');
  await assert.rejects(task.run(),/LOCAL_CATALOG_CHANGED/);assert.equal(api.deleted.length,count);
});
test('tampered journal and execution identity absence fail closed',async t=>{
  const {task,api}=await diskFixture(t);api.deleteClient=null;await assert.rejects(task.run(),/DEDICATED_DELETE_IDENTITY_REQUIRED/);
  await fs.writeFile(task.journalFile,JSON.stringify({status:'DETACHED',mac:'0'.repeat(64)}));await assert.rejects(task.run(),/INDEX_AUTHENTICATION_FAILED/);assert.equal(api.deleted.length,0);
});
test('SDK adapter mandates VersionId, validates actual absence and preserves bucket binding',async()=>{
  const r={...fixture().baseline};let gone=false,calls=[];
  const client={headObject:(args,cb)=>{calls.push(args);gone?cb({statusCode:404}):cb(null,{headers:{'x-cos-version-id':r.versionId,'content-length':String(r.bytes),'x-cos-meta-sha256':r.sha256}});},deleteObject:(args,cb)=>{calls.push(args);gone=true;cb(null,{headers:{'x-cos-version-id':r.versionId}});}};
  const api=new CosApi(c,client,client);await api.deleteVersion(r);assert.ok(calls.every(x=>x.VersionId===r.versionId&&x.Bucket===c.backupBucket));
  await assert.rejects(api.deleteVersion({...r,versionId:''}),/INVALID_VERSION_RECEIPT/);
});
test('SDK version pagination uses both markers and rejects repeated cursors',async()=>{
  let calls=[];const client={listObjectVersions:(args,cb)=>{calls.push(args);cb(null,args.KeyMarker?{Versions:[],IsTruncated:'false'}:{Versions:[],IsTruncated:'true',NextKeyMarker:'key',NextVersionIdMarker:'version'});}};
  await new CosApi(c,client).versions();assert.equal(calls[1].KeyMarker,'key');assert.equal(calls[1].VersionIdMarker,'version');
  client.listObjectVersions=(args,cb)=>cb(null,{Versions:[],IsTruncated:true,NextKeyMarker:'same',NextVersionIdMarker:'v'});
  await assert.rejects(new CosApi(c,client).versions(),/VERSION_PAGINATION_INCOMPLETE/);
});
test('historical encrypted catalog scan exceeds the old budget with bounded retained state',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cleanup-scan-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const api=new MemoryApi({inventory:[]}),identity=fixture().attachment.identity,receipts={};
  async function upload(value,folder) {
    const file=path.join(temp,crypto.randomUUID()+'.gcm'),r=await encryptStream(Readable.from([Buffer.from(JSON.stringify(value))]),file,secret,identity.keyId,16*1024**2);
    const remote=await api.put(`attachments/v1/${folder}/${crypto.randomUUID()}.gcm`,file);await fs.rm(file);return {...r,key:remote.key,versionId:remote.versionId,keyId:identity.keyId};
  }
  const file=path.join(temp,'blob.gcm'),receipt=await encryptStream(Readable.from([Buffer.from('synthetic-file')]),file,secret,identity.keyId,1000);
  const key=`attachments/v1/objects/${identity.keyId}/${receipt.sha256}.gcm`,remote=await api.put(key,file),blob={...receipt,key,versionId:remote.versionId,keyId:identity.keyId,verified:true};receipts[key]=blob;
  await api.put(key+'.receipt.json',Buffer.from(JSON.stringify(seal(blob,secret))));
  const ss=[];
  for(let n=0;n<2;n++) {
    const sid=crypto.randomUUID(),manifest={id:sid,scope:'attachment_inventory_only',complete:true,entries:[{blob:key,versionId:blob.versionId,sha256:blob.sha256,bytes:blob.bytes}]};
    const r=await upload(manifest,'snapshots');ss.push({id:sid,at:at(n?60000:400*24*hour),complete:true,protected:n===0,blobs:[key],remote:r});
  }
  // Historical source maps are irrelevant to the retained dependency graph.
  // Twelve authenticated 6 MiB catalogs reproduce production growth past 64 MiB.
  for(let n=0;n<12;n++) {
    const points=n===0?ss:ss.slice(1);
    const state={schema:1,identity,receipts,snapshots:points,blobSets:{},sources:{historical:{padding:'x'.repeat(6*1024**2)}},candidates:{},pending:false};
    const pointer=await upload(seal(state,secret),'catalogs');await api.put('attachments/v1/catalog-latest.json',Buffer.from(JSON.stringify(seal(pointer,secret))));
  }
  const local={host:{schema:1,points:[]},attachment:{schema:1,identity,receipts,snapshots:ss.slice(1),blobSets:{},pending:false},sourceHashes:{}};
  const cfg={...c,maxScanBytes:536870912};config(cfg);
  const result=await scan(api,cfg,local,secret,temp);assert.equal(result.snapshots.size,2);assert.ok(result.snapshots.has(ss[0].id));assert.equal(result.unknownMetadata.length,0);
  assert.ok(result.scanBytes>64*1024**2);assert.equal(result.catalogs.size,12);
  assert.ok([...result.catalogs.values()].every(cat=>!Object.hasOwn(cat,'state')));
  await assert.rejects(scan(api,c,local,secret,temp),/METADATA_SCAN_BUDGET/);
  await assert.rejects(scan(api,{...cfg,maxScanBytes:1},local,secret,temp),/METADATA_SCAN_BUDGET/);
  const historicalPointer=[...api.rows.values()].find(r=>r.key==='attachments/v1/catalog-latest.json'&&!r.latest);
  const body=JSON.parse(api.bodies.get(id(historicalPointer)));body.mac='0'.repeat(64);
  api.bodies.set(id(historicalPointer),Buffer.from(JSON.stringify(body)));
  await assert.rejects(scan(api,cfg,local,secret,temp),/INDEX_AUTHENTICATION_FAILED/);
});

test('detachment refuses conflicting versions for one retained deduplication key',()=>{
  const f=fixture(),p=mature(f),s=f.snapshots.get('00000000-0000-0000-0000-000000000004');
  const other={...f.baseline,versionId:'other-retained-version',receipt:{...f.baseline.receipt,versionId:'other-retained-version'}};
  f.records.set(id(other),other);s.blobs=[id(other)];
  assert.throws(()=>detach(f,p),/DETACH_CONFLICTING_RETAINED_BLOB_VERSION/);
});
