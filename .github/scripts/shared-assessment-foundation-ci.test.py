"""New CI boundary fixtures only. Does not execute product tests or Docker."""
import copy
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).with_name('shared-assessment-foundation-ci.py')
spec = importlib.util.spec_from_file_location('foundation_ci', path)
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class FrozenBoundary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.changes = ci.entries(ci.APPROVED['base'], ci.APPROVED['productSource'])

    def test_exact_full_training_and_foundation_diff(self):
        self.assertEqual(len(self.changes), 43)
        ci.validate_changes(self.changes)
        self.assertTrue(any(x['file'].endswith('/assignmentController.ts') for x in self.changes))
        self.assertTrue(any('/modules/assessment-core/' in x['file'] for x in self.changes))

    def test_missing_training_file_rejected(self):
        with self.assertRaises(AssertionError):
            ci.validate_changes([x for x in self.changes if not x['file'].endswith('/assignmentController.ts')])

    def test_new_product_bytes_rejected(self):
        changed = copy.deepcopy(self.changes); changed[0]['after'] = '0' * 40
        with self.assertRaises(AssertionError):
            ci.validate_changes(changed)

    def test_unknown_and_directory_allowlist_rejected(self):
        for path in ['.github/scripts/foundation-unknown.py', 'server-version/backend/src/modules/assessment-core/unknown.ts']:
            with self.subTest(path=path), self.assertRaises(AssertionError):
                ci.validate_changes(self.changes + [{'file': path, 'oldMode': '000000', 'newMode': '100644', 'before': None, 'after': 'a' * 40, 'status': 'A'}])

    def test_unsafe_mode_delete_rename_duplicate_rejected(self):
        for changes in [dict(newMode='120000'), dict(status='D', newMode='000000'), dict(status='R100'), dict(oldMode='100755')]:
            candidate = copy.deepcopy(self.changes); candidate[0].update(changes)
            with self.subTest(change=changes), self.assertRaises(AssertionError):
                ci.validate_changes(candidate)
        with self.assertRaises(AssertionError):
            ci.validate_changes(self.changes + [self.changes[0]])

    def test_only_exact_ci_files_admitted(self):
        additions = [{'file': path, 'oldMode': '000000', 'newMode': '100644', 'before': None, 'after': 'a' * 40, 'status': 'A'} for path in ci.TOOLS]
        ci.validate_changes(self.changes + additions)


if __name__ == '__main__':
    unittest.main()
