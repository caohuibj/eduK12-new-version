import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('cycle',Path(__file__).with_name('cycle.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class CycleTests(unittest.TestCase):
    def fixtures(self):
        now=dt.datetime.now(dt.timezone.utc);at=now.isoformat()
        receipt={'id':'point','at':at,'status':'VERIFIED','sourceRevision':'a'*40,'restore':{'status':'PASS'},'objects':[{'versionId':'db-version','downloadVerified':True,'authenticatedDecryptionVerified':True},{'versionId':'cfg-version','downloadVerified':True,'authenticatedDecryptionVerified':True}]}
        catalog={'snapshots':[{'id':'snapshot','at':at,'complete':True,'remote':{'versionId':'snapshot-version'}}],'lastFullVerificationAt':at,'verifyCursor':{'complete':True}}
        proof={'status':'VERIFIED','at':at,'referenceVerifierSha256':'verifier','checks':dict.fromkeys(['databaseRestore','attachmentDecrypt','databaseReferences'],True),'bindings':[{'hostPointId':'point','databaseVersionId':'db-version','attachmentSnapshotId':'snapshot','snapshotVersionId':'snapshot-version'}]}
        return now,receipt,catalog,proof
    def test_only_same_day_authenticated_matching_evidence_is_reused(self):
        now,r,c,p=self.fixtures()
        self.assertTrue(m.database_ready(r,now,'a'*40));self.assertTrue(m.snapshot_ready(c,r,now));self.assertTrue(m.verification_ready(c,now));self.assertTrue(m.recovery_ready(p,r,c,'verifier',now))
        self.assertFalse(m.database_ready({**r,'at':(now-dt.timedelta(days=1)).isoformat()},now,'a'*40))
        self.assertFalse(m.database_ready(r,now,'b'*40))
        self.assertFalse(m.verification_ready({**c,'verifyCursor':{'complete':False}},now))
        self.assertFalse(m.recovery_ready(p,r,c,'changed-verifier',now))
        q=copy.deepcopy(p);q['bindings'][0]['databaseVersionId']='changed-version';self.assertFalse(m.recovery_ready(q,r,c,'verifier',now))
    def test_skip_or_failed_stage_never_updates_last_success(self):
        now,r,c,p=self.fixtures()
        class Backup:
            def unseal(self,v,s):return v
            def cleanup_pending(self,s):return False
            def atomic(self,path,value):path.write_text(json.dumps(value))
        with tempfile.TemporaryDirectory() as t,patch.object(m,'STATE',Path(t)),patch.object(m,'HOST',Path(t)),patch.object(m,'ATT',Path(t)),patch.object(m,'PROOF',Path(t,'proof.json')):
            Path(t,'latest.json').write_text(json.dumps({**r,'status':'FAILED'}))
            with patch.object(m.subprocess,'run') as run:
                result=m.run_cycle(Backup(),'synthetic','a'*40)
            self.assertEqual(result['status'],'FAILED');self.assertFalse(Path(t,'cycle-last-success.json').exists())
            self.assertEqual(run.call_count,1);self.assertEqual(result['stage'],'database')
    def test_all_good_stages_are_reused_without_restarting_services(self):
        now,r,c,p=self.fixtures()
        class Backup:
            def unseal(self,v,s):return v
            def cleanup_pending(self,s):return False
            def atomic(self,path,value):path.write_text(json.dumps(value))
            def sha(self,path):return 'verifier'
        with tempfile.TemporaryDirectory() as t,patch.object(m,'STATE',Path(t)),patch.object(m,'HOST',Path(t)),patch.object(m,'ATT',Path(t)),patch.object(m,'PROOF',Path(t,'proof.json')):
            for name,value in [('latest.json',r),('catalog.json',c),('proof.json',p)]:Path(t,name).write_text(json.dumps(value))
            with patch.object(m.subprocess,'run') as run:result=m.run_cycle(Backup(),'synthetic','a'*40)
            self.assertEqual(result['status'],'COMPLETE');run.assert_not_called()
            self.assertEqual(set(result['stages'].values()),{'REUSED'})
if __name__=='__main__':unittest.main()
