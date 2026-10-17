"""Fixed official receipt admission and missing runtime checks only.

No rebuild, fallback source, local-test promotion or expiry renewal.
The exact source manifest is reviewable data; the transport helpers are existing CI code.
"""
import argparse
import ast
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
        expected = M.get('testFix', {}).get('files', {}).get(file, M.get('frontendPatch', {}).get('files', {}).get(file, binding))['after']
        require(git('rev-parse', head + ':' + file) == expected, 'Reviewed candidate blob changed: ' + file)
    for file, binding in M['testFix']['files'].items():
        require(git('rev-parse', head + ':' + file) == binding['after'], 'Reviewed test fixture blob changed: ' + file)
    for file, blob in M['unchangedConsumers'].items():
        require(git('rev-parse', head + ':' + file) == blob, 'Supporting consumer changed: ' + file)
    # Independently recompute the actual full diff using the same fail-closed plan.
    script = "import{changedEntries}from'./.github/scripts/content-scope.mjs';import{reviewedCandidatePlan}from'./.github/scripts/reviewed-candidate-scope.mjs';console.log(JSON.stringify(reviewedCandidatePlan(changedEntries(process.argv[1],process.argv[2]),process.argv[1],process.argv[2])));"
    recomputed = json.loads(output(['node', '--input-type=module', '-e', script, M['base'], head]))
    require(recomputed == plan, 'Recomputed scope differs')
    return head


def download(expected, members, selected_reports=False):
    path = PRIVATE / (str(expected['id']) + '.zip')
    request = urllib.request.Request('https://api.github.com/repos/' + M['repository'] + '/actions/artifacts/' + str(expected['id']) + '/zip',
                                     headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN']})
    with transport.opener.open(request, timeout=60) as response, path.open('wb') as sink:
        while chunk := response.read(1024 * 1024):
            sink.write(chunk)
    require(path.stat().st_size == expected['size'] and 'sha256:' + file_sha(path) == expected['digest'], 'Official ZIP digest/size mismatch')
    target = PRIVATE / str(expected['id']); target.mkdir()
    with zipfile.ZipFile(path) as archive:
        if selected_reports:
            # The fixed whole-ZIP digest is already verified. Read only declared
            # JSON reports; screenshots and other members are never extracted.
            infos = archive.infolist()
            require(len({i.filename for i in infos}) == len(infos), 'Duplicate qualification ZIP member')
            for name in members:
                require(name.endswith('.json') and '\\' not in name and all(part not in ['', '.', '..'] for part in name.split('/')), 'Unsafe qualification report path')
                info = archive.getinfo(name)
                require(not info.is_dir() and ((info.external_attr >> 16) & 0o170000) != 0o120000
                        and info.file_size <= 20_000_000, 'Unsafe qualification report member')
        else:
            validate_members(archive.infolist(), members)
        for name in members:
            (target / name).parent.mkdir(parents=True, exist_ok=True)
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
               'claim': 'Original backend and unchanged dependency evidence accepted. The exact prior frontend assembly remains its original source; missing types, selected contracts, scan and UI require current-run success. Local test counts remain local review evidence.'}
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


def validate_assembly_origin(actual, job, receipt):
    # This exact producer failed after assembly/lint. Admit those phases only;
    # its failed types and unexecuted tests/scan remain missing current-run work.
    for key, value in {'id': receipt['run'], 'head_sha': receipt['head'], 'head_branch': receipt['branch'],
                       'event': receipt['event'], 'path': receipt['workflow'], 'run_attempt': receipt['attempt'],
                       'status': 'completed', 'conclusion': 'failure'}.items():
        require(actual.get(key) == value, 'Partial frontend run mismatch: ' + key)
    require(actual.get('repository', {}).get('full_name') == M['repository']
            and actual.get('head_repository', {}).get('full_name') == M['repository'], 'Partial frontend repository mismatch')
    for key, value in {'id': receipt['job']['id'], 'name': receipt['job']['name'], 'run_id': receipt['run'],
                       'run_attempt': receipt['attempt'], 'head_sha': receipt['head'], 'status': 'completed',
                       'conclusion': 'failure', 'completed_at': receipt['job']['completedAt']}.items():
        require(job.get(key) == value, 'Partial frontend job mismatch: ' + key)
    require(transport.recent(job['completed_at']), 'Original partial frontend job expired')


