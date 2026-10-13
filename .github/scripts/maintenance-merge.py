"""Admit the reviewed PR 292 operations evidence; never manufacture a check result."""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import urllib.request

REPOSITORY = 'caohuibj/eduK12-new-version'
BRANCH = 'ops/backup-space-upgrade-20261013'
QUALIFIED_HEAD = '57873798530ca76c6f6fe7b779a18b2145cd985d'
JOB = 'attachment deduplication, indexes and protected cleanup'
CHAIN = [
 ('38347265525', 'b8969a064f04ed923692eb8b02f7ce9f989e2aa4', 'pull_request', '.github/workflows/ci.yml',
  ['CI routing and attachment invariants', 'Host launcher and existing monitoring guards',
   'Check shell and systemd units without starting production services',
   'Real isolated Docker launcher and failed-task cleanup',
   'Actual encrypted database restore and failure-volume cleanup']),
 ('38347724147', 'ec593e7be764523c1f57490338efbe29c29b20a2', 'workflow_dispatch', '.github/workflows/ci-maintenance.yml',
  ['Qualify unchanged maintenance evidence for exact cache follow-up', 'Verify affected cache policy only']),
 ('38352435608', 'a6eaa3abb91473b60124e9ef26c65731f672308b', 'workflow_dispatch', '.github/workflows/ci-maintenance.yml',
  ['Qualify unchanged foundations for operations follow-up', 'Verify affected backup cycle, capacity, image protection and quarantine']),
 ('38352891452', '5c1e73e23426e8b8a9977c99823385aa97132db7', 'workflow_dispatch', '.github/workflows/ci-maintenance.yml',
  ['Qualify unchanged foundations for operations follow-up', 'Verify daily verification safety margin only']),
 ('38354070158', '6feac11f67a6b5d687ad90fac84d1fdb1f8f66f4', 'workflow_dispatch', '.github/workflows/ci-maintenance.yml',
  ['Qualify unchanged foundations for operations follow-up', 'Verify large snapshot batching and skipped space maintenance only']),
 ('38355020869', QUALIFIED_HEAD, 'workflow_dispatch', '.github/workflows/ci-maintenance.yml',
  ['Qualify unchanged foundations for operations follow-up', 'Match production Python major and minor for the timestamp fix',
   'Verify production timestamp and operator identity separation only']),
]
# Includes the original backup scripts and every imported maintenance module,
# fixture, example, installer, unit, dependency and classification parameter.
CONSUMERS = ['server-version/scripts', '.github/config', '.github/release-tools']
CONTROL = {'.github/workflows/ci.yml', '.github/workflows/ci-maintenance.yml',
 '.github/scripts/content-scope.mjs', '.github/scripts/maintenance-routing.test.mjs',
 '.github/scripts/maintenance-merge.py', '.github/scripts/test_maintenance_merge.py'}


def require(condition, reason):
 if not condition: raise RuntimeError(reason)


def validate_provider(run, jobs, spec, now):
 ident, head, event, path, required = spec
 require(str(run.get('id')) == ident and run.get('repository', {}).get('full_name') == REPOSITORY,
         'PROVIDER_REPOSITORY_OR_RUN_MISMATCH')
 require(run.get('status') == 'completed' and run.get('conclusion') == 'success' and
         run.get('head_sha') == head and run.get('head_branch') == BRANCH and
         run.get('event') == event and run.get('path') == path, 'PROVIDER_INPUT_OR_RESULT_MISMATCH')
 age = (now - dt.datetime.fromisoformat(run['updated_at'].replace('Z', '+00:00'))).total_seconds()
 require(0 <= age <= 24 * 3600, 'PROVIDER_EVIDENCE_STALE')
 expected = ('maintenance / ' if event == 'pull_request' else '') + JOB
 selected = [j for j in jobs if j.get('name') == expected]
 require(len(selected) == 1, 'PROVIDER_JOB_MISSING_OR_AMBIGUOUS')
 job = selected[0]
 require(job.get('head_sha') == head and job.get('conclusion') == 'success' and
         job.get('status') == 'completed' and job.get('labels') == ['ubuntu-24.04'], 'PROVIDER_JOB_NOT_QUALIFIED')
 steps = {s['name']: s.get('conclusion') for s in job.get('steps', [])}
 require(all(steps.get(name) == 'success' for name in required), 'PROVIDER_REQUIRED_STEP_NOT_SUCCESS')
 return {'runId': ident, 'head': head, 'jobId': job['id'], 'requiredSteps': required, 'updatedAt': run['updated_at']}


