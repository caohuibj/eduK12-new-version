import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('completion', Path(__file__).with_name('training-completion.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class CompletionGuardTests(unittest.TestCase):
    def setUp(self):
        self.job = {'id': 1, 'name': 'required', 'status': 'completed', 'conclusion': 'success',
                    'started_at': '2026-10-08T10:00:00Z', 'completed_at': '2026-10-08T10:01:00Z'}
        self.pr = {'number': c.PR, 'state': 'open', 'base': {'sha': c.BASE, 'ref': 'main', 'repo': {'full_name': c.REPO}},
                   'head': {'sha': 'candidate', 'ref': c.BRANCH, 'repo': {'full_name': c.REPO}}}
        self.run = {'id': c.UI_RUN, 'head_sha': c.UI_HEAD, 'path': c.WORKFLOW, 'event': 'workflow_dispatch',
                    'repository': {'full_name': c.REPO}, 'head_repository': {'full_name': c.REPO},
                    'head_branch': c.BRANCH, 'run_attempt': 1, 'status': 'completed', 'conclusion': 'success'}

    def test_successful_jobs_have_bound_evidence(self):
        self.assertEqual(c.validate_jobs([self.job], {1: 'required'})[0]['id'], 1)

    def test_non_success_results_fail_closed(self):
        for result in ('failure', 'cancelled', 'skipped', None, 'neutral', 'timed_out'):
            with self.subTest(result=result), self.assertRaises(ValueError):
                c.validate_jobs([{**self.job, 'conclusion': result}], {1: 'required'})

    def test_missing_duplicate_renamed_unfinished_or_untimed_jobs_fail(self):
        cases = [[], [self.job, self.job], [{**self.job, 'name': 'optional'}],
                 [{**self.job, 'status': 'in_progress'}], [{**self.job, 'completed_at': None}]]
        for jobs in cases:
            with self.subTest(jobs=jobs), self.assertRaises(ValueError):
                c.validate_jobs(jobs, {1: 'required'})

    def test_main_candidate_branch_pr_and_repository_are_bound(self):
        c.validate_pr(self.pr, c.BASE, 'candidate')
        patches = [{'number': 1}, {'state': 'closed'}, {'base': {**self.pr['base'], 'ref': 'other'}},
                   {'head': {**self.pr['head'], 'sha': 'other'}},
                   {'head': {**self.pr['head'], 'ref': 'other'}},
                   {'head': {**self.pr['head'], 'repo': {'full_name': 'attacker/fork'}}}]
        for patch in patches:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                c.validate_pr({**self.pr, **patch}, c.BASE, 'candidate')
        with self.assertRaises(ValueError):
            c.validate_pr(self.pr, 'changed-main', 'candidate')

    def test_run_commit_attempt_workflow_repo_event_success_are_bound(self):
        c.validate_run(self.run, c.UI_RUN, c.UI_HEAD, 'workflow_dispatch', 1, success=True)
        for key, value in [('id', 1), ('head_sha', 'other'), ('path', 'other'), ('event', 'push'),
                           ('head_branch', 'other'), ('run_attempt', 2), ('status', 'in_progress'),
                           ('conclusion', 'failure'), ('repository', {'full_name': 'other/repo'}),
                           ('head_repository', {'full_name': 'other/fork'})]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                c.validate_run({**self.run, key: value}, c.UI_RUN, c.UI_HEAD, 'workflow_dispatch', 1, success=True)

    def test_application_tests_locks_deletions_and_symlinks_cannot_reuse_evidence(self):
        records = [':100644 100644 a b M\t' + c.WORKFLOW]
        records += [':000000 100644 0 a A\t' + path for path in sorted(c.NEW_FILES)]
        c.validate_changes(records)
        for path in ['server-version/backend/src/auth.ts', 'server-version/frontend/package-lock.json',
                     'server-version/e2e/qa-round3-browser-e2e.cjs', '.github/workflows/ci-ui.yml']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                c.validate_changes(records + [':100644 100644 a b M\t' + path])
        for mode, status in [('120000', 'A'), ('100755', 'A'), ('100644', 'D'), ('100644', 'R100')]:
            with self.subTest(mode=mode, status=status), self.assertRaises(ValueError):
                c.validate_changes([records[0], f':000000 {mode} 0 a {status}\t' + sorted(c.NEW_FILES)[0], records[2]])
        with self.assertRaises(ValueError):
            c.validate_changes(records[:-1])

    def test_transform_refuses_ambiguous_or_missing_structure(self):
        with self.assertRaises(ValueError):
            c.completion_workflow('unrelated workflow')
        with self.assertRaises(ValueError):
            c.once('marker marker', 'marker', 'replacement')


if __name__ == '__main__':
    unittest.main()
