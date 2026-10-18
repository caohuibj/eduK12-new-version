#!/usr/bin/env python3
"""C16-only PG/dist HTTP qualification on a byte-verified stopped FULL02 clone.

Owns the shared measurement lock and only its child services. Private state must
be new and outside the checkout. No old submission/report suite is replayed.
"""
import argparse
import fcntl
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
from urllib.parse import urlparse

BASE = Path(__file__).resolve().parent
BACKEND = BASE.parents[1] / 'backend'
REPO = BACKEND.parents[1]
PINNED_DUMP_SHA256 = 'a40b5f82ea2058a507140a9735bab4666c9babb96900e0622f279a3a58b0cde6'


def sha_file(file):
    digest = hashlib.sha256()
    with file.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def manifest(root):
    result = []
    assert root.is_dir() and not root.is_symlink()
    for entry in sorted(root.rglob('*')):
        assert not entry.is_symlink(), 'source symlinks are forbidden'
        item = {'path': str(entry.relative_to(root)), 'mode': entry.stat().st_mode & 0o777}
        if entry.is_dir():
            item['type'] = 'directory'
        else:
            assert entry.is_file(), 'special files are forbidden'
            item.update(type='file', size=entry.stat().st_size, sha256=sha_file(entry))
        result.append(item)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--source-state', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--upgrade-only', action='store_true')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--resume-state', type=Path, help='Stopped failed C16 clone whose upgrade passed and whose HTTP checks did not yet pass')
    group.add_argument('--continue-state', type=Path, help='Stopped C16 clone with accepted explicit partial phases; continue only missing HTTP checks')
    args = parser.parse_args()
    tools, source, state = (value.resolve() for value in (args.tools, args.source_state, args.state))
    assert source != state and source not in state.parents and state not in source.parents
    assert REPO not in state.parents and state != REPO and not state.exists()
    resume_arg = args.resume_state or args.continue_state
    resume = resume_arg.resolve() if resume_arg else None
    continuation = bool(args.continue_state)
    if resume:
        assert resume != state and resume not in state.parents and state not in resume.parents and resume != source
        assert not args.upgrade_only
        resumed_status = json.loads((resume / 'status.json').read_text())
        resumed_result = json.loads((resume / 'c16-runtime-result.json').read_text())
        resumed_http = json.loads((resume / 'c16-http-result.json').read_text())
        assert resumed_status['state'] == 'stopped' and resumed_status['cleanupVerified'] and not resumed_status['cleanupErrors']
        assert resumed_result['passed'] is False and all(resumed_result[key] is True for key in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged'])
        assert resumed_result['phases']['upgrade']['passed'] is True and resumed_http['passed'] is False
        if continuation:
            assert len(resumed_http['checks']) == 3 and resumed_http['exports'] == []
            if resumed_http['checks'][0].startswith('Real HTTP two-wave 10/20/50 synthetic four-tool numeric facts'):
                assert resumed_http['checks'][1].startswith('Actual PostgreSQL SQL-event counts remain batch-bounded')
                assert resumed_http['checks'][2].startswith('Owner discovers/analyzes current Training course')
                assert resumed_http['requests'][-1]['status'] == 500
                continuation_stage = 'AFTER_NUMERICAL_SQL_AUTHORITY'
            else:
                assert resumed_http['checks'][0].startswith('Same publication alias rejected 409')
                assert resumed_http['checks'][1].startswith('Removing one synthetic current enrollment retains all50')
                assert resumed_http['checks'][2].startswith('Bounded quality list paginates 25 rows')
                assert resumed_http['requests'][-1]['status'] == 400
                assert resumed_http['reusedEvidence']['stage'] == 'AFTER_NUMERICAL_SQL_AUTHORITY'
                continuation_stage = 'AFTER_QUALITY_LIST'
            assert resumed_result.get('resumeSourceUnchanged', True) is True
        else:
            assert resumed_http['checks'] == []
        assert not (resume / 'pgdata/postmaster.pid').exists()
        assert resumed_result['pinnedC14DumpSha256'] == PINNED_DUMP_SHA256
        for entry in json.loads((resume / 'current-source-inputs.json').read_text()):
            if '/prisma/' in entry['path'] or '/backend/scripts/' in entry['path'] or entry['path'].endswith(('backend/package.json', 'backend/package-lock.json')):
                assert sha_file(REPO / entry['path']) == entry['sha256'], 'upgrade inputs changed; passed migration evidence cannot be reused'
    node, pg, redis = tools / 'node_modules/node/bin/node', tools / 'postgresql/bin', tools / 'redis/bin/redis-server'
    assert subprocess.check_output([str(node), '--version'], text=True).strip() == 'v24.21.0'
    assert '16.15' in subprocess.check_output([str(pg / 'postgres'), '--version'], text=True)
    assert 'v=7.4.11 ' in subprocess.check_output([str(redis), '--version'], text=True)
    assert (BACKEND / 'dist/index.js').is_file()
    source_status = json.loads((source / 'status.json').read_text())
    source_result = json.loads((source / 'c14-runtime-result.json').read_text())
    source_runtime = json.loads((source / 'runtime-private.json').read_text())
    assert source_status['state'] == 'stopped' and source_status['cleanupVerified'] is True
    assert source_status['cleanupErrors'] == [] and source_result['passed'] is True
    assert source_result['qualificationScope'] == 'FULL_CONTINUATION'
    assert source_result['sourceUnchanged'] is True and source_result['inputsUnchanged'] is True
    assert source_result['phases']['newFormatRestore']['passed'] is True
    assert not (source / 'pgdata/postmaster.pid').exists()
    assert (source / 'pgdata/PG_VERSION').read_text().strip() == '16'
    assert not any((source / 'pgdata/pg_tblspc').iterdir())
    dump = source / 'c14-new-format-restore/c14-http-new-format.dump'
    assert sha_file(dump) == PINNED_DUMP_SHA256
    for config in ('postgresql.conf', 'postgresql.auto.conf'):
        for line in (source / 'pgdata' / config).read_text().splitlines():
            active = line.split('#', 1)[0].strip()
            assert not re.match(r'(?i)^(include(?:_if_exists|_dir)?|data_directory|hba_file|ident_file|external_pid_file|log_directory|archive_command|restore_command)\b', active)
    for key, role in [('DATABASE_URL_OWNER', 'eduk12_owner'), ('DATABASE_URL', 'eduk12_runtime'), ('DATABASE_URL_RUNTIME', 'eduk12_runtime')]:
        parsed = urlparse(source_runtime[key])
        assert parsed.hostname == '127.0.0.1' and parsed.username == role and parsed.path == '/eduk12_recovery'
        assert parsed.port == source_status['ports']['postgres'] and parsed.password
    lock = (tools / '.measurement.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    assert shutil.disk_usage(state.parent).free >= 8 * 1024 ** 3, 'available disk below 8GiB stop line'
    os.umask(0o077)
    state.mkdir(mode=0o700)
    env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state), 'TZ': 'UTC', 'LANG': 'C.UTF-8', 'NODE_ENV': 'test'}
    result = {'passed': False, 'qualificationScope': 'C16_UPGRADE_ONLY' if args.upgrade_only else 'C16_ANALYSIS_ONLY', 'phases': {}, 'checks': [], 'pinnedC14DumpSha256': PINNED_DUMP_SHA256, 'sourceHead': source_status['head']}
    status = {'state': 'preparing', 'ports': {}, 'pids': {}, 'startedAt': time.time()}
    children, logs, source_manifest, resume_manifest = [], [], None, None
    pinned = None

    def record():
        temporary = state / 'status.tmp'
        temporary.write_text(json.dumps(status, indent=2))
        temporary.replace(state / 'status.json')

    def binding():
        paths = ['server-version/backend/src', 'server-version/backend/prisma', 'server-version/backend/scripts', 'server-version/backend/package.json', 'server-version/backend/package-lock.json', 'server-version/backend/tsconfig.json', 'server-version/scripts/recovery']
        tracked = subprocess.check_output(['git', 'ls-files', '-z', '--', *paths], cwd=REPO).split(b'\0')
        untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z', '--', *paths], cwd=REPO).split(b'\0')
        entries = []
        for relative in sorted(set(tracked + untracked) - {b''}):
            file = REPO / os.fsdecode(relative)
            assert not file.is_symlink()
            entries.append({'path': os.fsdecode(relative), 'sha256': sha_file(file) if file.exists() else None, 'mode': file.stat().st_mode & 0o777 if file.exists() else None})
        return {'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(), 'runtimeFingerprint': json.loads(subprocess.check_output([str(node), str(BASE / 'runtime-fingerprint.cjs'), str(BACKEND)], text=True)), 'sourceInputs': entries, 'sourceInputsSha256': hashlib.sha256(json.dumps(entries, sort_keys=True).encode()).hexdigest(), 'toolExecutables': {str(binary.relative_to(tools)): sha_file(binary) for binary in [node, pg / 'postgres', pg / 'psql', pg / 'pg_dump', pg / 'pg_restore', redis]}}

    def guard():
        assert shutil.disk_usage(state).free >= 8 * 1024 ** 3, 'available disk below 8GiB stop line'
        available = next(int(line.split()[1]) * 1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
        assert available >= 2 * 1024 ** 3, 'available memory below 2GiB stop line'
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
                raise TimeoutError(f'{name} exceeded budget; see private log')
            time.sleep(.2)
        (state / (name + '.exit')).write_text(str(process.returncode) + '\n')
        assert process.returncode == 0, f'{name} failed; see private log'
        guard()

    def wait_port(port, process):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            guard()
            assert process.poll() is None
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.5):
                    actual = Path(f'/proc/{process.pid}/exe').resolve()
                    assert actual in [node.resolve(), (pg / 'postgres').resolve(), redis.resolve()], 'unexpected actual executable'
                    result.setdefault('actualServiceExecutables', {})[str(process.pid)] = {'path': str(actual), 'sha256': sha_file(actual)}
                    return
            except OSError:
                time.sleep(.2)
        raise TimeoutError('service startup exceeded 60 seconds')

    def verify():
        assert binding() == pinned, 'source/runtime inputs changed during this run'

    def interrupt(_signum, _frame):
        raise KeyboardInterrupt

    for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
        signal.signal(sig, interrupt)
    try:
        pinned = binding()
        result.update({key: value for key, value in pinned.items() if key != 'sourceInputs'})
        (state / 'current-source-inputs.json').write_text(json.dumps(pinned['sourceInputs'], indent=2))
        source_manifest = manifest(source)
        result['sourceManifestSha256'] = hashlib.sha256(json.dumps(source_manifest, sort_keys=True).encode()).hexdigest()
        (state / 'source-byte-manifest.json').write_text(json.dumps(source_manifest, indent=2))
        if resume:
            resume_manifest = manifest(resume)
            result['reusedUpgrade'] = {'sourceState': str(resume), 'resultSha256': sha_file(resume / 'c16-upgrade-result.json'), 'runtimeResultSha256': sha_file(resume / 'c16-runtime-result.json'), 'sourceManifestSha256': hashlib.sha256(json.dumps(resume_manifest, sort_keys=True).encode()).hexdigest(), 'scope': 'EXACT_STOPPED_UPGRADED_CLONE_NO_PASSED_HTTP_CHECKS_REPLAYED'}
            (state / 'resume-byte-manifest.json').write_text(json.dumps(resume_manifest, indent=2))
            assert resumed_result['sourceManifestSha256'] == result['sourceManifestSha256']
            for name in ['c16-original-rows-private.json', 'c16-old-projections.json', 'c16-upgrade-result.json']:
                shutil.copyfile(resume / name, state / name)
            if continuation:
                for name in ['c16-fixture-private.json', 'c16-http-result.json']:
                    shutil.copyfile(resume / name, state / ('prior-' + name))
                evidence = {'stage': continuation_stage, 'priorHead': resumed_result['head'], 'priorRuntimeResultSha256': sha_file(resume / 'c16-runtime-result.json'), 'priorHttpResultSha256': sha_file(resume / 'c16-http-result.json'), 'priorSourceInputsSha256': resumed_result['sourceInputsSha256'], 'reusedChecks': resumed_http['checks'], 'reusedMeasurements': resumed_http['measurements'], 'priorReusedEvidence': resumed_http.get('reusedEvidence'), 'reusedSqlQueryFamilies': resumed_http.get('sqlQueryFamilies')}
                (state / 'c16-continuation.json').write_text(json.dumps(evidence, indent=2))
                result['reusedHttp'] = evidence
        copy_source = resume or source
        for directory in ['pgdata', 'uploads', 'exports']:
            before = manifest(copy_source / directory)
            shutil.copytree(copy_source / directory, state / directory, copy_function=shutil.copy2)
            assert manifest(state / directory) == before
        assert manifest(source) == source_manifest
        for name in ['fixture-private.json', 'c14-http-result.json', 'c14-runtime-result.json']:
            shutil.copyfile(source / name, state / ('source-' + name if name != 'fixture-private.json' else name))
        shutil.copyfile(dump, state / 'c14-pinned.dump')
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
        dbport, redisport, apiport = (status['ports'][key] for key in ['postgres', 'redis', 'api'])
        runtime = {**source_runtime, 'BACKGROUND_WORKERS_ENABLED': 'false', 'HEAVY_PROCESSING_ENABLED': 'false', 'VIDEO_PROCESSING_ENABLED': 'false', 'PERF_ISOLATED_TEST_MODE': '1', 'PERF_SQL_EVENT_COUNT': '1'}
        for key in ['DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME']:
            parsed = urlparse(runtime[key])
            runtime[key] = parsed._replace(netloc=f'{parsed.username}:{parsed.password}@127.0.0.1:{dbport}').geturl()
        runtime.update(REDIS_URL=f'redis://127.0.0.1:{redisport}', PORT=str(apiport), UPLOAD_DIR=str(state / 'uploads'), EXPORT_DIR=str(state / 'exports'))
        assert not any(str(source) in str(value) for value in runtime.values()), 'runtime retained original source path'
        (state / 'runtime-private.json').write_text(json.dumps(runtime))
        public_runtime = {key: value for key, value in runtime.items() if key != 'DATABASE_URL_OWNER'}
        postgres = start([pg / 'postgres', '-D', state / 'pgdata', '-h', '127.0.0.1', '-p', dbport, '-k', '', '-c', 'timezone=UTC', '-c', 'shared_buffers=128MB', '-c', 'max_connections=40'], 'postgres')
        wait_port(dbport, postgres)
        status.update(state='upgrading', head=pinned['head'], node='v24.21.0', runtimeFingerprint=pinned['runtimeFingerprint'])
        record()
        if not resume:
            run(['python3', BASE / 'c16-analysis-upgrade.py', '--tools', tools, '--state', state], 'c16-upgrade', timeout=300)
        result['phases']['upgrade'] = json.loads((state / 'c16-upgrade-result.json').read_text())
        assert result['phases']['upgrade']['passed'] is True
        verify()
        if not args.upgrade_only:
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
            run([node, BASE / 'c16-analysis-smoke.mjs', state], 'c16-http', public_runtime, timeout=720)
            result['phases']['http'] = json.loads((state / 'c16-http-result.json').read_text())
            assert result['phases']['http']['passed'] is True
            verify()
            run(['python3', BASE / 'c16-analysis-restore.py', '--tools', tools, '--state', state], 'c16-restore', timeout=300)
            result['phases']['restore'] = json.loads((state / 'c16-restore-result.json').read_text())
            assert result['phases']['restore']['passed'] is True
            verify()
        result['passed'] = True
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
        result['cleanupVerified'] = not cleanup and all(process.poll() is not None for _, process, _ in children)
        result['processExits'] = {name: process.returncode for name, process, _ in children}
        try:
            result['sourceUnchanged'] = source_manifest is not None and manifest(source) == source_manifest and not (source / 'pgdata/postmaster.pid').exists()
        except Exception:
            result['sourceUnchanged'] = False
        try:
            result['inputsUnchanged'] = pinned is not None and binding() == pinned
        except Exception:
            result['inputsUnchanged'] = False
        if resume:
            try:
                result['resumeSourceUnchanged'] = resume_manifest is not None and manifest(resume) == resume_manifest and not (resume / 'pgdata/postmaster.pid').exists()
            except Exception:
                result['resumeSourceUnchanged'] = False
        result['passed'] = result['passed'] and result['cleanupVerified'] and result['sourceUnchanged'] and result['inputsUnchanged'] and result.get('resumeSourceUnchanged', True)
        status.update(state='stopped', cleanupVerified=result['cleanupVerified'], cleanupErrors=cleanup, endedAt=time.time())
        record()
        (state / 'c16-runtime-result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps({key: result[key] for key in ['passed', 'cleanupVerified', 'sourceUnchanged', 'inputsUnchanged']}), flush=True)
        lock.close()
        if not all(result.get(key) for key in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged']) or not result.get('resumeSourceUnchanged', True):
            raise RuntimeError('C16 isolation/cleanup/input validation failed')


if __name__ == '__main__':
    main()
