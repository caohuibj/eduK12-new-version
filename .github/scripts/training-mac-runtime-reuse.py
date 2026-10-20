"""Exact successful phases from failed Mac run 39510605714; never whole-run success."""
import ast
import hashlib
import json
from pathlib import Path
import zipfile

PHASES = ('backend-compile', 'frontend-compile', 'frontend-app-types', 'changed-lint')
PIN = {'head': 'bd438db68051c1c914240eebfda52d94287e8075', 'sourceHead': '024c0fe09d390c655a4e90c1090adb7c2033d6e5', 'tree': 'aef710411a79539d84c94fae7660f28760439a39', 'planSha256': 'f3076008f99e3dabb5276f47e4875439d5c1fd5bdae83158fc0d259c6b7db80f', 'inputsSha256': 'df22684ddeb0584d80b31b7864b971a41f7f3c0f41a296a04701a47c08b18ecd', 'runId': '39510605714', 'attempt': 1, 'jobId': 118930461696, 'jobName': 'exact-candidate / integrated Mac candidate qualification / fixed Mac inputs and missing affected qualification', 'resultSha256': 'f8cd70dd04d4cee06e58d6d94fa18ee86b49aaa3dee26b40b5c29bdce0f67bf7'}
ARTIFACTS = {'results': {'artifactId': 12306185116, 'artifactName': 'training-mac-results-bd438db68051c1c914240eebfda52d94287e8075-1', 'zipBytes': 19460, 'zipSha256': 'b5aa3a4f49395b48661a8da435b9267df44f16cbcadc784a7413fddab180b91e'}, 'backend': {'artifactId': 12305991707, 'artifactName': 'training-mac-backend-compiled-bd438db68051c1c914240eebfda52d94287e8075-1', 'zipBytes': 14134680, 'zipSha256': '1740f4c97ceaff662b6c351f7a3e1c6b46907ac6d810634c81d323f6c9d8549c', 'archiveSha256': '9f2fccb4d67024056593c1bca760b2bc4114ca1876eb653916305d69f8e71a94', 'archiveBytes': 14207949, 'receiptSha256': 'a6a62b7306d05c10f29bddbfda46e58ab2712d13f62e7bcd671193bf493881b2'}, 'frontend': {'artifactId': 12305612095, 'artifactName': 'training-mac-frontend-compiled-bd438db68051c1c914240eebfda52d94287e8075-1', 'zipBytes': 22336220, 'zipSha256': 'e4f7a125d3ba6d6df5d92f89feaa940b8d23f48294712ace7cb4d9d92f776efc', 'archiveSha256': 'cb94100fc0ab65175d57ccb03a6abddd481f5d44aca36624c5be38e30495bdd8', 'archiveBytes': 22330865, 'receiptSha256': 'ca6c82a3ad5d5e435c009eb27037434080cf7d744bc55d3df3634c8a99668334'}}
CONSUMED_SHA256 = '921d08a15e43c610e0d2dbf1e2f42a4a845756ca3eaedf3097579cd7d2a66046'
INPUTS_SHA256 = '35d16e5bace780d922e3139a55766104840b15d3adaffc155d916414673d2bbe'


def require(ok, message):
    if not ok: raise ValueError(message)


def consumed_hash(source):
    tree = ast.parse(source)
    classes = [c for c in tree.body if isinstance(c, ast.ClassDef) and c.name == 'MacQualification']
    require(len(classes) == 1, 'Missing exact runtime class')
    classes[0].body = [n for n in classes[0].body if not isinstance(n, ast.FunctionDef) or n.name not in ('execute', 'browser', 'restore_compilation')]
    return hashlib.sha256(ast.dump(tree, include_attributes=False).encode()).hexdigest()


def input_hash(raw):
    value = json.loads(raw)
    # Only the failed browser fixture changed. All successful consumed inputs stay pinned.
    value['macRuntime'].pop('browserScriptBlob')
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def validate_artifact(artifact, pin):
    require(artifact['id'] == pin['artifactId'] and artifact['name'] == pin['artifactName'] and artifact['expired'] is False, 'Original artifact unavailable')
    require(artifact['size_in_bytes'] == pin['zipBytes'] and artifact['digest'] == 'sha256:' + pin['zipSha256'], 'Original artifact identity changed')
    require(str(artifact['workflow_run']['id']) == PIN['runId'] and artifact['workflow_run']['head_sha'] == PIN['sourceHead'], 'Wrong artifact producer')


