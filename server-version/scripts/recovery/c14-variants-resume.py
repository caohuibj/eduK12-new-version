#!/usr/bin/env python3
"""Resume the missing C14 HTTP/report work on a byte-verified stopped-state clone.

Run under TOOLS/.measurement.lock after compiling the repaired backend once.
Never starts or writes the source cluster, seeds fixtures, deploys migrations, or
edits report jobs. The smoke uses the normal authenticated participant retry endpoint when needed.
Historical passing observations retain their original runtime identity; they do
not qualify the changed runtime. The original failed aggregate stays failed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import time
import urllib.request
from urllib.parse import unquote, urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--source-state', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--report-only', action='store_true', help='Resume only the already accepted original attempt report; skip all later scenarios and restore')
    args = parser.parse_args()
    source, state, tools = (p.resolve() for p in (args.source_state, args.state, args.tools))
    base = Path(__file__).resolve().parent
    backend = base.parents[1] / 'backend'
    repo = backend.parents[1]
    node, pg, redis = tools / 'node_modules/node/bin/node', tools / 'postgresql/bin', tools / 'redis/bin/redis-server'
    assert source != state and source not in state.parents and state not in source.parents
    assert repo not in state.parents and state != repo, 'private state must be outside the repository'
    assert not state.exists(), 'new private state required'
    for binary in (node, pg / 'postgres', pg / 'psql', pg / 'pg_dump', redis):
        assert binary.is_file(), 'required local binary missing'
    assert subprocess.check_output([str(node), '--version'], text=True).strip() == 'v24.21.0', 'pinned Node v24.21.0 required'
    assert (backend / 'dist/index.js').is_file() and (backend / 'dist/workers/main.js').is_file()
    originals = {name: (source / name).read_bytes() for name in
                 ['status.json', 'c14-runtime-result.json', 'c14-http-result.json', 'c14-http.log', 'fixture-private.json', 'runtime-private.json']}
    source_status = json.loads(originals['status.json'])
    original = json.loads(originals['c14-runtime-result.json'])
    direct_http = json.loads(originals['c14-http-result.json'])
    source_runtime = json.loads(originals['runtime-private.json'])
    assert source_status.get('state') == 'stopped' and source_status.get('cleanupVerified') is True
    assert source_status.get('cleanupErrors') == [] and original.get('cleanupVerified') is True
    report_checkpoint = original.get('passed') is True and original.get('qualificationScope') == 'REPORT_ONLY'
    if report_checkpoint:
        assert direct_http.get('passed') is True and direct_http.get('qualificationScope') == 'REPORT_ONLY'
        assert original.get('sourceUnchanged') is True and original.get('inputsUnchanged') is True
        assert original['phases']['variants'] == direct_http and 'newFormatRestore' not in original['phases']
        originals['c14-resume-source-result.json'] = (source / 'c14-resume-source-result.json').read_bytes()
        previous_resume = json.loads(originals['c14-resume-source-result.json'])
        http = previous_resume['http']
        historical = previous_resume['originalAggregate']
        historical_status = previous_resume['originalStatus']
        assert previous_resume['originalFailureMarker'] == 'active unit required'
        assert len(direct_http['allocations']) == len(direct_http['completed']) == 1
        assert direct_http['allocations'][0] == http['allocations'][0]
        assert direct_http['completed'][0]['attemptId'] == http['allocations'][0]['attemptId']
        assert direct_http['completed'][0]['allocationHash'] == http['allocations'][0]['allocationHash']
        accepted_facts = direct_http['reusedEvidence']['acceptedFacts']
        assert re.fullmatch(r'[0-9a-f]{64}', accepted_facts['sha256']) and isinstance(accepted_facts['counts'], dict)
        historical_bytes = {}
        for name in ['status.json', 'c14-runtime-result.json', 'c14-http-result.json']:
            key = 'http03-' + name
            originals[key] = (source / key).read_bytes()
            historical_bytes[name] = originals[key]
        assert json.loads(historical_bytes['status.json']) == historical_status
        assert json.loads(historical_bytes['c14-runtime-result.json']) == historical
        assert json.loads(historical_bytes['c14-http-result.json']) == http
    else:
        assert original.get('passed') is False and direct_http.get('passed') is False
        assert b'active unit required' in originals['c14-http.log'], 'only the recorded missing-active-unit failure may resume'
        http, historical, historical_status = direct_http, original, source_status
        historical_bytes = {name: originals[name] for name in ['status.json', 'c14-runtime-result.json', 'c14-http-result.json']}
    assert historical.get('passed') is False and historical.get('cleanupVerified') is True and http.get('passed') is False
    assert historical_status.get('state') == 'stopped' and historical_status.get('cleanupVerified') is True and historical_status.get('cleanupErrors') == []
    assert historical_status['head'] == historical['sourceHead']
    assert historical_status['runtimeFingerprint'] == historical['runtimeFingerprint']
    assert len(http['checks']) == 10 and len(http['allocations']) == 1 and len(http['completed']) == 0
    assert source_status['head'] == original.get('candidateHead', original['sourceHead'])
    assert source_status['runtimeFingerprint'] == original['runtimeFingerprint']
    assert source_status['node'] == original['runtimeFingerprint']['nodeVersion'] == 'v24.21.0'
    assert not (source / 'pgdata/postmaster.pid').exists()
    assert (source / 'pgdata/PG_VERSION').read_text().strip() == '16'
    assert not any((source / 'pgdata/pg_tblspc').iterdir()), 'external tablespaces cannot be cloned'
    for key, role in [('DATABASE_URL_OWNER', 'eduk12_owner'), ('DATABASE_URL', 'eduk12_runtime'), ('DATABASE_URL_RUNTIME', 'eduk12_runtime')]:
        parsed = urlparse(source_runtime[key])
        assert parsed.scheme in ('postgres', 'postgresql') and parsed.hostname == '127.0.0.1'
        assert parsed.username == role and parsed.password and parsed.path == '/eduk12_recovery'
        assert parsed.port == source_status['ports']['postgres']
    assert urlparse(source_runtime['REDIS_URL']).hostname == '127.0.0.1'
    assert int(source_runtime['PORT']) == source_status['ports']['api']
    for key, directory in [('UPLOAD_DIR', 'uploads'), ('EXPORT_DIR', 'exports')]:
        assert Path(source_runtime[key]).resolve() == source / directory, 'source asset path is not isolated'
    assert source_runtime['BACKGROUND_WORKERS_ENABLED'] == 'false'
    assert source_runtime['HEAVY_PROCESSING_ENABLED'] == 'false' and source_runtime['VIDEO_PROCESSING_ENABLED'] == 'false'
    assert source_runtime['ASSESSMENT_REPORT_ASYNC_ENABLED'] == 'true' and source_runtime['ASSESSMENT_WHOLE_SUBMIT_ENABLED'] == 'true'
    for key in ['JWT_SECRET', 'ASSET_SIGNING_SECRET', 'DATA_ENCRYPTION_KEY', 'DATA_PSEUDONYM_KEY']:
        assert source_runtime.get(key), 'original runtime secret missing'
    # initdb's ordinary local configuration is accepted; external includes and
    # path overrides could otherwise cause the clone to touch the source tree.
    for config in ('postgresql.conf', 'postgresql.auto.conf'):
        for line in (source / 'pgdata' / config).read_text().splitlines():
            active = line.split('#', 1)[0].strip()
            assert not re.match(r'(?i)^(include(?:_if_exists|_dir)?|data_directory|hba_file|ident_file|external_pid_file|log_directory|archive_command|restore_command)\b', active), 'external PostgreSQL configuration is not accepted'

    # Explicit scope for this continuation. Omitted source flags defaulted off;
    # record presence separately so omission is never described as an explicit false.
    runtime_flag_overrides = {
        'ASSESSMENT_COMPACT_FACTS_ENABLED': 'true',
        'ASSESSMENT_SHARED_CONTROL_ENABLED': 'true',
        'ASSESSMENT_REPORT_COMPACT_READ_ENABLED': 'true',
        'ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED': 'true',
        'ASSESSMENT_REPORT_CONTEXT_REUSE_ENABLED': 'true',
        'ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED': 'true',
        'ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED': 'false',
        'ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED': 'false',
    }
    for key, value in runtime_flag_overrides.items():
        if value == 'false':
            assert key not in source_runtime or source_runtime[key] == 'false', 'source whole-receipt/backlog path was unexpectedly enabled'
    runtime_flag_changes = {key: {
        'sourcePresent': key in source_runtime,
        'sourceValue': source_runtime.get(key),
        'sourceEffectiveEnabled': source_runtime.get(key) == 'true',
        'currentPresent': True,
        'currentValue': value,
        'currentEffectiveEnabled': value == 'true',
    } for key, value in runtime_flag_overrides.items()}

    os.umask(0o077)
    state.mkdir(mode=0o700)
    result = {'passed': False, 'originalAggregatePassed': False, 'checks': [], 'phases': {},
              'sourceHead': source_status['head'], 'sourceRuntimeFingerprint': original['runtimeFingerprint'],
              'qualificationScope': 'REPORT_ONLY' if args.report_only else 'FULL_CONTINUATION',
              'sourceQualificationScope': 'REPORT_ONLY' if report_checkpoint else 'ORIGINAL_FAILED_HTTP',
              'originalSourceHead': historical['sourceHead'], 'originalRuntimeFingerprint': historical['runtimeFingerprint'],
              'sourceHarnessInputs': original['harnessInputs'], 'sourceState': str(source),
              'evidenceScope': 'Historical passed observations remain bound to the original runtime and feature flags and do not qualify the current runtime; existing accepted facts stay unchanged while only missing and affected continuation work is executed.',
              'runtimeFlagChanges': runtime_flag_changes,
              'runtimeConfigurationChanged': any(not item['sourcePresent'] or item['sourceValue'] != item['currentValue'] for item in runtime_flag_changes.values()),
              'reusedEvidence': {'checks': len(http['checks']), 'requests': len(http['requests']),
                                         'allocations': len(http['allocations']), 'completed': len(http['completed']),
                                         'qualifiesCurrentRuntime': False, 'sourceChecks': http['checks']}}
    summary = {'state': 'preparing', 'startedAt': time.time(), 'checks': {}, 'pids': {}, 'ports': {},
               'runtimeFlagChanges': runtime_flag_changes, 'historicalObservationsQualifyCurrentRuntime': False}
    env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state), 'LANG': 'C.UTF-8', 'TZ': 'UTC', 'NODE_ENV': 'test'}
    children, logs = [], []
    source_manifest = None
    pinned = None

    def sha(data):
        return hashlib.sha256(data).hexdigest()

    def file_sha(file):
        digest = hashlib.sha256()
        with file.open('rb') as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b''):
                digest.update(block)
        return digest.hexdigest()

    def manifest(directory):
        assert directory.is_dir() and not directory.is_symlink()
        entries = []
        for entry in sorted(directory.rglob('*')):
            assert not entry.is_symlink(), 'source/clone symlinks are forbidden'
            item = {'path': str(entry.relative_to(directory)), 'mode': entry.stat().st_mode & 0o777}
            if entry.is_dir():
                item['type'] = 'directory'
            else:
                assert entry.is_file(), 'only ordinary files/directories can be cloned'
                item.update(type='file', size=entry.stat().st_size, sha256=file_sha(entry))
            entries.append(item)
        return entries

    def git(*args):
        return subprocess.check_output(['git', *args], cwd=repo)

    def fingerprint():
        return json.loads(subprocess.check_output([str(node), str(base / 'runtime-fingerprint.cjs'), str(backend)], text=True))

    def input_binding():
        paths = ['server-version/backend/src', 'server-version/backend/prisma', 'server-version/backend/scripts',
                 'server-version/backend/package.json', 'server-version/backend/package-lock.json',
                 'server-version/backend/tsconfig.json', 'server-version/backend/vitest.config.ts',
                 'server-version/e2e/questionnaire-products-fixture.ts', 'server-version/scripts/recovery']
        tracked = git('ls-files', '-z', '--', *paths).split(b'\0')
        untracked = git('ls-files', '--others', '--exclude-standard', '-z', '--', *paths).split(b'\0')
        entries = []
        for relative in sorted(set(tracked + untracked) - {b''}):
            file = repo / os.fsdecode(relative)
            assert not file.is_symlink(), 'source input symlinks are forbidden'
            entries.append({'path': os.fsdecode(relative), 'sha256': file_sha(file) if file.exists() else None,
                            'mode': file.stat().st_mode & 0o777 if file.exists() else None})
        patch = git('diff', '--binary', '--no-ext-diff', source_status['head'], '--', *paths)
        changed = git('diff', '--name-only', '--no-ext-diff', source_status['head'], '--', *paths).decode().splitlines()
        additions = [item for item in entries if os.fsencode(item['path']) in untracked]
        return {'head': git('rev-parse', 'HEAD').decode().strip(), 'runtimeFingerprint': fingerprint(),
                'sourceInputs': entries, 'sourceInputsSha256': sha(json.dumps(entries, sort_keys=True).encode()),
                'changedSourceFiles': sorted(set(changed + [item['path'] for item in additions])),
                'trackedSourceDiffSha256': sha(patch), 'untrackedSourceInputs': additions,
                'sourceDiffSha256': sha(patch + b'\0UNTRACKED\0' + json.dumps(additions, sort_keys=True).encode()),
                'harnessInputs': {str(path.relative_to(backend.parent)): file_sha(path) for path in
                    [Path(__file__).resolve(), base / 'c14-variants-smoke.mjs', base / 'c14-training-fixture.mjs',
                     base / 'c14-variants-restore.py', base / 'local-stack.py', base / 'runtime-fingerprint.cjs',
                     base / 'loopback-only.cjs', backend.parent / 'e2e/questionnaire-products-fixture.ts',
                     backend / 'src/modules/situational/authoring/examples/online-hand-calculated.json']}}

    def verify_inputs():
        assert input_binding() == pinned, 'runtime or source/harness inputs changed during this run'

    def record():
        temporary = state / 'status.tmp'
        temporary.write_text(json.dumps(summary, indent=2))
        temporary.replace(state / 'status.json')

    def guard():
        available = next(int(line.split()[1]) * 1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
        assert available >= 2 * 1024 ** 3, 'host available memory below 2GiB stop line'
        for name, process, service in children:
            if not service:
                continue
            assert process.poll() is None, f'{name} exited unexpectedly'
            if name in ['api', 'report-worker']:
                proc_status = Path(f'/proc/{process.pid}/status').read_text()
                rss = next(int(line.split()[1]) * 1024 for line in proc_status.splitlines() if line.startswith('VmRSS:'))
                summary.setdefault('peakRssBytes', {})[name] = max(rss, summary.get('peakRssBytes', {}).get(name, 0))
                assert rss < 1024 ** 3, f'{name} reached 1GiB stop line'
        if (state / 'stop').exists():
            raise KeyboardInterrupt

    def start(command, name, extra=None, service=True):
        log = (state / (name + '.log')).open('w')
        logs.append(log)
        process = subprocess.Popen(list(map(str, command)), cwd=backend, env={**env, **(extra or {})},
                                   stdout=log, stderr=log, start_new_session=True)
        children.append((name, process, service))
        if service:
            summary['pids'][name] = process.pid
        record()
        return process

    def run(command, name, extra=None, timeout=240):
        process = start(command, name, extra, service=False)
        deadline = time.monotonic() + timeout
        while process.poll() is None:
            guard()
            if time.monotonic() >= deadline:
                raise TimeoutError(f'{name} timeout; see private log')
            time.sleep(.25)
        if process.returncode:
            raise RuntimeError(f'{name} failed; see private log')
        guard()

    def wait_port(port, process):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            guard()
            assert process.poll() is None, 'service exited during startup'
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=1):
                    return
            except OSError:
                time.sleep(.2)
        raise TimeoutError('service startup exceeded 60 seconds')

    def interrupt(_signum, _frame):
        raise KeyboardInterrupt

    for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
        signal.signal(sig, interrupt)
    try:
        pinned = input_binding()
        result.update({key: value for key, value in pinned.items() if key != 'sourceInputs'})
        result['candidateHead'] = pinned['head']
        result['sourceDiffBase'] = 'Recorded source HEAD; historical uncommitted source bytes were not saved. Runtime fingerprints are independently recorded.'
        result['runtimeArtifactChanged'] = pinned['runtimeFingerprint'] != original['runtimeFingerprint']
        result['runtimeChanged'] = result['runtimeArtifactChanged'] or result['runtimeConfigurationChanged']
        assert pinned['runtimeFingerprint']['files']['prisma/schema.prisma'] == source_status['schemaSha256']
        assert pinned['runtimeFingerprint']['files']['prisma/schema.prisma'] == original['runtimeFingerprint']['files']['prisma/schema.prisma']
        assert not git('diff', '--name-only', source_status['head'], '--', 'server-version/backend/prisma').strip(), 'schema/migrations changed: resume without migrations is not permitted'
        assert not git('ls-files', '--others', '--exclude-standard', '--', 'server-version/backend/prisma').strip(), 'untracked schema/migration input'
        (state / 'current-source-inputs.json').write_text(json.dumps(pinned['sourceInputs'], indent=2))
        summary.update(head=pinned['head'], node='v24.21.0', runtimeFingerprint=pinned['runtimeFingerprint'],
                       schemaSha256=source_status['schemaSha256'], sourceHead=source_status['head'],
                       qualificationScope=result['qualificationScope'], launcherSha256=file_sha(Path(__file__)))
        source_manifest = manifest(source)
        result['sourceManifestSha256'] = sha(json.dumps(source_manifest, sort_keys=True).encode())
        (state / 'source-byte-manifest.json').write_text(json.dumps(source_manifest, indent=2))
        for name in ['pgdata', 'uploads', 'exports']:
            if (source / name).exists():
                before = manifest(source / name)
                shutil.copytree(source / name, state / name, copy_function=shutil.copy2)
                assert manifest(state / name) == before, 'clone bytes do not match source'
            else:
                assert name != 'pgdata'
                (state / name).mkdir(mode=0o700)
        assert manifest(source) == source_manifest and not (source / 'pgdata/postmaster.pid').exists()
        (state / 'fixture-private.json').write_bytes(originals['fixture-private.json'])
        for name in ['status.json', 'c14-runtime-result.json', 'c14-http-result.json']:
            (state / ('source-' + name)).write_bytes(originals[name])
            (state / ('http03-' + name)).write_bytes(historical_bytes[name])
        result['sourceSummarySha256'] = {name: sha(originals[name]) for name in ['status.json', 'c14-runtime-result.json', 'c14-http-result.json', 'c14-http.log']}
        result['checks'].append('Stopped PostgreSQL 16 and existing assets byte-verified before clone startup; original summaries preserved unchanged')
        reservations = []
        try:
            for name in ['postgres', 'redis', 'api']:
                while True:
                    sock = socket.socket()
                    sock.bind(('127.0.0.1', 0))
                    if sock.getsockname()[1] not in source_status['ports'].values():
                        break
                    sock.close()
                reservations.append(sock)
                summary['ports'][name] = sock.getsockname()[1]
        finally:
            for sock in reservations:
                sock.close()
        dbport, redisport, apiport = (summary['ports'][name] for name in ['postgres', 'redis', 'api'])
        runtime = {**source_runtime, **runtime_flag_overrides}
        for key in ['DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME']:
            parsed = urlparse(runtime[key])
            runtime[key] = parsed._replace(netloc=f'{parsed.username}:{parsed.password}@127.0.0.1:{dbport}').geturl()
        runtime.update(REDIS_URL=f'redis://127.0.0.1:{redisport}', PORT=str(apiport),
                       UPLOAD_DIR=str(state / 'uploads'), EXPORT_DIR=str(state / 'exports'))
        assert all(runtime[key] == value for key, value in runtime_flag_overrides.items())
        rewritten_keys = set(runtime_flag_overrides) | {'DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME', 'REDIS_URL', 'PORT', 'UPLOAD_DIR', 'EXPORT_DIR'}
        assert all(runtime[key] == value for key, value in source_runtime.items() if key not in rewritten_keys), 'unrelated runtime setting changed'
        for key in ['UPLOAD_DIR', 'EXPORT_DIR']:
            assert state in Path(runtime[key]).resolve().parents
        assert all(runtime[key] == source_runtime[key] for key in ['JWT_SECRET', 'ASSET_SIGNING_SECRET', 'DATA_ENCRYPTION_KEY', 'DATA_PSEUDONYM_KEY'])
        assert all(str(source) not in value for value in runtime.values() if isinstance(value, str)), 'runtime must not retain source paths'
        (state / 'runtime-private.json').write_text(json.dumps(runtime))
        source_metadata = {'sourceMode': 'REPORT_ONLY' if report_checkpoint else 'HTTP03', 'sourceState': str(source), 'sourceHead': historical['sourceHead'], 'sourceRuntimeFingerprint': historical['runtimeFingerprint'],
                           'directSource': {'state': str(source), 'head': source_status['head'],
                                            'runtimeFingerprint': original['runtimeFingerprint'],
                                            'aggregatePassed': original['passed'],
                                            'qualificationScope': result['sourceQualificationScope']},
                           'currentHead': pinned['head'], 'currentRuntimeFingerprint': pinned['runtimeFingerprint'],
                           'sourceManifestSha256': result['sourceManifestSha256'], 'sourceSummarySha256': result['sourceSummarySha256'],
                           'changedSourceFiles': pinned['changedSourceFiles'], 'sourceDiffSha256': pinned['sourceDiffSha256'],
                           'runtimeFlagChanges': runtime_flag_changes,
                           'runtimeArtifactChanged': result['runtimeArtifactChanged'],
                           'runtimeConfigurationChanged': result['runtimeConfigurationChanged'],
                           'originalAggregatePassed': False, 'historicalObservationsQualifyCurrentRuntime': False}
        resume_source = {'http': http, 'originalHttp': http, 'originalAggregate': historical, 'originalStatus': historical_status,
                         'originalFailureMarker': 'active unit required', 'sourceMetadata': source_metadata, 'originalAggregatePassed': False}
        if report_checkpoint:
            resume_source['reportOnlyCheckpoint'] = {'acceptedFacts': accepted_facts, 'completed': direct_http['completed'][0]}
        (state / 'c14-resume-source-result.json').write_text(json.dumps(resume_source, indent=2))
        owner = urlparse(runtime['DATABASE_URL_OWNER'])
        auth = {'PGPASSWORD': unquote(owner.password)}
        public_runtime = {key: value for key, value in runtime.items() if key != 'DATABASE_URL_OWNER'}
        process = start([pg / 'postgres', '-D', state / 'pgdata', '-h', '127.0.0.1', '-p', dbport, '-k', '',
                         '-c', 'timezone=UTC', '-c', 'shared_buffers=128MB', '-c', 'max_connections=40'], 'postgres')
        wait_port(dbport, process)
        run([node, 'scripts/runtime-role-contract.mjs', 'verify-current'], 'runtime-role', public_runtime)
        summary['checks']['runtimeRole'] = 'passed'
        schema_command = [pg / 'pg_dump', '--schema-only', '--no-owner', '--no-acl', '-h', '127.0.0.1', '-p', dbport, '-U', owner.username, '-d', 'eduk12_recovery']
        def schema_snapshot(label):
            run(schema_command, label, auth)
            # Newer pg_dump patch releases randomize only these psql guard keys.
            lines = (state / (label + '.log')).read_bytes().splitlines()
            return sha(b'\n'.join(line for line in lines if not line.startswith((b'\\restrict ', b'\\unrestrict '))))
        schema_before = schema_snapshot('schema-before')
        result['schemaBeforeSha256'] = schema_before
        redis_process = start([redis, '--bind', '127.0.0.1', '--port', redisport, '--dir', state, '--save', '',
                               '--appendonly', 'no', '--maxmemory', '128mb', '--maxmemory-policy', 'noeviction'], 'redis')
        wait_port(redisport, redis_process)
        api = start([node, '--require', base / 'loopback-only.cjs', 'dist/index.js'], 'api', public_runtime)
        wait_port(apiport, api)
        start([node, '--require', './dist/workers/exportProcessor.js', 'dist/workers/main.js'], 'report-worker', public_runtime)
        summary['apiUrl'] = f'http://127.0.0.1:{apiport}'
        for endpoint in ['health', 'ready']:
            with urllib.request.urlopen(summary['apiUrl'] + '/' + endpoint, timeout=8) as response:
                assert response.status == 200
                summary['checks'][endpoint] = response.status
        summary['state'] = 'running'
        record()
        result['checks'].append('Existing restricted runtime role/schema verified; fresh Redis, original API/report/export consumers, no seed or migration')
        verify_inputs()
        try:
            run([node, base / 'c14-variants-smoke.mjs', state], 'c14-http',
                {**public_runtime, 'PERF_ISOLATED_TEST_MODE': '1', 'PERF_SQL_EVENT_COUNT': '1',
                 **({'C14_REPORT_ONLY': '1'} if args.report_only else {})}, timeout=1000)
        finally:
            if (state / 'c14-http-result.json').is_file():
                result['phases']['variants'] = json.loads((state / 'c14-http-result.json').read_text())
        assert result['phases']['variants']['passed'] is True
        verify_inputs()
        assert schema_snapshot('schema-after-http') == schema_before, 'HTTP continuation changed database schema'
        if args.report_only:
            report = result['phases']['variants']
            assert report.get('qualificationScope') == 'REPORT_ONLY'
            assert len(report['allocations']) == len(report['completed']) == 1
            assert report['allocations'][0] == http['allocations'][0]
            assert report['completed'][0]['attemptId'] == http['allocations'][0]['attemptId']
            assert report['completed'][0]['allocationHash'] == http['allocations'][0]['allocationHash']
            result['checks'].append('REPORT_ONLY: existing accepted original attempt reached report completion; current inputs/schema unchanged; later scenarios and restore were not executed')
        else:
            assert result['phases']['variants'].get('qualificationScope') == 'FULL_CONTINUATION', 'report-only evidence cannot qualify full continuation'
            try:
                run(['python3', base / 'c14-variants-restore.py', '--tools', tools, '--state', state], 'c14-new-format-restore', timeout=240)
            finally:
                if (state / 'c14-new-format-restore-result.json').is_file():
                    result['phases']['newFormatRestore'] = json.loads((state / 'c14-new-format-restore-result.json').read_text())
            assert result['phases']['newFormatRestore']['passed'] is True
            verify_inputs()
            assert schema_snapshot('schema-after-restore') == schema_before, 'source clone schema changed during restore'
            result['checks'].append('Current runtime/source/harness bindings pinned throughout continuation and restore; original clone schema unchanged')
        result['passed'] = True
    except BaseException as error:
        result['errorType'] = type(error).__name__
        # Do not render subprocess arguments or private runtime configuration.
        raise
    finally:
        for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
            signal.signal(sig, signal.SIG_IGN)
        cleanup_errors = []
        for name, process, service in reversed(children):
            try:
                if process.poll() is None:
                    if service:
                        process.send_signal(signal.SIGINT if name == 'postgres' else signal.SIGTERM)
                    else:
                        os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=20)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=5)
            except ProcessLookupError:
                process.poll()
            except Exception as error:
                cleanup_errors.append({'service': name, 'errorType': type(error).__name__})
        for log in logs:
            log.close()
        for name, port in summary['ports'].items():
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.2):
                    cleanup_errors.append({'service': name, 'errorType': 'PortStillOpen'})
            except OSError:
                pass
        result['cleanupVerified'] = not cleanup_errors and all(process.poll() is not None for _, process, _ in children)
        try:
            result['sourceUnchanged'] = (all((source / name).read_bytes() == data for name, data in originals.items())
                and not (source / 'pgdata/postmaster.pid').exists()
                and source_manifest is not None and manifest(source) == source_manifest)
        except Exception:
            result['sourceUnchanged'] = False
        try:
            result['inputsUnchanged'] = pinned is not None and input_binding() == pinned
        except Exception:
            result['inputsUnchanged'] = False
        result['passed'] = result['passed'] and result['cleanupVerified'] and result['sourceUnchanged'] and result['inputsUnchanged']
        summary.update(state='stopped' if result['cleanupVerified'] else 'cleanup_failed',
                       cleanupVerified=result['cleanupVerified'], cleanupErrors=cleanup_errors,
                       sourceUnchanged=result['sourceUnchanged'], stoppedAt=time.time())
        record()
        (state / 'c14-runtime-result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps({'resultPath': str(state / 'c14-runtime-result.json'), 'passed': result['passed'],
                          'cleanupVerified': result['cleanupVerified'], 'sourceUnchanged': result['sourceUnchanged']}), flush=True)
        if not result['cleanupVerified'] or not result['sourceUnchanged'] or not result['inputsUnchanged']:
            raise RuntimeError('C14 resume cleanup, source immutability, or input binding check failed')


if __name__ == '__main__':
    main()
