"""Narrow round-2 backend/PG evidence reuse. No fallback or evidence signing."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request
import zipfile

SOURCE = '48defee0aecbc36138ad624f729b9a7cbb634efc'
RUN = 39560427570
TITLE = 'persists quality-item raw answers and frozen image feedback without scoring quality items'
ARTIFACTS = {
    'backend': (12326834164, 'scale-backend-' + SOURCE, 924879951, '5cba5d3efd53318479134d8e0b380993533e2eb6847fa3fb41d9d1f1aaf77280'),
    'reports': (12327198696, 'scale-backend-reports-' + SOURCE, 330235, '29ec19e7828503e60383c3b388b5317897e4148cec04915dc7867439e10cc605'),
    'frontendReports': (12327173709, 'scale-frontend-reports-' + SOURCE, 43617, '16250de1efb6f3b2fb628078213916abf4aacdc5ce7998c94f17ede393643391'),
    'browser': (12328080272, 'scale-browser-' + SOURCE, 2042, '5b5c1e8d3311397c14cdffcea2edf7c4b4082cfc4d30e584e6c08bde96d3cfc7'),
}
FRONTEND_REPAIR_PATHS = [
    'server-version/frontend/src/pages/ScaleEdit.css',
    'server-version/frontend/src/pages/ScaleEdit.tsx',
    'server-version/frontend/src/pages/__tests__/ScaleEdit.authoring.test.tsx',
    'server-version/frontend/src/pages/__tests__/ScaleEdit.contrast.test.ts',
    'server-version/frontend/src/pages/__tests__/ScaleEdit.persistence-boundaries.test.tsx',
    'server-version/frontend/src/survey/ResearchScaleEditor.feedback.test.tsx',
    'server-version/frontend/src/survey/SurveyRawScoreFeedbackEditor.tsx',
]
CLOSURE = ['server-version/backend', '.github/scripts/scale-authoring-build.sh',
           '.github/scripts/scale-authoring-backend.sh', '.github/scripts/measurement-browser-ci.py',
           'server-version/e2e/measurement-browser-proxy.cjs']


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def unchanged(old, new, label):
    if old != new:
        raise ValueError(label + ' changed; fixed backend reuse is invalid, stop and re-scope affected work')


def check_closure():
    unchanged(sorted(FRONTEND_REPAIR_PATHS), sorted(git('diff', '--name-only', SOURCE, 'HEAD', '--', 'server-version/frontend').splitlines()), 'frontend repair boundary; untouched tests and all other transitive frontend inputs')
    for path in CLOSURE:
        unchanged(git('rev-parse', SOURCE + ':' + path), git('rev-parse', 'HEAD:' + path), path)
    old_plan = json.loads(git('show', SOURCE + ':.github/scripts/scale-authoring-bindings.json'))
    plan = json.loads(Path('.github/scripts/scale-authoring-bindings.json').read_text())
    unchanged(old_plan['tests']['backend'], plan['tests']['backend'], 'backend selected test inputs')
    old_checks = git('show', SOURCE + ':.github/scripts/scale-authoring-checks.sh')
    # The only accepted check-runner edit removes a frontend-only subset typecheck.
    old_checks = old_checks.replace('  node node_modules/typescript/bin/tsc -p tsconfig.cognitive.json --noEmit\n', '')
    unchanged(old_checks, Path('.github/scripts/scale-authoring-checks.sh').read_text().strip(), 'backend check runner')
    original = git('show', SOURCE + ':.github/workflows/ci-scale-authoring.yml')
    current = Path('.github/workflows/ci-scale-authoring.yml').read_text()
    unchanged(original.split('\nenv:\n', 1)[1].split('\njobs:\n', 1)[0], current.split('\nenv:\n', 1)[1].split('\njobs:\n', 1)[0], 'top-level CI timezone and registry environment')
    for name, end in [('build', 'browser'), ('browser', 'sast')]:
        block = current.split('  ' + name + ':\n', 1)[1].split('  ' + end + ':\n', 1)[0]
        assert '    runs-on: ubuntu-24.04\n' in block
        assert "          node-version: '24.21.0'\n" in block
    def browser_config(text):
        return text.split('  browser:\n', 1)[1].split('    env:\n', 1)[1].split('    steps:\n', 1)[0]
    unchanged(browser_config(original), browser_config(current), 'PG/runtime environment and service versions')
    def test_env(text):
        return text.split('      - name: exact affected contracts, types, lint and dependency audit\n', 1)[1].split('        env:\n', 1)[1].split('        run:', 1)[0]
    unchanged(test_env(original), test_env(current), 'backend test environment')
    return old_plan


def api(path):
    url = 'https://api.github.com/repos/caohuibj/eduK12-new-version/actions/' + path
    headers = {'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
        return json.load(response)


def verify_jobs(read=api):
    run = read('runs/' + str(RUN))
    assert run['id'] == RUN and run['head_sha'] == SOURCE and run['run_attempt'] == 1
    producer = read('jobs/119090160085')
    assert producer['run_id'] == RUN and producer['head_sha'] == SOURCE and producer['name'] == 'build (backend)' and producer['conclusion'] == 'success'
    frontend = read('jobs/119090160090')
    assert frontend['run_id'] == RUN and frontend['head_sha'] == SOURCE and frontend['name'] == 'build (frontend)' and frontend['conclusion'] == 'success'
    browser = read('jobs/119091427956')
    assert browser['run_id'] == RUN and browser['head_sha'] == SOURCE
    for name in ['new exact PostgreSQL persistence and image permission case', 'stop this run processes and clear private credentials']:
        matches = [s for s in browser['steps'] if s['name'] == name]
        assert len(matches) == 1 and matches[0]['conclusion'] == 'success'


def artifact_identity(meta, key):
    aid, name, size, digest = ARTIFACTS[key]
    assert meta['id'] == aid and meta['name'] == name and not meta['expired']
    assert meta['size_in_bytes'] == size and meta['digest'] == 'sha256:' + digest
    assert meta['workflow_run']['id'] == RUN and meta['workflow_run']['head_sha'] == SOURCE


def checked_zip(archive, key, output):
    _, _, size, digest = ARTIFACTS[key]
    h = hashlib.sha256()
    with archive.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
    assert archive.stat().st_size == size and h.hexdigest() == digest, 'Original artifact ZIP bytes changed'
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            path = Path(info.filename)
            assert not path.is_absolute() and '..' not in path.parts and '\\' not in info.filename
            assert (info.external_attr >> 16) & 0o170000 != 0o120000
        z.extractall(output)


def download(key, output):
    aid = ARTIFACTS[key][0]
    artifact_identity(api('artifacts/' + str(aid)), key)
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(NoRedirect)
    request = urllib.request.Request('https://api.github.com/repos/caohuibj/eduK12-new-version/actions/artifacts/' + str(aid) + '/zip', headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN']})
    try:
        opener.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        assert error.code in (301, 302, 303, 307, 308)
        url = error.headers['Location']
    else:
        raise RuntimeError('Expected official signed artifact redirect')
    assert url.startswith('https://')
    archive = Path(os.environ['RUNNER_TEMP']) / ('scale-reused-' + key + '.zip')
    # Never forward the GitHub token to the signed artifact host.
    with urllib.request.urlopen(url, timeout=120) as response, archive.open('wb') as stream:
        while chunk := response.read(1024 * 1024):
            stream.write(chunk)
    checked_zip(archive, key, output)
    archive.unlink()


def verify_reports(reports, browser, selected):
    test = json.loads((reports / 'backend-tests.json').read_text())
    assert test['success'] is True and test['numPassedTests'] == 174 and test['numFailedTests'] == 0 and test['numFailedTestSuites'] == 0 and test['numPendingTests'] == 0
    actual = [x['name'].split('/server-version/backend/', 1)[1] for x in test['testResults']]
    assert sorted(actual) == sorted(selected)
    assert all(x['assertionResults'] and all(a['status'] == 'passed' for a in x['assertionResults']) for x in test['testResults'])
    audit = json.loads((reports / 'backend-audit.json').read_text())['metadata']['vulnerabilities']
    assert audit['high'] == 0 and audit['critical'] == 0
    scan = json.loads((reports / 'backend-runtime-scan.json').read_text())
    assert scan.get('Results') and all(v['Severity'] not in ['HIGH', 'CRITICAL'] for result in scan['Results'] for v in result.get('Vulnerabilities', []))
    assembly = json.loads((reports / 'backend-runtime-output.json').read_text())
    assert assembly['head'] == SOURCE and assembly['sameCompilerOutput'] is True and assembly['files']
    pg = json.loads((browser / 'postgres.json').read_text())
    assert pg['success'] is True and pg['numPassedTests'] == 1 and pg['numFailedTests'] == 0 and pg['numFailedTestSuites'] == 0
    chosen = [a for suite in pg['testResults'] for a in suite['assertionResults'] if a['title'] == TITLE]
    assert len(chosen) == 1 and chosen[0]['status'] == 'passed'
    cleanup = json.loads((browser / 'cleanup.json').read_text())
    assert cleanup['exitStatus'] == 0 and cleanup['privateMaterialRemoved'] is True


def verify_frontend_report(reports, selected):
    report = json.loads((reports / 'frontend-tests.json').read_text())
    assert report['success'] is True and report['numPassedTests'] == 123 and report['numFailedTests'] == 0 and report['numFailedTestSuites'] == 0 and report['numPendingTests'] == 0
    actual = [x['name'].split('/server-version/frontend/', 1)[1] for x in report['testResults']]
    assert sorted(actual) == sorted(selected)
    assert all(x['assertionResults'] and all(a['status'] == 'passed' for a in x['assertionResults']) for x in report['testResults'])


def main():
    mode = sys.argv[1]
    assert mode in ['verify', 'restore']
    plan = check_closure()
    verify_jobs()
    output = Path('scale-authoring-evidence')
    if mode == 'verify':
        reports = output / 'reused-backend-reports'
        browser = output / 'reused-postgres'
        download('reports', reports)
        download('browser', browser)
        verify_reports(reports, browser, plan['tests']['backend'])
        frontend_reports = output / 'reused-frontend-reports'
        download('frontendReports', frontend_reports)
        verify_frontend_report(frontend_reports, plan['tests']['frontend'])
        (output / 'backend-reuse.json').write_text(json.dumps({'status': 'PASS', 'sourceRun': RUN, 'sourceHead': SOURCE, 'candidateHead': os.environ['GITHUB_SHA'], 'backendPassed': 174, 'originalFrontendPassed': 123, 'frontendRepairPaths': FRONTEND_REPAIR_PATHS, 'postgresPassed': 1, 'backendRebuilt': False, 'pgRepeated': False, 'mergeQualified': False, 'artifacts': ARTIFACTS}, indent=2))
    else:
        download('backend', output)
        assert (output / 'backend-head.txt').read_text().strip() == SOURCE
        assert (output / 'backend-run.txt').read_text().strip() == str(RUN)
    print('Fixed original backend evidence ' + mode + ' verified; no backend/PG work repeated')


if __name__ == '__main__':
    main()
