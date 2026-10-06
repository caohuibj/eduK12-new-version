import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {referenceIndex,addAsset,addReferenceRow,cachedBinding,download,readRows} from './recovery.mjs';
import {hash,id} from './model.mjs';
const sha='a'.repeat(64),blob='attachments/v1/objects/key1/'+sha+'.gcm';
const entry=(provider,key)=>({source:{provider,key},sha256:sha,bytes:12,blob,versionId:'blob-v'});
const hosts={cos:['media.test'],site:['huisurvey.cn']};
const index=()=>referenceIndex({scope:'attachment_inventory_only',complete:true,entries:[entry('cos','assets/test.pdf'),entry('cos','videos/originals/test.mp4'),entry('local','pictures/a.png')]});
const asset={id:'asset-1',provider:'cos',object_key:'assets/test.pdf',sha256:sha,size_bytes:12};
test('real restored row shapes cover assets, migrated documents, legacy COS/local and nested JSON',()=>{
 const ix=index();addAsset(ix,asset);addReferenceRow(ix,'documents',{asset_id:'asset-1',file_path:'/uploads/old',cos_key:'assets/test.pdf'},hosts);
 addReferenceRow(ix,'videos',{original_cos_key:'videos/originals/test.mp4'},hosts);
 addReferenceRow(ix,'snapshots',{payload:[{coverAssetId:'asset-1',img:'https://media.test/assets/test.pdf?signature=redacted'},'/uploads/pictures/a.png','/videos/originals/test.mp4']},hosts);
 assert.equal(ix.references,8);assert.equal(ix.needed.size,1);
});
test('missing referenced assets, changed content, traversal and missing inventory all block',()=>{
 assert.throws(()=>addAsset(index(),{...asset,sha256:'b'.repeat(64)}),/CONTENT_CHANGED/);
 assert.throws(()=>addAsset(index(),{...asset,size_bytes:13}),/CONTENT_CHANGED/);
 assert.throws(()=>addReferenceRow(index(),'asset_references',{asset_id:'missing'},hosts),/ASSET_REFERENCE_MISSING/);
 for(const url of ['/uploads/missing','/videos/originals/missing','https://media.test/assets/%2e%2e/test.pdf'])assert.throws(()=>addReferenceRow(index(),'any',{url},hosts),/REFERENCE_(MISSING|PATH_INVALID)/);
 assert.throws(()=>referenceIndex({scope:'attachment_inventory_only',complete:false,entries:[]}),/MANIFEST_INVALID/);
});
test('external resources are counted, soft deleted data is excluded and ordinary site links are allowed',()=>{
 const ix=index();addAsset(ix,{...asset,id:'deleted',deleted_at:'2026-01-01'});
 addReferenceRow(ix,'any',{asset_id:'deleted',link:'https://huisurvey.cn/',external:'https://outside.test/uploads/a'},hosts);
 addReferenceRow(ix,'documents',{is_deleted:true,file_path:'/uploads/missing'},hosts);
 assert.equal(ix.externalUrls,1);assert.equal(ix.needed.size,0);
});
test('migration batch summaries preserve historical diagnostics without treating them as live attachments',()=>{
 const ix=index(),historical={preview:[{processedUrl:'/videos/old-missing.mp4',asset_id:'old-missing'}],notes:['https://media.test/old-missing.pdf']};
 addReferenceRow(ix,'_legacy_import_batches',{mode:'dry_run',summary:historical},hosts);
 assert.equal(ix.rows,1);assert.equal(ix.references,0);assert.equal(ix.needed.size,0);
 // Exact table and field scope: business JSON, future tables/fields and explicit
 // attachment references outside that audit summary remain protected.
 for(const table of ['videos','snapshots','_legacy_import_batches_archive'])assert.throws(()=>addReferenceRow(index(),table,{summary:historical},hosts),/REFERENCE_MISSING/);
 assert.throws(()=>addReferenceRow(index(),'_legacy_import_batches',{summary:historical,asset_id:'missing'},hosts),/ASSET_REFERENCE_MISSING/);
 assert.throws(()=>addReferenceRow(index(),'_legacy_import_batches',{summary:historical,detail:'/videos/missing.mp4'},hosts),/REFERENCE_MISSING/);
 addReferenceRow(ix,'_legacy_import_batches',{summary:historical,cos_key:'assets/test.pdf'},hosts);
 assert.equal(ix.references,1);
});
test('immutable acceptance cache rejects missing restore evidence, changed identity, DB/manifest/blob receipts',()=>{
 const receipt={sha256:sha,bytes:12},r={key:blob,versionId:'blob-v',receipt},p={id:'point',objects:[{versionId:'db-v',sha256:sha}]},s={id:'snap',remote:{versionId:'snap-v',encryptedSha256:sha}},identity={keyId:'key1'};
 const b={hostPointId:p.id,databaseVersionId:'db-v',databaseSha256:sha,attachmentSnapshotId:'snap',snapshotVersionId:'snap-v',snapshotSha256:sha,databaseRestoredAt:'2026-01-01T00:00:00Z',databaseRestore:{status:'PASS',network:'none',failedMigrations:0,appliedMigrations:1},verifiedBlobIds:[id(r)],verifiedBlobHashes:{[id(r)]:hash(receipt)}};
 const proof={referenceVerifierSha256:sha,schema:1,status:'VERIFIED',identity,checks:{databaseRestore:true,attachmentDecrypt:true,databaseReferences:true},bindings:[b]};
 assert.ok(cachedBinding(proof,p,[s],[r],identity,sha));
 for(const mutate of [x=>x.checks.attachmentDecrypt=false,x=>x.identity.keyId='changed',x=>x.bindings[0].databaseRestore.network='bridge',x=>x.bindings[0].databaseVersionId='changed',x=>x.bindings[0].snapshotSha256='bad',x=>delete x.bindings[0].verifiedBlobHashes]){const changed=structuredClone(proof);mutate(changed);assert.equal(cachedBinding(changed,p,[s],[r],identity,sha),null);}
 assert.equal(cachedBinding(proof,p,[s],[{...r,receipt:{...receipt,bytes:99}}],identity,sha),null);
 assert.equal(cachedBinding(proof,p,[s],[],identity,sha),null);
});
test('bounded version download verifies ciphertext hash and removes failed private staging',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'recovery-test-'));try{
 const data=Buffer.from('synthetic-ciphertext'),r={key:blob,versionId:'blob-v',bytes:data.length,sha256:hash(data)},f=path.join(dir,'cipher');let checked=false;
 const api={check:async()=>{checked=true;},stream:()=>Readable.from([data])};await download(api,r,f,100);assert.ok(checked);assert.deepEqual(await fs.readFile(f),data);await fs.rm(f);
 await assert.rejects(download(api,{...r,sha256:sha},f,100),/HASH_MISMATCH/);await assert.rejects(fs.stat(f),/ENOENT/);
 await assert.rejects(download(api,r,f,1),/DOWNLOAD_LIMIT/);await assert.rejects(download({...api,stream:()=>Readable.from([Buffer.alloc(100)])},r,f,100),/DOWNLOAD_LIMIT/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('private JSON row stream refuses oversized exports and symlinks',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'recovery-rows-'));try{const f=path.join(dir,'rows');await fs.writeFile(f,'{"data":{"asset_id":"x"}}\n');let rows=0;await readRows(f,()=>rows++);assert.equal(rows,1);await assert.rejects(readRows(f,()=>{},1),/ROWS_LIMIT/);await fs.symlink(f,path.join(dir,'link'));await assert.rejects(readRows(path.join(dir,'link'),()=>{}),/ROWS_LIMIT/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
