import { promises as fsp } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { atomicJson as baseAtomicJson, seal, unseal, encryptStream, verifyEncrypted } from '../attachment-backup/core.mjs';
import { config, need, hash, id, age, plan, detach, validRecord } from './model.mjs';
import { scan, fingerprint, METADATA_CIPHER_LIMIT } from './store.mjs';

async function atomicJson(file,value) {
  await baseAtomicJson(file,value);
  const directory=await fsp.open(path.dirname(file),'r');
  try {await directory.sync();}finally{await directory.close();}
}

export class Cleanup {
  constructor(c,api,secret,paths,{clock=()=>Date.now(),scanner=scan}={}) {
    this.c=config(c);this.api=api;this.secret=secret;this.paths=paths;this.clock=clock;this.scanner=scanner;
    this.planFile=path.join(paths.state,'plan.json');this.journalFile=path.join(paths.state,'journal.json');
  }
  async read(file,optional=false) {
    try {const s=await fsp.lstat(file);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=16*1024**2,'PRIVATE_CATALOG_FILE_REQUIRED');return unseal(JSON.parse(await fsp.readFile(file)),this.secret);}
    catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}
  }
  async local() {
    const host=await this.read(this.paths.host),attachment=await this.read(this.paths.attachment),proof=await this.read(this.paths.proof,true);
    const hostStatus=JSON.parse(await fsp.readFile(this.paths.hostStatus));
    let launcherFailure=false;try{await fsp.lstat(this.paths.launcherFailure);launcherFailure=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    const sourceHashes={};for(const f of [this.paths.host,this.paths.attachment,this.paths.proof]) {
      try{sourceHashes[f]=hash(await fsp.readFile(f));}catch(e){if(e.code!=='ENOENT')throw e;sourceHashes[f]=null;}
    }
    return {host,attachment,proof,hostStatus,launcherFailure,sourceHashes};
  }
  async saveJournal(j) {await atomicJson(this.journalFile,seal(j,this.secret));}
  async inspect() {
    await this.api.privateVersioned();
    return this.scanner(this.api,this.c,await this.local(),this.secret,this.paths.work);
  }
  async makePlan() {
    need(!(await this.pending()),'PENDING_TRANSACTION_REQUIRES_RESUME');
    const input=await this.inspect(),previous=await this.read(this.planFile,true),p=plan(this.c,input,previous,this.clock());
    await atomicJson(this.planFile,seal(p,this.secret));return {input,p};
  }
  async pending() {const j=await this.read(this.journalFile,true);return j&&j.status!=='COMPLETE'?j:null;}
  async run() {
    let j=await this.pending();
    if(j) {
      need(this.c.mode==='execute','PENDING_TRANSACTION_EXECUTION_PAUSED');
      return this.execute(j);
    }
    const {input,p}=await this.makePlan();
    if(this.c.mode!=='execute'||p.blocked.length||!p.actions.length)return this.summary(p,false);
    need(this.api.deleteClient,'DEDICATED_DELETE_IDENTITY_REQUIRED');
    for(const r of input.records.values()) if(p.protectedVersionIds.includes(id(r)))await this.api.check(r);
    need(fingerprint(await this.api.versions())===p.inventoryHash,'INVENTORY_CHANGED_BEFORE_COMMIT');
    const desired=detach(input,p);
    // Journal is durable before either source index is rewritten or a DELETE is issued.
    j={schema:1,status:'PREPARED',at:p.at,id:crypto.randomUUID(),configHash:hash(this.c),plan:p,
      desired,sourceHashes:p.sourceHashes,inventory:input.inventory,owned:[],checkpoints:[],deleted:[],deleteIntent:null,
      protectedRecords:[...input.records.values()].filter(r=>p.protectedVersionIds.includes(id(r))),proofHash:p.sourceHashes[this.paths.proof]};
    await this.saveJournal(j);return this.execute(j);
  }
  summary(p,executed,deleted=0) {return {mode:this.c.mode,executed,blocked:p.blocked,candidates:p.candidateCount,eligible:p.eligibleCount,selected:p.actions.length,selectedBytes:p.bytes,deletedVersions:deleted};}
  async sync(j) {
    const actual=await this.api.versions(),known=new Map([...j.inventory,...j.owned].map(r=>[id(r),r]));
    const deleted=new Set(j.deleted);
    for(const r of actual) {
      if(known.has(id(r))){need(known.get(id(r)).bytes===r.bytes&&!deleted.has(id(r)),'REMOTE_INVENTORY_CHANGED');continue;}
      const header=await this.api.call('headObject',{Key:r.key,VersionId:r.versionId});
      const cp=j.checkpoints.find(cp=>cp.key===r.key&&cp.sha256===header.headers?.['x-cos-meta-sha256']
        ||cp.pointerBody&&r.key==='attachments/v1/catalog-latest.json'&&r.bytes===Buffer.byteLength(cp.pointerBody)&&hash(cp.pointerBody)===header.headers?.['x-cos-meta-sha256']);
      need(cp&&r.kind==='object','UNEXPECTED_REMOTE_VERSION');
      const expected=cp.key===r.key?cp.sha256:hash(cp.pointerBody);
      const candidate={...r,sha256:expected};await this.api.check(candidate);
      j.owned.push(candidate);known.set(id(r),candidate);await this.saveJournal(j);
    }
    const ids=new Set(actual.map(id));
    for(const [key,r] of known)if(!deleted.has(key)&&!ids.has(key)) {
      need(j.deleteIntent&&key===id(j.deleteIntent),'REMOTE_VERSION_DISAPPEARED');
      j.deleted.push(key);deleted.add(key);j.deleteIntent=null;await this.saveJournal(j);
    }
    return actual;
  }
  async prepareCheckpoint(j) {
    const name=crypto.randomUUID(),file=path.join(this.paths.state,'checkpoint-'+name+'.gcm');
    const receipt=await encryptStream(Readable.from([Buffer.from(JSON.stringify(seal(j.desired.attachment,this.secret)))]),file,this.secret,j.desired.attachment.identity.keyId,16*1024**2);
    const staging=await fsp.open(file,'r');try{await staging.sync();}finally{await staging.close();}
    const cp={key:'attachments/v1/catalogs/'+name+'.gcm',file,crypto:receipt,sha256:receipt.encryptedSha256,bytes:receipt.encryptedBytes};
    j.checkpoints.push(cp);await this.saveJournal(j);return cp;
  }
  async ensureCheckpoint(j,cp) {
    await this.sync(j);
    let found=j.owned.filter(r=>r.key===cp.key);
    need(found.length<=1,'CHECKPOINT_DUPLICATE_VERSION_REVIEW_REQUIRED');
    if(!found.length) {
      const r=await this.api.put(cp.key,cp.file);j.owned.push(r);await this.saveJournal(j);found=[r];
    }
    await this.api.check(found[0]);
    const ciphertext=path.join(this.paths.work,crypto.randomUUID()+'.gcm');
    try {await fsp.writeFile(ciphertext,await this.api.buffer(found[0],METADATA_CIPHER_LIMIT),{mode:0o600,flag:'wx'});await verifyEncrypted(ciphertext,cp.crypto,this.secret,j.desired.attachment.identity.keyId);}
    finally {await fsp.rm(ciphertext,{force:true});}
    if(!cp.pointerBody) {
      cp.pointerBody=JSON.stringify(seal({...cp.crypto,key:cp.key,keyId:j.desired.attachment.identity.keyId,versionId:found[0].versionId,at:j.at},this.secret));await this.saveJournal(j);
    }
    const rows=await this.sync(j),latest=rows.find(r=>r.key==='attachments/v1/catalog-latest.json'&&r.latest);
    if(latest&&j.owned.some(r=>id(r)===id(latest)&&r.sha256===hash(cp.pointerBody)))cp.pointerVersion=latest.versionId;
    else {
      const pointer=await this.api.put('attachments/v1/catalog-latest.json',Buffer.from(cp.pointerBody));
      j.owned.push(pointer);cp.pointerVersion=pointer.versionId;await this.saveJournal(j);
    }
    cp.complete=true;await this.saveJournal(j);
  }
  async executionGuards(j) {
    need(j.schema===1&&j.configHash===hash(this.c)&&j.plan.actions.length<=this.c.maxDeleteObjects
      &&j.plan.actions.reduce((n,r)=>n+r.bytes,0)<=this.c.maxDeleteBytes,'JOURNAL_CONFIGURATION_CHANGED');
    for(const r of j.plan.actions)validRecord(r);
    const local=await this.local();need(local.sourceHashes[this.paths.proof]===j.proofHash,'RECOVERY_PROOF_CHANGED');
    const proof=local.proof;
    need(proof?.status==='VERIFIED'&&proof.bucket===this.c.backupBucket&&proof.region===this.c.region
      &&proof.checks?.databaseRestore===true&&proof.checks?.attachmentDecrypt===true&&proof.checks?.databaseReferences===true
      &&age(proof.at,this.clock())<=36*3600000,'JOINT_RECOVERY_PROOF_STALE');
    need(!local.launcherFailure&&!local.attachment.pending&&!local.attachment.lastFailure
      &&local.hostStatus.status==='VERIFIED'&&age(local.attachment.lastFullVerificationAt,this.clock())<=36*3600000
      &&age(local.attachment.snapshots.at(-1).at,this.clock())<=90*60000
      &&age(local.host.points.filter(p=>p.status==='VERIFIED').at(-1).at,this.clock())<=36*3600000,'BACKUP_HEALTH_CHANGED');
    for(const r of j.protectedRecords)await this.api.check(r);
    // Neither index may change outside the exact before/after transaction states.
    for(const [name,file] of [['host',this.paths.host],['attachment',this.paths.attachment]]) {
      const current=local.sourceHashes[file],desiredHash=hash(JSON.stringify(seal(j.desired[name],this.secret))+'\n');
      need(current===j.sourceHashes[file]||current===desiredHash,'LOCAL_CATALOG_CHANGED');
    }
  }
  async execute(j) {
    need(this.c.mode==='execute'&&this.api.deleteClient,'EXECUTION_NOT_ENABLED');
    await this.api.privateVersioned();await this.executionGuards(j);await this.sync(j);
    if(j.status==='PREPARED') {
      await atomicJson(this.paths.host,seal(j.desired.host,this.secret));
      await atomicJson(this.paths.attachment,seal(j.desired.attachment,this.secret));
      // Two independently read/decrypted checkpoints replace older recovery lookups.
      while(j.checkpoints.length<2)await this.prepareCheckpoint(j);
      for(const cp of j.checkpoints)if(!cp.complete)await this.ensureCheckpoint(j,cp);
      j.status='DETACHED';await this.saveJournal(j);
    }
    for(const r of j.plan.actions) {
      if(j.deleted.includes(id(r)))continue;
      await this.executionGuards(j);await this.sync(j);
      need(!j.plan.protectedVersionIds.includes(id(r)),'PROTECTED_VERSION_DELETE_REFUSED');
      const latest=(await this.api.versions()).find(r=>r.key==='attachments/v1/catalog-latest.json'&&r.latest);
      need(latest?.versionId===j.checkpoints.at(-1).pointerVersion,'CURRENT_POINTER_CHANGED');
      j.deleteIntent=r;await this.saveJournal(j);
      await this.api.deleteVersion(r);
      j.deleted.push(id(r));j.deleteIntent=null;await this.saveJournal(j);
    }
    await this.sync(j);await this.executionGuards(j);
    j.status='COMPLETE';j.completedAt=new Date(this.clock()).toISOString();await this.saveJournal(j);
    for(const cp of j.checkpoints) {
      need(path.dirname(cp.file)===this.paths.state&&/^checkpoint-[a-f0-9-]{36}\.gcm$/.test(path.basename(cp.file)),'CHECKPOINT_LOCAL_PATH_REFUSED');
      await fsp.rm(cp.file,{force:true});
    }
    await atomicJson(path.join(this.paths.state,'last-result.json'),seal({at:j.completedAt,id:j.id,deletedVersions:j.deleted.length,deletedBytes:j.plan.bytes,protectedVersions:j.protectedRecords.length},this.secret));
    return this.summary(j.plan,true,j.deleted.length);
  }
}
