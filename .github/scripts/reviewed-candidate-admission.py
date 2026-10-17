"""Single-origin official receipt admission and missing runtime checks only.

No fallback build/test/scan, multi-run chain, local-test promotion or expiry renewal.
The exact source manifest is reviewable data; the transport helpers are existing CI code.
"""
import argparse
import ast
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
E = ROOT / 'reviewed-candidate-evidence'
PRIVATE = ROOT / 'reviewed-candidate-private'
MANIFEST = ROOT / '.github/scripts/reviewed-candidate-source.json'
M = json.loads(MANIFEST.read_text())


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


transport = module('official_transport', '.github/scripts/access-efficiency-reuse.py')


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True, timeout=30).strip()


def run(args, timeout=120, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, timeout=timeout, **kwargs)


def output(args, timeout=60):
    return subprocess.check_output(args, cwd=ROOT, text=True, timeout=timeout).strip()


def write(name, data):
    E.mkdir(exist_ok=True)
    (E / name).write_text(json.dumps(data, indent=2) + '\n')


def phase(record, name, function):
    require(name not in [x['name'] for x in record['phases']], 'Phase already executed')
    entry = {'name': name, 'status': 'running'}
    record['phases'].append(entry)
    started = time.monotonic()
    try:
        function()
        entry['status'] = 'success'
    except BaseException as error:
        entry.update(status='failure', errorType=type(error).__name__)
        raise
    finally:
        entry['seconds'] = round(time.monotonic() - started, 3)
        write(record['report'], record)


def validate_run(actual, jobs, manifest=M):
    expected = manifest['source']
    for key, value in {'id': expected['run'], 'head_sha': expected['head'],
                       'head_branch': expected['branch'], 'event': expected['event'],
                       'path': expected['workflow'], 'run_attempt': expected['attempt'],
                       'status': 'completed', 'conclusion': 'success'}.items():
        require(actual.get(key) == value, 'Official run mismatch: ' + key)
    require(actual.get('repository', {}).get('full_name') == manifest['repository'], 'Wrong repository')
    require(actual.get('head_repository', {}).get('full_name') == manifest['repository'], 'Wrong head repository')
    wanted = {item['id']: item['name'] for item in expected['jobs']}
    require(len(jobs) == len(wanted) and {j['id']: j['name'] for j in jobs} == wanted, 'Official job identities changed')
    for job in jobs:
        require(job.get('run_id') == expected['run'] and job.get('head_sha') == expected['head'], 'Job source mismatch')
        require(job.get('status') == 'completed' and job.get('conclusion') == 'success', 'Non-success official job')
        require(transport.recent(job.get('completed_at')), 'Expired official job')


def validate_artifact(actual, expected, manifest=M):
    require(not actual.get('expired'), 'Expired artifact')
    for actual_key, expected_key in [('id', 'id'), ('name', 'name'), ('size_in_bytes', 'size'), ('digest', 'digest'), ('created_at', 'createdAt')]:
        require(actual.get(actual_key) == expected[expected_key], 'Artifact metadata changed: ' + actual_key)
    require(actual.get('workflow_run', {}).get('id') == manifest['source']['run'], 'Wrong artifact run')
    require(actual.get('workflow_run', {}).get('head_sha') == manifest['source']['head'], 'Wrong artifact source')
    require(transport.recent(actual.get('created_at')), 'Original artifact exceeds 24 hours')
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', actual.get('digest', '')), 'Missing official digest')


def validate_members(infos, names):
    require(len(infos) == len(names) and {i.filename for i in infos} == set(names), 'Unexpected ZIP members')
    for info in infos:
        require('/' not in info.filename and '\\' not in info.filename and info.filename not in ('.', '..'), 'Unsafe ZIP path')
        require(not info.is_dir() and ((info.external_attr >> 16) & 0o170000) != 0o120000, 'ZIP symlink/directory refused')
        require(info.file_size <= 2_000_000_000, 'Oversized archive member')


