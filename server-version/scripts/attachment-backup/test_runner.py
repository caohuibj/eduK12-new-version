import json
import unittest
from unittest.mock import patch
import subprocess
import tempfile
from pathlib import Path
import runner

class RunnerSafetyTests(unittest.TestCase):
    def test_cleanup_rejects_production_before_docker(self):
        with patch.object(runner.subprocess, "run") as invoke:
            with self.assertRaisesRegex(RuntimeError, "UNSAFE_TASK_CONTAINER"):
                runner.cleanup_task("eduk12-prod-backend", "a" * 32)
            invoke.assert_not_called()

    def test_cleanup_checks_exact_run_label_and_never_removes_volumes(self):
        run_id = "a" * 32
        inspected = subprocess.CompletedProcess([], 0, json.dumps([{"Config": {"Labels": {runner.ROLE: run_id}}}]), "")
        with patch.object(runner.subprocess, "run", side_effect=[inspected, subprocess.CompletedProcess([], 0)]) as invoke:
            runner.cleanup_task("eduk12-attachments-" + run_id, run_id)
            self.assertEqual(invoke.call_args_list[1].args[0], ["docker", "rm", "--force", "eduk12-attachments-" + run_id])

    def test_foreign_task_label_blocks_cleanup(self):
        item = [{"Config": {"Labels": {runner.ROLE: "foreign"}}}]
        with patch.object(runner.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(item), "")) as invoke:
            with self.assertRaisesRegex(RuntimeError, "TASK_OWNERSHIP_MISMATCH"):
                runner.cleanup_task("eduk12-attachments-" + "a" * 32, "a" * 32)
            self.assertEqual(invoke.call_count, 1)

    def test_scratch_cleanup_only_removes_the_current_run_workspace(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            current = root / (".work-" + "a" * 32 + "-test")
            foreign = root / (".work-" + "b" * 32 + "-test")
            current.mkdir()
            foreign.mkdir()
            (current / "encrypted").write_bytes(b"synthetic")
            runner.cleanup_workspace(root, "a" * 32)
            self.assertFalse(current.exists())
            self.assertTrue(foreign.exists())

    def test_scratch_cleanup_refuses_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            link = root / (".work-" + "a" * 32 + "-test")
            link.symlink_to(root)
            with self.assertRaisesRegex(RuntimeError, "UNSAFE_WORKSPACE"):
                runner.cleanup_workspace(root, "a" * 32)

    def test_key_reader_selects_only_existing_backup_key(self):
        value = "synthetic-test-backup-key-0123456789"
        self.assertEqual(runner.parse_key("UNRELATED=value\nBACKUP_ENCRYPTION_KEY=" + value), value)
        with self.assertRaisesRegex(RuntimeError, "BACKUP_KEY_REQUIRED"):
            runner.parse_key("PASSWORD=private")

if __name__ == "__main__":
    unittest.main()