def validate_assembly_reports(runtime, verification, receipt):
    for key, value in {'schema': 1, 'status': 'success', 'stage': 'runtime-assembly', 'head': receipt['head'],
                       'checkoutSha': receipt['mergeHead'], 'run': str(receipt['run']), 'attempt': str(receipt['attempt']),
                       'componentTree': M['frontendPatch']['afterTree'], 'imageId': receipt['imageId']}.items():
        require(runtime.get(key) == value, 'Partial frontend assembly mismatch: ' + key)
    require(receipt['componentTree'] == M['frontendPatch']['afterTree'], 'Assembly manifest component tree mismatch')
    require(verification.get('status') == 'failure' and verification.get('currentHead') == receipt['head']
            and verification.get('sourceSha') == M['source']['head'], 'Partial producer failure/origin changed')
    expected = {'admit-original-official-evidence': 'success', 'changed-frontend-frontend': 'failure',
                'fetch-base-node': 'success', 'fetch-base-nginx': 'success',
                'changed-frontend-build-once': 'success', 'package-exact-new-builder': 'success',
                'changed-scale-scoped-lint': 'success', 'changed-frontend-app-types': 'failure'}
    phases = verification.get('phases', [])
    require(len(phases) == len(expected) and {p['name']: p['status'] for p in phases} == expected,
            'Partial frontend phase set/status changed')
    require(verification.get('runtimeAssembly') == {'imageId': runtime['imageId'], 'archiveSha256': runtime['archive']['sha256']},
            'Partial frontend assembly identity mismatch')
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', runtime['imageId']) and runtime.get('entryChanged') is True,
            'Missing exact runtime identity/entry comparison')


