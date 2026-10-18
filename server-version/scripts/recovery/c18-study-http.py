#!/usr/bin/env python3
"""C18-only stopped-clone upgrade / HTTP / restore qualification.

Run services and clients in this one persistent executor process. The launcher
owns .measurement.lock; do not wrap it in flock. Source/private state is never
inside Git. --from-state clones only accepted stopped C18 phase evidence;
completed phases are verified and reused, never silently replayed.
"""
import argparse
import fcntl
import importlib.util
import json
import sys
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import time
import urllib.request
from urllib.parse import urlparse

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
BACKEND = BASE.parents[1] / 'backend'
REPO = BACKEND.parents[1]
spec = importlib.util.spec_from_file_location('c18_db', BASE / 'c18-study-db.py')
db_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db_module)
sha_file, digest = db_module.sha_file, db_module.digest
FLOOR = 8 * 1024 ** 3
PHASES = ['upgrade', 'http', 'restore']


def manifest(root):
    assert root.is_dir() and not root.is_symlink()
    result = []
    for path in sorted(root.rglob('*')):
        assert not path.is_symlink(), 'source symlinks are forbidden'
        item = {'path': str(path.relative_to(root)), 'mode': path.stat().st_mode & 0o777}
        if path.is_dir():
            item['type'] = 'directory'
        else:
            assert path.is_file(), 'special files are forbidden'
            item.update(type='file', size=path.stat().st_size, sha256=sha_file(path))
        result.append(item)
    return result


