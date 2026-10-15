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


// These fixtures exercise cryptographic compatibility and refusal, independently
// of COS transport. The large-data memory profile is measured on the server.
import { encryptDatabaseFile, decryptDatabaseFile, verifyDatabase, validateRestoreTarget } from './backup-crypto.mjs';
import { encryptPackage, decryptPackage } from '../backup/backup-db.mjs';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const databaseSecret='synthetic-database-crypto-key-0123456789012345';
function withDatabasePackage(operation){
 const directory=mkdtempSync(join(tmpdir(),'database-stream-contract-'));mkdirSync(join(directory,'encryption'));
 try {
  const dump=Buffer.from('PGDMP synthetic binary fixture\0\xff');writeFileSync(join(directory,'database.dump'),dump);
  writeFileSync(join(directory,'manifest.json'),JSON.stringify({format:'eduk12-db-backup',version:1,components:[{name:'database.dump',bytes:dump.length,sha256:hash(dump)}]}));
  const packed=join(directory,'package.tar'),run=spawnSync('tar',['-cf',packed,'-C',directory,'manifest.json','database.dump']);assert.equal(run.status,0);
  return operation(directory,packed,dump);
 }finally{rmSync(directory,{recursive:true,force:true});}
}
test('v1 database streaming compatibility works in both directions',()=>withDatabasePackage((d,packed,dump)=>{
 const file=join(d,'stream.enc');encryptDatabaseFile(packed,file,databaseSecret,join(d,'encryption'));
 assert.deepEqual(decryptPackage(JSON.parse(readFileSync(file,'utf8')),databaseSecret),readFileSync(packed));
 const legacy=join(d,'legacy.enc');writeFileSync(legacy,JSON.stringify(encryptPackage(readFileSync(packed),databaseSecret))+'\n');writeFileSync(legacy+'.sha256',hash(readFileSync(legacy)));
 mkdirSync(join(d,'verify'));assert.deepEqual(readFileSync(verifyDatabase(legacy,databaseSecret,join(d,'verify'))),dump);
}));
test('rehashed corrupt GCM data, wrong keys and missing sidecars fail before consuming plaintext',()=>withDatabasePackage((d,packed)=>{
 const file=join(d,'stream.enc');encryptDatabaseFile(packed,file,databaseSecret,join(d,'encryption'));
 assert.throws(()=>decryptDatabaseFile(file,join(d,'wrong.tar'),databaseSecret+'wrong'));
 const value=JSON.parse(readFileSync(file,'utf8'));value.ciphertext=(value.ciphertext[0]==='A'?'B':'A')+value.ciphertext.slice(1);writeFileSync(file,JSON.stringify(value));writeFileSync(file+'.sha256',hash(readFileSync(file)));
 assert.throws(()=>decryptDatabaseFile(file,join(d,'tampered.tar'),databaseSecret));
 assert.throws(()=>readFileSync(join(d,'tampered.tar')));
 rmSync(file+'.sha256');assert.throws(()=>decryptDatabaseFile(file,join(d,'missing.tar'),databaseSecret));
}));
test('streaming database helper refuses production restore and archive traversal',()=>withDatabasePackage((d,packed)=>{
 assert.throws(()=>validateRestoreTarget({confirmation:'RESTORE',target:'eduk12-prod-postgres'}),/ISOLATED_RESTORE_REQUIRED/);
 writeFileSync(join(d,'unexpected.txt'),'must not extract');const bad=join(d,'bad.tar');assert.equal(spawnSync('tar',['-cf',bad,'-C',d,'manifest.json','database.dump','unexpected.txt']).status,0);
 const file=join(d,'bad.enc');encryptDatabaseFile(bad,file,databaseSecret,join(d,'encryption'));mkdirSync(join(d,'verify'));
 assert.throws(()=>verifyDatabase(file,databaseSecret,join(d,'verify')),/ARCHIVE_ENTRIES/);
}));
