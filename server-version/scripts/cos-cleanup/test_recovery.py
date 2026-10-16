import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('recovery',Path(__file__).with_name('recovery.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Exports(unittest.TestCase):
 def test_bounded_private_export(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'rows';self.assertEqual(r.export_rows([sys.executable,'-c',"print('synthetic')"],p,100),10);self.assertEqual(p.stat().st_mode&0o777,0o600)
 def test_excess_timeout_and_failed_query_block(self):
  for script,limit,timeout,code in [("print('x'*100)",10,10,'LIMIT'),('import time;time.sleep(10)',100,.05,'TIMEOUT'),('raise SystemExit(1)',100,10,'FAILED')]:
   with tempfile.TemporaryDirectory() as d:
    with self.assertRaisesRegex(RuntimeError,code):r.export_rows([sys.executable,'-c',script],Path(d)/'rows',limit,timeout)
 def test_symlink_refused(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'rows';p.symlink_to(Path(d)/'missing')
   with self.assertRaisesRegex(RuntimeError,'PATH_REFUSED'):r.export_rows(['invalid-command'],p)

from unittest.mock import patch
import datetime
import hashlib
import json
class Activation(unittest.TestCase):
 def test_expired_changed_config_changed_identity_or_source_cannot_enable(self):
  now=datetime.datetime.now(datetime.timezone.utc)
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);config=root/'config.json';config.write_text('{"mode":"plan_only"}')
   files=[root/'writer1',root/'writer2'];[p.write_text('COS_CLEANUP_TRANSACTION_PENDING') for p in files]
   class Backup:
    def sha(self,p):return hashlib.sha256(p.read_bytes()).hexdigest()
    def canonical(self,v):return json.dumps(v,separators=(',',':')).encode()
   b=Backup();c={'mode':'plan_only'};creds={'COS_SECRET_ID':'application'};delete={'COS_SECRET_ID':'dedicated','COS_SECRET_KEY':'synthetic'}
   req={'schema':1,'purpose':'enable_protected_cos_cleanup','deleteProbeVerified':True,'id':'a'*32,'at':(now-datetime.timedelta(minutes=1)).isoformat(),'expiresAt':(now+datetime.timedelta(hours=1)).isoformat(),'configSha256':b.sha(config),'deleteIdentityFingerprint':hashlib.sha256(b.canonical(delete)).hexdigest(),'sourceSha256':{str(p):b.sha(p) for p in files}}
   with patch.object(r,'CONFIG',config),patch.object(r,'PINNED_FILES',files):
    r.authorize_activation(b,req,c,creds,delete,now)
    for mutate,code in [(lambda x:x.update(expiresAt=now.isoformat()),'EXPIRED'),(lambda x:x.update(configSha256='changed'),'CONFIGURATION_CHANGED'),(lambda x:x.update(deleteIdentityFingerprint='changed'),'IDENTITY_CHANGED'),(lambda x:x['sourceSha256'].update({str(files[0]):'changed'}),'SOURCE_CHANGED'),(lambda x:x.update(deleteProbeVerified=False),'AUTHORIZATION_REQUIRED')]:
     changed=json.loads(json.dumps(req));mutate(changed)
     with self.assertRaisesRegex(RuntimeError,code):r.authorize_activation(b,changed,c,creds,delete,now)
    with self.assertRaisesRegex(RuntimeError,'DEDICATED'):r.authorize_activation(b,req,c,creds,{**delete,'COS_SECRET_ID':'application'},now)
    self.assertEqual(config.read_text(),'{"mode":"plan_only"}')
 def test_missing_authorization_and_existing_execute_mode_do_not_write(self):
  with tempfile.TemporaryDirectory() as d,patch.object(r,'ACTIVATION',Path(d)/'missing'):
   self.assertFalse(r.activate_if_requested(None,{'mode':'plan_only'},None,None,None,None))
 def test_failed_readiness_does_not_switch_mode(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'request';p.write_text('{}')
   class Backup:
    def private_read(self,p):return '{}'
    def unseal(self,v,s):return {'runtimeImage':'synthetic'}
    def cleanup_pending(self,s):return False
    def atomic(self,*a):raise AssertionError('unexpected write')
   with patch.object(r,'ACTIVATION',p),patch.object(r,'authorize_activation'),patch.object(r,'helper',return_value={'ready':False}):
    self.assertFalse(r.activate_if_requested(Backup(),{'mode':'plan_only'},'synthetic',{},'synthetic',None))

class StreamedRecovery(unittest.TestCase):
 def test_database_transport_uses_validated_bound_without_changing_verifier(self):
  class Backup:
   LABEL='synthetic'
   def canonical(self,v):return json.dumps(v).encode()
   def run(self,args,data=None,timeout=None):
    self.args=args;self.payload=json.loads(data);return b'{"downloadHashVerified":true}'
   def cleanup_container(self,*a):pass
  with tempfile.TemporaryDirectory() as d,patch.object(r,'PROOF',Path(d)/'missing'):
   b=Backup();result=r.helper(b,'synthetic-image',Path(d),{},'synthetic-secret',{},'database',pointId='a'*32,maxDatabaseBytes=2*1024**3)
   self.assertTrue(result['downloadHashVerified']);self.assertIn(r.DATABASE_DOWNLOAD_JS,b.args);self.assertIn('--input-type=module',b.args)
   self.assertEqual(b.payload['maxDatabaseBytes'],2*1024**3)
   self.assertIn('await download(api,point.objects[0]',r.DATABASE_DOWNLOAD_JS)
   self.assertIn("'RECOVERY_POINT_NOT_RETAINED'",r.DATABASE_DOWNLOAD_JS)
   b=Backup();r.helper(b,'synthetic-image',Path(d),{},'synthetic-secret',{},'cached',pointId='a'*32)
   self.assertEqual(b.args[-1],'/ops/recovery.mjs');self.assertNotIn(r.DATABASE_DOWNLOAD_JS,b.args)
 def test_transport_program_parses_without_accessing_credentials_or_network(self):
  import subprocess
  result=subprocess.run(['node','--input-type=module','--check'],input=r.DATABASE_DOWNLOAD_JS,text=True,capture_output=True)
  self.assertEqual(result.returncode,0,result.stderr)
 def test_stream_restore_failure_removes_owned_container_and_private_env(self):
  class Backup:
   LABEL='synthetic'
   def run(self,*a,**k):return b'synthetic-container'
   def wait_for_database(self,*a):self.waited=a
   def database_command(self,*a,**k):self.operation=(a,k);raise RuntimeError('BACKUP_COMMAND_FAILED')
   def cleanup_container(self,*a):self.cleaned=a
  with tempfile.TemporaryDirectory() as d:
   work=Path(d);b=Backup()
   with self.assertRaisesRegex(RuntimeError,'BACKUP_COMMAND_FAILED'):
    r.isolated_export(b,work/'database.enc',work,'synthetic-secret',work,'a'*32)
   self.assertEqual(b.operation[0],('restore','synthetic-secret'));self.assertEqual(b.operation[1]['confirmation'],'RESTORE')
   self.assertEqual(b.operation[1]['target'],'eduk12-restore-'+('a'*12));self.assertEqual(b.cleaned,('eduk12-restore-'+('a'*12),'a'*32))
   self.assertFalse((work/'restore.env').exists())
