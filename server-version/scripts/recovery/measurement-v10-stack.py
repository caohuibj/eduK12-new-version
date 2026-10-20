#!/usr/bin/env python3
"""Exact-SHA, disposable V10 transport/DB harness. Never uses existing credentials.

Creates a scratch-only source snapshot, private generated Prisma client, new PG
cluster and restricted synthetic role. No production/CI/pressure work. Existing
business semantics, authentication, Redis and immutable SQL guards stay enabled.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import subprocess
import tarfile
import time
import urllib.request


def resource_budget(path):
    stats = os.statvfs(path)
    if stats.f_bavail * stats.f_frsize < 4 * 1024**3:
        raise RuntimeError('Filesystem free below 4 GiB stop line')
    memory = Path('/proc/meminfo').read_text()
    available = int(re.search(r'^MemAvailable:\s+(\d+)', memory, re.M).group(1)) * 1024
    if available < 2 * 1024**3:
        raise RuntimeError('Available memory below 2 GiB stop line')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--head', required=True)
    parser.add_argument('--hold-seconds', type=int, default=1800)
    parser.add_argument('--api', action='store_true')
    parser.add_argument('--frontend', action='store_true')
    parser.add_argument('--test', action='append', default=[])
    args = parser.parse_args()
    if not re.fullmatch(r'[a-f0-9]{40}', args.head) or not 1 <= args.hold_seconds <= 7200:
        parser.error('Exact 40-character SHA and hold-seconds 1..7200 required')
    if args.frontend and not args.api:
        parser.error('frontend requires the actual API')
    for name in args.test:
        if not re.fullmatch(r'src/__tests__/measurement-content/[a-z0-9-]+\.postgres\.integration\.test\.ts', name):
            parser.error('Only explicitly named V10 measurement-content connected tests are supported')
    root = args.repo.resolve(); tools = args.tools.resolve(); state = args.state.resolve()
    scratch = Path('/workspace/scratch/5a77e8bdc1ae').resolve()
    if scratch not in state.parents or state == root or root in state.parents:
        parser.error('State must be a NEW sibling scratch directory, not the source checkout')
    resource_budget(state.parent)
    node = tools / 'node_modules/node/bin/node'; pg = tools / 'postgresql/bin'
    if subprocess.check_output([str(node), '--version'], text=True).strip() != 'v24.21.0':
        raise RuntimeError('Expected the existing pinned Node 24.21.0')
    if subprocess.check_output(['git', 'rev-parse', args.head + '^{commit}'], cwd=root, text=True).strip() != args.head:
        raise RuntimeError('Exact commit identity mismatch')
    state.mkdir(mode=0o700, exist_ok=False); os.umask(0o077)
    (state / 'tmp').mkdir(); (state / 'source').mkdir()
    env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'LANG': 'C.UTF-8',
           'TZ': 'UTC', 'TMPDIR': str(state / 'tmp'), 'NODE_ENV': 'test',
           'PRISMA_GENERATE_SKIP_AUTOINSTALL': 'true'}
    report = {'head': args.head, 'mode': 'isolated synthetic fixture only', 'startedAt': time.time(),
              'status': 'preparing', 'checks': {}, 'productionAccess': False}
    children = []; logs = []
    backend = state / 'source/server-version/backend'; frontend = state / 'source/server-version/frontend'

    def record():
        (state / 'status.tmp').write_text(json.dumps(report, indent=2))
        (state / 'status.tmp').replace(state / 'status.json')

    def run(command, label, extra=None, data=None, cwd=None, timeout=90):
        report['stage'] = label; record()
        with (state / (label + '.log')).open('w') as log:
            subprocess.run([str(x) for x in command], cwd=cwd or backend, env={**env, **(extra or {})},
                           input=data, text=True, stdout=log, stderr=log, check=True, timeout=timeout)
        report['checks'][label] = 'PASS'; record()

    def start(command, label, extra=None, cwd=None):
        log = (state / (label + '.log')).open('w'); logs.append(log)
        process = subprocess.Popen([str(x) for x in command], cwd=cwd or backend,
                                   env={**env, **(extra or {})}, stdout=log, stderr=log)
        children.append((label, process)); return process

    def free_port():
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); return sock.getsockname()[1]

    def ready(port, process):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if process.poll() is not None: raise RuntimeError('Child exited before readiness')
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.5): return
            except OSError: time.sleep(.1)
        raise RuntimeError('Listener readiness timed out')

    def dependencies(source, target, prisma=False):
        target.mkdir()
        for package in source.iterdir():
            if package.name in ('.bin', '.prisma', '.vite', '.vite-temp'): continue
            if prisma and package.name == '@prisma':
                scope = target / '@prisma'; scope.mkdir()
                for dependency in package.iterdir():
                    if dependency.name == 'client':
                        import shutil
                        shutil.copytree(dependency.resolve(), scope / 'client')
                    else: (scope / dependency.name).symlink_to(dependency.resolve())
            else: (target / package.name).symlink_to(package.resolve())

    def interrupted(signum, _frame):
        report['stopReason'] = f'signal_{signum}'; raise KeyboardInterrupt

    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP): signal.signal(signum, interrupted)
    try:
        archive = state / 'source.tar'
        with archive.open('wb') as output:
            subprocess.run(['git', 'archive', '--format=tar', args.head], cwd=root, stdout=output, check=True)
        with tarfile.open(archive) as bundle: bundle.extractall(state / 'source', filter='data')
        archive.unlink()
        dependencies(root / 'server-version/backend/node_modules', backend / 'node_modules', prisma=True)
        if args.frontend: dependencies(root / 'server-version/frontend/node_modules', frontend / 'node_modules')
        schema = (backend / 'prisma/schema.prisma').read_text()
        output = str(backend / 'node_modules/.prisma/client')
        if re.search(r'^\s*output\s*=', schema, re.M): raise RuntimeError('Unexpected tracked generator output')
        private_schema = schema.replace('provider = "prisma-client-js"', f'provider = "prisma-client-js"\n  output = "{output}"', 1)
        # Prisma resolves its generator relative to the schema. Keep the private
        # derivative under this snapshot's backend so its owned client is found.
        generation_schema = backend / 'prisma/.v10-generation-schema.prisma'
        generation_schema.write_text(private_schema)
        inputs = {'head': args.head, 'sourceMode': True, 'node': '24.21.0', 'files': {}}
        for file in [backend / 'prisma/schema.prisma', backend / 'package-lock.json',
                     backend / 'scripts/runtime-table-policy.json', backend / 'scripts/runtime-role-defaults.sql',
                     backend / 'scripts/runtime-role-contract.mjs', backend / 'scripts/release-schema-contract.mjs',
                     *sorted((backend / 'prisma/migrations').glob('*/migration.sql'))]:
            inputs['files'][str(file.relative_to(state / 'source'))] = hashlib.sha256(file.read_bytes()).hexdigest()
        for name, binary in [('node', node), ('postgres', pg / 'postgres'), ('redis', tools / 'redis/bin/redis-server')]:
            inputs[name + 'Sha256'] = hashlib.sha256(binary.read_bytes()).hexdigest()
        inputs['launcherSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        (state / 'inputs.json').write_text(json.dumps(inputs, indent=2))
        run([node, 'node_modules/prisma/build/index.js', 'generate', '--schema', generation_schema], 'generate-private-client',
            {'DATABASE_URL': 'postgresql://synthetic@127.0.0.1:39403/eduk12_measurement_v10_test'})
        for relative in ('node_modules/.prisma/client/schema.prisma', 'node_modules/.prisma/client/index.js'):
            inputs['files']['generated/' + relative] = hashlib.sha256((backend / relative).read_bytes()).hexdigest()
        (state / 'inputs.json').write_text(json.dumps(inputs, indent=2))
        dbport = 39403; redisport = free_port(); apiport = 39991; uiport = free_port()
        owner_password = secrets.token_hex(24); runtime_password = secrets.token_hex(24)
        runtime_role = 'v10_runtime_' + secrets.token_hex(4); database = 'eduk12_measurement_v10_test'
        (state / 'pg-password').write_text(owner_password)
        run([pg / 'initdb', '-D', state / 'pgdata', '-U', 'v10_owner', '--auth-local=trust',
             '--auth-host=scram-sha-256', '--pwfile=' + str(state / 'pg-password'), '--encoding=UTF8', '--locale=C.UTF-8'], 'initdb')
        process = start([pg / 'postgres', '-D', state / 'pgdata', '-h', '127.0.0.1', '-p', dbport, '-k', '',
                         '-c', 'timezone=UTC', '-c', 'shared_buffers=64MB', '-c', 'max_connections=16',
                         '-c', 'max_wal_size=128MB', '-c', 'min_wal_size=80MB'], 'postgres')
        ready(dbport, process)
        psql = [pg / 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', dbport, '-U', 'v10_owner']
        auth = {'PGPASSWORD': owner_password}
        run([*psql, '-d', 'postgres'], 'create-synthetic-fixture-role', auth,
            f"CREATE DATABASE {database};\nCREATE ROLE {runtime_role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{runtime_password}';\n")
        owner_url = f'postgresql://v10_owner:{owner_password}@127.0.0.1:{dbport}/{database}?connection_limit=2'
        runtime_url = f'postgresql://{runtime_role}:{runtime_password}@127.0.0.1:{dbport}/{database}?connection_limit=4'
        run([node, 'scripts/pr24-migration-preflight.mjs'], 'migration-preflight', {'DATABASE_URL': owner_url})
        run([node, 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrate-deploy', {'DATABASE_URL': owner_url}, timeout=180)
        run([*psql, '-d', database], 'synthetic-schema-usage', auth,
            f'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO {runtime_role};\n')
        run([*psql, '-d', database, '-v', 'target_database=' + database, '-v', 'migration_owner=v10_owner',
             '-v', 'runtime_role=' + runtime_role, '-v', 'table_policy=' + (backend / 'scripts/runtime-table-policy.json').read_text(),
             '-f', 'scripts/runtime-role-defaults.sql'], 'synthetic-exact-runtime-acl', auth)
        runtime = {'DATABASE_URL': runtime_url, 'DATABASE_URL_RUNTIME': runtime_url,
                   'MEASUREMENT_V10_OWNER_DATABASE_URL': owner_url, 'MEASUREMENT_V10_RUNTIME_DATABASE_URL': runtime_url,
                   'MEASUREMENT_V10_FIXTURE': '1', 'MEASUREMENT_V10_HEAD': args.head,
                   'MEASUREMENT_V10_API_URL': f'http://127.0.0.1:{apiport}',
                   'RELEASE_INTEGRATION_DATABASE_URL': runtime_url,
                   'REDIS_URL': f'redis://127.0.0.1:{redisport}', 'PORT': str(apiport),
                   'CORS_ORIGIN': f'http://localhost:{uiport}', 'COOKIE_SECURE': 'false',
                   'SOCKET_REDIS_REQUIRED': 'true',
                   'BACKGROUND_WORKERS_ENABLED': 'false', 'HEAVY_PROCESSING_ENABLED': 'false', 'VIDEO_PROCESSING_ENABLED': 'false',
                   'SURVEY_WORKSPACE_ENABLED': 'true', 'SURVEY_PUBLICATION_ENABLED': 'true', 'SURVEY_ANALYTICS_ENABLED': 'true',
                   'COGNITIVE_MODULE_ENABLED': 'true', 'ASSESSMENT_REPORT_ASYNC_ENABLED': 'true',
                   'ASSESSMENT_WHOLE_SUBMIT_ENABLED': 'true', 'UPLOAD_DIR': str(state / 'uploads'),
                   'EXPORT_DIR': str(state / 'exports')}
        for key in ('JWT_SECRET', 'ASSET_SIGNING_SECRET', 'DATA_ENCRYPTION_KEY', 'DATA_PSEUDONYM_KEY', 'SURVEY_MFA_ENCRYPTION_KEY'):
            runtime[key] = secrets.token_hex(32)
        (state / 'runtime-private.json').write_text(json.dumps(runtime, indent=2))
        report['effectiveFlags'] = {k: v for k, v in runtime.items() if k.endswith('_ENABLED') or k in ('COOKIE_SECURE', 'MEASUREMENT_V10_FIXTURE')}
        run([node, 'scripts/runtime-role-contract.mjs', 'verify-current'], 'restricted-runtime-and-ledger', runtime)
        report['ports'] = {'postgres': dbport, 'redis': redisport, 'api': apiport, 'frontend': uiport}
        if args.api:
            redis = start([tools / 'redis/bin/redis-server', '--bind', '127.0.0.1', '--port', redisport, '--dir', state,
                           '--save', '', '--appendonly', 'no', '--maxmemory', '32mb', '--maxmemory-policy', 'noeviction'], 'redis')
            ready(redisport, redis)
            api = start([node, '--require', state / 'source/server-version/scripts/recovery/loopback-only.cjs',
                         '--import', 'tsx', 'src/index.ts'], 'api', runtime)
            ready(apiport, api)
            for endpoint in ('health', 'ready'):
                with urllib.request.urlopen(f'http://127.0.0.1:{apiport}/{endpoint}', timeout=5) as response:
                    if response.status != 200: raise RuntimeError(endpoint + ' not ready')
                    payload = json.load(response)
                    if payload.get('status') != 'ok': raise RuntimeError(endpoint + ' status not ok')
                    if endpoint == 'ready' and payload.get('dependencies') != {
                            'database': 'ready', 'socketRedis': 'ready', 'cacheRedis': 'ready'}:
                        raise RuntimeError('Actual database and both real Redis consumers must be ready')
                    report['checks'][endpoint] = payload
            report['apiUrl'] = f'http://127.0.0.1:{apiport}'
        if args.frontend:
            ui = start([node, 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', uiport, '--strictPort'],
                       'frontend', {'E2E_BACKEND_URL': f'http://127.0.0.1:{apiport}'}, frontend)
            ready(uiport, ui); report['uiUrl'] = f'http://localhost:{uiport}'
        if args.test:
            try:
                run([node, 'node_modules/vitest/vitest.mjs', 'run', *args.test, '--maxWorkers=1', '--no-file-parallelism',
                     '--no-cache', '--reporter=json', '--outputFile=' + str(state / 'connected-results.json')],
                    'focused-connected-tests', runtime, timeout=180)
            except subprocess.CalledProcessError:
                # Preserve the isolated running fixture for exact failed-test diagnosis,
                # rather than remigrating or replaying successful tests automatically.
                report['checks']['focused-connected-tests'] = 'FAIL'
                report['testFailure'] = True
        report['status'] = 'ready_with_failed_tests' if report.get('testFailure') else 'ready'; report['pids'] = {label: p.pid for label, p in children}; record()
        print(json.dumps(report), flush=True)
        deadline = time.monotonic() + args.hold_seconds
        while time.monotonic() < deadline and not (state / 'stop').exists():
            if any(p.poll() is not None for _, p in children): raise RuntimeError('A fixture service exited unexpectedly')
            resource_budget(state)
            time.sleep(.5)
    except KeyboardInterrupt:
        report.setdefault('stopReason', 'operator stop')
    except Exception as error:
        report['status'] = 'failed'; report['errorType'] = type(error).__name__
        report['stopReason'] = 'Stage failed; inspect the exact private stage log'
        raise
    finally:
        for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP): signal.signal(signum, signal.SIG_IGN)
        for label, process in reversed(children):
            if process.poll() is None:
                process.send_signal(signal.SIGINT if label == 'postgres' else signal.SIGTERM)
                try: process.wait(timeout=15)
                except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
        for log in logs: log.close()
        report['cleanupVerified'] = all(process.poll() is not None for _, process in children)
        report['stoppedAt'] = time.time()
        if report['status'] != 'failed': report['status'] = 'stopped'
        record()


if __name__ == '__main__': main()
