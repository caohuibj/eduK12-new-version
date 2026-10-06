import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cleanup_runner', Path(__file__).with_name('runner.py'))
runner = importlib.util.module_from_spec(spec); spec.loader.exec_module(runner)

class CleanupSafety(unittest.TestCase):
    def test_production_and_foreign_container_never_removed(self):
        with patch.object(runner.subprocess, 'run') as command:
            with self.assertRaisesRegex(RuntimeError, 'CLEANUP_CONTAINER_REFUSED'):
                runner.cleanup_container('eduk12-prod-backend', 'a' * 32)
            command.assert_not_called()

    def test_wrong_owner_or_volume_refuses_cleanup(self):
        for item in [{'Config': {'Labels': {runner.LABEL: 'foreign'}}, 'Mounts': []},
                     {'Config': {'Labels': {runner.LABEL: 'a' * 32}}, 'Mounts': [{'Type': 'volume', 'Name': 'business_data'}]}]:
            r = subprocess.CompletedProcess([], 0, json.dumps([item]).encode())
            with patch.object(runner.subprocess, 'run', return_value=r) as command:
                with self.assertRaisesRegex(RuntimeError, 'CLEANUP_CONTAINER_OWNERSHIP_REFUSED'):
                    runner.cleanup_container('eduk12-cos-cleanup-' + 'a' * 32, 'a' * 32)
                self.assertEqual(command.call_count, 1)

    def test_owned_cleanup_does_not_prune_volumes(self):
        item = [{'Config': {'Labels': {runner.LABEL: 'a' * 32}}, 'Mounts': []}]
        with patch.object(runner.subprocess, 'run', side_effect=[subprocess.CompletedProcess([], 0, json.dumps(item).encode()), subprocess.CompletedProcess([], 0)]) as command:
            runner.cleanup_container('eduk12-cos-cleanup-' + 'a' * 32, 'a' * 32)
            self.assertEqual(command.call_args_list[1].args[0], ['docker', 'rm', '--force', 'eduk12-cos-cleanup-' + 'a' * 32])

    def test_workspace_cleanup_preserves_journal_checkpoint_and_foreign_workspace(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(runner, 'STATE', Path(tmp).resolve()):
            root = Path(tmp).resolve(); mine = root / ('.work-' + 'a' * 32 + '-test'); mine.mkdir()
            foreign = root / ('.work-' + 'b' * 32 + '-test'); foreign.mkdir()
            (root / 'checkpoint-owned.gcm').write_bytes(b'encrypted')
            (root / 'journal.json').write_text('{}')
            runner.cleanup_workspace('a' * 32)
            self.assertFalse(mine.exists()); self.assertTrue(foreign.exists())
            self.assertTrue((root / 'journal.json').exists()); self.assertTrue((root / 'checkpoint-owned.gcm').exists())

    def test_workspace_symlink_is_not_followed(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(runner, 'STATE', Path(tmp)):
            (Path(tmp) / ('.work-' + 'a' * 32 + '-test')).symlink_to(tmp)
            with self.assertRaisesRegex(RuntimeError, 'WORKSPACE_SYMLINK_REFUSED'): runner.cleanup_workspace('a' * 32)

    def test_status_records_counts_without_secret_payload_and_refuses_symlink(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(runner, 'STATE', Path(tmp)):
            runner.record_status({'status': 'BLOCKED', 'blocked': ['JOINT_RECOVERY_PROOF_REQUIRED']})
            data = json.loads((Path(tmp) / 'status.json').read_text())
            self.assertFalse(data['pendingTransaction']); self.assertEqual(data['status'], 'BLOCKED')
            (Path(tmp) / 'status.json').unlink(); (Path(tmp) / 'status.json').symlink_to(Path(tmp) / 'foreign')
            with self.assertRaisesRegex(RuntimeError, 'STATUS_SYMLINK_REFUSED'): runner.record_status({})

if __name__ == '__main__': unittest.main()