def source_scope():
    require(os.environ.get('CI') == 'true' and os.environ.get('GITHUB_ACTIONS') == 'true', 'Actions-only admission')
    require(os.environ.get('GITHUB_EVENT_NAME') == 'pull_request', 'Ready PR required')
    require(os.environ.get('GITHUB_REPOSITORY') == M['repository'], 'Repository mismatch')
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    pr = event['pull_request']
    require(pr['head']['repo']['full_name'] == M['repository'] and not pr['draft'], 'Same-repository ready PR required')
    require(pr['number'] == int(os.environ['PR_NUMBER']), 'PR number mismatch')
    require(pr['base']['sha'] == M['base'] and os.environ.get('CI_BASE_SHA') == M['base'], 'Main moved')
    require(transport.api('/git/ref/heads/main')['object']['sha'] == M['base'], 'Current main moved')
    current_pr = transport.api('/pulls/' + str(pr['number']))
    require(current_pr['head']['sha'] == pr['head']['sha'] and current_pr['base']['sha'] == M['base'] and current_pr['state'] == 'open' and not current_pr['draft'], 'Current PR changed')
    head = git('rev-parse', 'HEAD')
    require(pr['head']['sha'] == os.environ.get('CANDIDATE_HEAD_SHA'), 'PR head changed')
    require(git('rev-parse', head + '^{tree}') == git('rev-parse', pr['head']['sha'] + '^{tree}'), 'PR merge tree differs from reviewed head')
    require(git('rev-parse', M['source']['head'] + '^{tree}') == M['source']['tree'], 'Original source tree changed')
    run(['git', 'merge-base', '--is-ancestor', M['source']['head'], pr['head']['sha']], 30)
    run(['git', 'merge-base', '--is-ancestor', M['base'], pr['head']['sha']], 30)
    plan = json.loads((ROOT / 'reviewed-candidate-plan.json').read_text())
    require(plan['base'] == M['base'] and plan['head'] == head and plan['route'] == 'reviewed-candidate', 'Plan checkout mismatch')
    for component, tree in plan['components'].items():
        require(git('rev-parse', head + ':server-version/' + component) == tree, 'Product input changed')
    for file, binding in M['files'].items():
        expected = M.get('frontendPatch', {}).get('files', {}).get(file, binding)['after']
        require(git('rev-parse', head + ':' + file) == expected, 'Reviewed candidate blob changed: ' + file)
    for file, blob in M['unchangedConsumers'].items():
        require(git('rev-parse', head + ':' + file) == blob, 'Supporting consumer changed: ' + file)
    # Independently recompute the actual full diff using the same fail-closed plan.
    script = "import{changedEntries}from'./.github/scripts/content-scope.mjs';import{reviewedCandidatePlan}from'./.github/scripts/reviewed-candidate-scope.mjs';console.log(JSON.stringify(reviewedCandidatePlan(changedEntries(process.argv[1],process.argv[2]),process.argv[1],process.argv[2])));"
    recomputed = json.loads(output(['node', '--input-type=module', '-e', script, M['base'], head]))
    require(recomputed == plan, 'Recomputed scope differs')
    return head


