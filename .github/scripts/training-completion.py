"""One frozen Training receipt; readonly source-bound continuation, never latest-success."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request

REPO = 'caohuibj/eduK12-new-version'
PR = 248
BRANCH = 'feat/training-admin-governance'
BASE = 'c0fe6f6751e05a18854e2b67e313762634b0082e'
FULL_HEAD = '2d0ef44f029a6029a6f475ebd1bfdad24368e256'
FULL_CHECKOUT = 'd88a126742170acc456a9bf4e543d9d4bf50a786'
UI_HEAD = '3f80dc54a734d8c78da3afc60260b6f5302f941a'
FULL_RUN, UI_RUN = 37768367942, 37786700187
WORKFLOW = '.github/workflows/ci.yml'
NEW_FILES = {'.github/scripts/training-completion.py', '.github/scripts/test_training_completion.py'}
FULL_JOBS = {
    113329187292: 'mini program / foundation contract and page smoke',
    113329188047: 'codeql (javascript/typescript SAST)',
    113329188156: 'maintenance / attachment deduplication, indexes and protected cleanup',
    113329188318: 'frontend artifacts / release consumers early / build',
    113329188393: 'frontend artifacts / release consumers early / UI-lab artifact',
    113329189182: 'accept-media / cognitive-situational',
    113329189355: 'accept-media / images-video',
    113329189405: 'browser (seeded Situational Bundle + static visual acceptance) / browser (seeded Situational Bundle + static visual acceptance)',
    113329190366: 'accept-ops / runtime-recovery',
    113329190377: 'accept-perf / Scale + Cognitive + SJT fresh accounting',
    113329190726: 'docker (compose config + production builds) / production image build and scan',
    113329191659: 'frontend (lint + types + full tests + build) / frontend checks',
    113329192318: 'accept-ui (webkit) / webkit frontend acceptance',
    113329194169: 'accept-ui (firefox) / firefox frontend acceptance',
    113329241686: 'backend (migrate + build + performance gate) / backend (migrate + build + performance gate)',
    113329247704: 'classify changed content',
    113329251328: 'backend regression (isolated job database) / backend regression (isolated job database)',
}
UI_JOBS = {
    113343196484: 'probe-frontend-build / build',
    113343197058: 'probe-frontend-build / UI-lab artifact',
    113343602537: 'probe-ui-hosted (chromium) / chromium frontend acceptance',
}


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def once(text, old, new):
    require(text.count(old) == 1, 'Unexpected workflow structure')
    return text.replace(old, new, 1)


def completion_workflow(original):
    """Exact reviewed transform; no broad YAML allowlist or arbitrary CI edits."""
    text = once(original, '      full_acceptance:\n',
                "      complete_training:\n        type: boolean\n        default: false\n        description: 'Approved frozen Training evidence receipt; no application tests rerun'\n      full_acceptance:\n")
    original_scope = "    if: (inputs.step_probe == '' || inputs.step_probe == 'none') && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)"
    text = once(text, original_scope, "    if: ${{ !inputs.complete_training && " + original_scope[len('    if: '):] + " }}")
    before, gate = text.split('  merge-gate:\n')
    gate = once(gate,
                "    runs-on: ${{ vars.CI_MAC_LIGHT_ENABLED == 'true' && fromJSON('[\"self-hosted\",\"macOS\",\"eduk12-mac-ci\"]') || fromJSON('[\"self-hosted\",\"Linux\",\"X64\",\"eduk12-win-ci\"]') }}",
                "    runs-on: ${{ inputs.complete_training && fromJSON('[\"ubuntu-24.04\"]') || (vars.CI_MAC_LIGHT_ENABLED == 'true' && fromJSON('[\"self-hosted\",\"macOS\",\"eduk12-mac-ci\"]') || fromJSON('[\"self-hosted\",\"Linux\",\"X64\",\"eduk12-win-ci\"]')) }}")
    gate = once(gate, '      - uses: actions/checkout@v4\n',
                '      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n')
    gate = once(gate, '      - name: require exact success for the selected route\n',
                '      - name: require exact success for the selected route\n        if: ${{ !inputs.complete_training }}\n')
    gate += '''      - name: verify approved frozen Training receipt and refusal cases
        if: inputs.complete_training
        env:
          GH_TOKEN: ${{ github.token }}
          PYTHONDONTWRITEBYTECODE: '1'
        run: |
          python3 -m unittest discover -s .github/scripts -p test_training_completion.py
          node --test .github/scripts/content-workflows.test.mjs .github/scripts/ci-topology.test.mjs .github/scripts/maintenance-routing.test.mjs
          python3 .github/scripts/training-completion.py
      - name: upload current-head evidence receipt
        if: always() && inputs.complete_training
        uses: actions/upload-artifact@v4
        with:
          name: training-completion-${{ github.sha }}
          path: training-completion.json
          retention-days: 3
          if-no-files-found: error
'''
    return before + '  merge-gate:\n' + gate


def validate_run(run, run_id, head, event, attempt, success=False):
    require(run['id'] == run_id and run['head_sha'] == head, 'Run/head mismatch')
    require(run['path'] == WORKFLOW and run['event'] == event, 'Wrong workflow/event')
    require(run['repository']['full_name'] == REPO and run['head_repository']['full_name'] == REPO,
            'Foreign run repository')
    require(run['head_branch'] == BRANCH and run['run_attempt'] == attempt, 'Wrong branch/attempt')
    require(run['status'] == 'completed', 'Incomplete baseline run')
    if success:
        require(run['conclusion'] == 'success', 'Hosted UI run did not succeed')


def validate_jobs(jobs, expected):
    ids = [job['id'] for job in jobs]
    require(len(ids) == len(set(ids)), 'Duplicate job records')
    by_id = {job['id']: job for job in jobs}
    selected = []
    for job_id, name in expected.items():
        job = by_id.get(job_id)
        require(job is not None and job['name'] == name, f'Missing/mismatched job {job_id}')
        require(job['status'] == 'completed' and job['conclusion'] == 'success', f'Non-success job {name}')
        require(bool(job.get('started_at')) and bool(job.get('completed_at')), 'Missing execution timestamps')
        selected.append({'id': job_id, 'name': name, 'result': job['conclusion'],
                         'started_at': job['started_at'], 'completed_at': job['completed_at']})
    return selected


def validate_pr(pr, main_sha, candidate):
    require(main_sha == BASE and pr['base']['sha'] == BASE, 'Main changed; re-evaluate validation scope')
    require(pr['number'] == PR and pr['state'] == 'open' and pr['base']['ref'] == 'main', 'Wrong/closed PR')
    require(pr['head']['sha'] == candidate and pr['head']['ref'] == BRANCH, 'Candidate changed')
    require(pr['head']['repo']['full_name'] == REPO and pr['base']['repo']['full_name'] == REPO, 'Foreign PR')


def validate_changes(records):
    # git diff --raw --no-renames; modes/status reject moves, deletions and symlinks.
    paths = set()
    for record in records:
        fields, path = record.split('\t')
        old_mode, new_mode, _old, _new, status = fields.split()
        require(path not in paths, 'Duplicate changed path')
        paths.add(path)
        if path == WORKFLOW:
            require(old_mode == ':100644' and new_mode == '100644' and status == 'M', 'Invalid workflow mode')
        else:
            require(path in NEW_FILES and old_mode == ':000000' and new_mode == '100644' and status == 'A',
                    'Unvalidated source/input changed: ' + path)
    require(paths == NEW_FILES | {WORKFLOW}, 'Unexpected continuation patch')


def api(path):
    token = os.environ['GH_TOKEN']
    request = urllib.request.Request('https://api.github.com/repos/' + REPO + '/' + path,
                                    headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                                             'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def jobs(run_id, attempt):
    result = []
    for page in range(1, 6):
        data = api(f'actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100&page={page}')
        result.extend(data['jobs'])
        if len(result) == data['total_count']:
            return result
    raise ValueError('Incomplete job inventory')


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def main():
    receipt = {'schema': 1, 'status': 'FAIL', 'repository': REPO, 'pr': PR, 'main': BASE,
               'candidate': os.environ.get('GITHUB_SHA'), 'originalRun': FULL_RUN, 'hostedUiRun': UI_RUN}
    try:
        require(os.environ['GITHUB_REPOSITORY'] == REPO and os.environ['GITHUB_EVENT_NAME'] == 'workflow_dispatch',
                'Only approved same-repository manual completion is permitted')
        event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
        inputs = event['inputs']
        require(str(inputs.get('complete_training')).lower() == 'true' and inputs.get('step_probe') == 'none'
                and str(inputs.get('full_acceptance')).lower() == 'false', 'Invalid completion request')
        candidate = os.environ['GITHUB_SHA']
        require(git('rev-parse', 'HEAD') == candidate and os.environ['GITHUB_REF'] == 'refs/heads/' + BRANCH,
                'Checkout/ref mismatch')
        validate_pr(api(f'pulls/{PR}'), api('branches/main')['commit']['sha'], candidate)
        require(git('rev-parse', FULL_HEAD + '^{tree}') == api('git/commits/' + FULL_CHECKOUT)['tree']['sha'],
                'Original tested merge tree differs')
        require({x['sha'] for x in api('git/commits/' + FULL_CHECKOUT)['parents']} == {BASE, FULL_HEAD},
                'Wrong original test-merge base')
        require(git('diff', '--name-only', FULL_HEAD, UI_HEAD) == WORKFLOW, 'UI source differs from full validation')
        full_workflow = git('show', FULL_HEAD + ':' + WORKFLOW) + '\n'
        ui_workflow = git('show', UI_HEAD + ':' + WORKFLOW) + '\n'
        # The only pre-receipt difference strengthens the Chromium probe coverage.
        start, end = full_workflow.index('  probe-ui-hosted:\n'), full_workflow.index('  probe-maintenance:\n')
        block = once(full_workflow[start:end], '      engine: ${{ matrix.engine }}\n',
                     '      engine: ${{ matrix.engine }}\n      canonical: true\n      app_shell: true\n      qa_round3: true\n')
        require(full_workflow[:start] + block + full_workflow[end:] == ui_workflow, 'Unreviewed UI workflow change')
        validate_changes(git('diff', '--raw', '--no-renames', UI_HEAD, candidate).splitlines())
        require(git('show', candidate + ':' + WORKFLOW) + '\n' == completion_workflow(ui_workflow),
                'Unreviewed completion workflow change')
        require(subprocess.run(['git', 'merge-base', '--is-ancestor', BASE, candidate]).returncode == 0,
                'Main is not included in candidate')
        full_run, ui_run = api(f'actions/runs/{FULL_RUN}'), api(f'actions/runs/{UI_RUN}')
        validate_run(full_run, FULL_RUN, FULL_HEAD, 'pull_request', 2)
        validate_run(ui_run, UI_RUN, UI_HEAD, 'workflow_dispatch', 1, success=True)
        receipt['preserved'] = validate_jobs(jobs(FULL_RUN, 2), FULL_JOBS)
        receipt['chromiumCompletion'] = validate_jobs(jobs(UI_RUN, 1), UI_JOBS)
        receipt['originalConclusion'] = full_run['conclusion']  # Keep the original failure honest.
        # Recheck mutable state after all evidence reads to close the acceptance race.
        validate_pr(api(f'pulls/{PR}'), api('branches/main')['commit']['sha'], candidate)
        receipt['status'] = 'PASS'
    except Exception as error:
        receipt['reason'] = str(error)
        raise
    finally:
        Path('training-completion.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt))


if __name__ == '__main__':
    main()