def current_frontend_image():
    receipt = M['frontendAssemblyReceipt']
    actual = transport.api('/actions/runs/' + str(receipt['run']))
    job = transport.api('/actions/jobs/' + str(receipt['job']['id']))
    validate_assembly_origin(actual, job, receipt)
    require(receipt['pr'] == int(os.environ['PR_NUMBER']) and receipt['base'] == M['base'], 'Partial frontend PR/base mismatch')
    require(git('rev-parse', receipt['head'] + '^{tree}') == receipt['tree'], 'Partial frontend source tree changed')
    require(transport.api('/git/commits/' + receipt['mergeHead'])['tree']['sha'] == receipt['tree'], 'Partial frontend merge tree changed')
    run(['git', 'merge-base', '--is-ancestor', receipt['head'], os.environ['CANDIDATE_HEAD_SHA']], 30)
    require(git('rev-parse', receipt['head'] + ':server-version/frontend') == M['frontendPatch']['afterTree'], 'Assembly frontend tree changed')
    require(git('rev-parse', 'HEAD:server-version/frontend') == M['testFix']['afterTree'], 'Current test overlay tree changed')
    # Docker COPY includes tests, but this one test is neither a Vite entry nor
    # imported by production code. Keep the old image, source label and bytes.
    test_file = 'server-version/frontend/src/pages/__tests__/TrainingTaskDeepLinks.test.tsx'
    changed = git('diff', '--name-only', '--no-renames', receipt['head'], 'HEAD', '--', 'server-version/frontend').splitlines()
    require(changed == [test_file], 'Unexpected frontend build input change')
    binding = M['testFix']['files'][test_file]
    require(git('rev-parse', receipt['head'] + ':' + test_file) == binding['before']
            and git('rev-parse', 'HEAD:' + test_file) == binding['after'], 'Exact test-only overlay changed')
    provenance = {**M, 'source': {'run': receipt['run'], 'head': receipt['head']}}
    for item in [receipt['artifact'], receipt['reportsArtifact']]:
        validate_artifact(transport.api('/actions/artifacts/' + str(item['id'])), item, provenance)
    reports_dir = download(receipt['reportsArtifact'], receipt['reportDigests'])
    reports = {}
    for name, digest in receipt['reportDigests'].items():
        raw = (reports_dir / name).read_bytes()
        require(sha(raw) == digest, 'Partial frontend report bytes changed: ' + name)
        reports[name] = json.loads(raw)
    runtime, verification = reports['frontend-runtime.json'], reports['frontend-verification.json']
    validate_assembly_reports(runtime, verification, receipt)
    original_builder = M['source']['head']
    require(reports['official-admission.json']['sourceSha'] == original_builder
            and reports['official-admission.json']['prHead'] == receipt['head']
            and reports['official-admission.json']['status'] == 'success', 'Partial frontend original admission changed')
    directory = download(receipt['artifact'], ['frontend-runtime.json', 'frontend-runtime.tar.zst'])
    require(file_sha(directory / 'frontend-runtime.json') == receipt['reportDigests']['frontend-runtime.json'], 'Runtime artifact receipt differs')
    archive = directory / 'frontend-runtime.tar.zst'
    require(archive.stat().st_size == runtime['archive']['bytes'] and file_sha(archive) == runtime['archive']['sha256'], 'Partial frontend archive changed')
    producer = subprocess.Popen(['zstd', '-dc', str(archive)], stdout=subprocess.PIPE)
    try:
        run(['docker', 'load'], 300, stdin=producer.stdout)
        require(producer.wait(timeout=30) == 0, 'Partial frontend decompression failed')
    finally:
        producer.stdout.close()
        if producer.poll() is None: producer.kill(); producer.wait()
    image = runtime['imageId']
    detail = json.loads(output(['docker', 'image', 'inspect', image]))[0]
    require(detail['Id'] == image and detail['Config']['Labels']['org.opencontainers.image.revision'] == receipt['head'],
            'Original frontend image ID/revision changed')
    archive.unlink()
    write('frontend-runtime.json', runtime)
    write('source-frontend-verification.json', verification)
    write('accepted-frontend-assembly.json', {'status': 'success', 'currentHead': os.environ['CANDIDATE_HEAD_SHA'],
        'sourceHead': receipt['head'], 'sourceTree': receipt['tree'], 'sourceRun': receipt['run'], 'sourceJob': receipt['job']['id'],
        'originalJobConclusion': 'failure', 'originalCompletedAt': receipt['job']['completedAt'],
        'artifact': receipt['artifact'], 'reportsArtifact': receipt['reportsArtifact'], 'reportDigests': receipt['reportDigests'],
        'imageId': image, 'acceptedPhases': ['changed-frontend-build-once', 'package-exact-new-builder', 'changed-scale-scoped-lint'],
        'claim': 'Only successful assembly and unchanged Scale lint are accepted from this failed producer. The source image is unchanged; types, selected contracts and image scan are admitted from the independently successful job fixed by qualificationReceipt.'})
    return image


def validate_qualification_origin(actual, job, action, receipt):
    require(action in ['frontend', 'browser', 'interaction-chromium', 'interaction-firefox', 'interaction-webkit'], 'Unknown qualification action')
    for key, value in {'id': receipt['run'], 'head_sha': receipt['head'], 'head_branch': receipt['branch'],
                       'event': receipt['event'], 'path': receipt['workflow'], 'run_attempt': receipt['attempt'],
                       'status': 'completed', 'conclusion': 'failure'}.items():
        require(actual.get(key) == value, 'Qualification run mismatch: ' + key)
    require(actual.get('repository', {}).get('full_name') == M['repository']
            and actual.get('head_repository', {}).get('full_name') == M['repository'], 'Qualification repository mismatch')
    expected = receipt['jobs'][action]
    for key, value in {'id': expected['id'], 'name': expected['name'], 'run_id': receipt['run'],
                       'run_attempt': receipt['attempt'], 'head_sha': receipt['head'], 'status': 'completed',
                       'conclusion': 'failure' if action == 'browser' else 'success', 'completed_at': expected['completedAt']}.items():
        require(job.get(key) == value, 'Qualification job mismatch: ' + key)
    require(transport.recent(job['completed_at']), 'Original qualification expired')


