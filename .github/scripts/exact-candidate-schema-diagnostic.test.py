"""Diagnostic control contracts only; no service or application execution."""
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).with_name('exact-candidate-schema-diagnostic.py')
SPEC = importlib.util.spec_from_file_location('schema_diagnostic', PATH)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class ComparisonContracts(unittest.TestCase):
    def test_only_existing_random_pg_dump_guards_are_normalized(self):
        first = '\\restrict randomA\nCREATE TABLE t(id int);\n\\unrestrict randomA\n'
        second = '\\restrict randomB\nCREATE TABLE t(id int);\n\\unrestrict randomB\n'
        result, delta = M.comparison(first, second)
        self.assertTrue(result['schemasEqual'])
        self.assertEqual(delta, '')

    def test_definitions_order_comments_and_acl_are_not_ignored(self):
        original = '-- original\nCREATE TABLE a(id int);\nGRANT SELECT ON a TO reader;\n'
        for changed in (
            original.replace('id int', 'id text'),
            original.replace('SELECT', 'ALL'),
            original.replace('-- original', '-- changed'),
            'GRANT SELECT ON a TO reader;\n-- original\nCREATE TABLE a(id int);\n',
        ):
            with self.subTest(changed=changed):
                result, delta = M.comparison(original, changed)
                self.assertFalse(result['schemasEqual'])
                self.assertGreater(result['diffLineCount'], 0)
                self.assertIn('synthetic-restored-schema', delta)

    def test_diagnostics_count_both_ddl_and_comment_changes(self):
        result, _ = M.comparison('-- before\nCREATE TABLE a(id int);', '-- after\nCREATE TABLE a(id text);')
        self.assertEqual(result['addedLineCount'], 2)
        self.assertEqual(result['removedLineCount'], 2)
        self.assertEqual(result['changedCommentLineCount'], 2)
        self.assertEqual(result['changedNonCommentLineCount'], 2)

    def test_no_application_gates_build_install_or_qualification_claim(self):
        source = PATH.read_text()
        for forbidden in ('npm ci', 'npm run build', "'audit'", "'eslint'", "'tsc'", "'trivy'", "'build',", '--publish', '--no-acl', "qualified': True"):
            self.assertNotIn(forbidden, source)
        self.assertIn("'qualified': False", source)
        self.assertIn("'--internal', network", source)
        self.assertIn('RUNTIME.validate_producer', source)
        self.assertIn('RUNTIME.validate_receipt', source)
        self.assertIn("'--schema-only', '--no-owner'", source)
        self.assertIn("'--exit-on-error'", source)

    def test_cleanup_accounts_for_migrator_and_uncertain_create(self):
        source = PATH.read_text()
        for flag in ('attempted_network = True', 'attempted_container = True', 'attempted_migrator = True'):
            self.assertIn(flag, source)
        self.assertIn('(migrator, attempted_migrator, False)', source)
        self.assertIn('(name, attempted_container, attempted_network)', source)
        self.assertIn('cleanup_errors.append', source)


if __name__ == '__main__':
    unittest.main()