def download(expected, members):
    path = PRIVATE / (str(expected['id']) + '.zip')
    request = urllib.request.Request('https://api.github.com/repos/' + M['repository'] + '/actions/artifacts/' + str(expected['id']) + '/zip',
                                     headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN']})
    with transport.opener.open(request, timeout=60) as response, path.open('wb') as sink:
        while chunk := response.read(1024 * 1024):
            sink.write(chunk)
    require(path.stat().st_size == expected['size'] and 'sha256:' + file_sha(path) == expected['digest'], 'Official ZIP digest/size mismatch')
    target = PRIVATE / str(expected['id']); target.mkdir()
    with zipfile.ZipFile(path) as archive:
        validate_members(archive.infolist(), members)
        for name in members:
            with archive.open(name) as source, (target / name).open('wb') as sink:
                shutil.copyfileobj(source, sink)
    path.unlink()
    return target


def admit():
    head = source_scope()
    source = M['source']
    actual = transport.api('/actions/runs/' + str(source['run']))
    jobs = transport.api('/actions/runs/' + str(source['run']) + '/attempts/' + str(source['attempt']) + '/jobs?per_page=100')
    require(jobs['total_count'] == len(jobs['jobs']), 'Truncated source jobs')
    validate_run(actual, jobs['jobs'])
    artifacts = transport.api('/actions/runs/' + str(source['run']) + '/artifacts?per_page=100')
    require(artifacts['total_count'] == len(artifacts['artifacts']), 'Truncated artifacts')
    by_id = {a['id']: a for a in artifacts['artifacts']}
    expected = {a['id']: a for a in source['artifacts']}
    require(set(by_id) == set(expected), 'Unexpected source artifacts')
    for artifact_id, item in expected.items():
        validate_artifact(by_id[artifact_id], item)
    reports = {}
    for artifact_id, digests in M['reportDigests'].items():
        directory = download(expected[int(artifact_id)], digests)
        for name, digest in digests.items():
            raw = (directory / name).read_bytes()
            require(sha(raw) == digest, 'Original report bytes changed')
            value = json.loads(raw)
            if name in reports:
                require(reports[name] == value, 'Conflicting same-origin reports')
            reports[name] = value
    validate_reports(reports)
    receipt = {'schema': 1, 'status': 'success', 'currentHead': head, 'prHead': os.environ['CANDIDATE_HEAD_SHA'],
               'sourceSha': source['head'], 'sourceRun': source['run'], 'sourceTree': source['tree'],
               'originalArtifactCreatedAt': {str(a['id']): a['createdAt'] for a in expected.values()},
               'artifactDigests': {str(a['id']): a['digest'] for a in expected.values()},
               'components': M['components'], 'images': M['images'],
               'originalFrontendProofIsBaselineOnly': bool(M.get('frontendPatch')),
               'claim': 'Original backend and unchanged dependency evidence accepted; original frontend runtime is baseline only after the exact readability patch. New frontend assembly, scan and UI execute in this run. Local test counts remain local review evidence.'}
    write('official-admission.json', receipt)
    return reports


def validate_reports(reports, manifest=M):
    source = manifest['source']
    scope = reports['scope.json']
    require(scope['head'] == source['head'] and scope['base'] == manifest['base'] and scope['components'] == manifest['components'], 'Original scope mismatch')
    require(len(scope['changes']) == len(manifest['files']), 'Original full diff missing')
    for item in scope['changes']:
        require({k: item[k] for k in ['before', 'after', 'status', 'oldMode', 'newMode']} == manifest['files'][item['file']], 'Original diff binding mismatch')
    for component in ['backend', 'frontend']:
        builder, runtime = (reports[component + '-' + stage + '.json'] for stage in ['builder', 'runtime'])
        for stage, value in [('builder', builder), ('runtime', runtime)]:
            require(value['head'] == source['head'] and value['runId'] == str(source['run']), 'Producer origin mismatch')
            require(value['componentTree'] == manifest['components'][component] and value['stage'] == stage, 'Producer inputs mismatch')
            require(value['status'] == 'success' and all(p['status'] == 'success' for p in value['phases']), 'Unsuccessful producer phase')
            require(value['tools'] == scope['tools'], 'Producer tools changed')
            require(value['images'][stage] == manifest['images'][component + '-' + stage], 'Image identity mismatch')
        require(runtime['builderImage'] == builder['images']['builder'], 'Runtime builder mismatch')
        original_builder_bytes = (json.dumps(builder, indent=2) + '\n').encode()
        require(runtime['builderReceiptSha256'] == sha(original_builder_bytes), 'Runtime receipt chain mismatch')
        for kind in ['audit', 'scan', 'probe']:
            value = reports[component + '-' + kind + '-verification.json']
            require(value['head'] == source['head'] and value['runId'] == str(source['run']) and value['status'] == 'success', 'Verification source/status mismatch')
            require(all(p['status'] == 'success' for p in value['phases']), 'Failed verification phase')
            stage = 'builder' if kind == 'audit' else 'runtime'
            require(value['images'][stage] == manifest['images'][component + '-' + stage], 'Verification image mismatch')
        require(not [v for r in reports[component + '-scan.json'].get('Results', []) for v in r.get('Vulnerabilities', [])], 'Nonempty original HIGH/CRITICAL scan')
    http = reports['runtime-http.json']
    require(http['sourceSha'] == source['head'] and http['imageId'] == manifest['images']['backend-runtime'] and http['status'] == 'success', 'Runtime report origin/status mismatch')
    require(len(http['checks']) == 65 and all(c['pass'] is True for c in http['checks']), 'Runtime assertions missing/failed')
    require(len(http['requests']) == 18 and http['maxObservedHttpConcurrency'] == 1, 'Original HTTP scope mismatch')
    require(len(http['corpus']) == 3 and all(c['expectedSha256'] == c['outputSha256'] for c in http['corpus']), 'Frozen output mismatch')
    require(reports['backend-probe-verification.json']['isolatedResourcesRemoved'] is True, 'Original resource cleanup failed')
    frontend = reports['frontend-probe-verification.json']
    require(frontend['builderStaticFileCount'] == 393 and frontend['runtimeStaticFileCount'] == 394 and set(frontend['baseOwnedExtraFiles']) == {'50x.html'}, 'Static output scope mismatch')


def load_image(name, reports):
    artifact = next(a for a in M['source']['artifacts'] if a['name'].endswith('-' + name))
    directory = download(artifact, [name + '.json', name + '.tar.zst'])
    receipt = reports[name + '.json']
    require(json.loads((directory / (name + '.json')).read_text()) == receipt, 'Image ZIP receipt mismatch')
    archive = directory / (name + '.tar.zst')
    require(archive.stat().st_size == receipt['archive']['bytes'] and file_sha(archive) == receipt['archive']['sha256'], 'Image archive mismatch')
    producer = subprocess.Popen(['zstd', '-dc', str(archive)], stdout=subprocess.PIPE)
    try:
        run(['docker', 'load'], 600, stdin=producer.stdout)
        require(producer.wait(timeout=30) == 0, 'Image decompression failed')
    finally:
        producer.stdout.close()
        if producer.poll() is None:
            producer.kill(); producer.wait()
    image = M['images'][name]
    detail = json.loads(output(['docker', 'image', 'inspect', image]))[0]
    require(detail['Id'] == image and detail['Config']['Labels']['org.opencontainers.image.revision'] == M['source']['head'], 'Loaded image identity/revision mismatch')
    archive.unlink()
    return image


def container(env, image, command=(), mounts=(), user=False):
    args = ['docker', 'run', '--rm', '--network', 'host']
    if user:
        args += ['--user', str(os.getuid()) + ':' + str(os.getgid())]
    for key, value in env.items():
        args += ['-e', key + '=' + str(value)]
    for source, target in mounts:
        args += ['-v', str(source) + ':' + target]
    return args + [image, *command]


def original_probe(action, reports, record):
    owned = []
    names = ['reviewed-candidate-frontend'] if action == 'browser' else ['survey-ci-postgres', 'reviewed-candidate-redis', 'reviewed-candidate-api']
    for name in names:
        require(subprocess.run(['docker', 'inspect', name], capture_output=True).returncode != 0, 'Container already exists')
    ownership = os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT'] + '-' + action
    def start(args):
        name = args[args.index('--name') + 1]
        try:
            value = output(['docker', 'run', '-d', '--label', 'reviewed-candidate-owner=' + ownership, *args], 180)
            require(re.fullmatch('[a-f0-9]{64}', value), 'Invalid created container ID')
            owned.append(value)
        except BaseException:
            # The CLI may fail after creation. Only recover a preflight-absent
            # exact name whose unique current-job ownership label matches.
            found = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True)
            if found.returncode == 0:
                detail = json.loads(found.stdout)[0]
                if detail.get('Config', {}).get('Labels', {}).get('reviewed-candidate-owner') == ownership:
                    owned.append(detail['Id'])
            raise
    try:
        if action == 'browser':
            image = load_image('frontend-runtime', reports)
            start(['--name', names[0], '-p', '127.0.0.1:3189:80', image])
            for attempt in range(30):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:3189/', timeout=2) as response:
                        if response.status == 200:
                            break
                except Exception:
                    pass
                time.sleep(1)
            else:
                raise RuntimeError('Candidate frontend readiness exceeded 30 seconds')
            env = {**os.environ, 'CANDIDATE_SOURCE_SHA': M['source']['head'], 'CANDIDATE_IMAGE_ID': image, 'CANDIDATE_ORIGIN_PORT': '3189'}
            phase(record, 'missing-training-and-shared-form-browser', lambda: run(['node', '.github/scripts/reviewed-candidate-browser.mjs'], 240, env=env))
            name = 'browser.json'
        else:
            image = load_image('backend-runtime', reports)
            builder = load_image('backend-builder', reports)
            env = runtime_environment(image, builder)
            services = reports['backend-probe-verification.json']['services']
            start(['--name', names[0], '-e', 'POSTGRES_USER=ptool', '-e', 'POSTGRES_PASSWORD=ptool123', '-e', 'POSTGRES_DB=survey_candidate_ci_test', '-p', '127.0.0.1:5432:5432', services['postgres:16.15-bookworm'], 'postgres', '-c', 'track_activity_query_size=8192'])
            start(['--name', names[1], '-p', '127.0.0.1:6379:6379', services['redis:7.4.11-bookworm']])
            wait_services(names[0], names[1])
            operator = {**env, 'DATABASE_URL': env['DATABASE_URL_ADMIN'], 'RUNTIME_ROLE_REQUIRED': 'false'}
            phase(record, 'fresh-fixture-schema-only', lambda: run(container(operator, builder, ['npx', 'prisma', 'migrate', 'deploy']), 300))
            phase(record, 'fresh-restricted-role-only', lambda: run(['python3', '-B', '.github/scripts/survey-candidate-recovery.py', 'bootstrap', builder, str(E)], 300, env={**os.environ, **env}))
            args = ['--name', names[2], '--network', 'host']
            for key, value in env.items():
                if key not in ['DATABASE_URL_ADMIN', 'SURVEY_CI_IMAGE_ID']:
                    args += ['-e', key + '=' + str(value)]
            start(args + [image])
            wait_api()
            mounts = [(ROOT / '.github/scripts/reviewed-candidate-scale-race.cjs', '/race.cjs:ro'), (E, '/evidence')]
            phase(record, 'missing-real-postgresql-freeze-races', lambda: run(container(env, image, ['node', '/race.cjs'], mounts, user=True), 150))
            name = 'scale-race.json'
        value = json.loads((E / name).read_text())
        require(value['status'] == 'success' and value['sourceSha'] == M['source']['head'] and value['imageId'] == image, 'New probe source/status mismatch')
        require(value['currentHead'] == os.environ['CANDIDATE_HEAD_SHA'], 'New probe PR head mismatch')
    finally:
        failures = []
        for identity in reversed(owned):
            if subprocess.run(['docker', 'rm', '-f', '-v', identity], capture_output=True).returncode != 0:
                failures.append(identity)
        record['isolatedResourcesRemoved'] = not failures
        write(record['report'], record)
        require(not failures, 'Owned resource cleanup failed')


