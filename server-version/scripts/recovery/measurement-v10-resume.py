#!/usr/bin/env python3
"""Resume a disposable V10 cluster; optionally apply one reviewed increment.

Exec sandboxes may isolate loopback per invocation. Fixed, hash-bound acceptance
tasks therefore run as children of the SAME supervisor as PG/API/Redis. This does
not change network configuration or expose a listener beyond 127.0.0.1.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--hold-seconds', type=int, default=3600)
    parser.add_argument('--candidate', help='Exact reviewed incremental candidate; never reapplies old migrations')
    args = parser.parse_args()
    state, repo, tools = args.state.resolve(), args.repo.resolve(), args.tools.resolve()
    if not str(state).startswith('/workspace/scratch/5a77e8bdc1ae/measurement-v10-connected-'):
        parser.error('Dedicated synthetic state required')
    if not 1 <= args.hold_seconds <= 7200:
        parser.error('Bounded hold required')
    os.umask(0o077)
    original = json.loads((state / 'status.json').read_text())
    inputs = json.loads((state / 'inputs.json').read_text())
    runtime = json.loads((state / 'runtime-private.json').read_text())
    assert original['cleanupVerified'] and original['head'] == inputs['head'] == runtime['MEASUREMENT_V10_HEAD']
    assert runtime['MEASUREMENT_V10_FIXTURE'] == '1' and not (state / 'pgdata/postmaster.pid').exists()
    assert original['checks']['migrate-deploy'] == 'PASS'
    backend = state / 'source/server-version/backend'
    for name, digest in inputs['files'].items():
        file = backend / name.removeprefix('generated/') if name.startswith('generated/') else state / 'source' / name
        assert hashlib.sha256(file.read_bytes()).hexdigest() == digest, 'Frozen input changed: ' + name
    node = tools / 'node_modules/node/bin/node'
    pg = tools / 'postgresql/bin'
    for name, binary in [('node', node), ('postgres', pg / 'postgres'), ('redis', tools / 'redis/bin/redis-server')]:
        assert hashlib.sha256(binary.read_bytes()).hexdigest() == inputs[name + 'Sha256']
    spec = importlib.util.spec_from_file_location('v10_stack', repo / 'server-version/scripts/recovery/measurement-v10-stack.py')
    stack = importlib.util.module_from_spec(spec); spec.loader.exec_module(stack)
    stack.resource_budget(state)
    env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'LANG': 'C.UTF-8',
           'TMPDIR': str(state / 'tmp'), 'TZ': 'UTC', 'NODE_ENV': 'test', **runtime,
           'MEASUREMENT_V10_STATE': str(state)}
    report = {'head': inputs['head'], 'startedAt': time.time(), 'status': 'starting', 'tasks': [],
              'resumeOnly': True, 'migrationsReapplied': False,
              'supervisorSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    patch_file = state / 'source-patches.json'
    if patch_file.exists():
        patches = json.loads(patch_file.read_text())
        for patch in patches:
            assert re.fullmatch(r'[a-f0-9]{40}', patch['commit'])
            assert patch['baseHead'] == inputs['head']
            for name, digest in patch['files'].items():
                assert name in ('server-version/backend/src/modules/questionnaire-product/content-report.service.ts',
                                'server-version/backend/src/modules/survey/report-drafts.service.ts')
                assert hashlib.sha256((state / 'source' / name).read_bytes()).hexdigest() == digest
                committed = subprocess.check_output(['git', 'show', patch['commit'] + ':' + name], cwd=repo)
                assert hashlib.sha256(committed).hexdigest() == digest
        report['sourcePatches'] = patches
    candidate_file = state / 'candidate-inputs.json'
    candidate_completion = state / 'candidate-upgrade-result.json'
    incremental_deploy = False
    if candidate_file.exists():
        candidate = json.loads(candidate_file.read_text())
        completed = json.loads(candidate_completion.read_text()) if candidate_completion.exists() else {}
        assert completed.get('passed') and completed.get('head') == candidate['head'], \
            'An earlier upgrade has an uncertain outcome and requires explicit reconciliation'
        assert args.candidate in (None, candidate['head']), 'Only the already verified candidate can resume'
        assert candidate['baseHead'] == inputs['head']
        backend = Path(candidate['sourceRoot']) / 'server-version/backend'
        assert backend == state / ('candidate-' + candidate['head']) / 'server-version/backend'
        for name, digest in candidate['files'].items():
            assert hashlib.sha256((backend / name).read_bytes()).hexdigest() == digest
        for name, digest in candidate['migrationHashes'].items():
            assert hashlib.sha256((backend / 'prisma/migrations' / name).read_bytes()).hexdigest() == digest
        report['incrementalCandidate'] = candidate
        report['incrementalMigrationAndRuntime'] = 'REUSED_EXACT_PRIOR_PASS'
        report['head'] = candidate['head']
        runtime['MEASUREMENT_V10_HEAD'] = candidate['head']
        runtime['MEASUREMENT_V10_SOURCE_ROOT'] = candidate['sourceRoot']
        env.update(runtime)
    elif args.candidate:
        assert re.fullmatch(r'[a-f0-9]{40}', args.candidate)
        assert subprocess.check_output(['git', 'rev-parse', args.candidate + '^{commit}'], cwd=repo, text=True).strip() == args.candidate
        old_migrations = {name.removeprefix('server-version/backend/prisma/migrations/'): digest
                          for name, digest in inputs['files'].items()
                          if name.startswith('server-version/backend/prisma/migrations/')}
        tracked = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', args.candidate,
            'server-version/backend/prisma/migrations'], cwd=repo, text=True).splitlines()
        new_migrations = {}
        for name in tracked:
            if name.endswith('/migration.sql'):
                data = subprocess.check_output(['git', 'show', args.candidate + ':' + name], cwd=repo)
                new_migrations[name.removeprefix('server-version/backend/prisma/migrations/')] = hashlib.sha256(data).hexdigest()
        assert all(new_migrations.get(name) == digest for name, digest in old_migrations.items()), 'Applied migration mutated or removed'
        added = sorted(set(new_migrations) - set(old_migrations))
        assert added and len(added) <= 3, 'Only explicit small additive migration increments are supported'
        assert added == sorted(added) and min(added) > max(old_migrations), 'Increment must follow the frozen ledger'
        next_root = state / ('candidate-' + args.candidate)
        next_root.mkdir(exist_ok=False)
        archive = next_root / 'source.tar'
        with archive.open('wb') as output:
            subprocess.run(['git', 'archive', args.candidate], cwd=repo, stdout=output, check=True)
        import tarfile
        with tarfile.open(archive) as bundle: bundle.extractall(next_root, filter='data')
        archive.unlink()
        old_backend = backend
        backend = next_root / 'server-version/backend'
        import shutil
        target = backend / 'node_modules'; target.mkdir()
        for package in (old_backend / 'node_modules').iterdir():
            if package.name in ('.bin', '.prisma', '.vite', '.vite-temp'): continue
            if package.name == '@prisma':
                (target / '@prisma').mkdir()
                for dependency in package.iterdir():
                    if dependency.name == 'client': shutil.copytree(dependency.resolve(), target / '@prisma/client')
                    else: (target / '@prisma' / dependency.name).symlink_to(dependency.resolve())
            else: (target / package.name).symlink_to(package.resolve())
        schema = (backend / 'prisma/schema.prisma').read_text()
        assert not re.search(r'^\s*output\s*=', schema, re.M)
        schema = schema.replace('provider = "prisma-client-js"',
            f'provider = "prisma-client-js"\n  output = "{backend / "node_modules/.prisma/client"}"', 1)
        private_schema = backend / 'prisma/.v10-generation-schema.prisma'
        private_schema.write_text(schema)
        with (state / 'candidate-generate.log').open('w') as log:
            subprocess.run([str(node), 'node_modules/prisma/build/index.js', 'generate', '--schema', str(private_schema)],
                cwd=backend, env={**env, 'PRISMA_GENERATE_SKIP_AUTOINSTALL': 'true'}, stdout=log, stderr=log, check=True, timeout=90)
        candidate = {'head': args.candidate, 'baseHead': inputs['head'], 'sourceRoot': str(next_root),
                     'addedMigrations': added, 'files': {}}
        for name in ['prisma/schema.prisma', 'scripts/runtime-table-policy.json', 'package-lock.json',
                     'node_modules/.prisma/client/schema.prisma', 'node_modules/.prisma/client/index.js']:
            candidate['files'][name] = hashlib.sha256((backend / name).read_bytes()).hexdigest()
        candidate['migrationHashes'] = new_migrations
        candidate_file.write_text(json.dumps(candidate, indent=2))
        report['incrementalCandidate'] = candidate
        report['head'] = args.candidate
        runtime['MEASUREMENT_V10_HEAD'] = args.candidate
        runtime['MEASUREMENT_V10_SOURCE_ROOT'] = str(next_root)
        env.update(runtime)
        (state / 'candidate-runtime-private.json').write_text(json.dumps(runtime, indent=2))
        incremental_deploy = True
    candidate_patches_file = state / 'candidate-patches.json'
    if candidate_patches_file.exists():
        assert report['head'] != inputs['head'], 'Incremental patches require an exact candidate'
        candidate_patches = json.loads(candidate_patches_file.read_text())
        effective_patches = {}
        for patch in candidate_patches:
            assert patch['baseHead'] == report['head'] and re.fullmatch(r'[a-f0-9]{40}', patch['commit'])
            for name, digest in patch['files'].items():
                assert name in (
                    'src/controllers/scaleController.ts',
                    'src/modules/assessment-run/startExecution.ts',
                    'src/modules/assessment-runtime/unified-form-section-final-submit.service.ts',
                    'src/modules/composite/training-reference-admission.ts',
                    'src/modules/composite/training-variant-child-scope.ts',
                    'src/modules/composite/training-variant-markers.ts',
                    'src/modules/composite/composite.service.ts',
                    'src/modules/composite/final-submit.service.ts',
                    'src/modules/composite/training-private-reference-use.ts',
                    'src/modules/composite/training-reference-selection.ts',
                    'src/modules/composite/training-metric-disclosure.ts',
                    'src/modules/cognitive/completion.service.ts',
                    'src/modules/cognitive/trial.service.ts',
                    'src/modules/cognitive/session-lock.ts')
                data = subprocess.check_output(['git', 'show', patch['commit'] + ':server-version/backend/' + name], cwd=repo)
                assert hashlib.sha256(data).hexdigest() == digest
                effective_patches[name] = digest
        # Keep the complete reviewed patch history while checking the last
        # exact blob for paths intentionally changed by a later repair.
        for name, digest in effective_patches.items():
            assert hashlib.sha256((backend / name).read_bytes()).hexdigest() == digest
        report['candidatePatches'] = candidate_patches
    children, logs = [], []

    def record():
        (state / 'resume-status.tmp').write_text(json.dumps(report, indent=2))
        (state / 'resume-status.tmp').replace(state / 'resume-status.json')

    def start(command, name, extra=None):
        log = (state / (name + '-resume.log')).open('a'); logs.append(log)
        process = subprocess.Popen([str(value) for value in command], cwd=backend,
                                   env={**env, **(extra or {})}, stdout=log, stderr=log)
        children.append((name, process)); return process

    def ready(port, process):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError('Service exited before readiness')
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.5): return
            except OSError: time.sleep(.1)
        raise RuntimeError('Service readiness timed out')

    def interrupted(signum, frame):
        report['stopReason'] = f'signal_{signum}'; raise KeyboardInterrupt

    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(signum, interrupted)
    try:
        postgres = start([pg / 'postgres', '-D', state / 'pgdata', '-h', '127.0.0.1', '-p', '39403', '-k', '',
                          '-c', 'timezone=UTC', '-c', 'shared_buffers=64MB', '-c', 'max_connections=16',
                          '-c', 'max_wal_size=128MB', '-c', 'min_wal_size=80MB'], 'postgres')
        ready(39403, postgres)
        if incremental_deploy:
            with (state / 'candidate-migrate.log').open('w') as log:
                subprocess.run([str(node), 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], cwd=backend,
                    env={**env, 'DATABASE_URL': runtime['MEASUREMENT_V10_OWNER_DATABASE_URL']},
                    stdout=log, stderr=log, check=True, timeout=90)
            # No new tables/grants are assumed. Exact runtime verification fails
            # closed if an increment would require further fixture ACL review.
            with (state / 'candidate-runtime-verify.log').open('w') as log:
                subprocess.run([str(node), 'scripts/runtime-role-contract.mjs', 'verify-current'], cwd=backend,
                    env=env, stdout=log, stderr=log, check=True, timeout=30)
            report['incrementalMigrationAndRuntime'] = 'PASS'
            candidate_completion.write_text(json.dumps({'head': candidate['head'], 'passed': True,
                'addedMigrations': candidate['addedMigrations'], 'completedAt': time.time(),
                'runtimeVerificationSha256': hashlib.sha256((state / 'candidate-runtime-verify.log').read_bytes()).hexdigest(),
                'migrateLogSha256': hashlib.sha256((state / 'candidate-migrate.log').read_bytes()).hexdigest()}, indent=2))
        redis_port = original['ports']['redis']
        redis = start([tools / 'redis/bin/redis-server', '--bind', '127.0.0.1', '--port', redis_port,
                       '--dir', state, '--save', '', '--appendonly', 'no', '--maxmemory', '32mb', '--maxmemory-policy', 'noeviction'], 'redis')
        ready(redis_port, redis)
        api = start([node, '--require', backend.parent / 'scripts/recovery/loopback-only.cjs',
                     '--import', 'tsx', 'src/index.ts'], 'api')
        ready(39991, api)
        with urllib.request.urlopen('http://127.0.0.1:39991/ready', timeout=5) as response:
            health = json.load(response)
            assert health['status'] == 'ok' and health['dependencies'] == {
                'database': 'ready', 'socketRedis': 'ready', 'cacheRedis': 'ready'}
        report['ready'] = health
        report['status'] = 'ready'
        report['networkNamespace'] = os.readlink('/proc/self/ns/net')
        record(); print(json.dumps({key: report[key] for key in
            ('head', 'status', 'ready', 'networkNamespace', 'supervisorSha256')}), flush=True)
        deadline = time.monotonic() + args.hold_seconds
        while time.monotonic() < deadline and not (state / 'stop').exists():
            stack.resource_budget(state)
            if any(process.poll() is not None for _, process in children):
                raise RuntimeError('Service exited unexpectedly')
            for request in sorted(state.glob('task-*.request.json')):
                body = json.loads(request.read_text())
                assert re.fullmatch(r'[a-f0-9-]{36}', body['id'])
                assert request.name == f"task-{body['id']}.request.json"
                assert body['head'] == report['head']
                kind = body.get('kind', 'http')
                if kind == 'http':
                    script_name = ('measurement-v10-reference-ready-http.mjs' if body['phase'] == 'reference_ready'
                                   else 'measurement-v10-training-http.mjs')
                    script = repo / 'server-version/scripts/recovery' / script_name
                    if body.get('scriptCommit'):
                        assert re.fullmatch(r'[a-f0-9]{40}', body['scriptCommit'])
                        script_bytes = subprocess.check_output(['git', 'show', body['scriptCommit'] +
                            ':server-version/scripts/recovery/' + script_name], cwd=repo)
                    else:
                        script_bytes = script.read_bytes()
                    assert hashlib.sha256(script_bytes).hexdigest() == body['scriptSha256']
                    assert body['phase'] in ('seed', 'author', 'final', 'reference', 'reinterpret', 'reference_context', 'cognitive_sjt', 'cognitive_disclosure', 'reference_ready')
                    assert type(body.get('index', 0)) is int and 0 <= body.get('index', 0) < 5
                    script = state / f"task-{body['id']}.mjs"
                    assert not script.exists()
                    script.write_bytes(script_bytes)
                    command = [str(node), '--import', 'tsx', str(script), str(state), body['phase'], str(body.get('index', 0))]
                else:
                    assert kind == 'vitest'
                    assert body['test'] in (
                        'src/__tests__/measurement-content/source-authority-races.postgres.integration.test.ts',
                        'src/__tests__/measurement-content/formal-reference-connected.postgres.integration.test.ts',
                        'src/__tests__/measurement-content/private-reference-expiry.postgres.integration.test.ts',
                        'src/__tests__/integration/registered-resource-longitudinal.postgres.integration.test.ts',
                        'src/__tests__/integration/huiteacherPersonalScale.postgres.integration.test.ts')
                    assert re.fullmatch(r'[a-f0-9]{40}', body['testCommit'])
                    data = subprocess.check_output(['git', 'show', body['testCommit'] + ':server-version/backend/' + body['test']], cwd=repo)
                    assert hashlib.sha256(data).hexdigest() == body['scriptSha256']
                    # Only reviewed test bytes can be overlaid, never business
                    # code, schema, environment, credentials, or test helpers.
                    (backend / body['test']).write_bytes(data)
                    command = [str(node), 'node_modules/vitest/vitest.mjs', 'run', body['test'],
                        '--maxWorkers=1', '--no-file-parallelism', '--reporter=verbose',
                        '--reporter=json', '--outputFile.json=' + str(state / f"task-{body['id']}.vitest.json")]
                    if body.get('testNamePattern'):
                        assert isinstance(body['testNamePattern'], str) and len(body['testNamePattern']) <= 500
                        assert type(body.get('expectedExecutedTests')) is int and 1 <= body['expectedExecutedTests'] <= 20
                        command.extend(['-t', body['testNamePattern']])
                running = request.with_suffix('.running')
                request.replace(running)
                log_path = state / f"task-{body['id']}.log"
                task_env = {**env}
                if kind == 'vitest':
                    task_env.update({'INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL': runtime['DATABASE_URL'],
                                     'RELEASE_INTEGRATION_DATABASE_URL': runtime['DATABASE_URL']})
                with log_path.open('w') as log:
                    process = subprocess.Popen(command, cwd=backend, env=task_env, stdout=log, stderr=log)
                    try: code = process.wait(timeout=180)
                    except BaseException:
                        process.terminate(); process.wait(timeout=10); raise
                execution_counts = None
                if kind == 'vitest' and code == 0:
                    counts = json.loads((state / f"task-{body['id']}.vitest.json").read_text())
                    execution_counts = {key: counts[key] for key in ('numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests')}
                    expected_count = body['expectedExecutedTests'] if body.get('testNamePattern') else counts['numTotalTests']
                    if not expected_count or counts['numPassedTests'] != expected_count or counts['numFailedTests']:
                        code = 1  # A skipped opt-in suite is not connected proof.
                outcome = {'id': body['id'], 'kind': kind, 'phase': body.get('phase'), 'index': body.get('index', 0),
                           'test': body.get('test'), 'testCommit': body.get('testCommit'),
                           'testNamePattern': body.get('testNamePattern'), 'scriptCommit': body.get('scriptCommit'),
                           'executionCounts': execution_counts,
                           'scriptSha256': body['scriptSha256'], 'exitCode': code, 'completedAt': time.time()}
                (state / f"task-{body['id']}.result.json").write_text(json.dumps(outcome, indent=2))
                running.replace(running.with_suffix('.done'))
                report['tasks'].append(outcome); record(); print(json.dumps(outcome), flush=True)
            time.sleep(.3)
    except KeyboardInterrupt:
        report.setdefault('stopReason', 'operator stop')
    except Exception as error:
        report['status'] = 'failed'; report['error'] = str(error); raise
    finally:
        for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(signum, signal.SIG_IGN)
        for name, process in reversed(children):
            if process.poll() is None:
                process.send_signal(signal.SIGINT if name == 'postgres' else signal.SIGTERM)
                try: process.wait(timeout=15)
                except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
        for log in logs: log.close()
        report['cleanupVerified'] = all(process.poll() is not None for _, process in children)
        report['stoppedAt'] = time.time()
        if report['status'] != 'failed': report['status'] = 'stopped'
        record()


if __name__ == '__main__':
    main()