def stopped(root):
    status = json.loads((root / 'status.json').read_text())
    assert status['state'] == 'stopped' and status['cleanupVerified'] is True and status['cleanupErrors'] == []
    assert not (root / 'pgdata/postmaster.pid').exists()
    assert (root / 'pgdata/PG_VERSION').read_text().strip() == '16'
    assert not any((root / 'pgdata/pg_tblspc').iterdir())
    for port in status['ports'].values():
        with socket.socket() as sock:
            sock.settimeout(.2)
            assert sock.connect_ex(('127.0.0.1', port)) != 0, 'source service port is still open'
    for config in ['postgresql.conf', 'postgresql.auto.conf']:
        for line in (root / 'pgdata' / config).read_text().splitlines():
            active = line.split('#', 1)[0].strip()
            assert not re.match(r'(?i)^(include(?:_if_exists|_dir)?|data_directory|hba_file|ident_file|external_pid_file|log_directory|archive_command|restore_command)\b', active)
    return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--source-state', type=Path, required=True, help='Read-only stopped C16 HTTP07 baseline')
    parser.add_argument('--state', type=Path, required=True, help='New, nonexistent private destination outside Git')
    parser.add_argument('--phase', choices=['upgrade', 'http', 'restore', 'all'], default='all')
    parser.add_argument('--from-state', type=Path, help='Read-only stopped C18 clone with accepted earlier phases; never a C16 continue-state')
    args = parser.parse_args()
    tools, source, state = [p.resolve() for p in [args.tools, args.source_state, args.state]]
    prior = args.from_state.resolve() if args.from_state else None
    for root in [source] + ([prior] if prior else []):
        assert root != state and root not in state.parents and state not in root.parents
    assert REPO not in state.parents and state != REPO and not state.exists()
    assert source != prior
    node, pg, redis = tools / 'node_modules/node/bin/node', tools / 'postgresql/bin', tools / 'redis/bin/redis-server'
    assert subprocess.check_output([str(node), '--version'], text=True).strip() == 'v24.21.0'
    assert '16.15' in subprocess.check_output([str(pg / 'postgres'), '--version'], text=True)
    assert 'v=7.4.11 ' in subprocess.check_output([str(redis), '--version'], text=True)
    assert (BACKEND / 'dist/index.js').is_file(), 'fresh Prisma generation and backend build must precede this run'
    fresh = db_module.fresh_prisma(BACKEND)
    source_status = stopped(source)
    source_result = json.loads((source / 'c16-runtime-result.json').read_text())
    assert all(source_result[key] is True for key in ['passed', 'cleanupVerified', 'sourceUnchanged', 'inputsUnchanged'])
    assert source_result['phases']['restore']['passed'] is True
    dump = source / 'c16-new-format-restore/c16-http-new-format.dump'
    assert sha_file(dump) == db_module.PINNED_DUMP_SHA256
    prior_result = None
    if prior:
        stopped(prior)
        prior_result = json.loads((prior / 'c18-runtime-result.json').read_text())
        assert all(prior_result.get(key) is True for key in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged'])
        assert prior_result.get('priorSourceUnchanged', True) is True
        assert prior_result['pinnedC16DumpSha256'] == db_module.PINNED_DUMP_SHA256
        assert prior_result['phases'].get('upgrade', {}).get('passed') is True
        if (prior / 'c18-http-result.json').exists():
            partial = json.loads((prior / 'c18-http-result.json').read_text())
            assert partial['passed'] or not partial.get('checks'), 'partial HTTP success requires a targeted continuation, never automatic replay'
    copy_source = prior or source
    source_runtime = json.loads((copy_source / 'runtime-private.json').read_text())
    effective = {**source_runtime, 'BACKGROUND_WORKERS_ENABLED': 'false', 'HEAVY_PROCESSING_ENABLED': 'false', 'VIDEO_PROCESSING_ENABLED': 'false', 'PERF_ISOLATED_TEST_MODE': '1', 'PERF_SQL_EVENT_COUNT': '1'}
    for key in ['DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME']:
        u = urlparse(effective[key])
        effective[key] = u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:0').geturl()
    effective.update(REDIS_URL='redis://127.0.0.1:0', PORT='0', UPLOAD_DIR='<private-state>/uploads', EXPORT_DIR='<private-state>/exports')
    runtime_config_hash = digest(effective)
    copy_status = json.loads((copy_source / 'status.json').read_text())
    for key, role in [('DATABASE_URL_OWNER', 'eduk12_owner'), ('DATABASE_URL', 'eduk12_runtime'), ('DATABASE_URL_RUNTIME', 'eduk12_runtime')]:
        parsed = urlparse(source_runtime[key])
        assert parsed.hostname == '127.0.0.1' and parsed.username == role and parsed.path == '/eduk12_recovery'
        assert parsed.port == copy_status['ports']['postgres'] and parsed.password
    lock = (tools / '.measurement.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    copy_bytes = sum(p.stat().st_size for directory in ['pgdata', 'uploads', 'exports'] for p in (copy_source / directory).rglob('*') if p.is_file()) + dump.stat().st_size
    assert shutil.disk_usage(state.parent).free - copy_bytes - 512 * 1024 ** 2 >= FLOOR, 'clone + 512MiB working reserve would cross 8GiB stop line'
    os.umask(0o077)
    state.mkdir(mode=0o700)
    env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state), 'TZ': 'UTC', 'LANG': 'C.UTF-8', 'NODE_ENV': 'test', 'PYTHONDONTWRITEBYTECODE': '1'}
    result = {'passed': False, 'qualificationScope': 'C18_STUDY_' + args.phase.upper(), 'phases': {}, 'reusedPhases': [],
              'pinnedC16DumpSha256': db_module.PINNED_DUMP_SHA256, 'sourceHead': source_status['head'], 'freshPrisma': fresh,
              'cloneBytes': copy_bytes, 'workingReserveBytes': 512 * 1024 ** 2}
    status = {'state': 'preparing', 'ports': {}, 'pids': {}, 'startedAt': time.time()}
    children, logs = [], []
    source_manifest = prior_manifest = pinned = None

    def record():
        temporary = state / 'status.tmp'
        temporary.write_text(json.dumps(status, indent=2))
        temporary.replace(state / 'status.json')

    def binding():
        paths = ['server-version/backend/src', 'server-version/backend/prisma', 'server-version/backend/scripts',
                 'server-version/backend/package.json', 'server-version/backend/package-lock.json', 'server-version/backend/tsconfig.json',
                 'server-version/scripts/recovery']
        tracked = subprocess.check_output(['git', 'ls-files', '-z', '--', *paths], cwd=REPO).split(b'\0')
        untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z', '--', *paths], cwd=REPO).split(b'\0')
        entries = []
        for relative in sorted(set(tracked + untracked) - {b''}):
            path = REPO / os.fsdecode(relative)
            assert not path.is_symlink()
            entries.append({'path': os.fsdecode(relative), 'sha256': sha_file(path) if path.exists() else None,
                            'mode': path.stat().st_mode & 0o777 if path.exists() else None})
        runtime = json.loads(subprocess.check_output([str(node), str(BASE / 'runtime-fingerprint.cjs'), str(BACKEND)], text=True))
        binaries = {str(p.relative_to(tools)): sha_file(p) for p in [node, pg / 'postgres', pg / 'psql', pg / 'pg_dump', pg / 'pg_restore', redis]}
        shared = [e for e in entries if '/backend/prisma/' in e['path'] or '/backend/scripts/' in e['path'] or e['path'].endswith(('backend/package.json', 'backend/package-lock.json', 'c18-study-db.py', 'c16-analysis-db.py'))]
        client = manifest(BACKEND / 'node_modules/.prisma/client')
        db_inputs = {'source': shared, 'client': client, 'tools': {k: v for k, v in binaries.items() if 'redis' not in k}}
        phase_hashes = {'upgrade': digest({**db_inputs, 'script': sha_file(BASE / 'c18-study-upgrade.py')}),
                        'http': digest({'source': [e for e in entries if '/backend/' in e['path'] or e['path'].endswith(('.mjs', 'loopback-only.cjs', 'runtime-fingerprint.cjs'))], 'runtime': runtime, 'tools': binaries, 'config': runtime_config_hash}),
                        'restore': digest({**db_inputs, 'script': sha_file(BASE / 'c18-study-restore.py')})}
        return {'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(), 'runtimeFingerprint': runtime,
                'sourceInputs': entries, 'sourceInputsSha256': digest(entries), 'toolExecutables': binaries,
                'phaseInputHashes': phase_hashes, 'generatedClientManifestSha256': digest(client), 'runtimeConfigurationSha256': runtime_config_hash}

    def guard():
        assert shutil.disk_usage(state).free >= FLOOR, 'available disk below 8GiB stop line'
        memory = next(int(line.split()[1]) * 1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
        assert memory >= 2 * 1024 ** 3, 'available memory below 2GiB stop line'
        for name, process, service in children:
            if service:
                assert process.poll() is None, f'{name} exited unexpectedly'
        if (state / 'stop').exists():
            raise KeyboardInterrupt

    def start(command, name, extra=None, service=True):
        log = (state / (name + '.log')).open('w')
        logs.append(log)
        process = subprocess.Popen(list(map(str, command)), cwd=BACKEND, env={**env, **(extra or {})}, stdout=log, stderr=log, start_new_session=True)
        children.append((name, process, service))
        if service:
            status['pids'][name] = process.pid
        record()
        return process

    def run(command, name, extra=None, timeout=300):
        process = start(command, name, extra, service=False)
        deadline = time.monotonic() + timeout
        while process.poll() is None:
            guard()
            if time.monotonic() >= deadline:
                raise TimeoutError(f'{name} exceeded budget; private log retained')
            time.sleep(.2)
        (state / (name + '.exit')).write_text(str(process.returncode) + '\n')
        assert process.returncode == 0, f'{name} failed; private log retained'
        guard()

    def wait_port(port, process):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            guard()
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.5):
                    actual = Path(f'/proc/{process.pid}/exe').resolve()
                    assert actual in [node.resolve(), (pg / 'postgres').resolve(), redis.resolve()]
                    result.setdefault('actualServiceExecutables', {})[str(process.pid)] = {'path': str(actual), 'sha256': sha_file(actual)}
                    return
            except OSError:
                time.sleep(.2)
        raise TimeoutError('service startup exceeded 60 seconds')

    def verify():
        if 'privateRuntimeFileSha256' in result:
            assert sha_file(state / 'runtime-private.json') == result['privateRuntimeFileSha256'], 'private runtime configuration changed'
        assert binding() == pinned, 'source/runtime/tool inputs changed during frozen run'

    def interrupt(_signum, _frame):
        raise KeyboardInterrupt

    for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
        signal.signal(sig, interrupt)
    try:
        record()
        pinned = binding()
        result.update({k: v for k, v in pinned.items() if k != 'sourceInputs'})
        (state / 'current-source-inputs.json').write_text(json.dumps(pinned['sourceInputs'], indent=2))
        (state / 'frozen-inputs.json').write_text(json.dumps(pinned, indent=2))
        source_manifest = manifest(source)
        result['sourceManifestSha256'] = digest(source_manifest)
        (state / 'source-byte-manifest.json').write_text(json.dumps(source_manifest, indent=2))
        requested = PHASES if args.phase == 'all' else PHASES[:PHASES.index(args.phase) + 1]
        if prior:
            prior_manifest = manifest(prior)
            result['priorManifestSha256'] = digest(prior_manifest)
            assert prior_result['sourceManifestSha256'] == result['sourceManifestSha256']
            for phase in PHASES:
                if prior_result['phases'].get(phase, {}).get('passed'):
                    assert prior_result['phaseInputHashes'][phase] == pinned['phaseInputHashes'][phase], f'passed {phase} inputs changed; cannot reuse or silently replay'
                    result['phases'][phase] = prior_result['phases'][phase]
                    result['reusedPhases'].append(phase)
            assert any(phase not in result['reusedPhases'] for phase in requested), 'all requested phases already passed; no services need starting'
            for name in ['c18-original-rows-private.json', 'c18-old-projections.json'] + [f'c18-{p}-{suffix}.json' for p in result['reusedPhases'] for suffix in ['result', 'post-state']]:
                shutil.copy2(prior / name, state / name)
            for file in prior.glob('c18-*-private.json'):
                if not (state / file.name).exists():
                    shutil.copy2(file, state / file.name)
            result['priorRuntimeResultSha256'] = sha_file(prior / 'c18-runtime-result.json')
        for directory in ['pgdata', 'uploads', 'exports']:
            before = manifest(copy_source / directory)
            shutil.copytree(copy_source / directory, state / directory, copy_function=shutil.copy2)
            assert manifest(state / directory) == before
            guard()
        shutil.copy2(dump, state / 'c16-pinned.dump')
        for source_name, target_name in [('fixture-private.json', 'fixture-private.json'), ('source-c14-http-result.json', 'source-c14-http-result.json'), ('c16-http-result.json', 'source-c16-http-result.json'), ('c16-runtime-result.json', 'source-c16-runtime-result.json')]:
            shutil.copy2(source / source_name, state / target_name)
        reservations = []
        try:
            for name in ['postgres', 'redis', 'api']:
                sock = socket.socket()
                sock.bind(('127.0.0.1', 0))
                reservations.append(sock)
                status['ports'][name] = sock.getsockname()[1]
        finally:
            for sock in reservations:
                sock.close()
        dbport, redisport, apiport = [status['ports'][k] for k in ['postgres', 'redis', 'api']]
        runtime = {**source_runtime, 'BACKGROUND_WORKERS_ENABLED': 'false', 'HEAVY_PROCESSING_ENABLED': 'false', 'VIDEO_PROCESSING_ENABLED': 'false', 'PERF_ISOLATED_TEST_MODE': '1', 'PERF_SQL_EVENT_COUNT': '1'}
        for key in ['DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME']:
            parsed = urlparse(runtime[key])
            runtime[key] = parsed._replace(netloc=f'{parsed.username}:{parsed.password}@127.0.0.1:{dbport}').geturl()
        runtime.update(REDIS_URL=f'redis://127.0.0.1:{redisport}', PORT=str(apiport), UPLOAD_DIR=str(state / 'uploads'), EXPORT_DIR=str(state / 'exports'))
        assert not any(str(root) in str(v) for root in [source] + ([prior] if prior else []) for v in runtime.values())
        (state / 'runtime-private.json').write_text(json.dumps(runtime))
        result['privateRuntimeFileSha256'] = sha_file(state / 'runtime-private.json')
        public_runtime = {k: v for k, v in runtime.items() if k != 'DATABASE_URL_OWNER'}
        postgres = start([pg / 'postgres', '-D', state / 'pgdata', '-h', '127.0.0.1', '-p', dbport, '-k', '', '-c', 'timezone=UTC', '-c', 'shared_buffers=128MB', '-c', 'max_connections=40'], 'postgres')
        wait_port(dbport, postgres)
        status.update(head=pinned['head'], node='v24.21.0', runtimeFingerprint=pinned['runtimeFingerprint'])
        record()
        if prior:
            db = db_module.Database(tools, state)
            latest = result['reusedPhases'][-1]
            accepted = json.loads((state / f'c18-{latest}-post-state.json').read_text())
            assert db.snapshot() == accepted, 'stopped clone differs from latest accepted phase; targeted continuation required'
        for phase in requested:
            if phase in result['reusedPhases']:
                continue
            verify()
            if phase == 'upgrade':
                status['state'] = 'upgrading'
                record()
                run(['python3', BASE / 'c18-study-upgrade.py', '--tools', tools, '--state', state], 'c18-upgrade', timeout=300)
            elif phase == 'http':
                redis_process = start([redis, '--bind', '127.0.0.1', '--port', redisport, '--dir', state, '--save', '', '--appendonly', 'no', '--maxmemory', '128mb', '--maxmemory-policy', 'noeviction'], 'redis')
                wait_port(redisport, redis_process)
                api = start([node, '--require', BASE / 'loopback-only.cjs', 'dist/index.js'], 'api', public_runtime)
                wait_port(apiport, api)
                status['apiUrl'] = f'http://127.0.0.1:{apiport}'
                for endpoint in ['health', 'ready']:
                    with urllib.request.urlopen(status['apiUrl'] + '/' + endpoint, timeout=8) as response:
                        assert response.status == 200
                status['state'] = 'running'
                record()
                run([node, '--require', BASE / 'loopback-only.cjs', BASE / 'c18-study-smoke.mjs', state], 'c18-http', public_runtime, timeout=600)
                http = json.loads((state / 'c18-http-result.json').read_text())
                assert http['passed'] is True
                db = db_module.Database(tools, state)
                db.original_rows_unchanged(json.loads((state / 'c18-original-rows-private.json').read_text()))
                (state / 'c18-http-post-state.json').write_text(json.dumps(db.snapshot(), indent=2))
            else:
                status['state'] = 'restoring'
                record()
                run(['python3', BASE / 'c18-study-restore.py', '--tools', tools, '--state', state], 'c18-restore', timeout=300)
            result['phases'][phase] = json.loads((state / f'c18-{phase}-result.json').read_text())
            assert result['phases'][phase]['passed'] is True
            verify()
            guard()
        result['passed'] = all(result['phases'].get(p, {}).get('passed') is True for p in requested)
    except BaseException as error:
        result['errorType'] = type(error).__name__
        raise
    finally:
        for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
            signal.signal(sig, signal.SIG_IGN)
        cleanup = []
        for name, process, service in reversed(children):
            try:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGINT if name == 'postgres' else signal.SIGTERM)
                    try:
                        process.wait(timeout=25)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=5)
            except ProcessLookupError:
                process.poll()
            except Exception as error:
                cleanup.append({'service': name, 'errorType': type(error).__name__})
        for log in logs:
            log.close()
        for name, port in status['ports'].items():
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.2):
                    cleanup.append({'service': name, 'errorType': 'PortStillOpen'})
            except OSError:
                pass
        if (state / 'pgdata/postmaster.pid').exists():
            cleanup.append({'service': 'postgres', 'errorType': 'PostmasterPidStillPresent'})
        result['cleanupVerified'] = not cleanup and all(p.poll() is not None for _, p, _ in children)
        result['processExits'] = {name: p.returncode for name, p, _ in children}
        for key, root, expected in [('sourceUnchanged', source, source_manifest)] + ([('priorSourceUnchanged', prior, prior_manifest)] if prior else []):
            try:
                result[key] = expected is not None and manifest(root) == expected and not (root / 'pgdata/postmaster.pid').exists()
            except Exception:
                result[key] = False
        try:
            result['inputsUnchanged'] = pinned is not None and binding() == pinned
        except Exception:
            result['inputsUnchanged'] = False
        isolation = all(result.get(k) is True for k in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged']) and result.get('priorSourceUnchanged', True)
        result['passed'] = result['passed'] and isolation
        status.update(state='stopped', cleanupVerified=result['cleanupVerified'], cleanupErrors=cleanup, endedAt=time.time())
        record()
        (state / 'c18-runtime-result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps({k: result[k] for k in ['passed', 'cleanupVerified', 'sourceUnchanged', 'inputsUnchanged']}), flush=True)
        lock.close()
        if not isolation:
            raise RuntimeError('C18 isolation/cleanup/input validation failed')


if __name__ == '__main__':
    main()