def load_qualification_reports(action):
    receipt = M['qualificationReceipt']
    validate_qualification_origin(transport.api('/actions/runs/' + str(receipt['run'])),
        transport.api('/actions/jobs/' + str(receipt['jobs'][action]['id'])), action, receipt)
    require(receipt['pr'] == int(os.environ['PR_NUMBER']) and receipt['base'] == M['base'], 'Qualification PR/base mismatch')
    require(git('rev-parse', receipt['head'] + '^{tree}') == receipt['tree'], 'Qualification source tree changed')
    require(transport.api('/git/commits/' + receipt['mergeHead'])['tree']['sha'] == receipt['tree'], 'Qualification merge tree changed')
    run(['git', 'merge-base', '--is-ancestor', receipt['head'], os.environ['CANDIDATE_HEAD_SHA']], 30)
    for component in ['frontend', 'backend']:
        for ref in [receipt['head'], 'HEAD']:
            require(git('rev-parse', ref + ':server-version/' + component) == receipt[component + 'Tree'], 'Qualified component inputs changed')
    for file, blob in receipt['inputs'].items():
        require(git('rev-parse', receipt['head'] + ':' + file) == blob, 'Original qualification tool changed: ' + file)
        # The browser runner independently proves its narrowly repaired selector
        # and admission-only additions preserve the five accepted context bodies.
        if file != '.github/scripts/reviewed-candidate-browser.mjs':
            require(git('rev-parse', 'HEAD:' + file) == blob, 'Qualified consumer input changed: ' + file)
    expected = receipt['artifacts'][action]
    validate_artifact(transport.api('/actions/artifacts/' + str(expected['id'])), expected,
                      {**M, 'source': {'run': receipt['run'], 'head': receipt['head']}})
    digests = receipt['reportDigests'][action]
    directory = download(expected, digests, selected_reports=True)
    reports = {}
    for name, digest in digests.items():
        raw = (directory / name).read_bytes()
        require(sha(raw) == digest, 'Qualification report bytes changed: ' + name)
        reports[name] = json.loads(raw)
    return reports, directory


def validate_qualification_reports(action, reports, receipt):
    require(action in ['frontend', 'interaction-chromium', 'interaction-firefox', 'interaction-webkit'], 'Only independently successful jobs qualify here')
    value = reports[action + '-verification.json']
    image = M['frontendAssemblyReceipt']['imageId']
    require(value.get('status') == 'success' and value.get('currentHead') == receipt['head']
            and value.get('sourceSha') == M['frontendAssemblyReceipt']['head'] and value.get('imageId') == image,
            'Qualification report source/status/image changed')
    expected = ['admit-original-official-evidence', 'qualify-missing-' + action]
    if action == 'frontend':
        expected += ['install-locked-host-frontend-tooling', 'missing-frontend-app-types',
                     'missing-scale-and-changed-training-contracts', 'missing-runtime-high-critical-scan']
        tests, scan = reports['selected-component-tests.json'], reports['frontend-scan.json']
        require(tests.get('success') is True and tests.get('numTotalTests') == tests.get('numPassedTests') == 41
                and all(tests.get(key) == 0 for key in ['numFailedTests', 'numPendingTests', 'numTodoTests']), 'Qualified tests incomplete')
        selected = {'ScaleEdit.readonly.test.tsx': 21, 'TrainingTaskDeepLinks.test.tsx': 20}
        require(len(tests.get('testResults', [])) == 2 and {Path(t['name']).name: len(t['assertionResults']) for t in tests['testResults']} == selected,
                'Qualified test files changed')
        require(all(t['status'] == 'passed' and all(a['status'] == 'passed' for a in t['assertionResults']) for t in tests['testResults']), 'Qualified assertion failed/skipped')
        require(scan.get('ArtifactID') == scan.get('ArtifactName') == scan.get('Metadata', {}).get('ImageID') == image
                and scan.get('ArtifactType') == 'container_image' and scan.get('Trivy', {}).get('Version') == '0.70.0', 'Qualified scan image/tool mismatch')
        require(scan.get('Results') and not [v for r in scan['Results'] for v in r.get('Vulnerabilities', [])], 'Qualified HIGH/CRITICAL scan not clean')
    else:
        engine = action.removeprefix('interaction-')
        expected += ['affected-assignment-states-' + engine]
        require(value.get('browser') == engine and value.get('scope') == 'assignment-list-states'
                and value.get('artifactSourceHead') == M['frontendAssemblyReceipt']['head'] and value.get('isolatedResourcesRemoved') is True
                and value.get('testScriptBlob') == receipt['inputs']['server-version/e2e/visual-interaction-states-browser-e2e.cjs'],
                'Qualified interaction scope/cleanup/script changed')
        qa = reports[action + '/interaction-states/qa.json']
        require(qa.get('scope') == 'assignment-list-states' and qa.get('results') ==
                [{'width': width, 'passed': True, 'assignmentStates': [{'state': state, 'passed': True} for state in
                  ['loading', 'populated', 'empty', 'filtered-empty', 'error']]} for width in [360, 390, 768, 1440]], 'Qualified interaction coverage incomplete')
    phases = value.get('phases', [])
    require(len(phases) == len(expected) and [p['name'] for p in phases] == expected
            and all(p['status'] == 'success' for p in phases), 'Qualification phases missing/failed')


