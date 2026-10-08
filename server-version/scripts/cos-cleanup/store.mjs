import { promises as fsp } from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { PassThrough } from 'node:stream';
import crypto from 'node:crypto';
import { unseal, verifyEncrypted, snapshotBlobs, keyFingerprint } from '../attachment-backup/core.mjs';
import { need, hash, id, validRecord } from './model.mjs';

export const METADATA_CIPHER_LIMIT = 16 * 1024 ** 2 + 4096;
const bool = x => x === true || x === 'true';
export class CosApi {
  constructor(c, client, deleteClient = null) { this.c = c; this.client = client; this.deleteClient = deleteClient; }
  call(method, extra = {}, client = this.client) {
    return new Promise((resolve,reject) => client[method]({ ...extra, Bucket: this.c.backupBucket, Region: this.c.region }, (e,r) => e ? reject(e) : resolve(r)));
  }
  async privateVersioned() {
    need((await this.call('getBucketVersioning')).VersioningConfiguration?.Status === 'Enabled', 'VERSIONING_REQUIRED');
    const acl = await this.call('getBucketAcl');
    need(!/anyone|AllUsers|AuthenticatedUsers/i.test(JSON.stringify(acl.Grants || [])), 'PRIVATE_BUCKET_REQUIRED');
    const status = await new Promise((resolve,reject) => {
      const req = https.request({ hostname: this.c.backupBucket + '.cos.' + this.c.region + '.myqcloud.com', method:'HEAD', path:'/attachments/v1/catalog-latest.json', timeout:15000 }, r=>{r.resume();resolve(r.statusCode);});
      req.on('error',reject);req.on('timeout',()=>req.destroy(Error('PRIVATE_PROBE_TIMEOUT')));req.end();
    });
    need(status === 403, 'PUBLIC_POLICY_REFUSED');
    const life = await this.call('getBucketLifecycle').catch(e=>{if(e.statusCode===404)return {Rules:[]};throw e;});
    need(!(life.Rules||[]).some(r=>r.Status==='Enabled' && (r.Expiration || r.NoncurrentVersionExpiration)
      && ['attachments/v1/','host-backups/v1/'].some(p=>p.startsWith(r.Filter?.Prefix??r.Prefix??'') || (r.Filter?.Prefix??r.Prefix??'').startsWith(p))), 'UNREVIEWED_EXPIRATION_RULE');
  }
  async versions() {
    const rows = [], seen = new Set();
    for (const Prefix of ['attachments/v1/','host-backups/v1/']) {
      let markers = {}, previous;
      while (true) {
        const r = await this.call('listObjectVersions',{Prefix,MaxKeys:1000,...markers});
        for (const [kind, items] of [['object',r.Versions||[]],['marker',r.DeleteMarkers||[]]]) for (const v of items) {
          need(v.Key.startsWith(Prefix) && typeof v.VersionId==='string' && v.VersionId && v.VersionId!=='null', 'VERSION_INVENTORY_INVALID');
          const row = {key:v.Key,versionId:v.VersionId,bytes:kind==='marker'?0:Number(v.Size),at:v.LastModified,latest:bool(v.IsLatest),kind};
          need(Number.isSafeInteger(row.bytes)&&row.bytes>=0&&!seen.has(id(row)), 'VERSION_INVENTORY_INVALID');
          seen.add(id(row)); rows.push(row);need(rows.length<=this.c.maxInventoryVersions,'VERSION_INVENTORY_LIMIT');
        }
        if (!bool(r.IsTruncated)) break;
        const next=JSON.stringify([r.NextKeyMarker,r.NextVersionIdMarker||'']);
        need(r.NextKeyMarker && next!==previous,'VERSION_PAGINATION_INCOMPLETE');previous=next;
        markers={KeyMarker:r.NextKeyMarker,VersionIdMarker:r.NextVersionIdMarker||''};
      }
    }
    return rows.sort((a,b)=>id(a).localeCompare(id(b)));
  }
  async head(r, missing=false) {
    validRecord(r);
    try {return await this.call('headObject',{Key:r.key,VersionId:r.versionId});}
    catch(e){if(missing&&e.statusCode===404)return null;throw e;}
  }
  stream(r) {
    const stream = new PassThrough(); stream.on('error',()=>{});
    queueMicrotask(()=>this.client.getObject({Bucket:this.c.backupBucket,Region:this.c.region,Key:r.key,VersionId:r.versionId,Output:stream},e=>{if(e)stream.destroy(e);}));
    return stream;
  }
  async buffer(r, limit) {
    need(r.bytes<=limit,'METADATA_LIMIT');let count=0;const chunks=[];
    for await(const b of this.stream(r)){count+=b.length;need(count<=r.bytes&&count<=limit,'METADATA_LIMIT');chunks.push(b);}
    need(count===r.bytes,'DOWNLOAD_SIZE_MISMATCH');return Buffer.concat(chunks);
  }
  async check(r) {
    const h=await this.head(r);
    need(h.headers?.['x-cos-version-id']===r.versionId&&Number(h.headers?.['content-length'])===r.bytes,'REMOTE_VERSION_CHANGED');
    if(h.headers?.['x-cos-meta-sha256']) need(h.headers['x-cos-meta-sha256']===r.sha256,'REMOTE_HASH_CHANGED');
    else need(r.bytes<=16*1024**2 && hash(await this.buffer(r,16*1024**2))===r.sha256,'REMOTE_HASH_CHANGED');
  }
  async deleteVersion(r) {
    validRecord(r); need(this.deleteClient,'DEDICATED_DELETE_IDENTITY_REQUIRED');
    // VersionId is mandatory. Never create a delete marker or delete a key by age.
    const h=await this.head(r,true);if(!h)return {alreadyAbsent:true};
    await this.check(r);
    const result=await this.call('deleteObject',{Key:r.key,VersionId:r.versionId},this.deleteClient);
    need(result.headers?.['x-cos-version-id']===r.versionId && result.headers?.['x-cos-delete-marker']!=='true','DELETE_RESPONSE_INVALID');
    need(!(await this.head(r,true)),'DELETE_NOT_CONFIRMED');return {deleted:true};
  }
  async put(key, body) {
    const bytes=Buffer.isBuffer(body)?body:await fsp.readFile(body),sha256=hash(bytes);
    validRecord({key,versionId:'pending',bytes:bytes.length,sha256});
    const response=await this.call('putObject',{Key:key,Body:bytes,ContentLength:bytes.length,ACL:'private',ServerSideEncryption:'AES256',Headers:{'x-cos-meta-sha256':sha256}});
    const r={key,versionId:response.VersionId||response.headers?.['x-cos-version-id'],bytes:bytes.length,sha256};validRecord(r);
    await this.check(r);need(hash(await this.buffer(r,METADATA_CIPHER_LIMIT))===sha256,'CHECKPOINT_DOWNLOAD_FAILED');return r;
  }
}
export const fingerprint = versions => hash(versions.map(r=>[r.key,r.versionId,r.bytes,r.kind]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
export async function scan(api, c, local, secret, work) {
  const versions=await api.versions(), lookup=new Map(versions.filter(r=>r.kind==='object').map(r=>[id(r),r]));
  const records=new Map(),snapshots=new Map(),catalogs=new Map();let readBytes=0;
  const register=(r,kind,extra={})=>{
    validRecord(r);const listed=lookup.get(id(r));need(listed&&listed.bytes===r.bytes,'INDEXED_VERSION_MISSING');
    const previous=records.get(id(r));need(!previous||previous.sha256===r.sha256,'CONFLICTING_VERSION_RECEIPTS');
    const record={...r,at:listed.at,kind,...extra};records.set(id(r),record);return record;
  };
  const read=async r=>{readBytes+=r.bytes;need(readBytes<=c.maxScanBytes,'METADATA_SCAN_BUDGET');return api.buffer(r,METADATA_CIPHER_LIMIT);};
  const decrypted=async r=>{
    const original=lookup.get(id(r));need(original&&original.bytes===r.encryptedBytes,'INDEXED_METADATA_MISSING');
    const encrypted=path.join(work,crypto.randomUUID()+'.gcm'),plain=encrypted+'.json';
    try {await fsp.writeFile(encrypted,await read(original),{mode:0o600,flag:'wx'});await verifyEncrypted(encrypted,r,secret,local.attachment.identity.keyId,plain);return JSON.parse(await fsp.readFile(plain));}
    finally{await fsp.rm(encrypted,{force:true});await fsp.rm(plain,{force:true});}
  };
  const metadataRecord=r=>({key:r.key,versionId:r.versionId,bytes:r.encryptedBytes,sha256:r.encryptedSha256});
  // Retain the dependency graph, not every historical catalog's full source map.
  const registerState=async state=>{
    for(const r of Object.values(state.receipts)) {
      need(r.verified===true&&r.key===`attachments/v1/objects/${local.attachment.identity.keyId}/${r.sha256}.gcm`,'BLOB_RECEIPT_INVALID');
      // An authenticated old catalog may include an orphan already deleted by a completed journal.
      if(!lookup.has(id(r))) continue;
      register(metadataRecord(r),'blob',{blob:id(r),receipt:r});
    }
    for(const s of state.snapshots) {
      if(!lookup.has(id(s.remote)))continue;
      if(!snapshots.has(s.id)) {
        const manifest=await decrypted(s.remote);need(manifest.id===s.id&&manifest.complete===true&&manifest.scope==='attachment_inventory_only'&&Array.isArray(manifest.entries),'SNAPSHOT_MANIFEST_INVALID');
        for(const entry of manifest.entries) {
          const r=state.receipts[entry.blob];need(r&&entry.versionId===r.versionId&&entry.sha256===r.sha256&&entry.bytes===r.bytes,'SNAPSHOT_CONTENT_REFERENCE_MISMATCH');
        }
        const blobKeys=snapshotBlobs(state,s),blobs=[...new Set(manifest.entries.map(e=>id({key:e.blob,versionId:e.versionId})))];
        need(JSON.stringify([...new Set(manifest.entries.map(e=>e.blob))].sort())===JSON.stringify([...blobKeys].sort()),'SNAPSHOT_REFERENCE_MISMATCH');
        snapshots.set(s.id,{...s,blobs,blobKeys});register(metadataRecord(s.remote),'snapshot',{snapshotId:s.id});
      } else need(id(snapshots.get(s.id).remote)===id(s.remote),'CONFLICTING_SNAPSHOT_ID');
    }
  };
  await registerState(local.attachment);
  for(const v of versions.filter(v=>v.kind==='object'&&v.key==='attachments/v1/catalog-latest.json')) {
    const body=await read(v),pointer=unseal(JSON.parse(body),secret);
    need(/^attachments\/v1\/catalogs\/[a-f0-9-]{36}\.gcm$/.test(pointer.key)&&pointer.keyId===local.attachment.identity.keyId,'CATALOG_POINTER_INVALID');
    register({...v,sha256:hash(body)},'pointer',{catalog:id(pointer),publishedAt:pointer.at});
    if(!catalogs.has(id(pointer))){
      const state=unseal(await decrypted(pointer),secret);
      need(JSON.stringify(state.identity)===JSON.stringify(local.attachment.identity)&&state.schema===1,'HISTORICAL_REPOSITORY_IDENTITY_CHANGED');
      const blobs=Object.values(state.receipts).map(r=>id(r));
      catalogs.set(id(pointer),{blobs,snapshotIds:state.snapshots.map(s=>s.id)});register(metadataRecord(pointer),'catalog');
      await registerState(state);
    }
  }
  // Sidecars are authenticated, version-specific owners of deduplicated payloads.
  for(const v of versions.filter(v=>v.kind==='object'&&v.key.endsWith('.gcm.receipt.json'))) {
    const body=await read(v),r=unseal(JSON.parse(body),secret);
    need(v.key===r.key+'.receipt.json'&&r.keyId===local.attachment.identity.keyId&&r.verified===true,'BLOB_SIDECAR_INVALID');
    if(lookup.has(id(r))) {
      register(metadataRecord(r),'blob',{blob:id(r),receipt:r});
      register({...v,sha256:hash(body)},'blob_receipt',{blob:id(r)});
    }
  }
  for(const p of local.host.points) for(const r of [...p.objects,p.metadata]) {
    if(p.status==='RETIRED'&&!lookup.has(id(r)))continue;
    register(r,'host',{pointId:p.id});
  }
  const unknownMetadata=versions.filter(r=>!records.has(id(r)) && (r.kind==='marker' || /(?:catalog|snapshots\/|receipt\.json)/.test(r.key))).map(id);
  need(local.attachment.identity.keyFingerprint===keyFingerprint(secret),'ATTACHMENT_KEY_CHANGED');
  return {...local,records,snapshots,catalogs,unknownMetadata,inventory:versions,inventoryHash:fingerprint(versions),scanBytes:readBytes};
}
