"""Bounded browser qualification, not local-test admission or merge readiness."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import time
import urllib.request
import urllib.error
import zipfile

ROOT = Path(__file__).resolve().parents[2]
E = ROOT / 'measurement-browser-evidence'
BINDING = ROOT / '.github/scripts/measurement-browser-bindings.json'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def sha(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def inventory(ref, excluded):
    rows = subprocess.check_output(['git', 'ls-tree', '-r', '-z', ref], cwd=ROOT).split(b'\0')
    return hashlib.sha256(b'\0'.join(row for row in rows if row and row.split(b'\t', 1)[1].decode() not in excluded)).hexdigest()


def write(name, data):
    E.mkdir(exist_ok=True)
    (E / name).write_text(json.dumps(data, indent=2) + '\n')


def validate_frontend_patch(binding):
    patch = binding['frontendLayoutRepair']
    for file, identity in patch['files'].items():
        assert git('ls-tree', 'HEAD', '--', file) == f"{identity['mode']} blob {identity['after']}\t{file}", 'Unreviewed product repair: ' + file
    assert inventory('HEAD', binding['addedTools'] + list(patch['files'])) == patch['stableSourceInventorySha256'], 'Other frozen source changed'
    assert production_inputs('frontend', list(patch['files'])) == patch['stableFrontendInventorySha256'], 'Other frontend inputs changed'
    rows = subprocess.check_output(['git', 'ls-tree', '-r', '-z', 'HEAD', '--', 'server-version/frontend'], cwd=ROOT).split(b'\0')
    original = []
    for row in rows:
        if not row: continue
        metadata, name = row.split(b'\t', 1)
        repair = patch['files'].get(name.decode())
        if repair:
            if repair['before'] is None: continue
            row = f"100644 blob {repair['before']}\t{name.decode()}".encode()
        original.append(row)
    assert hashlib.sha256(b'\0'.join(original)).hexdigest() == binding['fixedBuildSource']['components']['frontend']['productionInputSha256'], 'Original frontend identity not reconstructed by exact patch'



def scope():
    binding = json.loads(BINDING.read_text())
    head = git('rev-parse', 'HEAD')
    validate_frontend_patch(binding)
    for path in binding['addedTools']:
        entry = git('ls-tree', 'HEAD', '--', path)
        assert entry.startswith('100644 blob '), 'Missing or non-regular tool: ' + path
    assert os.environ.get('GITHUB_EVENT_NAME') == 'push', 'Push-only bounded qualification'
    assert os.environ.get('GITHUB_REF') == binding['branch'], 'Wrong candidate branch'
    assert os.environ.get('GITHUB_SHA') == head, 'Checkout SHA mismatch'
    subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--'], cwd=ROOT, check=True)
    plan = {'head': head, 'runId': os.environ['GITHUB_RUN_ID'], 'attempt': os.environ['GITHUB_RUN_ATTEMPT'],
            'sourceReference': binding['sourceReference'], 'productInventorySha256': binding['productInventorySha256'],
            'currentProductInventorySha256': inventory('HEAD', binding['addedTools']),
            'productInventoryMeaning': 'Original baseline identity retained; current source bound by current inventory and exact repair',
            'frontendLayoutRepair': binding['frontendLayoutRepair'],
            'tools': {p: git('rev-parse', 'HEAD:' + p) for p in binding['addedTools']},
            'localEvidence': {'status': 'reference-only / not executed or formally admitted by this workflow',
                              'path': 'docs/measurement-version/evidence/20261020-local-acceptance-status.md'},
            'claim': 'Bounded browser qualification only; not merge, release, or production qualification'}
    write('scope.json', plan)
    return plan


def execute(args, cwd, timeout=1200):
    subprocess.run(args, cwd=cwd, check=True, timeout=timeout)


def build(component):
    assert component == 'frontend', 'Only changed frontend may build in this repair round'
    plan = scope()
    folder = ROOT / 'server-version' / component
    report = {**plan, 'component': component, 'status': 'running', 'phases': [],
              'buildFlags': {key: os.environ.get(key) for key in ['VITE_COGNITIVE_MODULE_ENABLED', 'TZ']},
              'runtimeSourceAssets': 'Exact checkout retained; emitted app, not deployable image'}
    def phase(name, args):
        started = time.time()
        entry = {'name': name, 'status': 'running'}
        report['phases'].append(entry)
        write(component + '-build.json', report)
        try:
            execute(args, folder)
        except Exception:
            entry.update(status='failure', seconds=round(time.time() - started, 2))
            raise
        else:
            entry.update(status='success', seconds=round(time.time() - started, 2))
        finally:
            write(component + '-build.json', report)
    try:
        phase('locked official dependencies', ['npm', 'ci'])
        if component == 'backend':
            phase('Prisma generated client', ['node_modules/.bin/prisma', 'generate'])
            # Existing catalog prerequisites have no recorded matching local pass.
            # Preserve the actual production build; never add no-emit/tests.
            phase('production backend build and catalog prerequisites', ['npm', 'run', 'build'])
        else:
            phase('production Vite assets', ['npm', 'run', 'build'])
        assert (folder / 'dist' / ('index.js' if component == 'backend' else 'index.html')).is_file()
        required = ['dist/index.js', 'assets/sjt-upload-v1.xlsx', 'assets/sjt-upload-example-v1.xlsx'] if component == 'backend' else ['dist/index.html']
        if component == 'backend':
            required += ['dist/modules/cognitive/generated/' + name + '.js' for name in ['catalog', 'execution', 'presentation', 'scientific', 'seeds']]
            required += ['src/modules/cognitive/generated/identities.json']
        assert all((folder / item).is_file() for item in required), 'Required compiled registry/runtime assets missing'
        report['requiredFiles'] = {item: sha(folder / item) for item in required}
        archive = E / (component + '-build.tar.gz')
        execute(['tar', '-czf', str(archive), 'dist', 'node_modules'], folder)
        report.update(status='success', archiveSha256=sha(archive), componentTree=git('rev-parse', 'HEAD:server-version/' + component),
                      lockfileSha256=sha(folder / 'package-lock.json'))
    except Exception:
        report['status'] = 'failure'
        raise
    finally:
        write(component + '-build.json', report)


def validate_receipt(receipt, component, plan, archive_hash, tree, lock_hash):
    assert receipt['status'] == 'success', 'Failed producer'
    for key in ['head', 'runId', 'productInventorySha256']:
        assert receipt[key] == plan[key], 'Wrong artifact ' + key
    assert receipt['component'] == component
    assert receipt['buildFlags'] == {key: os.environ.get(key) for key in ['VITE_COGNITIVE_MODULE_ENABLED', 'TZ']}, 'Build flags missing or changed'
    assert receipt['componentTree'] == tree
    assert receipt['lockfileSha256'] == lock_hash
    assert receipt['archiveSha256'] == archive_hash, 'Archive content changed'


def production_inputs(component, excluded):
    excluded = {excluded} if isinstance(excluded, str) else set(excluded)
    rows = subprocess.check_output(['git', 'ls-tree', '-r', '-z', 'HEAD', '--', 'server-version/' + component], cwd=ROOT).split(b'\0')
    return hashlib.sha256(b'\0'.join(row for row in rows if row and row.split(b'\t', 1)[1].decode() not in excluded)).hexdigest()


def fixed_inputs(component):
    assert component == 'backend', 'Changed frontend must use a new current-run build, never the old artifact'
    source = json.loads(BINDING.read_text())['fixedBuildSource']
    pin = source['components'][component]
    fixture = source['fixtureRepair']
    assert git('rev-parse', 'HEAD:' + fixture['path']) == fixture['after'], 'Unreviewed fixture repair'
    assert production_inputs(component, fixture['path']) == pin['productionInputSha256'], 'Production build inputs changed'
    return source, pin


def api(route):
    repository = os.environ['GITHUB_REPOSITORY']
    assert repository == json.loads(BINDING.read_text())['fixedBuildSource']['repository']
    request = urllib.request.Request('https://api.github.com/repos/' + repository + route,
        headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def admit(component):
    plan = scope()
    source, pin = fixed_inputs(component)
    run = api('/actions/runs/' + source['runId'])
    assert str(run['id']) == source['runId'] and str(run['run_attempt']) == source['attempt']
    assert run['head_sha'] == source['head'] and run['head_branch'] == source['branch']
    assert run['event'] == 'push' and run['path'] == source['workflowPath']
    assert run['status'] == 'completed', 'Original run is not terminal'
    job = api('/actions/jobs/' + str(pin['jobId']))
    assert str(job['run_id']) == source['runId'] and str(job['run_attempt']) == source['attempt']
    assert job['head_sha'] == source['head'] and job['conclusion'] == 'success'
    assert job['name'] == 'production compile once / ' + component
    artifact = api('/actions/artifacts/' + str(pin['artifactId']))
    assert artifact['id'] == pin['artifactId'] and not artifact['expired']
    assert artifact['name'] == f"measurement-{source['runId']}-{source['head']}-{component}-build"
    assert artifact['size_in_bytes'] == pin['zipBytes'] and artifact['digest'] == 'sha256:' + pin['zipSha256']
    assert str(artifact['workflow_run']['id']) == source['runId'] and artifact['workflow_run']['head_sha'] == source['head']
    write(component + '-admission.json', {**plan, 'originalBuild': source, 'component': component,
          'status': 'admitted original successful build only; failed browser run remains failed'})
    return source, pin


def download_zip(source, pin, archive_name):
    E.mkdir(exist_ok=True)
    archive = E / archive_name
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    request = urllib.request.Request(f"https://api.github.com/repos/{source['repository']}/actions/artifacts/{pin['artifactId']}/zip",
        headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
    try:
        urllib.request.build_opener(NoRedirect).open(request, timeout=60)
        raise AssertionError('Expected signed artifact download redirect')
    except urllib.error.HTTPError as error:
        assert error.code == 302
        location = error.headers['Location']
        assert location.startswith('https://')
    # Never forward GitHub authorization to the signed storage URL.
    with urllib.request.urlopen(location, timeout=120) as response, archive.open('wb') as target:
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            assert total <= pin['zipBytes'], 'Oversized artifact'
            target.write(chunk)
    assert total == pin['zipBytes'] and sha(archive) == pin['zipSha256'], 'Official artifact bytes changed'
    return archive


def download_fixed(component):
    source, pin = admit(component)
    archive = download_zip(source, pin, component + '-official.zip')
    with zipfile.ZipFile(archive) as zipped:
        expected = {component + '-build.json', component + '-build.tar.gz'}
        assert set(zipped.namelist()) == expected, 'Unexpected artifact members'
        for name in expected:
            with zipped.open(name) as src, (E / name).open('wb') as dst:
                while chunk := src.read(1024 * 1024): dst.write(chunk)
    archive.unlink()
    return source, pin


def admin_fixture_slice(fixture):
    # Exact reviewed repair only: journeys-only Survey prerequisite body and
    # failure-only diagnostics. The separate whole-file before/after pin remains.
    fixture = fixture.replace("let prerequisiteStage = 'fixture-entry'\n", '')
    before, survey = fixture.split('async function surveyPrerequisites(runId: string) {', 1)
    _, after = survey.split('async function finals() {', 1)
    combined = before + 'async function finals() {' + after
    success, failure = combined.split('})().catch((error: unknown) => {', 1)
    _, cleanup = failure.split('}).finally(async () => {', 1)
    return success + '}).finally(async () => {' + cleanup


def admin_runner_success_slice(text):
    # Reverse only this reviewed failure-barrier overlay. Whole after blobs are
    # pinned separately; no unrelated edit can gain admission through this slice.
    text = text.split('})().catch(async error=>{', 1)[0]
    text = text.replace("const {guardRouteCallback}=require('./helpers/measurement-response-loss.cjs')\n", '')
    text = text.replace('blockedExternalRequests:[],callbackFailures:[],', 'blockedExternalRequests:[],')
    if 'function callbackFailure(scope)' in text:
        start = text.index('function callbackFailure(scope)')
        end = text.index('function save()', start)
        text = text[:start] + text[end:]
    text = text.replace("dialog=>dialog.accept().catch(()=>callbackFailure('admin-dialog'))", 'dialog=>dialog.accept()')
    text = text.replace("guardRouteCallback(async route=>{", "async route=>{")
    text = text.replace("},()=>callbackFailure('admin-response-loss')),{times:1})", "},{times:1})")
    text = text.replace("guardRouteCallback(route=>{", "route=>{")
    text = text.replace("},()=>callbackFailure('browser-network-route')))", "})")
    text = text.replace("  assert.equal(evidence.callbackFailures.length,0,'Asynchronous browser callback failure')\n", '')
    return text


def admin_locator_slice(text):
    return text.split('function labeledControl(scope, text, tag) {', 1)[1].split('async function responseData(response)', 1)[0]


def admin_inputs():
    binding = json.loads(BINDING.read_text())
    pin = binding['fixedAdminSource']
    fixed_inputs('backend'); validate_frontend_patch(binding)
    for file, blob in pin['unchangedTools'].items():
        repair = pin.get('reviewedTestToolRepairs', {}).get(file)
        if repair:
            assert repair['before'] == blob
            assert git('rev-parse', 'HEAD:' + file) == repair['after'], 'Unreviewed admin test-tool repair'
        else:
            assert git('rev-parse', 'HEAD:' + file) == blob, 'Admin tool input changed: ' + file
    if pin.get('reviewedTestToolRepairs'):
        runner = (ROOT / 'server-version/e2e/measurement-version-browser.cjs').read_text()
        journey = (ROOT / 'server-version/e2e/measurement-version-journeys.cjs').read_text()
        assert hashlib.sha256(admin_runner_success_slice(runner).encode()).hexdigest() == pin['adminRunnerSuccessSha256']
        assert hashlib.sha256(admin_locator_slice(journey).encode()).hexdigest() == pin['adminLocatorSha256']
        for file, blob in pin['newFailureGuardTools'].items():
            assert git('rev-parse', 'HEAD:' + file) == blob, 'Unreviewed failure guard'

    fixture = (ROOT / binding['fixedBuildSource']['fixtureRepair']['path']).read_text()
    admin_slice = admin_fixture_slice(fixture)
    assert hashlib.sha256(admin_slice.encode()).hexdigest() == pin['fixtureAdminSliceSha256'], 'Admin fixture inputs changed'
    workflow = (ROOT / '.github/workflows/ci-measurement-browser.yml').read_text()
    runtime = workflow.split('      NODE_ENV: test', 1)[1].split('    steps:', 1)[0]
    assert hashlib.sha256(runtime.encode()).hexdigest() == pin['runtimeConfigurationSha256'], 'Admin runtime inputs changed'
    return binding, pin


def validate_admin_result(result, pin):
    assert result['head'] == pin['head'] and result['status'] == 'PASS'
    assert result['selectedPhase'] == 'admin'
    assert result['pageErrors'] == [] and result['blockedExternalRequests'] == []
    assert len(result['checks']) == len(pin['requiredChecks'])
    assert {row['name'] for row in result['checks']} == set(pin['requiredChecks'])
    assert all(row['status'] == 'PASS' for row in result['checks'])


def admit_admin():
    plan = scope()
    binding, pin = admin_inputs()
    source = binding['fixedBuildSource']
    run = api('/actions/runs/' + pin['runId'])
    assert str(run['id']) == pin['runId'] and str(run['run_attempt']) == pin['attempt']
    assert run['head_sha'] == pin['head'] and run['head_branch'] == source['branch']
    assert run['event'] == 'push' and run['path'] == source['workflowPath'] and run['status'] == 'completed'
    job = api('/actions/jobs/' + str(pin['jobId']))
    assert str(job['run_id']) == pin['runId'] and str(job['run_attempt']) == pin['attempt']
    assert job['head_sha'] == pin['head'] and job['conclusion'] == 'success'
    assert job['name'] == 'missing measurement browser paths / admin'
    artifact = api('/actions/artifacts/' + str(pin['artifactId']))
    assert artifact['id'] == pin['artifactId'] and not artifact['expired']
    assert artifact['name'] == pin['artifactName'] and artifact['size_in_bytes'] == pin['zipBytes']
    assert artifact['digest'] == 'sha256:' + pin['zipSha256']
    assert str(artifact['workflow_run']['id']) == pin['runId'] and artifact['workflow_run']['head_sha'] == pin['head']
    archive = download_zip(source, pin, 'original-admin.zip')
    with zipfile.ZipFile(archive) as zipped:
        raw = zipped.read(pin['resultPath'])
        assert hashlib.sha256(raw).hexdigest() == pin['resultSha256']
        result = json.loads(raw)
        validate_admin_result(result, pin)
        original_scope = json.loads(zipped.read('eduK12-new-version/eduK12-new-version/measurement-browser-evidence/scope.json'))
        assert original_scope['head'] == pin['head'] and original_scope['runId'] == pin['runId']
        assert original_scope['attempt'] == pin['attempt']
        for file, blob in pin['unchangedTools'].items():
            assert original_scope['tools'][file] == blob, 'Original admin tool identity mismatch'
        assert original_scope['tools'][source['fixtureRepair']['path']] == pin['fixtureBefore']
        for component in ['backend', 'frontend']:
            consumed = json.loads(zipped.read(f'eduK12-new-version/eduK12-new-version/measurement-browser-evidence/{component}-consumed.json'))
            assert consumed['producerRunId'] == source['runId'] and consumed['producerHead'] == source['head']
            assert consumed['producerAttempt'] == source['attempt'] and consumed['status'] == 'verified'
            assert consumed['head'] == pin['head'] and consumed['runId'] == pin['runId'] and consumed['attempt'] == pin['attempt']
            assert consumed['archiveSha256'] == source['components'][component]['archiveSha256']
    archive.unlink()
    write('admin-admitted.json', {**plan, 'originalAdmin': pin, 'status': 'original admin success admitted, not re-executed',
          'checks': result['checks'], 'originalFailedJourneys': 'remains failed; only journeys executes now'})


def restore(component):
    plan = scope()
    folder = ROOT / 'server-version' / component
    if component == 'backend':
        source, pin = download_fixed(component)
    archive = E / (component + '-build.tar.gz')
    receipt = json.loads((E / (component + '-build.json')).read_text())
    if component == 'backend':
        assert sha(archive) == pin['archiveSha256']
        validate_receipt(receipt, component, {**plan, 'head': source['head'], 'runId': source['runId']}, sha(archive), pin['componentTree'], sha(folder / 'package-lock.json'))
        assert receipt['attempt'] == source['attempt'] and sha(E / (component + '-build.json')) == pin['receiptSha256']
        assert receipt['tools'][source['fixtureRepair']['path']] == source['fixtureRepair']['before'], 'Original fixture identity mismatch'
    else:
        validate_receipt(receipt, component, plan, sha(archive), git('rev-parse', 'HEAD:server-version/frontend'), sha(folder / 'package-lock.json'))
        assert receipt['currentProductInventorySha256'] == plan['currentProductInventorySha256']
        assert receipt['frontendLayoutRepair'] == plan['frontendLayoutRepair']
        assert int(receipt['attempt']) <= int(plan['attempt']), 'No future build attempt'
    # Backend retains original provenance; frontend is exact current-run build. Retain modes and internal npm
    # symlinks; reject absolute/traversal member names before extracting.
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            path = Path(member.name)
            assert not path.is_absolute() and '..' not in path.parts
            assert path.parts[0] in ['dist', 'node_modules']
    execute(['tar', '-xzf', str(archive)], folder)
    assert (folder / 'dist' / ('index.js' if component == 'backend' else 'index.html')).is_file()
    for relative, expected in receipt['requiredFiles'].items():
        file = Path(relative)
        assert not file.is_absolute() and '..' not in file.parts
        assert sha(folder / file) == expected, 'Required emitted/source asset changed: ' + relative
    write(component + '-consumed.json', {**plan, 'producerHead': receipt['head'], 'producerRunId': receipt['runId'], 'producerAttempt': receipt['attempt'], 'archiveSha256': receipt['archiveSha256'], 'status': 'verified'})


def tls():
    assert os.environ.get('MEASUREMENT_BROWSER_EPHEMERAL_CA_APPROVED') == 'true', 'Explicit one-run profile-only CA approval required'
    assert os.environ.get('GITHUB_ACTIONS') == 'true'
    private = Path(os.environ['MEASUREMENT_BROWSER_FIXTURE_DIR'])
    cert = private / 'tls'
    cert.mkdir(mode=0o700)
    home = private / 'browser-home'
    nss = home / '.pki/nssdb'
    nss.mkdir(parents=True, mode=0o700)
    commands = [
        ['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', str(cert / 'ca.key'), '-out', str(cert / 'ca.crt'), '-subj', '/CN=Measurement isolated browser only'],
        ['openssl', 'req', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(cert / 'site.key'), '-out', str(cert / 'site.csr'), '-subj', '/CN=training.eduk12.top'],
    ]
    (cert / 'ext.cnf').write_text('subjectAltName=DNS:training.eduk12.top,DNS:survey.eduk12.top\n')
    commands += [
        ['openssl', 'x509', '-req', '-in', str(cert / 'site.csr'), '-CA', str(cert / 'ca.crt'), '-CAkey', str(cert / 'ca.key'), '-CAcreateserial', '-out', str(cert / 'site.crt'), '-days', '1', '-extfile', str(cert / 'ext.cnf')],
        ['certutil', '-N', '-d', 'sql:' + str(nss), '--empty-password'],
        ['certutil', '-A', '-n', 'measurement-isolated-browser', '-t', 'C,,', '-i', str(cert / 'ca.crt'), '-d', 'sql:' + str(nss)],
    ]
    for command in commands:
        subprocess.run(command, cwd=ROOT, check=True, timeout=30, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for key in cert.glob('*.key'):
        key.chmod(0o600)
    with open(os.environ['GITHUB_ENV'], 'a') as output:
        for key, value in {'MEASUREMENT_BROWSER_TLS_CA': cert / 'ca.crt', 'MEASUREMENT_BROWSER_TLS_CERT': cert / 'site.crt', 'MEASUREMENT_BROWSER_TLS_KEY': cert / 'site.key', 'MEASUREMENT_BROWSER_PROFILE_HOME': home}.items():
            output.write(f'{key}={value}\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['scope', 'build', 'restore', 'tls', 'admit', 'admit-admin'])
    parser.add_argument('component', nargs='?', choices=['backend', 'frontend'])
    args = parser.parse_args()
    if args.action in ['scope', 'tls', 'admit-admin']:
        globals()[args.action.replace('-', '_')]()
    else:
        assert args.component
        globals()[args.action](args.component)
