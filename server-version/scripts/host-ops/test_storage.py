import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('storage',Path(__file__).with_name('storage.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
CONFIG=json.loads(Path(__file__).with_name('storage-config.example.json').read_text())
class StorageSafetyTests(unittest.TestCase):
    def test_current_cache_is_retained_and_only_reviewed_cache_files_are_candidates(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(m,'DEPLOY',Path(tmp)):
            for release in ['release-20261009-5f2c67a5','release-243']:
                p=Path(tmp,release,'trivy-cache/db');p.mkdir(parents=True);(p/'trivy.db').write_bytes(b'cache')
            plan=m.cache_plan(CONFIG,time.time()+72*3600)
            self.assertEqual([p['path'] for p in plan],[str(Path(tmp,'release-243/trivy-cache'))])
            Path(tmp,'release-243/trivy-cache/operator-recovery.json').write_text('keep')
            with self.assertRaisesRegex(RuntimeError,'CACHE_CONTENT_REFUSED'):m.cache_plan(CONFIG,time.time()+72*3600)
    def test_symlink_and_recent_cache_are_refused_or_retained(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(m,'DEPLOY',Path(tmp)):
            p=Path(tmp,'release-243/trivy-cache/db');p.mkdir(parents=True);(p/'trivy.db').write_bytes(b'cache')
            self.assertEqual(m.cache_plan(CONFIG),[])
            (p/'trivy.db').unlink();(p/'trivy.db').symlink_to('/etc/passwd')
            with self.assertRaisesRegex(RuntimeError,'CACHE_CONTENT_REFUSED'):m.cache_plan(CONFIG,time.time()+72*3600)
    def test_alias_and_container_referenced_images_are_protected(self):
        tag='eduk12-backend:50200b2d'
        def docker(args,**kwargs):
            if args[1:3]==['ps','-aq']:return 'container'
            if args[1]=='inspect':return 'sha256:inuse'
            if args[1:3]==['image','ls']:return tag+'|sha256:inuse\n'+tag+'|sha256:unaliased\n'
            return json.dumps([tag,'operator:keep'])
        with patch.object(m,'command',side_effect=docker),patch.object(m,'protected_refs',return_value=set()):
            self.assertEqual(m.image_plan(CONFIG),[])
        for edit in [{'protectedRevisions':[]},{'buildCacheLimit':'0gb'},{'oldImageRevisions':['5f2c67a5']}]:
            with self.assertRaises(RuntimeError):m.validate({**CONFIG,**edit})
    def test_apply_never_prunes_volumes_or_unreviewed_paths(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(m,'STATE',Path(tmp)),patch.object(m,'cache_plan',return_value=[]),patch.object(m,'image_plan',return_value=[]),patch.object(m,'command',return_value='') as run:
            result=m.execute(CONFIG)
            calls=[c.args[0] for c in run.call_args_list]
            self.assertTrue(any(x[1:3]==['buildx','prune'] and '--max-used-space=2gb' in x for x in calls))
            self.assertFalse(any('volume' in x or ('image' in x and 'rm' in x) for x in calls))
            self.assertFalse(result['imageDeletionAutomatic'])
