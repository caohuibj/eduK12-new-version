import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { encryptStream, verifyEncrypted } from '../attachment-backup/core.mjs';

// Keep the existing v1 envelope, PBKDF2 parameters, authenticated tar and dump
// checksums. Large payloads only move through bounded buffers and private files.
const BLOCK = 192 * 1024;
const FORMAT = 'eduk12-db-backup';
const hashFile = file => {
  const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(BLOCK);
  try { let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n)); }
  finally { fs.closeSync(fd); }
  return h.digest('hex');
};
function writeAll(fd,bytes) { let offset=0;while(offset<bytes.length)offset+=fs.writeSync(fd,bytes,offset,bytes.length-offset); }
function blocks(file,visit) {
  const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(BLOCK);
  try {let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))visit(buffer.subarray(0,n));}
  finally {fs.closeSync(fd);}
}
function command(program,args,options={}) {
  const result=spawnSync(program,args,{encoding:'utf8',maxBuffer:1024*1024,...options});
  if(result.error||result.status!==0)throw Error('DATABASE_BACKUP_COMMAND_FAILED');
  return result.stdout;
}
function metadata(envelope,secret) {
  if(envelope?.format!==FORMAT||envelope.version!==1||envelope.kdf?.name!=='pbkdf2'||envelope.kdf.digest!=='sha256'||envelope.kdf.iterations!==210000||envelope.cipher?.name!=='aes-256-gcm'||!/^[a-f0-9]{64}$/.test(envelope.plaintextSha256||''))throw Error('DATABASE_BACKUP_FORMAT_REFUSED');
  const salt=Buffer.from(envelope.kdf.salt,'base64'),iv=Buffer.from(envelope.cipher.iv,'base64'),tag=Buffer.from(envelope.cipher.authTag,'base64');
  if(salt.length!==16||iv.length!==12||tag.length!==16)throw Error('DATABASE_BACKUP_ENCRYPTION_LENGTH');
  return {key:crypto.pbkdf2Sync(secret,salt,210000,32,'sha256'),iv,tag};
}
export function encryptDatabaseFile(file,output,secret,temporary,maxBytes=2*1024**3) {
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=crypto.pbkdf2Sync(secret,salt,210000,32,'sha256');
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv),raw=path.join(temporary,'ciphertext.bin');
  const fd=fs.openSync(raw,'wx',0o600);
  try {blocks(file,b=>writeAll(fd,cipher.update(b)));writeAll(fd,cipher.final());}
  finally {fs.closeSync(fd);key.fill(0);}
  const envelope={format:FORMAT,version:1,encryptedAt:new Date().toISOString(),kdf:{name:'pbkdf2',digest:'sha256',iterations:210000,salt:salt.toString('base64')},cipher:{name:'aes-256-gcm',iv:iv.toString('base64'),authTag:cipher.getAuthTag().toString('base64')},plaintextSha256:hashFile(file)};
  const prefix=Buffer.from(JSON.stringify(envelope).slice(0,-1)+',"ciphertext":"');
  if(prefix.length+4*Math.ceil(fs.statSync(raw).size/3)+4>maxBytes)throw Error('DATABASE_BACKUP_LIMIT');
  const out=fs.openSync(output,'wx',0o600);let carry=Buffer.alloc(0);
  try {
    writeAll(out,prefix);
    blocks(raw,b=>{const bytes=carry.length?Buffer.concat([carry,b]):b,end=bytes.length-bytes.length%3;writeAll(out,Buffer.from(bytes.subarray(0,end).toString('base64')));carry=Buffer.from(bytes.subarray(end));});
    if(carry.length)writeAll(out,Buffer.from(carry.toString('base64')));
    writeAll(out,Buffer.from('"}\n'));fs.fsyncSync(out);
  } finally {fs.closeSync(out);fs.rmSync(raw,{force:true});}
  fs.writeFileSync(output+'.sha256',hashFile(output)+'  '+path.basename(output)+'\n',{mode:0o600,flag:'wx'});
  return envelope;
}
export function decryptDatabaseFile(file,output,secret) {
  const expected=fs.readFileSync(file+'.sha256','utf8').trim().split(/\s+/)[0];
  if(!/^[a-f0-9]{64}$/i.test(expected)||expected.toLowerCase()!==hashFile(file))throw Error('DATABASE_BACKUP_CHECKSUM');
  const source=fs.openSync(file,'r'),size=fs.fstatSync(source).size,head=Buffer.alloc(Math.min(size,64*1024));
  let target;
  try {
    fs.readSync(source,head,0,head.length,0);
    const match=/"ciphertext"\s*:\s*"/.exec(head.toString('latin1'));
    if(!match)throw Error('DATABASE_BACKUP_HEADER_LIMIT');
    const envelope=JSON.parse(head.subarray(0,match.index).toString('utf8')+'"ciphertext":""}');
    const params=metadata(envelope,secret),decipher=crypto.createDecipheriv('aes-256-gcm',params.key,params.iv);params.key.fill(0);decipher.setAuthTag(params.tag);
    const tail=Buffer.alloc(Math.min(size,256));fs.readSync(source,tail,0,tail.length,size-tail.length);
    const end=/"\s*}\s*$/.exec(tail.toString('latin1'));if(!end)throw Error('DATABASE_BACKUP_TRAILER');
    const start=match.index+match[0].length,finish=size-tail.length+end.index;
    if(finish<start||(finish-start)%4)throw Error('DATABASE_BACKUP_BASE64');
    target=fs.openSync(output,'wx',0o600);const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(BLOCK);
    const plain=b=>{writeAll(target,b);hash.update(b);};
    for(let position=start;position<finish;) {
      const length=Math.min(buffer.length,finish-position);let n=0;
      while(n<length){const read=fs.readSync(source,buffer,n,length-n,position+n);if(!read)throw Error('DATABASE_BACKUP_TRUNCATED');n+=read;}
      const encoded=buffer.subarray(0,n).toString('latin1');
      if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)||(position+n<finish&&encoded.includes('=')))throw Error('DATABASE_BACKUP_BASE64');
      plain(decipher.update(Buffer.from(encoded,'base64')));position+=n;
    }
    plain(decipher.final());if(hash.digest('hex')!==envelope.plaintextSha256)throw Error('DATABASE_BACKUP_PLAINTEXT_CHECKSUM');
    fs.fsyncSync(target);
  } catch(error) {if(target!==undefined){fs.closeSync(target);target=undefined;fs.rmSync(output,{force:true});}throw error;}
  finally {fs.closeSync(source);if(target!==undefined)fs.closeSync(target);}
}
function validateTar(file,directory) {
  const entries=command('tar',['-tf',file]).trim().split('\n');
  if(entries.length!==2||new Set(entries).size!==2||!entries.includes('manifest.json')||!entries.includes('database.dump'))throw Error('DATABASE_BACKUP_ARCHIVE_ENTRIES');
  fs.mkdirSync(directory,{mode:0o700});command('tar',['--no-same-owner','--no-same-permissions','-xf',file,'-C',directory]);
  for(const name of entries){const s=fs.lstatSync(path.join(directory,name));if(!s.isFile()||s.nlink!==1)throw Error('DATABASE_BACKUP_ARCHIVE_TYPE');}
  const manifestPath=path.join(directory,'manifest.json');if(fs.statSync(manifestPath).size>64*1024)throw Error('DATABASE_BACKUP_MANIFEST_LIMIT');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')),component=manifest.components?.[0],dump=path.join(directory,'database.dump');
  if(manifest.format!==FORMAT||manifest.version!==1||manifest.components?.length!==1||component.name!=='database.dump'||!Number.isSafeInteger(component.bytes)||component.bytes!==fs.statSync(dump).size||component.sha256!==hashFile(dump))throw Error('DATABASE_BACKUP_DUMP_CHECKSUM');
  return dump;
}
export function verifyDatabase(file,secret,temporary) {
  const plain=path.join(temporary,'verified.tar');decryptDatabaseFile(file,plain,secret);
  // Never extract or consume GCM plaintext until final authentication succeeds.
  return validateTar(plain,path.join(temporary,'extracted'));
}
function fullDatabase(input) {
  const directory=path.resolve(input.directory);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const temporary=fs.mkdtempSync(path.join(directory,'.db-stream-'));let output,complete=false;
  try {
    const dump=path.join(temporary,'database.dump'),fd=fs.openSync(dump,'wx',0o600);
    try {command('docker',['exec',input.postgresContainer,'pg_dump','--format=custom','--no-owner','--no-privileges','--username',input.user,'--dbname',input.database],{stdio:['ignore',fd,'pipe']});}
    finally {fs.closeSync(fd);}
    const manifest={format:FORMAT,version:1,createdAt:new Date().toISOString(),database:{name:input.database,user:input.user},components:[{name:'database.dump',bytes:fs.statSync(dump).size,sha256:hashFile(dump)}]};
    fs.writeFileSync(path.join(temporary,'manifest.json'),JSON.stringify(manifest)+'\n',{mode:0o600});
    const packed=path.join(temporary,'package.tar');command('tar',['-cf',packed,'-C',temporary,'manifest.json','database.dump']);
    if(input.progress)fs.writeFileSync(input.progress,JSON.stringify({stage:'database-encrypt',at:Date.now()/1000,dumpBytes:fs.statSync(dump).size,packageBytes:fs.statSync(packed).size,maxBackupBytes:input.maxBytes}),{mode:0o600});
    output=path.join(directory,'eduk12-db-'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')+'.edubackup.enc');
    encryptDatabaseFile(packed,output,input.secret,temporary,input.maxBytes);verifyDatabase(output,input.secret,temporary);
    complete=true;return {file:output,bytes:fs.statSync(output).size,sha256:hashFile(output),format:FORMAT,version:1,authenticatedDecryptionVerified:true};
  } finally {fs.rmSync(temporary,{recursive:true,force:true});if(!complete&&output){fs.rmSync(output,{force:true});fs.rmSync(output+'.sha256',{force:true});}}
}
export function validateRestoreTarget(input) {
  if(input.confirmation!=='RESTORE'||!/^(eduk12-restore|ptool-restore)-[a-z0-9-]+$/i.test(input.target||''))throw Error('ISOLATED_RESTORE_REQUIRED');
  const image=command('docker',['inspect','--format={{.Config.Image}}',input.target]).trim();
  if(!/^postgres(?:[:@]|$)/i.test(image))throw Error('ISOLATED_POSTGRES_REQUIRED');
}
function verifiedDatabase(input,restore=false) {
  if(restore)validateRestoreTarget(input);
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'eduk12-db-stream-'));
  try {
    const dump=verifyDatabase(path.resolve(input.file),input.secret,temporary);
    if(restore){const fd=fs.openSync(dump,'r');try{command('docker',['exec','-i',input.target,'pg_restore','--exit-on-error','--clean','--if-exists','--no-owner','--no-privileges','--username',input.user,'--dbname',input.database],{stdio:[fd,'ignore','pipe']});}finally{fs.closeSync(fd);}}
    return {authenticatedDecryptionVerified:true,isolatedRestore:restore,format:FORMAT,version:1};
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}
async function main() {
  process.umask(0o077);
  const input=JSON.parse(fs.readFileSync(0,'utf8'));
  if(typeof input.secret!=='string'||input.secret.length<32)throw Error('KEY_REQUIRED');
  const operation=process.argv[2];
  if(operation==='encrypt')return encryptStream(fs.createReadStream(input.file),input.output,input.secret,'host-backups-v1',32*1024**2);
  if(operation==='verify')return verifyEncrypted(input.file,input.receipt,input.secret,'host-backups-v1');
  if(operation==='database-full')return fullDatabase(input);
  if(operation==='database-verify')return verifiedDatabase(input);
  if(operation==='database-restore')return verifiedDatabase(input,true);
  throw Error('COMMAND_REQUIRED');
}
if(pathToFileURL(process.argv[1]||'').href===import.meta.url){
  try {console.log(JSON.stringify(await main()));}
  catch(error) {console.error('HOST_BACKUP_CRYPTO_FAILED '+(/^[A-Z][A-Z0-9_]+$/.test(error.message||'')?error.message:error.code||error.name));process.exitCode=1;}
}