def validate_checkout(event, trees, changes):
 pr = event.get('pull_request', {})
 require(event.get('number') == 292 and not pr.get('draft', True) and
         pr.get('head', {}).get('repo', {}).get('full_name') == REPOSITORY and
         pr.get('head', {}).get('ref') == BRANCH and pr.get('base', {}).get('ref') == 'main', 'REVIEWED_PR_ONLY')
 for path, (before, current) in trees.items():
  require(before == current, 'CONSUMER_INPUT_CHANGED: ' + path)
 require(set(trees) == set(CONSUMERS), 'CONSUMER_BINDINGS_INCOMPLETE')
 for status, old_mode, new_mode, path in changes:
  require(status in ('M', 'A') and old_mode in ('000000', '100644', '100755') and
          new_mode in ('100644', '100755'), 'DIFF_METADATA_UNQUALIFIED')
  require(path in CONTROL or path.startswith(('server-version/scripts/host-ops/',
          'server-version/scripts/cos-cleanup/', 'server-version/scripts/attachment-backup/')), 'MIXED_OR_UNKNOWN_PR_DIFF')


def main():
 require(os.environ.get('GITHUB_EVENT_NAME') == 'pull_request' and
         os.environ.get('GITHUB_REPOSITORY') == REPOSITORY, 'OFFICIAL_PR_CONTEXT_ONLY')
 event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
 def git(*args): return subprocess.check_output(['git', *args]).decode().strip()
 base = event['pull_request']['base']['sha']; head = event['pull_request']['head']['sha']
 for ancestor in (base, head, QUALIFIED_HEAD):
  subprocess.run(['git', 'merge-base', '--is-ancestor', ancestor, 'HEAD'], check=True)
 trees = {p: (git('rev-parse', QUALIFIED_HEAD + ':' + p), git('rev-parse', 'HEAD:' + p)) for p in CONSUMERS}
 raw = subprocess.check_output(['git', 'diff', '--raw', '-z', '--no-renames', base, 'HEAD']).decode().split('\0')
 changes = []
 for offset in range(0, len(raw) - 1, 2):
  meta = raw[offset].split(); changes.append((meta[-1], meta[0][1:], meta[1], raw[offset + 1]))
 validate_checkout(event, trees, changes)
 def api(path):
  request = urllib.request.Request('https://api.github.com/repos/' + REPOSITORY + '/' + path,
    headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
  return json.load(urllib.request.urlopen(request, timeout=30))
 now = dt.datetime.now(dt.timezone.utc)
 proofs = []
 for spec in CHAIN:
  run = api('actions/runs/' + spec[0]); jobs = api('actions/runs/' + spec[0] + '/jobs?per_page=100')['jobs']
  proofs.append(validate_provider(run, jobs, spec, now))
 receipt = {'pr': 292, 'head': head, 'checkout': git('rev-parse', 'HEAD'), 'base': base,
            'consumerTrees': {p: values[1] for p, values in trees.items()}, 'providers': proofs}
 Path('qualified-maintenance-merge.json').write_text(json.dumps(receipt, indent=2) + '\n')
 with open(os.environ['GITHUB_OUTPUT'], 'a') as output: output.write('reused=true\n')
 print('Qualified six official successful provider stages and identical maintenance consumer inputs for PR 292.')


if __name__ == '__main__': main()
