import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import transport from './backup-cos.cjs';
const config = { sourceBucket:'ptool-videos-edu-1393949445',backupBucket:'eduk12-backups-1393949445',region:'ap-beijing',maxBackupBytes:512*1024**2 };
const hash = b => createHash('sha256').update(b).digest('hex');

function store() {
  const objects=new Map(), calls=[];
  const client={
    getBucketVersioning:(a,done)=>done(null,{VersioningConfiguration:{Status:'Enabled'}}),
    getBucketAcl:(a,done)=>done(null,{Grants:[]}),
    getBucketLifecycle:(a,done)=>done(null,{Rules:[]}),
    headObject:(a,done)=>objects.has(a.Key)?done(null,{headers:{'content-length':objects.get(a.Key).length,'x-cos-meta-sha256':hash(objects.get(a.Key)),'x-cos-version-id':'fixed-version'}}):done({statusCode:404}),
    putObject:async(a,done)=>{const chunks=[];for await(const chunk of a.Body)chunks.push(chunk);objects.set(a.Key,Buffer.concat(chunks));done(null,{VersionId:'fixed-version'});},
    getObject:(a,done)=>{a.Output.end(objects.get(a.Key));done(null,{});},
    getBucket:(a,done)=>done(null,{Contents:[]}),
  };
  for(const name of Object.keys(client)){const fn=client[name];client[name]=(a,done)=>{calls.push({name,a});assert.equal(a.Bucket,config.backupBucket);return fn(a,done);};}
  return {client,calls,objects};
}

test('transport uses only backup namespace and exact version download/hash',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'host-backup-'));
  try{
    const data=Buffer.from('synthetic encrypted envelope');writeFileSync(join(directory,'database.edubackup.enc'),data);
    const s=store(),input={config,command:'put',runId:'a'.repeat(32),file:'database.edubackup.enc',sha256:hash(data)};
    const r=await transport.transfer(input,s.client,{workspace:directory,anonymousProbe:async()=>403});
    assert.equal(r.downloadVerified,true);assert.equal(r.versionId,'fixed-version');assert.deepEqual(readFileSync(join(directory,'database.edubackup.enc.remote')),data);
    assert.equal(s.calls.find(c=>c.name==='getObject').a.VersionId,'fixed-version');
    assert.ok(s.calls.every(c=>!c.name.toLowerCase().includes('delete')));
    await assert.rejects(transport.transfer(input,s.client,{workspace:directory,anonymousProbe:async()=>403}),/REFUSE_OVERWRITE/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('media destination, traversal, public access, lifecycle expiry and missing versioning fail closed',async()=>{
  for(const file of ['../secret','other.sql','server-config.tar.gz'])assert.throws(()=>transport.keyFor('a'.repeat(32),file));
  for(const id of ['../','a'.repeat(31)])assert.throws(()=>transport.keyFor(id,'receipt.json'));
  const input={config,command:'probe'},options={anonymousProbe:async()=>403};
  await assert.rejects(transport.transfer({...input,config:{...config,backupBucket:config.sourceBucket}},store().client,options),/BUCKET_BINDING/);
  await assert.rejects(transport.transfer(input,store().client,{anonymousProbe:async()=>200}),/PUBLIC_POLICY/);
  const publicStore=store();publicStore.client.getBucketAcl=(a,done)=>done(null,{Grants:[{Grantee:{URI:'AllUsers'}}]});
  await assert.rejects(transport.transfer(input,publicStore.client,options),/PRIVATE_BUCKET/);
  const expiring=store();expiring.client.getBucketLifecycle=(a,done)=>done(null,{Rules:[{Status:'Enabled',Filter:{Prefix:'host-backups/'},Expiration:{Days:1}}]});
  await assert.rejects(transport.transfer(input,expiring.client,options),/EXPIRATION/);
  const unversioned=store();unversioned.client.getBucketVersioning=(a,done)=>done(null,{VersioningConfiguration:{Status:'Suspended'}});
  await assert.rejects(transport.transfer(input,unversioned.client,options),/VERSIONING/);
});
