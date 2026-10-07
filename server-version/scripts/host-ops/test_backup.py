import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('host_backup', Path(__file__).with_name('backup.py'))
backup = importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)
SECRET = 'synthetic-test-master-key-01234567890123456789'


class BackupSafety(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(Path(__file__).with_name('backup-config.example.json').read_text())

    def test_cold_readiness_probe_timeout_retries_within_existing_caps(self):
        clock = [0.0]
        calls = []
        def probe(args, **kwargs):
            calls.append(kwargs['timeout'])
            if len(calls) == 1:
                clock[0] += kwargs['timeout']
                raise subprocess.TimeoutExpired(args, kwargs['timeout'])
            return SimpleNamespace(returncode=0)
        def sleep(seconds): clock[0] += seconds
        with patch.object(backup.time, 'monotonic', side_effect=lambda: clock[0]), \
                patch.object(backup.time, 'sleep', side_effect=sleep), \
                patch.object(backup.subprocess, 'run', side_effect=probe):
            backup.wait_for_database('synthetic', 'restore', 'restore')
        self.assertEqual(calls, [10, 10])
        self.assertLess(clock[0], 90)

    def test_readiness_timeout_is_bounded_by_total_deadline(self):
        clock = [0.0]
        calls = []
        def probe(args, **kwargs):
            calls.append(kwargs['timeout'])
            clock[0] += kwargs['timeout']
            raise subprocess.TimeoutExpired(args, kwargs['timeout'])
        def sleep(seconds): clock[0] += seconds
        with patch.object(backup.time, 'monotonic', side_effect=lambda: clock[0]), \
                patch.object(backup.time, 'sleep', side_effect=sleep), \
                patch.object(backup.subprocess, 'run', side_effect=probe):
            with self.assertRaisesRegex(RuntimeError, 'ISOLATED_RESTORE_NOT_READY'):
                backup.wait_for_database('synthetic', 'restore', 'restore')
        self.assertEqual(clock[0], 90)
        self.assertTrue(all(0 < timeout <= 10 for timeout in calls))

    def test_readiness_failure_still_reclaims_restore_container(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            with patch.object(backup, 'run'), \
                    patch.object(backup, 'wait_for_database', side_effect=RuntimeError('ISOLATED_RESTORE_NOT_READY')), \
                    patch.object(backup, 'cleanup_container') as cleanup:
                with self.assertRaisesRegex(RuntimeError, 'ISOLATED_RESTORE_NOT_READY'):
                    backup.restore_check(work / 'synthetic.enc', work, SECRET, work, 'a' * 32,
                                         [{'name': 'synthetic', 'checksum': 'a' * 64}])
            cleanup.assert_called_once_with('eduk12-restore-' + 'a' * 12, 'a' * 32)
            self.assertFalse((work / 'restore.env').exists())

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

    def test_pending_cleanup_authentication_blocks_writer_until_complete(self):
        with patch.object(backup.Path, 'exists', return_value=True), patch.object(backup, 'private_read') as read:
            for status in ['PREPARED', 'DETACHED', 'COMPLETE']:
                read.return_value = json.dumps(backup.seal({'status': status}, SECRET))
                self.assertEqual(backup.cleanup_pending(SECRET), status != 'COMPLETE')
            read.return_value = json.dumps(backup.seal({'status': 'COMPLETE'}, 'wrong-key'))
            with self.assertRaisesRegex(RuntimeError, 'CATALOG_AUTHENTICATION_FAILED'): backup.cleanup_pending(SECRET)

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


class ReleaseIdentityTests(unittest.TestCase):
    def test_runtime_proof_timeout_is_unverified_without_blocking_backup(self):
        expected = [{'name': 'synthetic', 'checksum': 'a' * 64}]
        with patch.object(backup, 'run', side_effect=subprocess.TimeoutExpired('synthetic-runtime-probe', 60)) as run:
            proof = backup.source_runtime_proof(expected)
        self.assertEqual(proof['status'], 'NOT_VERIFIED')
        self.assertFalse(proof['applicationReleaseReady'])
        self.assertEqual(run.call_args.kwargs['timeout'], 60)

    def test_runtime_evidence_is_precise_and_outage_does_not_block_database_backup(self):
        expected = [{'name': 'synthetic', 'checksum': 'a' * 64}]
        valid = {'ok': True, 'restrictedRuntimeRole': True, 'migrationFingerprint': backup.migration_fingerprint(expected)}
        with patch.object(backup, 'run', return_value=json.dumps(valid).encode()):
            self.assertEqual(backup.source_runtime_proof(expected)['status'], 'PASS')
        for value in [b'not json', b'[]', json.dumps({**valid, 'migrationFingerprint': 'b' * 64}).encode()]:
            with patch.object(backup, 'run', return_value=value):
                self.assertEqual(backup.source_runtime_proof(expected)['status'], 'NOT_VERIFIED')
        with patch.object(backup, 'run', side_effect=RuntimeError('BACKUP_COMMAND_FAILED')):
            self.assertFalse(backup.source_runtime_proof(expected)['applicationReleaseReady'])
        with patch.object(backup, 'run', side_effect=RuntimeError('BACKUP_INTERRUPTED')):
            with self.assertRaisesRegex(RuntimeError, 'BACKUP_INTERRUPTED'): backup.source_runtime_proof(expected)

    def test_exact_migration_identity_refuses_missing_extra_changed_duplicate(self):
        expected = [{'name': 'one', 'checksum': 'a' * 64}, {'name': 'two', 'checksum': 'b' * 64}]
        self.assertEqual(backup.verify_restored_migrations(list(reversed(expected)), expected), backup.migration_fingerprint(expected))
        for actual in [expected[:1], expected + [{'name': 'three', 'checksum': 'c' * 64}],
                       [expected[0], {'name': 'two', 'checksum': 'c' * 64}], [expected[0], expected[0]]]:
            with self.assertRaisesRegex(RuntimeError, 'RESTORE_RELEASE_SCHEMA_MISMATCH'):
                backup.verify_restored_migrations(actual, expected)

    def test_migration_source_is_bound_to_release_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / 'scripts/backup'; source.mkdir(parents=True)
            sql = root / 'backend/prisma/migrations/one/migration.sql'; sql.parent.mkdir(parents=True); sql.write_text('CREATE TABLE synthetic(id text);')
            expected = backup.release_migrations(source)
            self.assertEqual(expected, [{'name': 'one', 'checksum': backup.sha(sql)}])
            sql.unlink(); sql.symlink_to(root / 'foreign.sql')
            with self.assertRaises(RuntimeError): backup.release_migrations(source)


if __name__ == '__main__': unittest.main()
