import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('host_backup', Path(__file__).with_name('backup.py'))
backup = importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)
SECRET = 'synthetic-test-master-key-01234567890123456789'


class BackupSafety(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(Path(__file__).with_name('backup-config.example.json').read_text())

    def test_media_bucket_cannot_be_backup_destination(self):
        for edit in [{'backupBucket': self.config['sourceBucket']}, {'region': 'ap-shanghai'},
                     {'cleanupMode': 'delete'}, {'localCopies': 1}, {'maxBackupBytes': 2 * 1024 ** 3},
                     {'minimumFreeBytes': 0}, {'retention': {'dailyDays': 1}}, {'backupSourceSha256': {}}]:
            with self.assertRaises(RuntimeError): backup.validate_config({**self.config, **edit})
        backup.validate_config(self.config)

    def test_existing_backup_sources_match_reviewed_pins(self):
        source = Path(__file__).resolve().parent.parent / 'backup'
        for name, expected in self.config['backupSourceSha256'].items():
            self.assertEqual(backup.sha(source / name), expected)

    def test_catalog_hmac_and_key_rotation(self):
        value = {'schema': 1, 'points': [{'id': 'a' * 32, 'status': 'VERIFIED'}]}
        signed = backup.seal(value, SECRET)
        self.assertEqual(backup.unseal(signed, SECRET), value)
        for invalid in [backup.seal(value, 'wrong-key'), {**signed, 'schema': 2}, {'mac': None}]:
            with self.assertRaises(RuntimeError): backup.unseal(invalid, SECRET)

    def fixture(self, root, ident):
        p = root / ident; p.mkdir()
        file = p / 'database.edubackup.enc'; file.write_bytes(b'synthetic-encrypted-data')
        return {'id': ident, 'status': 'VERIFIED', 'restore': {'status': 'PASS'},
                'objects': [{'file': file.name, 'sha256': backup.sha(file), 'downloadVerified': True, 'authenticatedDecryptionVerified': True}]}

    def test_local_rotation_only_after_two_verified_successors(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            points = [self.fixture(root, x * 32) for x in 'abc']
            foreign = root / 'operator-recovery'; foreign.mkdir()
            self.assertEqual(backup.rotate_local({'points': points}, root), 1)
            self.assertFalse((root / ('a' * 32)).exists())
            self.assertTrue(all((root / (x * 32)).exists() for x in 'bc'))
            self.assertTrue(foreign.exists())

    def test_unverified_successor_and_modified_copy_cannot_allow_deletion(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); points = [self.fixture(root, x * 32) for x in 'abc']
            invalid = copy.deepcopy(points); invalid[2]['restore']['status'] = 'FAILED'
            self.assertEqual(backup.rotate_local({'points': invalid}, root), 0)
            (root / ('a' * 32) / 'database.edubackup.enc').write_bytes(b'changed')
            with self.assertRaises(RuntimeError): backup.rotate_local({'points': points}, root)
            self.assertTrue((root / ('a' * 32)).exists())

    def test_symlink_or_unexpected_file_refuses_local_rotation(self):
        for kind in ['symlink', 'unexpected']:
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp); points = [self.fixture(root, x * 32) for x in 'abc']
                target = root / ('a' * 32)
                if kind == 'unexpected': (target / 'operator-note').write_text('keep')
                else: (target / 'foreign').symlink_to(root / ('b' * 32))
                with self.assertRaises(RuntimeError): backup.rotate_local({'points': points}, root)
                self.assertTrue(target.exists())

    def test_container_cleanup_refuses_foreign_owner_and_named_volume(self):
        name = 'eduk12-restore-' + 'a' * 12
        for item in [{'Config': {'Labels': {backup.LABEL: 'other'}}, 'Mounts': []},
                     {'Config': {'Labels': {backup.LABEL: 'a' * 32}}, 'Mounts': [{'Type': 'volume', 'Name': 'production_data'}]}]:
            completed = type('Result', (), {'returncode': 0, 'stdout': json.dumps([item]).encode()})()
            with patch.object(backup.subprocess, 'run', return_value=completed), patch.object(backup, 'run') as run:
                with self.assertRaises(RuntimeError): backup.cleanup_container(name, 'a' * 32)
                run.assert_not_called()
        with self.assertRaises(RuntimeError): backup.cleanup_container('eduk12-prod-postgres', 'a' * 32)


if __name__ == '__main__': unittest.main()
