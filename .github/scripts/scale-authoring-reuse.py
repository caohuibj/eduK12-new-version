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
FRONTEND_SOURCE = '9b289945f5c782b98027ff7228c344c362247e17'
FRONTEND_RUN = 39565491980
FRONTEND_TYPE_FIXES = ['server-version/frontend/src/pages/__tests__/ScaleEdit.authoring.test.tsx', 'server-version/frontend/src/pages/__tests__/ScaleEdit.persistence-boundaries.test.tsx']
TITLE = 'persists quality-item raw answers and frozen image feedback without scoring quality items'
ARTIFACTS = {
    'currentFrontend': (12330195734, 'scale-frontend-' + FRONTEND_SOURCE, 127259545, '8ba6190c5f4f84c9fcb49cd76f692c0de2f6c71345f9b134ae6f70134ba896de'),
    'currentFrontendReports': (12329676846, 'scale-frontend-reports-' + FRONTEND_SOURCE, 29808, 'bcbd561e2ba6062a7195f77e8a39394f0986f6b85f465b94aeee3f3b495f8d04'),
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
    run, source = (FRONTEND_RUN, FRONTEND_SOURCE) if key.startswith('currentFrontend') else (RUN, SOURCE)
    assert meta['workflow_run']['id'] == run and meta['workflow_run']['head_sha'] == source


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


def check_frontend_resume_closure():
    unchanged(sorted(FRONTEND_TYPE_FIXES), sorted(git('diff', '--name-only', FRONTEND_SOURCE, 'HEAD', '--', 'server-version/frontend').splitlines()), 'frontend compiler product/dependency closure; only reviewed type-option test fixes allowed')
    original = json.loads(git('show', FRONTEND_SOURCE + ':.github/scripts/scale-authoring-bindings.json'))
    current = json.loads(Path('.github/scripts/scale-authoring-bindings.json').read_text())
    unchanged(original['tests']['frontend'], current['tests']['frontend'], 'original 70-assertion selected files')
    run = api('runs/' + str(FRONTEND_RUN))
    assert run['id'] == FRONTEND_RUN and run['head_sha'] == FRONTEND_SOURCE and run['run_attempt'] == 1
    job = api('jobs/119106743241')
    assert job['run_id'] == FRONTEND_RUN and job['head_sha'] == FRONTEND_SOURCE and job['name'] == 'build (frontend)'
    matches = [step for step in job['steps'] if step['name'] == 'one locked build and cached runtime assembly']
    assert len(matches) == 1 and matches[0]['conclusion'] == 'success'
    return original


def verify_current_frontend_report(reports, selected):
    test = json.loads((reports / 'frontend-tests.json').read_text())
    assert test['success'] is True and test['numPassedTests'] == 70 and test['numFailedTests'] == 0 and test['numFailedTestSuites'] == 0 and test['numPendingTests'] == 0
    assert sorted(x['name'].split('/server-version/frontend/', 1)[1] for x in test['testResults']) == sorted(selected)
    assert all(x['assertionResults'] and all(a['status'] == 'passed' for a in x['assertionResults']) for x in test['testResults'])
    audit = json.loads((reports / 'frontend-audit.json').read_text())['metadata']['vulnerabilities']
    assert audit['high'] == 0 and audit['critical'] == 0
    output = json.loads((reports / 'frontend-runtime-output.json').read_text())
    assert output['head'] == FRONTEND_SOURCE and output['sameCompilerOutput'] is True and output['files']


def verify_frontend_bytes():
    root = Path('server-version/frontend')
    output = json.loads(Path('scale-authoring-evidence/frontend-runtime-output.json').read_text())
    assert output['head'] == FRONTEND_SOURCE and output['sameCompilerOutput'] is True
    actual = {str(file.relative_to(root / 'dist')): hashlib.sha256(file.read_bytes()).hexdigest() for file in (root / 'dist').rglob('*') if file.is_file()}
    assert actual and actual == output['files'], 'Compiled frontend file set or bytes changed'
    lock = json.loads((root / 'package-lock.json').read_text())
    for tool in ['typescript', 'eslint']:
        version = json.loads((root / 'node_modules' / tool / 'package.json').read_text())['version']
        assert version == lock['packages']['node_modules/' + tool]['version'], 'Restored tool identity differs from unchanged lock'


def verify_sast_boundary():
    roots = ['server-version/backend/src', 'server-version/backend/scripts', 'server-version/frontend/src', 'server-version/e2e', '.github/scripts']
    changed = set(git('diff', '--name-only', FRONTEND_SOURCE, 'HEAD', '--', *roots).splitlines())
    # These exact reviewed Python/data controls are not JavaScript/TypeScript inputs.
    controls = {'.github/scripts/scale-authoring-reuse.py', '.github/scripts/scale-authoring-reuse.test.py', '.github/scripts/scale-authoring-bindings.json'}
    unchanged(set(FRONTEND_TYPE_FIXES), changed - controls, 'CodeQL input boundary (all original roots, including JSX/MTS/CTS and dependency configs)')
    old = git('show', FRONTEND_SOURCE + ':.github/workflows/ci-scale-authoring.yml')
    current = Path('.github/workflows/ci-scale-authoring.yml').read_text()
    original_config = 'paths: [server-version/backend/src, server-version/backend/scripts, server-version/frontend/src, server-version/e2e, .github/scripts]'
    new_config = 'paths: [' + ', '.join(FRONTEND_TYPE_FIXES) + ']'
    def query_options(text):
        text = text.replace('@' + 'ce5e7eeac396d720fe2d802714996c8ce561e311', '@v3')
        return text.split('      - uses: github/codeql-action/init@v3\n', 1)[1].split('      - uses: actions/upload-artifact@v4\n', 1)[0]
    unchanged(query_options(old).replace(original_config, new_config), query_options(current.split('      - name: verify same original CodeQL tool and query pack')[0]), 'CodeQL language/query/tool invocation options (only exact input paths may change)')
    job = api('jobs/119106743347')
    assert job['run_id'] == FRONTEND_RUN and job['head_sha'] == FRONTEND_SOURCE and job['name'] == 'sast' and job['conclusion'] == 'success', 'Original full analysis has not succeeded; do not substitute the partial scan'
    output = Path('scale-authoring-evidence'); output.mkdir(exist_ok=True)
    (output / 'sast-input-boundary.json').write_text(json.dumps({'originalRun': FRONTEND_RUN, 'originalHead': FRONTEND_SOURCE, 'originalFullAnalysis': 'success', 'currentHead': os.environ['GITHUB_SHA'], 'currentAnalysisPaths': FRONTEND_TYPE_FIXES, 'currentFullRepositoryScan': False, 'pythonAndWorkflowReview': 'independent static control review; not claimed CodeQL coverage'}, indent=2))



def verify_sast_tools():
    reports = list(Path('scale-authoring-evidence/sarif').glob('*.sarif'))
    assert reports, 'Missing actual CodeQL output'
    for report in reports:
        runs = json.loads(report.read_text())['runs']
        assert runs, 'Empty CodeQL output'
        for run in runs:
            assert run['tool']['driver']['semanticVersion'] == '2.27.2', 'CodeQL CLI changed from original evidence'
            packs = [x for x in run['tool']['extensions'] if x['name'] == 'codeql/javascript-queries']
            assert len(packs) == 1 and packs[0]['semanticVersion'] == '2.4.7+a7057b836bf29767461026718b14d20790b9085f', 'CodeQL query pack changed from original evidence'


def main():
    mode = sys.argv[1]
    assert mode in ['verify', 'restore', 'restore-frontend', 'frontend-bytes', 'sast-boundary', 'sast-tools']
    if mode == 'sast-tools':
        verify_sast_tools()
        return
    if mode == 'sast-boundary':
        verify_sast_boundary()
        return
    if mode == 'frontend-bytes':
        verify_frontend_bytes()
        return
    plan = check_closure()
    verify_jobs()
    output = Path('scale-authoring-evidence')
    if mode == 'restore-frontend':
        current_plan = check_frontend_resume_closure()
        download('currentFrontend', output)
        assert (output / 'frontend-head.txt').read_text().strip() == FRONTEND_SOURCE
        assert (output / 'frontend-run.txt').read_text().strip() == str(FRONTEND_RUN)
        verify_current_frontend_report(output, current_plan['tests']['frontend'])
    elif mode == 'verify':
        reports = output / 'reused-backend-reports'
        browser = output / 'reused-postgres'
        download('reports', reports)
        download('browser', browser)
        verify_reports(reports, browser, plan['tests']['backend'])
        frontend_reports = output / 'reused-frontend-reports'
        download('frontendReports', frontend_reports)
        verify_frontend_report(frontend_reports, plan['tests']['frontend'])
        current_plan = check_frontend_resume_closure()
        current_reports = output / 'reused-current-frontend-reports'
        download('currentFrontendReports', current_reports)
        verify_current_frontend_report(current_reports, current_plan['tests']['frontend'])
        (output / 'frontend-resume.json').write_text(json.dumps({'sourceRun': FRONTEND_RUN, 'sourceHead': FRONTEND_SOURCE, 'candidateHead': os.environ['GITHUB_SHA'], 'originalAssertionsPassed': 70, 'auditRepeated': False, 'testsRepeated': False, 'compilerRepeated': False, 'runtimeReassemblyPlanned': True, 'typecheckAndLintPending': True}, indent=2))
        (output / 'backend-reuse.json').write_text(json.dumps({'status': 'PASS', 'sourceRun': RUN, 'sourceHead': SOURCE, 'candidateHead': os.environ['GITHUB_SHA'], 'backendPassed': 174, 'originalFrontendPassed': 123, 'frontendRepairPaths': FRONTEND_REPAIR_PATHS, 'postgresPassed': 1, 'backendRebuilt': False, 'pgRepeated': False, 'mergeQualified': False, 'artifacts': ARTIFACTS}, indent=2))
    else:
        download('backend', output)
        assert (output / 'backend-head.txt').read_text().strip() == SOURCE
        assert (output / 'backend-run.txt').read_text().strip() == str(RUN)
    print('Fixed original backend evidence ' + mode + ' verified; no backend/PG work repeated')


if __name__ == '__main__':
    main()