def runtime_environment(image, builder):
    env = {'CI': 'true', 'GITHUB_ACTIONS': 'true', 'NODE_ENV': 'production', 'FOUNDATION_CI_ISOLATED': '1',
           'FOUNDATION_CI_SOURCE_SHA': M['source']['head'], 'FOUNDATION_CI_IMAGE_ID': image,
           'CANDIDATE_HEAD_SHA': os.environ['CANDIDATE_HEAD_SHA'],
           'SURVEY_CI_ISOLATED': '1', 'SURVEY_CI_SOURCE_SHA': M['source']['head'], 'SURVEY_CI_IMAGE_ID': builder,
           'DATABASE_URL': 'postgresql://survey_ci_runtime:survey-ci-only-runtime@127.0.0.1:5432/survey_candidate_ci_test?schema=public',
           'DATABASE_URL_ADMIN': 'postgresql://ptool:ptool123@127.0.0.1:5432/survey_candidate_ci_test?schema=public',
           'REDIS_URL': 'redis://127.0.0.1:6379/0', 'PORT': '3000', 'CORS_ORIGIN': 'http://127.0.0.1:3000',
           'COOKIE_SECURE': 'false', 'TRUST_PROXY_HOPS': '1', 'RUNTIME_ROLE_REQUIRED': 'true', 'SOCKET_REDIS_REQUIRED': 'true',
           'JWT_SECRET': 'synthetic-foundation-ci-jwt-not-production', 'ASSET_SIGNING_SECRET': 'synthetic-foundation-ci-assets-not-production',
           'DATA_ENCRYPTION_KEY': '55' * 32, 'DATA_PSEUDONYM_KEY': '56' * 32,
           'SURVEY_MFA_ENCRYPTION_KEY': '45' * 32, 'CAMPUS_MFA_ENCRYPTION_KEY': '34' * 32,
           'COGNITIVE_MODULE_ENABLED': 'true', 'SURVEY_WORKSPACE_ENABLED': 'true', 'SURVEY_PUBLICATION_ENABLED': 'true',
           'BACKGROUND_WORKERS_ENABLED': 'false', 'VIDEO_PROCESSING_ENABLED': 'false', 'HEAVY_PROCESSING_ENABLED': 'false',
           'ASSET_MIGRATION_COMPLETE': 'true', 'LOG_LEVEL': 'warn'}
    env['DATABASE_URL_RUNTIME'] = env['DATABASE_URL']
    return env