def validate_records(run, job, raw, inputs, source):
    p = PIN
    require(str(run['id']) == p['runId'] and run['run_attempt'] == p['attempt'], 'Wrong prior run')
    require(run['head_sha'] == p['sourceHead'] and run['head_branch'] == 'work/training-mac-ui-final-20261020', 'Wrong prior source')
    require(run['event'] == 'pull_request' and run['path'] == '.github/workflows/ci.yml', 'Wrong prior workflow')
    require(all(run[k]['full_name'] == 'caohuibj/eduK12-new-version' for k in ('repository', 'head_repository')), 'Wrong repository')
    require(job['id'] == p['jobId'] and str(job['run_id']) == p['runId'] and job['run_attempt'] == p['attempt'] and job['head_sha'] == p['sourceHead'], 'Wrong prior job')
    require(job['name'] == p['jobName'] and job['status'] == 'completed' and job['conclusion'] == 'failure', 'Original failed job must remain failed')
    require(hashlib.sha256(raw).hexdigest() == p['resultSha256'], 'Original raw result changed')
    require(input_hash(inputs) == INPUTS_SHA256 and consumed_hash(source) == CONSUMED_SHA256, 'Successful consumed input or helper drift')
    result = json.loads(raw)
    require(result['candidate'] == 'training-mac' and result['status'] == 'failure', 'Original failure missing')
    for key in ('head', 'sourceHead', 'tree', 'planSha256', 'inputsSha256'): require(result[key] == p[key], 'Original result binding changed')
    require(result['consumerRunId'] == p['runId'] and result['consumerAttempt'] == str(p['attempt']), 'Original execution changed')
    expected = ['prepare', *PHASES, 'dependency-audit', 'compiled-browser']
    require([r['name'] for r in result['phases']] == expected, 'Original phase set changed')
    for row in result['phases']:
        require(row['status'] == ('failure' if row['name'] == 'compiled-browser' else 'success'), 'Original phase status changed')
        for key in ('head', 'sourceHead', 'tree', 'inputsSha256', 'consumerRunId', 'consumerAttempt'): require(row[key] == result[key], 'Phase binding changed')
    return {r['name']: r for r in result['phases'] if r['name'] in PHASES}


def zip_member(path, member, limit):
    with zipfile.ZipFile(path) as z:
        require(z.namelist().count(member) == 1 and z.getinfo(member).file_size <= limit, 'Missing/duplicate/oversized archive member')
        return z.read(member)


def admit_reusable_phases(q):
    q.ready('prepare')
    run = q.api('/actions/runs/' + PIN['runId'] + '/attempts/1')
    job = q.api('/actions/jobs/' + str(PIN['jobId']))
    files = {}
    for component, pin in ARTIFACTS.items():
        validate_artifact(q.api('/actions/artifacts/' + str(pin['artifactId'])), pin)
        target = q.private / ('prior-mac-' + component + '.zip')
        q.download({**pin, 'repository': 'caohuibj/eduK12-new-version'}, target)
        require(target.stat().st_size == pin['zipBytes'] and hashlib.sha256(target.read_bytes()).hexdigest() == pin['zipSha256'], 'Downloaded archive changed')
        files[component] = target
    raw = zip_member(files['results'], 'training-mac-evidence/runtime-result.json', 1024 * 1024)
    root = Path(__file__).parent
    phases = validate_records(run, job, raw, (root / 'training-mac-inputs.json').read_bytes(), (root / 'training-mac-runtime.py').read_text())
    archives = {}
    for component in ('backend', 'frontend'):
        pin = ARTIFACTS[component]
        archive_name = component + '-compiled.tar.gz'; receipt_name = component + '-compile.json'
        with zipfile.ZipFile(files[component]) as z:
            require(sorted(z.namelist()) == sorted([archive_name, receipt_name]), 'Unexpected compile ZIP members')
        receipt = zip_member(files[component], receipt_name, 1024 * 1024)
        require(hashlib.sha256(receipt).hexdigest() == pin['receiptSha256'] and json.loads(receipt) == phases[component + '-compile'], 'Original compile receipt changed')
        archive = zip_member(files[component], archive_name, pin['archiveBytes'])
        require(len(archive) == pin['archiveBytes'] and hashlib.sha256(archive).hexdigest() == pin['archiveSha256'], 'Original compiled bytes changed')
        require(phases[component + '-compile']['details']['archiveSha256'] == pin['archiveSha256'], 'Compiled output receipt mismatch')
        target = q.private / ('prior-' + archive_name); target.write_bytes(archive); archives[component] = target
    return {'phases': phases, 'archives': archives}
