#!/usr/bin/env python3
"""Disposable synthetic-data stack on the current node; never production.

Requires separately verified Node/PostgreSQL/Redis binaries and compiled backend.
Creates a NEW private state directory. No existing database is reused or deleted.
Ctrl-C or the stop marker stops only processes created by this invocation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--hold-seconds', type=int, default=3600)
    parser.add_argument('--whole-submit', action='store_true', help='Enable whole-submit only in this isolated synthetic stack')
    args = parser.parse_args()
    if not 1 <= args.hold_seconds <= 28800:
        parser.error('hold-seconds must be 1..28800')
    tools = args.tools.resolve()
    state = args.state.resolve()
    backend = Path(__file__).resolve().parents[2] / 'backend'
    repo = backend.parents[1]
    node = tools / 'node_modules/node/bin/node'
    pg = tools / 'postgresql/bin'
    redis = tools / 'redis/bin/redis-server'
    for binary in [node, pg / 'initdb', pg / 'postgres', pg / 'psql', redis]:
        if not binary.is_file():
            raise RuntimeError(f'missing binary: {binary}')
    if not (backend / 'dist/index.js').is_file():
        raise RuntimeError('compile backend before starting the stack')
    state.mkdir(mode=0o700, parents=False, exist_ok=False)
    os.umask(0o077)
    children = []
    logs = []
    env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state),
           'LANG': 'C.UTF-8', 'TMPDIR': str(state), 'NODE_ENV': 'test'}
    summary = {'startedAt': time.time(), 'state': 'preparing', 'checks': {}}

    def interrupt(signum, _frame):
        summary['stopReason'] = f'signal_{signum}'
        raise KeyboardInterrupt

    for signum in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
        signal.signal(signum, interrupt)

    def record():
        temporary = state / 'status.tmp'
        temporary.write_text(json.dumps(summary, indent=2))
        temporary.replace(state / 'status.json')

    def run(command, label, extra=None, data=None, cwd=backend, timeout=240):
        with (state / f'{label}.log').open('w') as log:
            subprocess.run([str(x) for x in command], cwd=cwd, env={**env, **(extra or {})},
                           input=data, text=True, stdout=log, stderr=log,
                           check=True, timeout=timeout)

    def start(command, label, extra=None):
        log = (state / f'{label}.log').open('w')
        logs.append(log)
        process = subprocess.Popen([str(x) for x in command], cwd=backend,
                                   env={**env, **(extra or {})}, stdout=log, stderr=log)
        children.append((label, process))
        return process

    def port():
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            return sock.getsockname()[1]

    def wait_port(number, process):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError('service exited during startup; see private logs')
            try:
                with socket.create_connection(('127.0.0.1', number), timeout=1):
                    return
            except OSError:
                time.sleep(0.2)
        raise TimeoutError('service startup exceeded 60 seconds')

    try:
        summary['head'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
        summary['schemaSha256'] = hashlib.sha256((backend / 'prisma/schema.prisma').read_bytes()).hexdigest()
        summary['launcherSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        summary['backendTree'] = subprocess.check_output(['git', 'rev-parse', 'HEAD:server-version/backend'], cwd=repo, text=True).strip()
        summary['node'] = subprocess.check_output([str(node), '--version'], text=True).strip()
        summary['runtimeFingerprint'] = json.loads(subprocess.check_output(
            [str(node), str(Path(__file__).with_name('runtime-fingerprint.cjs')), str(backend)], text=True))
        dbport, redisport, apiport = port(), port(), port()
        summary['ports'] = {'postgres': dbport, 'redis': redisport, 'api': apiport}
        owner_password, runtime_password = secrets.token_hex(24), secrets.token_hex(24)
        password_file = state / 'pg-password'
        password_file.write_text(owner_password)
        run([pg / 'initdb', '-D', state / 'pgdata', '-U', 'eduk12_owner',
             '--auth-local=trust', '--auth-host=scram-sha-256', f'--pwfile={password_file}',
             '--encoding=UTF8', '--locale=C.UTF-8'], 'initdb')
        process = start([pg / 'postgres', '-D', state / 'pgdata', '-h', '127.0.0.1',
                         '-p', dbport, '-k', '', '-c', 'timezone=UTC', '-c', 'shared_buffers=128MB',
                         '-c', 'max_connections=40'], 'postgres')
        wait_port(dbport, process)
        psql = [pg / 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
                '-p', dbport, '-U', 'eduk12_owner']
        auth = {'PGPASSWORD': owner_password}
        run([*psql, '-d', 'postgres'], 'create-database', auth,
            "CREATE DATABASE eduk12_recovery;\n"
            f"CREATE ROLE eduk12_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{runtime_password}';\n")
        owner_url = f'postgresql://eduk12_owner:{owner_password}@127.0.0.1:{dbport}/eduk12_recovery'
        runtime_url = f'postgresql://eduk12_runtime:{runtime_password}@127.0.0.1:{dbport}/eduk12_recovery?connection_limit=6'
        run([node, 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrate',
            {'DATABASE_URL': owner_url}, timeout=360)
        run([*psql, '-d', 'eduk12_recovery'], 'base-acl', auth,
            'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO eduk12_runtime;\n')
        table_policy = (backend / 'scripts/runtime-table-policy.json').read_text()
        run([*psql, '-d', 'eduk12_recovery', '-v', 'target_database=eduk12_recovery',
             '-v', 'migration_owner=eduk12_owner', '-v', 'runtime_role=eduk12_runtime',
             '-v', f'table_policy={table_policy}', '-f', 'scripts/runtime-role-defaults.sql'], 'runtime-acl', auth)
        runtime = {
            'DATABASE_URL': runtime_url, 'DATABASE_URL_RUNTIME': runtime_url,
            'REDIS_URL': f'redis://127.0.0.1:{redisport}', 'PORT': str(apiport),
            'CORS_ORIGIN': 'http://127.0.0.1:5173', 'COOKIE_SECURE': 'false',
            'JWT_SECRET': secrets.token_hex(32), 'ASSET_SIGNING_SECRET': secrets.token_hex(32),
            'DATA_ENCRYPTION_KEY': secrets.token_hex(32), 'DATA_PSEUDONYM_KEY': secrets.token_hex(32),
            'COGNITIVE_MODULE_ENABLED': 'true', 'BACKGROUND_WORKERS_ENABLED': 'false',
            'HEAVY_PROCESSING_ENABLED': 'false', 'VIDEO_PROCESSING_ENABLED': 'false',
            'ASSESSMENT_REPORT_ASYNC_ENABLED': 'true', 'UPLOAD_DIR': str(state / 'uploads'),
        }
        if args.whole_submit:
            runtime['ASSESSMENT_WHOLE_SUBMIT_ENABLED'] = 'true'
        # This file is private runtime configuration, never a repository artifact.
        (state / 'runtime-private.json').write_text(json.dumps({**runtime, 'DATABASE_URL_OWNER': owner_url}))
        run([node, 'scripts/runtime-role-contract.mjs', 'verify-current'], 'runtime-verify', runtime)
        summary['checks']['runtimeRole'] = 'passed'
        rp = start([redis, '--bind', '127.0.0.1', '--port', redisport, '--dir', state,
                    '--save', '', '--appendonly', 'no', '--maxmemory', '128mb',
                    '--maxmemory-policy', 'noeviction'], 'redis')
        wait_port(redisport, rp)
        api = start([node, '--require', Path(__file__).with_name('loopback-only.cjs'), 'dist/index.js'], 'api', runtime)
        wait_port(apiport, api)
        worker = start([node, 'dist/workers/main.js'], 'report-worker', runtime)
        for endpoint in ['health', 'ready']:
            with urllib.request.urlopen(f'http://127.0.0.1:{apiport}/{endpoint}', timeout=8) as response:
                summary['checks'][endpoint] = response.status
        summary['state'] = 'running'
        summary['pids'] = {name: child.pid for name, child in children}
        summary['apiUrl'] = f'http://127.0.0.1:{apiport}'
        record()
        print(json.dumps(summary), flush=True)
        deadline = time.monotonic() + args.hold_seconds
        while time.monotonic() < deadline and not (state / 'stop').exists():
            memory = Path('/proc/meminfo').read_text()
            available = next(int(line.split()[1]) * 1024 for line in memory.splitlines() if line.startswith('MemAvailable:'))
            if available < 2 * 1024 ** 3:
                raise RuntimeError('host available memory below 2GiB stop line')
            for name, child in children:
                if child.poll() is not None:
                    raise RuntimeError(f'{name} exited unexpectedly')
                if name in ['api', 'report-worker']:
                    status = Path(f'/proc/{child.pid}/status').read_text()
                    rss = next(int(line.split()[1]) * 1024 for line in status.splitlines() if line.startswith('VmRSS:'))
                    summary.setdefault('peakRssBytes', {})[name] = max(rss, summary.get('peakRssBytes', {}).get(name, 0))
                    if rss >= 1024 ** 3:
                        raise RuntimeError(f'{name} reached 1GiB stop line')
            record()
            time.sleep(1)
    except KeyboardInterrupt:
        summary.setdefault('stopReason', 'operator_interrupt')
    except Exception as error:
        summary['stopReason'] = str(error)
        raise
    finally:
        for signum in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
            signal.signal(signum, signal.SIG_IGN)
        cleanup_errors = []
        for name, child in reversed(children):
            try:
                if child.poll() is None:
                    child.send_signal(signal.SIGINT if name == 'postgres' else signal.SIGTERM)
                    try:
                        child.wait(timeout=20)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait(timeout=5)
            except ProcessLookupError:
                child.poll()
            except Exception as error:
                cleanup_errors.append({'service': name, 'errorType': type(error).__name__})
        for log in logs:
            log.close()
        summary['cleanupVerified'] = not cleanup_errors and all(child.poll() is not None for _, child in children)
        summary['state'] = 'stopped' if summary['cleanupVerified'] else 'cleanup_failed'
        summary['cleanupErrors'] = cleanup_errors
        summary['stoppedAt'] = time.time()
        record()
        if not summary['cleanupVerified']:
            raise RuntimeError('LOCAL_STACK_CLEANUP_INCOMPLETE')


if __name__ == '__main__':
    main()