def accept_qualification(action, record):
    reports, directory = load_qualification_reports(action)
    receipt = M['qualificationReceipt']
    validate_qualification_reports(action, reports, receipt)
    shutil.copyfile(directory / (action + '-verification.json'), E / ('source-' + action + '-verification.json'))
    write('accepted-' + action + '.json', {'status': 'success', 'currentHead': os.environ['CANDIDATE_HEAD_SHA'],
        'sourceHead': receipt['head'], 'sourceRun': receipt['run'], 'sourceJob': receipt['jobs'][action]['id'],
        'originalCompletedAt': receipt['jobs'][action]['completedAt'], 'artifact': receipt['artifacts'][action],
        'reportDigests': receipt['reportDigests'][action], 'imageId': M['frontendAssemblyReceipt']['imageId'],
        'claim': 'This independently successful original job is accepted unchanged. No build, install, typecheck, test, scan or browser execution occurred here.'})
    record['execution'] = 'Official receipt only; original completion time and source retained'


def qualify_frontend(reports, record):
    return accept_qualification('frontend', record)


def require_current_frontend_qualification():
    jobs = transport.api('/actions/runs/' + os.environ['GITHUB_RUN_ID'] + '/attempts/' + os.environ['GITHUB_RUN_ATTEMPT'] + '/jobs?per_page=100')
    require(jobs['total_count'] == len(jobs['jobs']), 'Truncated current qualification jobs')
    qualified = [job for job in jobs['jobs'] if job['name'] == 'reviewed-candidate / admitted frontend / unchanged qualification receipts']
    require(len(qualified) == 1 and qualified[0]['head_sha'] == os.environ['CANDIDATE_HEAD_SHA']
            and qualified[0]['status'] == 'completed' and qualified[0]['conclusion'] == 'success', 'Current frontend qualification not successful')


def interaction_frontend(engine, record):
    require(engine in ['chromium', 'firefox', 'webkit'], 'Unknown interaction browser')
    return accept_qualification('interaction-' + engine, record)


