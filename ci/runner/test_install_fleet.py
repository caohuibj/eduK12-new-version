import importlib.util, io, json, os, pathlib, tarfile, tempfile, unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('installer',pathlib.Path(__file__).with_name('install-fleet.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class InstallerTests(unittest.TestCase):
 def test_private_root_symlink_foreign_mode_and_controls(self):
  with tempfile.TemporaryDirectory()as raw:
   root=pathlib.Path(raw).resolve();self.assertEqual(module.checked_directory(root),root)
   (root/'link').symlink_to(root,target_is_directory=True)
   for bad in [root/'link'/'nested',root/'line\nbreak']:
    with self.assertRaises(ValueError):module.checked_directory(bad)
   (root/'public').mkdir(mode=0o755);(root/'public').chmod(0o755)
   with self.assertRaises(ValueError):module.checked_directory(root/'public')
 def test_archive_escape_is_rejected_and_internal_links_allowed(self):
  with tempfile.TemporaryDirectory()as raw:
   root=pathlib.Path(raw).resolve();archive=root/'bad.tar.gz'
   with tarfile.open(archive,'w:gz')as tar:
    item=tarfile.TarInfo('../escape');item.size=1;tar.addfile(item,io.BytesIO(b'x'))
   with self.assertRaises(tarfile.FilterError):module.safe_extract(archive,root/'out')
   self.assertFalse((root.parent/'escape').exists())
   with tarfile.open(archive,'w:gz')as tar:
    item=tarfile.TarInfo('lib/file');item.size=1;tar.addfile(item,io.BytesIO(b'x'))
    link=tarfile.TarInfo('lib/link');link.type=tarfile.SYMTYPE;link.linkname='file';tar.addfile(link)
   module.safe_extract(archive,root/'good');self.assertEqual((root/'good/lib/link').read_text(),'x')
 def test_registration_partial_progress_is_persisted_and_credentials_not_written(self):
  with tempfile.TemporaryDirectory()as raw:
   root=pathlib.Path(raw).resolve();lanes=[]
   for name in ['win-light','win-heavy']:
    path=root/name;path.mkdir(mode=0o700)
    lanes.append({'root':str(path),'name':'eduk12-'+name,'labels':['eduk12-'+name],'registered':False})
   (root/'inventory.json').write_text(json.dumps({'host':'win','lanes':lanes}))
   calls=[]
   def run(command,**kwargs):
    calls.append(command)
    if command[0]=='gh':return type('Result',(),{'returncode':0,'stdout':'synthetic-registration-token','stderr':''})()
    self.assertEqual(kwargs['env']['ACTIONS_RUNNER_INPUT_TOKEN'],'synthetic-registration-token');self.assertNotIn('--token',command)
    if len(calls)==3:raise RuntimeError('second lane failure')
    (pathlib.Path(kwargs['cwd'])/'.runner').write_text(json.dumps({'agentName':command[command.index('--name')+1]}))
   with patch.object(module.os,'getuid',return_value=root.stat().st_uid),patch.object(module.subprocess,'run',side_effect=run):
    # CI installation intentionally rejects root. Test the non-root branch with
    # the temporary directory's real owner, without changing production logic.
    if os.getuid()==0:self.skipTest('requires a non-root CI account')
    with self.assertRaises(RuntimeError):module.register(root)
   record=json.loads((root/'inventory.json').read_text());self.assertTrue(record['lanes'][0]['registered']);self.assertFalse(record['lanes'][1]['registered'])
   self.assertNotIn('synthetic-registration-token',(root/'inventory.json').read_text())
if __name__=='__main__':unittest.main()

class ExistingRunnerTests(unittest.TestCase):
 def test_reuse_reads_only_public_identity_and_requires_exact_repository(self):
  with tempfile.TemporaryDirectory()as raw:
   root=pathlib.Path(raw).resolve();config=root/'.runner'
   identity={'agentName':'existing-runner','agentId':123,'gitHubUrl':'https://github.com/'+module.REPO}
   config.write_text(json.dumps(identity));self.assertEqual(module.existing_identity(root)[1],identity)
   config.write_text(json.dumps({**identity,'gitHubUrl':'https://github.com/another/repo'}))
   with self.assertRaises(ValueError):module.existing_identity(root)
   config.unlink();(root/'identity.json').write_text(json.dumps(identity));config.symlink_to(root/'identity.json')
   with self.assertRaises(ValueError):module.existing_identity(root)
