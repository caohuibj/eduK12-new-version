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


def scope():
    binding = json.loads(BINDING.read_text())
    head = git('rev-parse', 'HEAD')
    assert inventory('HEAD', binding['addedTools']) == binding['productInventorySha256'], 'Frozen source inventory changed'
    for path in binding['addedTools']:
        entry = git('ls-tree', 'HEAD', '--', path)
        assert entry.startswith('100644 blob '), 'Missing or non-regular tool: ' + path
    assert os.environ.get('GITHUB_EVENT_NAME') == 'push', 'Push-only bounded qualification'
    assert os.environ.get('GITHUB_REF') == binding['branch'], 'Wrong candidate branch'
    assert os.environ.get('GITHUB_SHA') == head, 'Checkout SHA mismatch'
    subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--'], cwd=ROOT, check=True)
    plan = {'head': head, 'runId': os.environ['GITHUB_RUN_ID'], 'attempt': os.environ['GITHUB_RUN_ATTEMPT'],
            'sourceReference': binding['sourceReference'], 'productInventorySha256': binding['productInventorySha256'],
            'tools': {p: git('rev-parse', 'HEAD:' + p) for p in binding['addedTools']},
            'localEvidence': {'status': 'reference-only / not executed or formally admitted by this workflow',
                              'path': 'docs/measurement-version/evidence/20261020-local-acceptance-status.md'},
            'claim': 'Bounded browser qualification only; not merge, release, or production qualification'}
    write('scope.json', plan)
    return plan


def execute(args, cwd, timeout=1200):
    subprocess.run(args, cwd=cwd, check=True, timeout=timeout)


def build(component):
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
    rows = subprocess.check_output(['git', 'ls-tree', '-r', '-z', 'HEAD', '--', 'server-version/' + component], cwd=ROOT).split(b'\0')
    return hashlib.sha256(b'\0'.join(row for row in rows if row and row.split(b'\t', 1)[1].decode() != excluded)).hexdigest()


def fixed_inputs(component):
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


def download_fixed(component):
    source, pin = admit(component)
    E.mkdir(exist_ok=True)
    archive = E / (component + '-official.zip')
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
    with zipfile.ZipFile(archive) as zipped:
        expected = {component + '-build.json', component + '-build.tar.gz'}
        assert set(zipped.namelist()) == expected, 'Unexpected artifact members'
        for name in expected:
            with zipped.open(name) as src, (E / name).open('wb') as dst:
                while chunk := src.read(1024 * 1024): dst.write(chunk)
    archive.unlink()
    return source, pin


def restore(component):
    plan = scope()
    source, pin = download_fixed(component)
    folder = ROOT / 'server-version' / component
    archive = E / (component + '-build.tar.gz')
    assert sha(archive) == pin['archiveSha256']
    receipt = json.loads((E / (component + '-build.json')).read_text())
    validate_receipt(receipt, component, {**plan, 'head': source['head'], 'runId': source['runId']}, sha(archive), pin['componentTree'], sha(folder / 'package-lock.json'))
    assert receipt['attempt'] == source['attempt'] and sha(E / (component + '-build.json')) == pin['receiptSha256']
    assert receipt['tools'][source['fixtureRepair']['path']] == source['fixtureRepair']['before'], 'Original fixture identity mismatch'
    # Only the pinned original successful producer outputs are accepted. Retain modes and internal npm
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
    parser.add_argument('action', choices=['scope', 'build', 'restore', 'tls', 'admit'])
    parser.add_argument('component', nargs='?', choices=['backend', 'frontend'])
    args = parser.parse_args()
    if args.action in ['scope', 'tls']:
        globals()[args.action]()
    else:
        assert args.component
        globals()[args.action](args.component)
