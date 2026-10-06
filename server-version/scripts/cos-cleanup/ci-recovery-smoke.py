#!/usr/bin/env python3
"""Actual encrypted DB restore and production attachment-reference verifier, synthetic CI data only."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import uuid
import recovery

def main():
 if os.geteuid()!=0 or any(os.environ.get(k)!=v for k,v in {'CI':'true','GITHUB_ACTIONS':'true','NODE_ENV':'test'}.items()):raise RuntimeError('ISOLATED_HOSTED_CI_ONLY')
 source=Path(__file__).resolve().parent
 spec=importlib.util.spec_from_file_location('backup',source.parent/'host-ops/backup.py');backup=importlib.util.module_from_spec(spec);spec.loader.exec_module(backup)
 ident=uuid.uuid4().hex;name='eduk12-ci-host-backup-'+ident;label='eduk12.ci.fixture'
 def docker(*args,check=True):
  result=subprocess.run(['docker',*args],capture_output=True,timeout=120)
  if check and result.returncode:raise RuntimeError('CI_SYNTHETIC_DOCKER_FAILED: '+result.stderr.decode(errors='replace')[-2000:])
  return result
 containers=set(docker('ps','-aq').stdout.split());volumes=set(docker('volume','ls','-q').stdout.split())
 with tempfile.TemporaryDirectory(prefix='eduk12-joint-recovery-ci-') as temp:
  work=Path(temp);backup.STATE=work;backup.NODE=shutil.which('node');secret='synthetic-joint-recovery-key-0123456789'
  envfile=work/'fixture.env';envfile.write_text('POSTGRES_USER=fixture\nPOSTGRES_DB=fixture\nPOSTGRES_PASSWORD=synthetic-ci\n');envfile.chmod(0o600)
  try:
   docker('run','-d','--name',name,'--label',label+'='+ident,'--network','none','--memory','384m','--cpus','0.5','--env-file',str(envfile),'postgres:16.15-bookworm')
   # Wait for the final TCP server; the image init server is Unix-socket-only.
   for _ in range(90):
    if docker('exec',name,'pg_isready','-h','127.0.0.1','-U','fixture','-d','fixture',check=False).returncode==0:break
    time.sleep(1)
   else:raise RuntimeError('CI_DATABASE_NOT_READY')
   import hashlib
   digest=hashlib.sha256(b'synthetic attachment').hexdigest()
   sql='''CREATE TABLE "_prisma_migrations" (id text, finished_at timestamp, rolled_back_at timestamp); INSERT INTO "_prisma_migrations" VALUES ('synthetic',now(),NULL);
CREATE TABLE users(id text); INSERT INTO users VALUES ('fixture');
CREATE TABLE stored_assets(id text,provider text,object_key text,sha256 text,size_bytes integer,deleted_at timestamp);
INSERT INTO stored_assets VALUES ('asset-1','cos','assets/fixture.pdf','''+"'"+digest+"'"+''',20,NULL);
CREATE TABLE asset_references(asset_id text);INSERT INTO asset_references VALUES ('asset-1');
CREATE TABLE documents(asset_id text,file_path text,cos_key text);INSERT INTO documents VALUES ('asset-1','/uploads/legacy.pdf','assets/fixture.pdf');
CREATE TABLE snapshots(payload jsonb);INSERT INTO snapshots VALUES ('{"nested":{"url":"https://fixture.cos.test/assets/fixture.pdf"}}');
CREATE TABLE _legacy_import_batches(mode text,summary jsonb);INSERT INTO _legacy_import_batches VALUES ('dry_run','{"preview":{"processedUrl":"/videos/old-missing.mp4","asset_id":"old-missing"}}');'''
   docker('exec',name,'psql','-v','ON_ERROR_STOP=1','-U','fixture','-d','fixture','-c',sql)
   scripts=source.parent/'backup';env={**os.environ,'BACKUP_ENCRYPTION_KEY':secret,'POSTGRES_CONTAINER':name,'DB_USER':'fixture','DB_NAME':'fixture','ENCRYPTED_DIR':str(work)}
   subprocess.run([backup.NODE,str(scripts/'backup-db.mjs'),'full'],env=env,capture_output=True,check=True,timeout=120)
   encrypted=list(work.glob('*.edubackup.enc'));assert len(encrypted)==1
   evidence=recovery.isolated_export(backup,encrypted[0],scripts,secret,work,uuid.uuid4().hex);assert evidence['status']=='PASS' and evidence['referenceTables']==7
   (work/'restore-evidence.json').write_text(json.dumps(evidence))
   result=subprocess.run([backup.NODE,str(source/'recovery-smoke.mjs'),str(work)],env=os.environ,capture_output=True,timeout=120)
   if result.returncode:raise RuntimeError('CI_JOINT_REFERENCE_VERIFIER_FAILED: '+result.stderr.decode()[-3000:])
   print(result.stdout.decode().strip())
   Path(str(encrypted[0])+'.sha256').write_text('0'*64+'  corrupted\n')
   with tempfile.TemporaryDirectory(dir=work) as bad:
    try:recovery.isolated_export(backup,encrypted[0],scripts,secret,Path(bad),uuid.uuid4().hex);raise AssertionError('corrupt DB accepted')
    except RuntimeError as error:assert str(error)=='BACKUP_COMMAND_FAILED'
  finally:
   found=docker('inspect',name,check=False)
   if found.returncode==0:
    item=json.loads(found.stdout)[0];assert item['Config']['Labels'][label]==ident;docker('rm','-f','-v',name)
 assert set(docker('ps','-aq').stdout.split())==containers;assert set(docker('volume','ls','-q').stdout.split())==volumes
 print(json.dumps({'actualJointRecovery':'PASS','failedRestoreAnonymousVolumeCleanup':'PASS','foreignContainersAndVolumesPreserved':True}))
if __name__=='__main__':main()
