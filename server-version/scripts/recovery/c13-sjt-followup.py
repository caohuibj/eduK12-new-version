#!/usr/bin/env python3
"""Finish only six failed PG observations + new-format restore from stopped C13.

Original HTTP and four passing PG cases are reused by exact input/result binding,
never rerun or relabelled. Original aggregate remains failed. Only a byte-verified
PGdata clone starts; no API or Redis. Credentials stay in private state/environment.
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
from urllib.parse import urlparse

p = argparse.ArgumentParser()
p.add_argument('--tools', type=Path, required=True)
p.add_argument('--source-state', type=Path, required=True)
p.add_argument('--state', type=Path, required=True)
a = p.parse_args()
source, state, tools = a.source_state.resolve(), a.state.resolve(), a.tools.resolve()
base = Path(__file__).resolve().parent
backend = base.parents[1] / 'backend'
repo = backend.parents[1]
node, pg = tools / 'node_modules/node/bin/node', tools / 'postgresql/bin'
test_relative = 'server-version/backend/src/__tests__/integration/sjt-image-retention.postgres.integration.test.ts'
test_file = repo / test_relative
assert source != state and source not in state.parents and state not in source.parents
assert not state.exists(), 'new private state required'
source_status_bytes = (source / 'status.json').read_bytes()
source_status = json.loads(source_status_bytes)
original_bytes = (source / 'c13-runtime-result.json').read_bytes()
original = json.loads(original_bytes)
http_bytes = (source / 'c13-http-result.json').read_bytes()
http = json.loads(http_bytes)
pg_bytes = (source / 'c13-image-lock-pg-result.json').read_bytes()
old_pg = json.loads(pg_bytes)
assert source_status.get('state') == 'stopped' and source_status.get('cleanupVerified') is True
assert source_status.get('cleanupErrors') == [] and original.get('cleanupVerified') is True
assert original.get('passed') is False, 'this follow-up preserves the original failed aggregate'
assert http.get('passed') is True and original['phases']['sjt']['passed'] is True
assert source_status['head'] == original['sourceHead']
assert not (source / 'pgdata/postmaster.pid').exists()
assert (source / 'pgdata/PG_VERSION').read_text().strip() == '16'
assert not any((source / 'pgdata/pg_tblspc').iterdir())
source_runtime = json.loads((source / 'runtime-private.json').read_text())
for key, username in [('DATABASE_URL_OWNER', 'eduk12_owner'), ('DATABASE_URL', 'eduk12_runtime')]:
    parsed = urlparse(source_runtime[key])
    assert parsed.hostname == '127.0.0.1' and parsed.path == '/eduk12_recovery' and parsed.username == username
old_assertions = [item for suite in old_pg['testResults'] for item in suite['assertionResults']]
old_failed = [item for item in old_assertions if item['status'] == 'failed']
old_passed = [item for item in old_assertions if item['status'] == 'passed']
assert len(old_failed) == 6 and len(old_passed) == 4
expected_failed_names = [
    'publish retain first: deletion blocks, rechecks and refuses without losing the image',
    'publish deletion first: retention blocks then rejects the deleted identity, with no retained fact',
    'attempt retain first: deletion blocks, rechecks and refuses without losing the image',
    'attempt deletion first: retention blocks then rejects the deleted identity, with no retained fact',
    'rechecks ownership after a waiting delete acquires the row lock',
    'two different retain owners hold SHARE together while deletion waits for both',
]
assert sorted(item['title'] for item in old_failed) == sorted(expected_failed_names)
assert all(any('function pg_blocking_pids(bigint) does not exist' in message for message in item['failureMessages']) for item in old_failed)
pattern = '^(?:' + '|'.join(re.escape(item['fullName']) for item in old_failed) + ')$'
state.mkdir(mode=0o700)
os.umask(0o077)
result = {'passed': False, 'originalAggregatePassed': False, 'checks': [],
          'sourceHead': original['sourceHead'], 'sourceStatusSha256': hashlib.sha256(source_status_bytes).hexdigest(),
          'sourceAggregateSha256': hashlib.sha256(original_bytes).hexdigest(),
          'sourceHttpResultSha256': hashlib.sha256(http_bytes).hexdigest(),
          'sourcePostgresResultSha256': hashlib.sha256(pg_bytes).hexdigest(),
          'reusedHttp': {'checks': len(http['checks']), 'requests': len(http['requests']), 'frozenReceipts': len(http['receipts'])},
          'reusedPostgresPassedNames': [item['fullName'] for item in old_passed],
          'retriedPostgresFailedNames': [item['fullName'] for item in old_failed]}
child = None
log_handle = None
source_manifest = None
env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state), 'LANG': 'C.UTF-8', 'NODE_ENV': 'test'}
status = {'state': 'preparing', 'services': ['postgres'], 'apiStarted': False, 'redisStarted': False}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=repo)

def fingerprint():
    return json.loads(subprocess.check_output([str(node), str(base / 'runtime-fingerprint.cjs'), str(backend)], text=True))

def pgdata_manifest(directory):
    entries = []
    for entry in sorted(directory.rglob('*')):
        assert not entry.is_symlink(), 'PGdata symlinks not allowed'
        relative = str(entry.relative_to(directory))
        if entry.is_dir():
            entries.append({'path': relative, 'type': 'directory'})
        else:
            assert entry.is_file()
            digest = hashlib.sha256()
            with entry.open('rb') as handle:
                for block in iter(lambda: handle.read(1024 * 1024), b''):
                    digest.update(block)
            entries.append({'path': relative, 'type': 'file', 'size': entry.stat().st_size, 'sha256': digest.hexdigest()})
    return entries

def verify_inputs():
    current = fingerprint()
    assert current == original['runtimeFingerprint'] == source_status['runtimeFingerprint'], 'dist/runtime fingerprint changed; HTTP evidence cannot be reused'
    paths = ['server-version/backend/src', 'server-version/backend/prisma', 'server-version/backend/scripts',
             'server-version/backend/package.json', 'server-version/backend/package-lock.json',
             'server-version/backend/tsconfig.json', 'server-version/backend/vitest.config.ts',
             'server-version/e2e/questionnaire-products-fixture.ts']
    changed = git('diff', '--name-only', original['sourceHead'], '--', *paths).decode().splitlines()
    assert set(changed) <= {test_relative}, f'Non-test business input changed: {changed}'
    old_test = git('show', original['sourceHead'] + ':' + test_relative)
    original_call = b'pg_blocking_pids(${backendPid})'
    assert old_test.count(original_call) == 1
    assert test_file.read_bytes() == old_test.replace(original_call, b'pg_blocking_pids(${backendPid}::int)'), 'PG test changes exceed the single approved observation cast'
    assert not git('ls-files', '--others', '--exclude-standard', '--', *paths).strip(), 'untracked business inputs require review'
    source_tree = git('ls-tree', '-r', '-z', original['sourceHead'], '--', *paths)
    manifest = []
    for entry in source_tree.split(b'\0'):
        if not entry:
            continue
        metadata, encoded_path = entry.split(b'\t', 1)
        mode, kind, blob = metadata.decode().split()
        relative = encoded_path.decode()
        if relative == test_relative:
            continue
        file = repo / relative
        assert kind == 'blob' and not file.is_symlink() and file.is_file()
        assert ('100755' if os.access(file, os.X_OK) else '100644') == mode
        manifest.append([relative, mode, blob])
    current_blobs = subprocess.check_output(['git', 'hash-object', '--stdin-paths'], cwd=repo,
        input=('\n'.join(item[0] for item in manifest) + '\n').encode()).decode().splitlines()
    assert current_blobs == [item[2] for item in manifest], 'business source bytes changed'
    for relative, digest in original['harnessInputs'].items():
        if relative != 'backend/src/__tests__/integration/sjt-image-retention.postgres.integration.test.ts':
            assert sha((backend.parent / relative).read_bytes()) == digest, f'original HTTP harness input changed: {relative}'
    return current, manifest

def run(command, name, extra=None, timeout=240):
    with (state / (name + '.log')).open('w') as log:
        subprocess.run(list(map(str, command)), cwd=backend, env={**env, **(extra or {})}, stdout=log, stderr=log, check=True, timeout=timeout)

def interrupt(_signum, _frame):
    raise KeyboardInterrupt

for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
    signal.signal(sig, interrupt)
try:
    result['harnessSha256'] = sha(Path(__file__).read_bytes())
    result['candidateHead'] = git('rev-parse', 'HEAD').decode().strip()
    current_fingerprint, source_inputs = verify_inputs()
    result['runtimeFingerprint'] = current_fingerprint
    result['businessSourceManifestSha256'] = sha(json.dumps(source_inputs).encode())
    result['businessSourceFileCount'] = len(source_inputs)
    result['testSourceBeforeSha256'] = sha(git('show', original['sourceHead'] + ':' + test_relative))
    result['testSourceAfterSha256'] = sha(test_file.read_bytes())
    result['checks'].append('Original HTTP runtime fingerprint and every business source/config/schema/dependency byte match; only repaired PG test source differs')
    source_manifest = pgdata_manifest(source / 'pgdata')
    result['sourcePgdataManifestSha256'] = sha(json.dumps(source_manifest, sort_keys=True).encode())
    (state / 'source-pgdata-manifest.json').write_text(json.dumps(source_manifest, indent=2))
    shutil.copytree(source / 'pgdata', state / 'pgdata', copy_function=shutil.copy2)
    assert pgdata_manifest(source / 'pgdata') == source_manifest
    assert pgdata_manifest(state / 'pgdata') == source_manifest
    assert (source / 'status.json').read_bytes() == source_status_bytes and not (source / 'pgdata/postmaster.pid').exists()
    result['checks'].append('Stopped source PGdata path/size/SHA unchanged across copy; clone byte-identical before startup')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    runtime = dict(source_runtime)
    for key in ['DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME']:
        parsed = urlparse(runtime[key])
        runtime[key] = parsed._replace(netloc=f'{parsed.username}:{parsed.password}@127.0.0.1:{port}').geturl()
    # Existing HTTP assets are read only by the restore helper; never move/edit them.
    assert Path(runtime['UPLOAD_DIR']).resolve() == (source / 'uploads').resolve()
    (state / 'runtime-private.json').write_text(json.dumps(runtime))
    (state / 'c13-http-result.json').write_bytes(http_bytes)
    log_handle = (state / 'postgres.log').open('w')
    child = subprocess.Popen([str(pg / 'postgres'), '-D', str(state / 'pgdata'), '-h', '127.0.0.1', '-p', str(port), '-k', '',
                              '-c', 'timezone=UTC', '-c', 'shared_buffers=128MB', '-c', 'max_connections=40'],
                             cwd=backend, env=env, stdout=log_handle, stderr=log_handle)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if child.poll() is not None:
            raise RuntimeError('cloned PostgreSQL exited during startup')
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=1):
                break
        except OSError:
            time.sleep(.2)
    else:
        raise TimeoutError('cloned PostgreSQL startup')
    status.update({'state': 'running', 'ports': {'postgres': port}, 'pids': {'postgres': child.pid}, 'runtimeFingerprint': current_fingerprint})
    (state / 'status.json').write_text(json.dumps(status, indent=2))
    runtime.pop('DATABASE_URL_OWNER')
    run([node, 'scripts/runtime-role-contract.mjs', 'verify-current'], 'runtime-role', runtime)
    run([node, 'node_modules/vitest/vitest.mjs', 'run', 'src/__tests__/integration/sjt-image-retention.postgres.integration.test.ts',
         '--maxWorkers=1', '--testNamePattern', pattern, '--reporter=json', '--outputFile=' + str(state / 'c13-image-lock-pg-followup-result.json')],
        'c13-image-lock-pg-followup', {**runtime, 'RELEASE_INTEGRATION_DATABASE_URL': runtime['DATABASE_URL'], 'PERF_ISOLATED_TEST_MODE': '1'}, timeout=180)
    new_pg = json.loads((state / 'c13-image-lock-pg-followup-result.json').read_text())
    new_assertions = [item for suite in new_pg['testResults'] for item in suite['assertionResults']]
    assert new_pg['success'] is True and new_pg['numPassedTests'] == 6 and new_pg['numFailedTests'] == 0
    assert {item['fullName'] for item in new_assertions if item['status'] == 'passed'} == {item['fullName'] for item in old_failed}
    assert {item['fullName'] for item in new_assertions if item['status'] in ['pending', 'skipped', 'todo']} == {item['fullName'] for item in old_passed}
    result['newPostgresPassed'] = 6
    result['previousPostgresNotRerun'] = 4
    result['checks'].append('Exactly original six failed PG observations passed with corrected parameter cast; original four passed cases were not run')
    assert verify_inputs() == (current_fingerprint, source_inputs)
    assert sha(test_file.read_bytes()) == result['testSourceAfterSha256']
    run(['python3', base / 'c13-sjt-restore.py', '--tools', tools, '--state', state], 'c13-new-format-restore')
    result['newFormatRestore'] = json.loads((state / 'c13-new-format-restore-result.json').read_text())
    assert result['newFormatRestore']['passed'] is True
    assert verify_inputs() == (current_fingerprint, source_inputs)
    assert sha(Path(__file__).read_bytes()) == result['harnessSha256']
    result['passed'] = True
except BaseException as error:
    result['errorType'] = type(error).__name__
    raise
finally:
    for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
        signal.signal(sig, signal.SIG_IGN)
    if child and child.poll() is None:
        child.send_signal(signal.SIGINT)
        try:
            child.wait(timeout=30)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)
    if log_handle:
        log_handle.close()
    result['cleanupVerified'] = child is None or child.poll() is not None
    try:
        result['sourceUnchanged'] = ((source / 'status.json').read_bytes() == source_status_bytes
            and (source / 'c13-runtime-result.json').read_bytes() == original_bytes
            and (source / 'c13-http-result.json').read_bytes() == http_bytes
            and (source / 'c13-image-lock-pg-result.json').read_bytes() == pg_bytes
            and not (source / 'pgdata/postmaster.pid').exists()
            and (source_manifest is None or pgdata_manifest(source / 'pgdata') == source_manifest))
    except Exception:
        result['sourceUnchanged'] = False
    result['passed'] = result['passed'] and result['cleanupVerified'] and result['sourceUnchanged']
    status.update({'state': 'stopped' if result['cleanupVerified'] else 'cleanup_failed',
                   'cleanupVerified': result['cleanupVerified'], 'cleanupErrors': [] if result['cleanupVerified'] else ['PostgreSQL still running']})
    (state / 'status.json').write_text(json.dumps(status, indent=2))
    (state / 'c13-followup-result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'resultPath': str(state / 'c13-followup-result.json'), 'passed': result['passed'],
                      'cleanupVerified': result['cleanupVerified'], 'sourceUnchanged': result['sourceUnchanged']}), flush=True)
    if not result['cleanupVerified'] or not result['sourceUnchanged']:
        raise RuntimeError('C13 follow-up cleanup or source immutability check failed')