def wait_services(pg, redis):
    for _ in range(60):
        p = subprocess.run(['docker', 'exec', pg, 'pg_isready', '-U', 'ptool'], capture_output=True)
        r = subprocess.run(['docker', 'exec', redis, 'redis-cli', 'ping'], capture_output=True)
        if p.returncode == r.returncode == 0 and r.stdout.strip() == b'PONG':
            return
        time.sleep(1)
    raise RuntimeError('Disposable services readiness exceeded 60 seconds')


def wait_api():
    for _ in range(60):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3000/ready', timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError('Candidate API readiness exceeded 60 seconds')


def bound_function_hashes(source):
    result = {}
    nodes = ast.parse(source).body
    has_original = any(isinstance(n, ast.FunctionDef) and n.name == 'original_probe' for n in nodes)
    for node in nodes:
        if isinstance(node, ast.FunctionDef):
            if has_original and node.name == 'probe':
                continue
            name = 'probe' if node.name == 'original_probe' else node.name
            if name in ['probe', 'runtime_environment', 'wait_services', 'wait_api', 'container']:
                node.name = 'bound_function'
                result[name] = sha(ast.dump(node, include_attributes=False).encode())
    return result


def validate_race_job(job, receipt):
    for key, value in {'id': receipt['job']['id'], 'name': receipt['job']['name'], 'run_id': receipt['run'],
                       'head_sha': receipt['head'], 'status': 'completed', 'conclusion': 'success',
                       'completed_at': receipt['job']['completedAt']}.items():
        require(job.get(key) == value, 'Prior race job mismatch: ' + key)
    require(transport.recent(job['completed_at']), 'Prior race expired')


def accept_race(record):
    receipt = M['raceReceipt']
    actual = transport.api('/actions/runs/' + str(receipt['run']))
    for key, value in {'id': receipt['run'], 'head_sha': receipt['head'], 'head_branch': receipt['branch'],
                       'event': receipt['event'], 'path': receipt['workflow'], 'run_attempt': receipt['attempt'],
                       'status': 'completed', 'conclusion': 'failure'}.items():
        require(actual.get(key) == value, 'Prior race run mismatch: ' + key)
    require(actual['repository']['full_name'] == M['repository'] and actual['head_repository']['full_name'] == M['repository'], 'Prior race fork/repository mismatch')
    job = transport.api('/actions/jobs/' + str(receipt['job']['id']))
    validate_race_job(job, receipt)
    require(git('rev-parse', receipt['head'] + '^{tree}') == receipt['tree'], 'Prior PR tree changed')
    run(['git', 'merge-base', '--is-ancestor', receipt['head'], os.environ['CANDIDATE_HEAD_SHA']], 30)
    require(git('rev-parse', 'HEAD:server-version/backend') == receipt['backendTree'] == M['components']['backend'], 'Race backend inputs changed')
    script = '.github/scripts/reviewed-candidate-scale-race.cjs'
    require(git('rev-parse', 'HEAD:' + script) == git('rev-parse', receipt['head'] + ':' + script) == receipt['scriptBlob'], 'Race script changed')
    adapter = '.github/scripts/reviewed-candidate-admission.py'
    require(git('rev-parse', receipt['head'] + ':' + adapter) == receipt['originalAdapterBlob'], 'Original race adapter changed')
    old = git('show', receipt['head'] + ':' + adapter)
    require(bound_function_hashes(old) == bound_function_hashes((ROOT / adapter).read_text()) == receipt['functionHashes'], 'Race runtime setup/cleanup changed')
    expected = receipt['artifact']
    artifact = transport.api('/actions/artifacts/' + str(expected['id']))
    validate_artifact(artifact, expected, {**M, 'source': {'run': receipt['run'], 'head': receipt['head']}})
    directory = download(expected, receipt['reportDigests'])
    values = {}
    for name, digest in receipt['reportDigests'].items():
        raw = (directory / name).read_bytes(); require(sha(raw) == digest, 'Prior race report bytes changed')
        values[name] = json.loads(raw)
    value, verification = values['scale-race.json'], values['race-verification.json']
    require(value['status'] == verification['status'] == 'success' and verification['isolatedResourcesRemoved'] is True, 'Prior race failed/unclean')
    require(value['currentHead'] == verification['currentHead'] == receipt['head'], 'Race PR origin mismatch')
    require(value['sourceSha'] == verification['sourceSha'] == M['source']['head'] and value['imageId'] == M['images']['backend-runtime'], 'Race image/source changed')
    require(len(value['checks']) == 113 and all(c['pass'] is True for c in value['checks']), 'Race assertions incomplete')
    require(len(value['requests']) == 6 and len(value['postconditions']) == 5, 'Race coverage incomplete')
    require(all(p['status'] == 'success' for p in verification['phases']), 'Race phase failed')
    write('accepted-race.json', {'status': 'success', 'currentHead': os.environ['CANDIDATE_HEAD_SHA'],
        'sourceRun': receipt['run'], 'sourceHead': receipt['head'], 'sourceJob': job['id'],
        'originalCompletedAt': job['completed_at'], 'artifact': expected, 'reportDigests': receipt['reportDigests'],
        'assertions': 113, 'httpRequests': 6, 'postconditions': 5,
        'claim': 'Prior independently successful official race job accepted unchanged. No PostgreSQL service or race check executed in this job.'})
    record['execution'] = 'official-receipt-only; zero PostgreSQL services/checks rerun'