def browser_frontend(reports, record):
    require_current_frontend_qualification()
    prior, prior_directory = load_qualification_reports('browser')
    for name in ['browser.json', 'contrast-baseline.json', 'browser-verification.json']:
        shutil.copyfile(prior_directory / name, E / ('prior-' + name))
    current = current_frontend_image()
    # The prior run bound five passed contexts and the separate contrast baseline
    # to these immutable bytes. The browser runner verifies and retains those originals.
    require(json.loads((E / 'frontend-runtime.json').read_text())['entryChanged'] is True,
            'Original qualified assembly entry comparison changed')
    owned = []
    try:
        for mode, image, source in [('current', current, M['frontendAssemblyReceipt']['head'])]:
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
            env = {**os.environ, 'CANDIDATE_SOURCE_SHA': source, 'CANDIDATE_IMAGE_ID': image, 'CANDIDATE_ORIGIN_PORT': '3189', 'CANDIDATE_ENTRY_CHANGED': str(entry_changed).lower(),
                   'REVIEWED_PRIOR_BROWSER_REPORT': str(E / 'prior-browser.json'),
                   'REVIEWED_PRIOR_CONTRAST_REPORT': str(E / 'prior-contrast-baseline.json'),
                   'REVIEWED_PRIOR_BROWSER_VERIFICATION': str(E / 'prior-browser-verification.json')}
            command = ['node', '.github/scripts/reviewed-candidate-browser.mjs']
            phase(record, mode + '-frontend-browser', lambda: run(command, 240, env=env))
            run(['docker', 'rm', '-f', '-v', identity], 30); owned.remove(identity)
        value = json.loads((E / 'browser.json').read_text())
        require(value['status'] == 'success' and value['sourceSha'] == M['frontendAssemblyReceipt']['head']
                and value['currentHead'] == os.environ['CANDIDATE_HEAD_SHA'] and value['imageId'] == current, 'Current browser source/status mismatch')
        scenarios = ['assignments-target-and-identity', 'checkins-target-and-identity', 'scale-draft-published-standard',
                     'course-share-sender-and-admin', 'composite-results-course-return',
                     'survey-existing-form-shared-preview', 'teacher-existing-form-shared-runner']
        accepted, executed = value.get('acceptedRecords', []), value.get('records', [])
        require(len(accepted) == 5 and len(executed) == 9 and value.get('completedBusinessScenarios') == 14,
                'Prior/new browser context counts changed')
        require({(r['scenario'], r['width']) for r in accepted} == {(name, 390) for name in scenarios[:5]}, 'Accepted browser context set changed')
        require({(r['scenario'], r['width']) for r in accepted + executed} == {(name, width) for name in scenarios for width in [390, 1440]},
                'Complete browser context set changed')
        require(all(r.get('status') == r.get('functionalStatus') == r.get('visualStatus') == 'passed' for r in accepted + executed),
                'Prior/new browser context failed')

    finally:
        failures = [identity for identity in reversed(owned) if subprocess.run(['docker','rm','-f','-v',identity],capture_output=True).returncode != 0]
        record['isolatedResourcesRemoved'] = not failures; write(record['report'], record)
        require(not failures, 'Current frontend cleanup failed')


def probe(action, reports, record):
    if action == 'race': return accept_race(record)
    if action == 'frontend': return qualify_frontend(reports, record)
    if action.startswith('interaction-'): return interaction_frontend(action.removeprefix('interaction-'), record)
    return browser_frontend(reports, record)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['frontend', 'browser', 'race', 'interaction-chromium', 'interaction-firefox', 'interaction-webkit'])
    action = parser.parse_args().action
    require(not PRIVATE.exists(), 'Refuse stale private state')
    PRIVATE.mkdir(mode=0o700); E.mkdir(exist_ok=True)
    record = {'schema': 1, 'report': action + '-verification.json', 'status': 'running',
              'sourceSha': M['source']['head'] if action == 'race' else M['frontendAssemblyReceipt']['head'],
              'currentHead': os.environ.get('CANDIDATE_HEAD_SHA'), 'phases': []}
    try:
        reports = {}
        if action == 'race':
            phase(record, 'admit-original-official-evidence', lambda: reports.update(admit()))
        else:
            phase(record, 'validate-current-reviewed-scope', source_scope)
        phase(record, 'accept-prior-successful-race' if action == 'race' else 'qualify-missing-' + action, lambda: probe(action, reports, record))
        record['status'] = 'success'
    except BaseException:
        record['status'] = 'failure'
        raise
    finally:
        write(record['report'], record)
        shutil.rmtree(PRIVATE)
