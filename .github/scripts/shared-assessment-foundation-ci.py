"""Bounded, push-only CI candidate. No deployment, merge gate or local-test admission.

Build producers and consumers communicate through one same-run Actions artifact.
There is deliberately no cross-run cache/evidence lookup or fallback rebuild.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
BINDING = ROOT / '.github/scripts/shared-assessment-foundation-bindings.json'
APPROVED = json.loads(BINDING.read_text())
TOOLS = {
    '.github/scripts/shared-assessment-foundation-bindings.json',
    '.github/scripts/shared-assessment-foundation-ci.py',
    '.github/scripts/shared-assessment-foundation-ci.test.py',
    '.github/scripts/shared-assessment-foundation-runtime.cjs',
    '.github/workflows/ci-shared-assessment-foundation.yml',
    'docs/shared-assessment-foundation-ci.md',
}
E = ROOT / 'foundation-ci-evidence'
PRIVATE = ROOT / 'foundation-ci-private'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def output(args, timeout=60):
    return subprocess.check_output(args, cwd=ROOT, text=True, timeout=timeout).strip()


def git(*args):
    return output(['git', *args])


def write(name, value):
    E.mkdir(exist_ok=True)
    (E / name).write_text(json.dumps(value, indent=2) + '\n')


def entries(base, head):
    raw = subprocess.check_output(['git', 'diff', '--raw', '-z', '--no-renames', '--abbrev=40', base, head], cwd=ROOT)
    fields = raw.decode().split('\0')
    result = []
    while fields and fields[0]:
        metadata, path = fields[:2]
        del fields[:2]
        old_mode, new_mode, old, new, status = metadata.removeprefix(':').split()
        result.append({'file': path, 'oldMode': old_mode, 'newMode': new_mode,
                       'before': None if old == '0' * 40 else old, 'after': new, 'status': status})
    return result


def validate_changes(changes, approved=APPROVED):
    seen = set()
    for change in changes:
        path = change['file']
        assert path not in seen, 'Duplicate diff path'
        seen.add(path)
        assert change['newMode'] == '100644', 'Only regular non-executable files are admitted'
        assert (change['status'], change['oldMode']) in [('A', '000000'), ('M', '100644')], 'Deletion, rename or type/mode change'
        if path in approved['files']:
            assert {k: change[k] for k in ['before', 'after']} == approved['files'][path], 'Changed approved product blob: ' + path
        else:
            assert path in TOOLS, 'Unreviewed path: ' + path
    assert set(approved['files']).issubset(seen), 'Missing approved product change'


def scope():
    head = git('rev-parse', 'HEAD')
    assert APPROVED['schema'] == 1 and re.fullmatch('[0-9a-f]{40}', head)
    assert git('rev-parse', 'refs/remotes/origin/main') == APPROVED['base'], 'Main moved; review the full new diff first'
    # GitHub's commit API assigns a new commit identity. Product source is the
    # reviewed local receipt; exact blobs/trees, not its local commit metadata,
    # bind the remotely published candidate. Its frozen main must be ancestral.
    subprocess.run(['git', 'merge-base', '--is-ancestor', APPROVED['base'], head], cwd=ROOT, check=True)
    changes = entries(APPROVED['base'], head)
    validate_changes(changes)
    assert TOOLS.issubset({item['file'] for item in changes}), 'Missing committed candidate tools'
    subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--', *sorted(TOOLS), 'server-version'], cwd=ROOT, check=True)
    for component, tree in APPROVED['components'].items():
        assert git('rev-parse', head + ':server-version/' + component) == tree, 'Product tree changed'
    # The controlled tsc-only recipe retains the already-frozen scientific catalogs
    # and every generator/configuration input from main; it never regenerates them.
    generated = ['src/modules/' + name for name in ['scale', 'situational', 'cognitive', 'assessment-bundle']]
    generated += ['scripts', 'prisma', 'package.json', 'package-lock.json', 'Dockerfile', 'tsconfig.json']
    unchanged = {}
    for relative in generated:
        path = 'server-version/backend/' + relative
        before, after = git('rev-parse', APPROVED['base'] + ':' + path), git('rev-parse', head + ':' + path)
        assert before == after, 'Generated catalog or generator/config input changed: ' + path
        unchanged[path] = after
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        assert os.environ.get('GITHUB_EVENT_NAME') == 'push'
        assert os.environ.get('GITHUB_REF') == APPROVED['branch']
        assert os.environ.get('GITHUB_SHA') == head
    plan = {'schema': 1, 'head': head, 'base': APPROVED['base'], 'productSource': APPROVED['productSource'],
            'components': APPROVED['components'], 'changes': changes, 'unchangedGeneratedInputs': unchanged,
            'tools': {path: git('rev-parse', head + ':' + path) for path in sorted(TOOLS)},
            'claim': 'Local input-bound functional review plus new CI candidate assembly/security/bounded runtime checks; not merge or production qualification'}
    write('scope.json', plan)
    return plan


def official():
    assert os.environ.get('CI') == 'true' and os.environ.get('GITHUB_ACTIONS') == 'true', 'Official isolated Actions only'
    assert os.environ.get('GITHUB_REF') == APPROVED['branch']
    PRIVATE.mkdir(exist_ok=True, mode=0o700)


def execute(command, timeout=1200, **kwargs):
    return subprocess.run(command, cwd=ROOT, check=True, timeout=timeout, **kwargs)


def phase(record, name, action):
    assert not any(item['name'] == name for item in record['phases']), 'No silent phase repetition'
    item = {'name': name, 'status': 'running'}
    record['phases'].append(item)
    start = time.monotonic()
    write(record['report'], record)
    try:
        action()
        item['status'] = 'success'
    except BaseException as error:
        item.update(status='failure', errorType=type(error).__name__)
        raise
    finally:
        item['seconds'] = round(time.monotonic() - start, 3)
        write(record['report'], record)


def frozen_base(image):
    execute(['docker', 'pull', image], 600)
    details = json.loads(output(['docker', 'image', 'inspect', image]))[0]
    values = details['RepoDigests']
    assert values and all('@sha256:' in value for value in values)
    return values[0]


def copy_files(image, directory, destination):
    container = output(['docker', 'create', image])
    try:
        execute(['docker', 'cp', container + ':' + directory + '/.', str(destination)], 120)
    finally:
        execute(['docker', 'rm', '-v', container], 30)


def files_manifest(directory):
    result = {}
    for path in sorted(directory.rglob('*')):
        assert not path.is_symlink(), 'Unexpected symbolic link in static output'
        if path.is_file():
            result[path.relative_to(directory).as_posix()] = digest(path.read_bytes())
    assert result
    return result


def build(component):
    official()
    plan = scope()
    context = ROOT / 'server-version' / component
    head = plan['head']
    prefix = 'eduk12-foundation-' + component + ':' + head
    record = {'schema': 1, 'report': component + '-builder.json', 'stage': 'builder', 'head': head,
              'runId': os.environ['GITHUB_RUN_ID'], 'producerAttempt': os.environ['GITHUB_RUN_ATTEMPT'],
              'component': component, 'componentTree': plan['components'][component], 'tools': plan['tools'],
              'bases': {}, 'phases': [], 'status': 'running', 'images': {},
              'classification': 'CI candidate, not a deployable qualification receipt'}
    dockerfile = context / 'Dockerfile'
    text = dockerfile.read_text()
    for image in re.findall(r'^FROM (\S+) AS ', text, re.MULTILINE):
        if ':' not in image:
            continue
        if image not in record['bases']:
            record['bases'][image] = frozen_base(image)
        text = text.replace('FROM ' + image + ' AS ', 'FROM ' + record['bases'][image] + ' AS ')
    if component == 'backend':
        assert text.count('RUN npm run build\n') == 1
        text = text.replace('RUN npm run build\n', 'RUN NODE_OPTIONS=--max-old-space-size=3072 npx tsc\n')
        record['compileRecipeException'] = 'Exact tsc-only replacement; unchanged tracked scientific catalogs/generators are bound in scope.json. Not the unmodified production build recipe.'
    else:
        record['buildFlags'] = {'VITE_COGNITIVE_MODULE_ENABLED': 'true', 'teacherAndPrivacyFlags': 'Dockerfile defaults false', 'dotenv': 'excluded by tracked .dockerignore'}
    effective = PRIVATE / (component + '.Dockerfile')
    effective.write_text(text)
    record['effectiveDockerfileSha256'] = digest(effective.read_bytes())
    common = ['docker', 'buildx', 'build', '--builder', 'default', '--load', '-f', str(effective), '--label', 'org.opencontainers.image.revision=' + head,
              '--build-arg', 'NPM_REGISTRY=https://registry.npmjs.org']
    common += ['--build-arg', 'DEBIAN_MIRROR=deb.debian.org'] if component == 'backend' else ['--build-arg', 'VITE_COGNITIVE_MODULE_ENABLED=true']
    phase(record, 'compile-once', lambda: execute(common + ['--target', 'build', '-t', prefix + '-build', str(context)], 1800))
    record['images']['builder'] = output(['docker', 'image', 'inspect', '--format', '{{.Id}}', prefix + '-build'])
    if component == 'frontend':
        static = PRIVATE / 'frontend-builder'; static.mkdir()
        copy_files(prefix + '-build', '/app/dist', static)
        record['staticFiles'] = files_manifest(static)
        # COPY overlays nginx's stock HTML directory; bind any base-owned extras
        # from the exact frozen base instead of accepting unknown runtime files.
        stock = PRIVATE / 'frontend-base'; stock.mkdir()
        copy_files(record['bases']['nginx:1.31.6-alpine3.24-slim'], '/usr/share/nginx/html', stock)
        record['baseStaticFiles'] = files_manifest(stock)
        record['staticBytes'] = sum(path.stat().st_size for path in static.rglob('*') if path.is_file())
        js = [path for path in static.rglob('*.js') if path.is_file()]
        record['jsBytes'] = sum(path.stat().st_size for path in js)
        record['jsGzipBytes'] = sum(len(gzip.compress(path.read_bytes(), mtime=0)) for path in js)
        record['localComparison'] = {'local393ManifestSha256': APPROVED['localReview']['foundation']['metrics']['candidateManifestSha256'],
                                     'notice': 'Not an equality gate: local cognitive=false, official cognitive=true and Docker excludes dotenv.'}
    archive_image(record, prefix + '-build')


def archive_image(record, image):
    archive = E / (record['component'] + '-' + record['stage'] + '.tar.zst')
    def emit():
        producer = subprocess.Popen(['docker', 'save', image], stdout=subprocess.PIPE)
        try:
            with archive.open('wb') as destination:
                execute(['zstd', '-T2', '-3', '-c'], 600, stdin=producer.stdout, stdout=destination)
            assert producer.wait(timeout=60) == 0
        finally:
            if producer.poll() is None:
                producer.kill(); producer.wait()
        record['archive'] = {'file': archive.name, 'sha256': file_digest(archive), 'bytes': archive.stat().st_size}
    phase(record, 'immutable-image-archive', emit)
    record['status'] = 'success'; write(record['report'], record)


def runtime(component):
    builder = load(component, 'builder')
    context = ROOT / 'server-version' / component
    prefix = 'eduk12-foundation-' + component + ':' + builder['head']
    record = {**builder, 'stage': 'runtime', 'report': component + '-runtime.json', 'phases': [],
              'status': 'running', 'images': {}, 'builderImage': builder['images']['builder'],
              'builderReceiptSha256': digest((E / (component + '-builder.json')).read_bytes())}
    record.pop('archive', None)
    text = (context / 'Dockerfile').read_text()
    for image, frozen in builder['bases'].items():
        text = text.replace('FROM ' + image + ' AS ', 'FROM ' + frozen + ' AS ')
    marker = 'FROM build AS prod-deps' if component == 'backend' else 'FROM ' + builder['bases']['nginx:1.31.6-alpine3.24-slim'] + ' AS runtime'
    assert text.count(marker) == 1
    # Alias the inspected loaded image. The tail has no compilation instruction.
    alias = prefix + '-build'
    execute(['docker', 'tag', builder['images']['builder'], alias], 30)
    recipe = PRIVATE / (component + '-runtime.Dockerfile')
    recipe.write_text('FROM ' + alias + ' AS build\n' + text[text.index(marker):])
    record['runtimeDockerfileSha256'] = digest(recipe.read_bytes())
    args = ['docker', 'buildx', 'build', '--builder', 'default', '--load', '-f', str(recipe),
            '--label', 'org.opencontainers.image.revision=' + builder['head']]
    if component == 'backend':
        args += ['--build-arg', 'DEBIAN_MIRROR=deb.debian.org']
    phase(record, 'runtime-from-exact-builder', lambda: execute(args + ['--target', 'runtime', '-t', prefix, str(context)], 900))
    record['images']['runtime'] = output(['docker', 'image', 'inspect', '--format', '{{.Id}}', prefix])
    archive_image(record, prefix)


def load(component, stage):
    official(); plan = scope()
    record = json.loads((E / (component + '-' + stage + '.json')).read_text())
    assert record['stage'] == stage
    assert record['status'] == 'success' and all(p['status'] == 'success' for p in record['phases'])
    assert record['head'] == plan['head'] and record['runId'] == os.environ['GITHUB_RUN_ID']
    assert record['component'] == component and record['componentTree'] == plan['components'][component]
    assert record['tools'] == plan['tools'], 'Producer and consumer tools changed'
    archive = E / (component + '-' + stage + '.tar.zst')
    assert record['archive']['file'] == archive.name and record['archive']['sha256'] == file_digest(archive)
    producer = subprocess.Popen(['zstd', '-dc', str(archive)], stdout=subprocess.PIPE)
    try:
        execute(['docker', 'load'], 600, stdin=producer.stdout)
        assert producer.wait(timeout=30) == 0
    finally:
        if producer.poll() is None:
            producer.kill(); producer.wait()
    for image in record['images'].values():
        detail = json.loads(output(['docker', 'image', 'inspect', image]))[0]
        assert detail['Id'] == image and detail['Config']['Labels']['org.opencontainers.image.revision'] == plan['head']
    return record


def container_env(env, command, image, mounts=(), user=False):
    args = ['docker', 'run', '--rm', '--network', 'host']
    if user:
        args += ['--user', str(os.getuid()) + ':' + str(os.getgid())]
    for key, value in env.items():
        args += ['-e', key + '=' + str(value)]
    for source, target in mounts:
        args += ['-v', str(source) + ':' + target]
    return args + [image] + command


def verify(component, action):
    producer = load(component, 'builder' if action == 'audit' else 'runtime')
    record = {'report': component + '-' + action + '-verification.json', 'head': producer['head'], 'runId': producer['runId'],
              'component': component, 'images': producer['images'], 'phases': [], 'status': 'running'}
    if action == 'audit':
        phase(record, 'dependency-audit', lambda: execute(['docker', 'run', '--rm', producer['images']['builder'], 'npm', 'audit', '--audit-level=high'], 300))
    elif action == 'scan':
        phase(record, 'actual-runtime-high-critical-scan', lambda: execute(['trivy', 'image', '--exit-code', '1', '--ignore-unfixed', '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL', '--format', 'json', '--output', str(E / (component + '-scan.json')), producer['images']['runtime']], 600))
    elif component == 'frontend':
        def frontend():
            static = PRIVATE / 'frontend-runtime'; static.mkdir()
            copy_files(producer['images']['runtime'], '/usr/share/nginx/html', static)
            actual = files_manifest(static)
            expected = {**producer['baseStaticFiles'], **producer['staticFiles']}
            assert actual == expected, 'Runtime bytes differ from exact builder output plus pinned base-owned files'
            assert 'index.html' in actual and any(name.endswith('.js') for name in actual)
            record['staticBytes'] = producer['staticBytes']; record['jsBytes'] = producer['jsBytes']; record['jsGzipBytes'] = producer['jsGzipBytes']
            record['builderStaticFileCount'] = len(producer['staticFiles'])
            record['runtimeStaticFileCount'] = len(actual)
            record['baseOwnedExtraFiles'] = {name: value for name, value in producer['baseStaticFiles'].items() if name not in producer['staticFiles']}
        phase(record, 'same-builder-runtime-static-bytes', frontend)
    else:
        builder = load(component, 'builder')
        assert producer['builderImage'] == builder['images']['builder']
        assert producer['builderReceiptSha256'] == digest((E / (component + '-builder.json')).read_bytes())
        producer['images']['builder'] = builder['images']['builder']
        backend_runtime(record, producer)
    record['status'] = 'success'; write(record['report'], record)


def backend_runtime(record, producer):
    env = {'CI': 'true', 'GITHUB_ACTIONS': 'true', 'NODE_ENV': 'production', 'FOUNDATION_CI_ISOLATED': '1',
           'FOUNDATION_CI_SOURCE_SHA': producer['head'], 'FOUNDATION_CI_IMAGE_ID': producer['images']['runtime'],
           'SURVEY_CI_ISOLATED': '1', 'SURVEY_CI_SOURCE_SHA': producer['head'], 'SURVEY_CI_IMAGE_ID': producer['images']['builder'],
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
    resources = []
    for name in ['survey-ci-postgres', 'foundation-ci-redis', 'foundation-ci-api']:
        assert subprocess.run(['docker', 'inspect', name], capture_output=True).returncode != 0, 'Refuse to reuse an existing container: ' + name
    try:
        for name, image, extra in [
            ('survey-ci-postgres', 'postgres:16.15-bookworm', ['-e', 'POSTGRES_USER=ptool', '-e', 'POSTGRES_PASSWORD=ptool123', '-e', 'POSTGRES_DB=survey_candidate_ci_test', '-p', '127.0.0.1:5432:5432']),
            ('foundation-ci-redis', 'redis:7.4.11-bookworm', ['-p', '127.0.0.1:6379:6379'])]:
            frozen = frozen_base(image)
            record.setdefault('services', {})[image] = frozen
            container = output(['docker', 'run', '-d', '--name', name, '--label', 'foundation-ci-run=' + producer['runId'], *extra, frozen], 180)
            assert re.fullmatch('[a-f0-9]{64}', container)
            resources.append(container)
        for _ in range(60):
            pg = subprocess.run(['docker', 'exec', 'survey-ci-postgres', 'pg_isready', '-U', 'ptool'], capture_output=True)
            redis = subprocess.run(['docker', 'exec', 'foundation-ci-redis', 'redis-cli', 'ping'], capture_output=True)
            if pg.returncode == redis.returncode == 0 and redis.stdout.strip() == b'PONG':
                break
            time.sleep(1)
        else:
            raise RuntimeError('Isolated service readiness exceeded 60 seconds')
        operator = {**env, 'DATABASE_URL': env['DATABASE_URL_ADMIN'], 'RUNTIME_ROLE_REQUIRED': 'false'}
        phase(record, 'isolated-empty-schema-fixture', lambda: execute(container_env(operator, ['npx', 'prisma', 'migrate', 'deploy'], producer['images']['builder']), 300))
        phase(record, 'restricted-runtime-role', lambda: execute(['python3', '-B', '.github/scripts/survey-candidate-recovery.py', 'bootstrap', producer['images']['builder'], str(E)], 300, env={**os.environ, **env}))
        args = ['docker', 'run', '-d', '--name', 'foundation-ci-api', '--label', 'foundation-ci-run=' + producer['runId'], '--network', 'host']
        # The API never receives the fixture/operator database URL.
        for key, value in env.items():
            if key not in ['DATABASE_URL_ADMIN', 'SURVEY_CI_IMAGE_ID']:
                args += ['-e', key + '=' + value]
        container = output(args + [producer['images']['runtime']], 60)
        assert re.fullmatch('[a-f0-9]{64}', container)
        resources.append(container)
        for _ in range(60):
            try:
                with urllib.request.urlopen('http://127.0.0.1:3000/ready', timeout=2) as response:
                    if response.status == 200:
                        break
            except Exception:
                pass
            time.sleep(1)
        else:
            raise RuntimeError('Candidate runtime readiness exceeded 60 seconds')
        mounts = [(ROOT / '.github/scripts/shared-assessment-foundation-runtime.cjs', '/probe.cjs:ro'),
                  (ROOT / 'server-version/backend/src/__tests__/assessment-core/fixtures', '/fixtures:ro'), (E, '/evidence')]
        phase(record, 'compiled-core-and-bounded-http-persistence', lambda: execute(container_env(env, ['node', '/probe.cjs'], producer['images']['runtime'], mounts, user=True), 150))
        report = json.loads((E / 'runtime-http.json').read_text())
        assert report['status'] == 'success' and report['sourceSha'] == producer['head'] and report['imageId'] == producer['images']['runtime']
    finally:
        errors = []
        for name in reversed(resources):
            result = subprocess.run(['docker', 'rm', '-f', '-v', name], capture_output=True)
            if result.returncode != 0:
                errors.append(name)
        record['isolatedResourcesRemoved'] = not errors
        write(record['report'], record)
        if errors:
            raise RuntimeError('Owned disposable resources failed cleanup')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['scope', 'build', 'runtime', 'audit', 'scan', 'probe'])
    parser.add_argument('component', nargs='?', choices=['backend', 'frontend'])
    args = parser.parse_args()
    if args.action == 'scope':
        scope()
    else:
        assert args.component
        try:
            if args.action in ['build', 'runtime']:
                {'build': build, 'runtime': runtime}[args.action](args.component)
            else:
                verify(args.component, args.action)
        finally:
            if PRIVATE.exists():
                shutil.rmtree(PRIVATE)