def run_frontend_check(image, command, label, timeout, mounts=(), env=()):
    name = 'reviewed-check-' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT'] + '-' + label
    owner = name
    require(subprocess.run(['docker','inspect',name],capture_output=True).returncode != 0, 'Frontend check container already exists')
    identity = None
    try:
        args = ['docker','create','--network','none','--name',name,'--label','reviewed-candidate-owner=' + owner]
        for source, target in mounts: args += ['-v',str(source) + ':' + target]
        for key, value in env: args += ['-e',key + '=' + value]
        identity = output(args + [image, *command], 30)
        require(re.fullmatch('[a-f0-9]{64}', identity), 'Invalid frontend check container ID')
        run(['docker','start','-a',identity], timeout)
        require(output(['docker','inspect','--format','{{.State.ExitCode}}',identity]) == '0', 'Frontend check exited nonzero')
    finally:
        if identity is None:
            found = subprocess.run(['docker','inspect',name],capture_output=True,text=True)
            if found.returncode == 0:
                value = json.loads(found.stdout)[0]
                if value.get('Config',{}).get('Labels',{}).get('reviewed-candidate-owner') == owner: identity = value['Id']
        if identity:
            require(subprocess.run(['docker','rm','-f','-v',identity],capture_output=True).returncode == 0, 'Frontend check container cleanup failed')


def build_frontend(reports, record):
    helper = module('candidate_image_utilities', '.github/scripts/shared-assessment-foundation-ci.py')
    head = os.environ['CANDIDATE_HEAD_SHA']
    context = ROOT / 'server-version/frontend'
    bases = reports['frontend-builder.json']['bases']
    recipe = (context / 'Dockerfile').read_text()
    for tag, digest in bases.items():
        require('@sha256:' in digest, 'Unpinned original frontend base')
        recipe = recipe.replace('FROM ' + tag + ' AS ', 'FROM ' + digest + ' AS ')
        phase(record, 'fetch-base-' + tag.split(':')[0], lambda image=digest: run(['docker', 'pull', image], 300))
    effective = PRIVATE / 'frontend.Dockerfile'; effective.write_text(recipe)
    prefix = 'reviewed-current-frontend:' + head
    common = ['docker', 'buildx', 'build', '--builder', 'default', '--load', '-f', str(effective),
              '--label', 'org.opencontainers.image.revision=' + head,
              '--build-arg', 'NPM_REGISTRY=https://registry.npmjs.org', '--build-arg', 'VITE_COGNITIVE_MODULE_ENABLED=true']
    phase(record, 'changed-frontend-build-once', lambda: run(common + ['--target', 'build', '-t', prefix + '-builder', str(context)], 1200))
    builder = output(['docker', 'image', 'inspect', '--format', '{{.Id}}', prefix + '-builder'])
    static = PRIVATE / 'new-builder-static'; static.mkdir()
    helper.copy_files(builder, '/app/dist', static)
    files = helper.files_manifest(static)
    marker = 'FROM ' + bases['nginx:1.31.6-alpine3.24-slim'] + ' AS runtime'
    require(recipe.count(marker) == 1, 'Runtime stage ambiguous')
    runtime_recipe = PRIVATE / 'frontend-runtime.Dockerfile'
    runtime_recipe.write_text('FROM ' + prefix + '-builder AS build\n' + recipe[recipe.index(marker):])
    phase(record, 'package-exact-new-builder', lambda: run(['docker', 'buildx', 'build', '--builder', 'default', '--load',
        '-f', str(runtime_recipe), '--label', 'org.opencontainers.image.revision=' + head,
        '--target', 'runtime', '-t', prefix, str(context)], 300))
    image = output(['docker', 'image', 'inspect', '--format', '{{.Id}}', prefix])
    actual_path = PRIVATE / 'new-runtime-static'; actual_path.mkdir()
    helper.copy_files(image, '/usr/share/nginx/html', actual_path)
    actual = helper.files_manifest(actual_path)
    require(actual == {**reports['frontend-builder.json']['baseStaticFiles'], **files}, 'Current runtime differs from exact builder plus unchanged pinned nginx stock')
    archive = E / 'frontend-runtime.tar.zst'
    producer = subprocess.Popen(['docker', 'save', image], stdout=subprocess.PIPE)
    try:
        with archive.open('wb') as sink:
            run(['zstd', '-T2', '-3', '-c'], 300, stdin=producer.stdout, stdout=sink)
        require(producer.wait(timeout=30) == 0, 'Current runtime save failed')
    finally:
        producer.stdout.close()
        if producer.poll() is None: producer.kill(); producer.wait()
    js = list(static.rglob('*.js'))
    receipt = {'schema': 1, 'status': 'success', 'stage': 'runtime-assembly', 'head': head,
        'checkoutSha': git('rev-parse', 'HEAD'), 'run': os.environ['GITHUB_RUN_ID'], 'attempt': os.environ['GITHUB_RUN_ATTEMPT'],
        'componentTree': M['frontendPatch']['afterTree'], 'builderImage': builder, 'imageId': image, 'bases': bases,
        'effectiveDockerfileSha256': sha(effective.read_bytes()), 'runtimeDockerfileSha256': sha(runtime_recipe.read_bytes()),
        'archive': {'sha256': file_sha(archive), 'bytes': archive.stat().st_size}, 'staticFiles': files,
        'builderStaticFileCount': len(files), 'runtimeStaticFileCount': len(actual),
        'staticBytes': sum(p.stat().st_size for p in static.rglob('*') if p.is_file()),
        'jsBytes': sum(p.stat().st_size for p in js), 'jsGzipBytes': sum(len(gzip.compress(p.read_bytes(), mtime=0)) for p in js),
        'buildFlags': reports['frontend-builder.json']['buildFlags'],
        'claim': 'Only the exact component-scoped contrast patch changes product inputs. Assembly receipt is separate from scan result.'}
    entry_scripts = re.findall(r'<script[^>]+src=[\"\']([^\"\']+)[\"\']', (static / 'index.html').read_text())
    require(entry_scripts and all(name.startswith('/assets/') and '..' not in name for name in entry_scripts), 'Missing or unexpected built entry scripts')
    before_files = reports['frontend-builder.json']['staticFiles']
    receipt['entryComparison'] = {'indexHtmlBefore': before_files['index.html'], 'indexHtmlAfter': files['index.html'],
        'entryScripts': [{'path': name, 'before': before_files.get(name.lstrip('/')), 'after': files[name.lstrip('/')]} for name in entry_scripts]}
    receipt['entryChanged'] = receipt['entryComparison']['indexHtmlBefore'] != receipt['entryComparison']['indexHtmlAfter'] or any(item['before'] != item['after'] for item in receipt['entryComparison']['entryScripts'])
    write('frontend-runtime.json', receipt)
    record['runtimeAssembly'] = {'imageId': image, 'archiveSha256': receipt['archive']['sha256']}
    phase(record, 'changed-scale-scoped-lint', lambda: run_frontend_check(builder, ['npx','eslint','src/pages/ScaleEdit.tsx'], 'lint', 180))
    phase(record, 'changed-frontend-app-types', lambda: run_frontend_check(builder, ['npx','tsc','-p','tsconfig.app.json','--noEmit'], 'types', 300, env=[('NODE_OPTIONS','--max-old-space-size=4096')]))
    phase(record, 'affected-scale-component-contracts', lambda: run_frontend_check(builder,
        ['npx','vitest','run','--maxWorkers=2','src/pages/__tests__/ScaleEdit.readonly.test.tsx','--reporter=json','--outputFile=/evidence/scale-component-tests.json'], 'components', 180, mounts=[(E,'/evidence')]))
    # Save the successful assembly before the scan, so a scan failure never
    # destroys the immutable bytes or mislabels it as a failed build.
    phase(record, 'new-runtime-high-critical-scan', lambda: run(['trivy', 'image', '--exit-code', '1', '--ignore-unfixed',
        '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL', '--format', 'json', '--output', str(E / 'frontend-scan.json'), image], 600))
    write('frontend-byte-comparison.json', {'oldSource': M['source']['head'], 'newHead': head,
        'before': {k: reports['frontend-builder.json'][k] for k in ['staticBytes','jsBytes','jsGzipBytes']},
        'after': {k: receipt[k] for k in ['staticBytes','jsBytes','jsGzipBytes']},
        'claim': 'Measured artifact size delta for readability correction, not runtime speed or memory improvement.'})


