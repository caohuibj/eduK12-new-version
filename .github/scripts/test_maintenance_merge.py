import copy
import datetime as dt
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('maintenance_merge', Path(__file__).with_name('maintenance-merge.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class MaintenanceEvidenceContracts(unittest.TestCase):
 def setUp(self):
  self.now = dt.datetime(2026, 10, 13, 7, tzinfo=dt.timezone.utc)
  self.stage = m.CHAIN[-1]
  ident, head, event, path, steps = self.stage
  self.run = {'id': int(ident), 'repository': {'full_name': m.REPOSITORY}, 'status': 'completed',
   'conclusion': 'success', 'head_sha': head, 'head_branch': m.BRANCH, 'event': event, 'path': path,
   'updated_at': '2026-10-13T06:08:10Z'}
  self.jobs = [{'id': 123, 'name': m.JOB, 'head_sha': head, 'conclusion': 'success', 'status': 'completed',
   'labels': ['ubuntu-24.04'], 'steps': [{'name': name, 'conclusion': 'success'} for name in steps]}]
  self.event = {'number': 292, 'pull_request': {'draft': False,
   'head': {'ref': m.BRANCH, 'repo': {'full_name': m.REPOSITORY}}, 'base': {'ref': 'main'}}}
  self.trees = {p: ('a' * 40, 'a' * 40) for p in m.CONSUMERS}
  self.changes = [('M', '100644', '100644', '.github/workflows/ci.yml')]

 def test_exact_official_provider_and_unchanged_consumers_are_admitted(self):
  self.assertEqual(m.validate_provider(self.run, self.jobs, self.stage, self.now)['runId'], self.stage[0])
  m.validate_checkout(self.event, self.trees, self.changes)

 def test_failed_skipped_missing_or_wrong_head_provider_cannot_be_admitted(self):
  for field, value in [('conclusion', 'failure'), ('status', 'queued'), ('head_sha', 'b'*40),
                       ('event', 'push'), ('head_branch', 'main'), ('path', '.github/workflows/ci.yml'),
                       ('repository', {'full_name': 'other/repository'}), ('id', 42)]:
   with self.subTest(field=field), self.assertRaises(RuntimeError):
    m.validate_provider({**self.run, field: value}, self.jobs, self.stage, self.now)
  for steps in [[], [{'name': self.stage[-1][0], 'conclusion': 'skipped'}],
                [dict(s, conclusion='failure') for s in self.jobs[0]['steps']]]:
   with self.assertRaises(RuntimeError): m.validate_provider(self.run, [{**self.jobs[0], 'steps': steps}], self.stage, self.now)
  for jobs in [[], self.jobs * 2, [{**self.jobs[0], 'head_sha': 'c'*40}],
               [{**self.jobs[0], 'conclusion': 'cancelled'}], [{**self.jobs[0], 'labels': ['self-hosted']}]]:
   with self.assertRaises(RuntimeError): m.validate_provider(self.run, jobs, self.stage, self.now)

 def test_stale_and_future_provider_times_are_rejected(self):
  for value in ['2026-10-11T06:08:10Z', '2026-10-14T06:08:10Z']:
   with self.assertRaises(RuntimeError): m.validate_provider({**self.run, 'updated_at': value}, self.jobs, self.stage, self.now)

 def test_changed_modules_dependencies_and_incomplete_bindings_stop_reuse(self):
  for path in m.CONSUMERS:
   trees = copy.deepcopy(self.trees); trees[path] = ('a'*40, 'b'*40)
   with self.assertRaises(RuntimeError): m.validate_checkout(self.event, trees, self.changes)
  with self.assertRaises(RuntimeError): m.validate_checkout(self.event, {}, self.changes)

 def test_other_pr_draft_fork_unknown_business_and_deletion_cannot_use_receipt(self):
  for event in [{**self.event, 'number': 293}, {**self.event, 'pull_request': {**self.event['pull_request'], 'draft': True}},
                {**self.event, 'pull_request': {**self.event['pull_request'], 'head': {'ref': m.BRANCH, 'repo': {'full_name': 'other/repo'}}}}]:
   with self.assertRaises(RuntimeError): m.validate_checkout(event, self.trees, self.changes)
  for change in [('M','100644','100644','server-version/backend/src/index.ts'),
                 ('M','100644','100644','.github/scripts/unknown.py'),
                 ('D','100644','000000','.github/workflows/ci.yml'),
                 ('M','100644','120000','.github/workflows/ci.yml')]:
   with self.assertRaises(RuntimeError): m.validate_checkout(self.event, self.trees, [change])


if __name__ == '__main__': unittest.main()