def current_frontend_image():
    artifact_id = os.environ['CURRENT_FRONTEND_ARTIFACT_ID']
    require(artifact_id.isdigit() and int(artifact_id) > 0, 'Missing official current artifact ID')
    artifact = transport.api('/actions/artifacts/' + artifact_id)
    digest = os.environ['CURRENT_FRONTEND_ARTIFACT_DIGEST'].removeprefix('sha256:')
    require(re.fullmatch('[0-9a-f]{64}', digest) and artifact['digest'] == 'sha256:' + digest, 'Current official artifact digest mismatch')
    require(artifact['id'] == int(artifact_id) and not artifact['expired'] and transport.recent(artifact['created_at']), 'Current artifact missing/expired')
    require(artifact['workflow_run']['id'] == int(os.environ['GITHUB_RUN_ID']) and artifact['workflow_run']['head_sha'] == os.environ['CANDIDATE_HEAD_SHA'], 'Current artifact source mismatch')
    expected = {'id': artifact['id'], 'name': artifact['name'], 'size': artifact['size_in_bytes'], 'digest': artifact['digest'], 'createdAt': artifact['created_at']}
    directory = download(expected, ['frontend-runtime.json', 'frontend-runtime.tar.zst'])
    receipt = json.loads((directory / 'frontend-runtime.json').read_text())
    write('frontend-runtime.json', receipt)
    require(artifact['name'] == 'reviewed-current-frontend-' + receipt['run'] + '-' + receipt['head'] + '-attempt-' + receipt['attempt'], 'Current artifact name mismatch')
    require(artifact['workflow_run']['id'] == int(os.environ['GITHUB_RUN_ID']) and artifact['workflow_run']['head_sha'] == receipt['head'], 'Current artifact source mismatch')
    jobs = transport.api('/actions/runs/' + os.environ['GITHUB_RUN_ID'] + '/jobs?filter=all&per_page=100')
    require(jobs['total_count'] == len(jobs['jobs']), 'Truncated current jobs')
    producer = [j for j in jobs['jobs'] if j['name'] == 'reviewed-candidate / changed frontend / build scan and package' and j['run_attempt'] == int(receipt['attempt'])]
    require(len(producer) == 1 and producer[0]['status'] == 'completed' and producer[0]['conclusion'] == 'success' and producer[0]['head_sha'] == receipt['head'], 'Current frontend producer not successful')
    require(receipt['status'] == 'success' and receipt['stage'] == 'runtime-assembly', 'New frontend assembly failed')
    require(receipt['head'] == os.environ['CANDIDATE_HEAD_SHA'] and receipt['run'] == os.environ['GITHUB_RUN_ID'], 'New frontend artifact not from same PR/run')
    require(receipt['componentTree'] == M['frontendPatch']['afterTree'] == git('rev-parse', 'HEAD:server-version/frontend'), 'New frontend inputs changed')
    archive = directory / 'frontend-runtime.tar.zst'
    require(archive.stat().st_size == receipt['archive']['bytes'] and file_sha(archive) == receipt['archive']['sha256'], 'New frontend archive changed')
    producer = subprocess.Popen(['zstd', '-dc', str(archive)], stdout=subprocess.PIPE)
    try:
        run(['docker', 'load'], 300, stdin=producer.stdout)
        require(producer.wait(timeout=30) == 0, 'New frontend decompression failed')
    finally:
        producer.stdout.close()
        if producer.poll() is None: producer.kill(); producer.wait()
    image = receipt['imageId']
    detail = json.loads(output(['docker', 'image', 'inspect', image]))[0]
    require(detail['Id'] == image and detail['Config']['Labels']['org.opencontainers.image.revision'] == receipt['head'], 'New frontend image ID/revision changed')
    archive.unlink()
    return image


def browser_frontend(reports, record):
    old = load_image('frontend-runtime', reports)
    current = current_frontend_image()
    # No unimplemented partial-job receipt may silently substitute for two UI contexts.
    # If the actual entry is unchanged, stop for explicit prior-context admission instead.
    require(json.loads((E / 'frontend-runtime.json').read_text())['entryChanged'] is True,
            'Entry bytes unchanged: prior two-context admission is not implemented; stop rather than repeat or silently skip')
    owned = []
    try:
        for mode, image, source in [('baseline', old, M['source']['head']), ('current', current, os.environ['CANDIDATE_HEAD_SHA'])]:
            name = 'reviewed-candidate-frontend-' + mode
            require(subprocess.run(['docker', 'inspect', name], capture_output=True).returncode != 0, 'Frontend probe container already exists')
            label = os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT'] + '-' + mode
            try:
                identity = output(['docker', 'run', '-d', '--label', 'reviewed-candidate-owner=' + label, '--name', name, '-p', '127.0.0.1:3189:80', image], 120)
                require(re.fullmatch('[a-f0-9]{64}', identity), 'Invalid frontend container ID')
                owned.append(identity)
            except BaseException:
                found = subprocess.run(['docker','inspect',name],capture_output=True,text=True)
                if found.returncode == 0:
                    value = json.loads(found.stdout)[0]
                    if value.get('Config',{}).get('Labels',{}).get('reviewed-candidate-owner') == label: owned.append(value['Id'])
                raise
            for _ in range(30):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:3189/', timeout=2) as response:
                        if response.status == 200: break
                except Exception: pass
                time.sleep(1)
            else: raise RuntimeError('Frontend readiness exceeded 30 seconds')
            entry_changed = json.loads((E / 'frontend-runtime.json').read_text())['entryChanged']
            require(isinstance(entry_changed, bool), 'Missing measured entry comparison')
            env = {**os.environ, 'CANDIDATE_SOURCE_SHA': source, 'CANDIDATE_IMAGE_ID': image, 'CANDIDATE_ORIGIN_PORT': '3189', 'CANDIDATE_ENTRY_CHANGED': str(entry_changed).lower()}
            command = ['node', '.github/scripts/reviewed-candidate-browser.mjs'] + (['--contrast-baseline'] if mode == 'baseline' else [])
            phase(record, mode + '-frontend-browser', lambda: run(command, 240, env=env))
            run(['docker', 'rm', '-f', '-v', identity], 30); owned.remove(identity)
        value = json.loads((E / 'browser.json').read_text())
        require(value['status'] == 'success' and value['sourceSha'] == os.environ['CANDIDATE_HEAD_SHA']
                and value['currentHead'] == os.environ['CANDIDATE_HEAD_SHA'] and value['imageId'] == current, 'Current browser source/status mismatch')
    finally:
        failures = [identity for identity in reversed(owned) if subprocess.run(['docker','rm','-f','-v',identity],capture_output=True).returncode != 0]
        record['isolatedResourcesRemoved'] = not failures; write(record['report'], record)
        require(not failures, 'Current frontend cleanup failed')


def probe(action, reports, record):
    if action == 'race': return accept_race(record)
    if action == 'frontend': return build_frontend(reports, record)
    return browser_frontend(reports, record)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['frontend', 'browser', 'race'])
    action = parser.parse_args().action
    require(not PRIVATE.exists(), 'Refuse stale private state')
    PRIVATE.mkdir(mode=0o700); E.mkdir(exist_ok=True)
    record = {'schema': 1, 'report': action + '-verification.json', 'status': 'running',
              'sourceSha': M['source']['head'], 'currentHead': os.environ.get('CANDIDATE_HEAD_SHA'), 'phases': []}
    try:
        reports = {}
        phase(record, 'admit-original-official-evidence', lambda: reports.update(admit()))
        phase(record, 'accept-prior-successful-race' if action == 'race' else 'changed-frontend-' + action, lambda: probe(action, reports, record))
        record['status'] = 'success'
    except BaseException:
        record['status'] = 'failure'
        raise
    finally:
        write(record['report'], record)
        shutil.rmtree(PRIVATE)
