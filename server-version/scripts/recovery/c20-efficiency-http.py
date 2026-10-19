#!/usr/bin/env python3
"""Independent C20 resource baseline; never replays the functional qualification.

The launcher owns the measurement lock and every service/client in one persistent
execution namespace. Do not wrap it in flock. A new private destination is always
required. Failed attempts, journals and accepted FINALs are retained, never resumed
or replayed automatically. The after mode is deliberately fail-closed until the
exact optimization and unchanged comparison inputs are separately frozen.
"""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
BACKEND = BASE.parents[1] / 'backend'
REPO = BACKEND.parents[1]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, BASE / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


# Reuse the reviewed source checks, PG driver readiness policy and DB snapshot.
old = module('c20_efficiency_old_launcher', 'c20-materials-http.py')
sha_file, digest, manifest, stopped = old.sha_file, old.digest, old.manifest, old.stopped
FLOOR = 8 * 1024 ** 3
PINNED_HEAD = '11feee924fd2def2c7e2f6ae849d66ab59e3e2da'
PINNED_PLAN = '22b822ea37eb2dabcce618be1d78f534f054c3a781ce226bb7343edbf0681304'
PINNED_RUNTIME = '2c2b36735802dedcba5cf905bdce1c8430b1756cc86f8f78c8e127f7c15f77a5'
PINNED_DUMP = 'ceee3749d21dead15d1c838d945131fd18c3b7d6accfa58212fce287c4bfdb9c'
PINNED_BEFORE_RUNTIME = 'ba9a08e16b6acfebb3a4c2a61e31ebffd14ea00ce312d5beb5e71b9fbd0fcd6c'
AFTER_BUSINESS_PATHS = {
    'server-version/backend/src/modules/assessment-runtime/compact-assessment-storage.ts',
    'server-version/backend/src/modules/assessment-runtime/scale-fact-records.ts',
    'server-version/backend/src/modules/composite/composite-export.service.ts',
}
PRODUCERS = {'consumers': 'c20-efficiency-consumers.mjs', 'chains': 'c20-efficiency-chains.mjs'}
SUPPORT = {
    'c20-efficiency-http.py', 'c20-efficiency-observer.mjs',
    'c20-materials-http.py', 'c20-materials-db.py', 'c20-materials-receipts.py',
    'c20-materials-client.mjs', 'c20-materials-fixture.mjs',
    'c19-flow-db.py', 'c18-study-http.py', 'c18-study-db.py', 'c16-analysis-db.py',
    'runtime-fingerprint.cjs', 'loopback-only.cjs',
}
BUSINESS = ['server-version/backend/src', 'server-version/backend/prisma',
            'server-version/backend/scripts', 'server-version/backend/package.json',
            'server-version/backend/package-lock.json', 'server-version/backend/tsconfig.json']
def business_input(relative):
    return '/__tests__/' not in relative and not relative.endswith(('.test.ts', '.spec.ts'))


def git_paths(*arguments):
    return [os.fsdecode(value) for value in subprocess.check_output(['git', *arguments], cwd=REPO).split(b'\0') if value]

READINESS_DRIVER = """const {Client}=require('pg');const client=new Client({connectionString:process.env.DATABASE_URL_OWNER,connectionTimeoutMillis:2000,query_timeout:3000});(async()=>{try{await client.connect();const r=await client.query('SELECT 1 AS ready');if(r.rows.length!==1||r.rows[0].ready!==1)throw Object.assign(new Error('invalid readiness result'),{code:'INVALID_RESULT'});process.stdout.write(JSON.stringify({ready:true}));}catch(error){process.stdout.write(JSON.stringify({code:typeof error.code==='string'?error.code:'NO_SQLSTATE'}));process.exitCode=error.code==='57P03'?75:1;}finally{await client.end().catch(()=>{});}})()"""


def selected_scenarios(scenario):
    return ['consumers', 'chains'] if scenario == 'all' else ['consumers']


def validate_phase(phase, head, contract=None):
    assert phase in ['before', 'after']
    if phase == 'after':
        assert contract and contract.get('schemaVersion') == 1 and contract.get('phase') == 'after', 'after requires explicit frozen optimization contract'
        assert contract.get('beforeRuntimeSha256') == PINNED_BEFORE_RUNTIME
        assert contract.get('businessChanges') and set(contract['businessChanges']) <= AFTER_BUSINESS_PATHS
        assert re.fullmatch(r'[0-9a-f]{64}', contract.get('runtimeFingerprintSha256', ''))
        for hashes in contract['businessChanges'].values():
            assert set(hashes) == {'beforeSha256', 'afterSha256'}
            assert all(re.fullmatch(r'[0-9a-f]{64}', value) for value in hashes.values())
    else:
        assert contract is None
    assert re.fullmatch(r'[0-9a-f]{40}', head), 'execution HEAD must be an explicit full commit'
    # The main entry separately proves no BUSINESS diff from PINNED_HEAD.


def validate_before_instrumentation(before_result, before_frozen):
    assert digest(before_frozen['sourceInputs']) == before_result['sourceInputsSha256'], 'before frozen source digest mismatch'
    assert before_frozen['sourceInputsSha256'] == before_result['sourceInputsSha256']
    originals = {item['path']: item['sha256'] for item in before_frozen['sourceInputs']}
    consumer = 'server-version/scripts/recovery/c20-efficiency-consumers.mjs'
    assert originals[consumer] == before_result['scenarios']['consumers']['producerSha256'], 'before consumer producer identity mismatch'
    return originals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--source-state', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--expected-plan-sha256', required=True)
    parser.add_argument('--expected-head', required=True)
    parser.add_argument('--phase', choices=['before', 'after'], default='before')
    parser.add_argument('--scenario', choices=['all', 'consumers'], default='all')
    parser.add_argument('--after-contract', type=Path)
    parser.add_argument('--expected-after-contract-sha256')
    args = parser.parse_args()
    contract = None
    if args.phase == 'after':
        assert args.after_contract and args.expected_after_contract_sha256
        assert sha_file(args.after_contract) == args.expected_after_contract_sha256
        contract = json.loads(args.after_contract.read_text())
        assert args.scenario == 'consumers', 'new resource FINALs are never replayed after optimization'
    else:
        assert not args.after_contract and not args.expected_after_contract_sha256
    validate_phase(args.phase, args.expected_head, contract)
    tools, source, state, plan_file = [p.resolve() for p in [args.tools, args.source_state, args.state, args.plan]]
    assert args.expected_plan_sha256 == PINNED_PLAN and sha_file(plan_file) == PINNED_PLAN
    plan = json.loads(plan_file.read_text())
    assert Path(plan['sourceState']).resolve() == source
    assert plan['functionalHead'] == PINNED_HEAD
    assert plan['sourceRuntimeReceiptSha256'] == PINNED_RUNTIME
    assert plan['sourceDumpSha256'] == PINNED_DUMP
    assert re.fullmatch(r'[0-9a-f]{40}', args.expected_head)
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip() == args.expected_head
    if args.phase == 'before':
        assert subprocess.run(['git', 'diff', '--quiet', PINNED_HEAD, args.expected_head, '--', *BUSINESS], cwd=REPO).returncode == 0, 'execution commit changes functional baseline BUSINESS inputs'
    else:
        changed = {file for file in git_paths('diff', '--name-only', '-z', PINNED_HEAD, args.expected_head, '--', *BUSINESS) if business_input(file)}
        assert changed == set(contract['businessChanges']) <= AFTER_BUSINESS_PATHS
        for file, hashes in contract['businessChanges'].items():
            original = subprocess.check_output(['git', 'show', PINNED_HEAD + ':' + file], cwd=REPO)
            assert hashlib.sha256(original).hexdigest() == hashes['beforeSha256']
            assert sha_file(REPO / file) == hashes['afterSha256']

    assert not [file for file in git_paths('diff', '--name-only', '-z', 'HEAD', '--', *BUSINESS) if business_input(file)], 'uncommitted baseline business input'
    assert not [file for file in git_paths('ls-files', '--others', '--exclude-standard', '-z', '--', *BUSINESS) if business_input(file)], 'untracked baseline business input'
    assert state.parent.is_dir() and not state.exists()
    assert REPO != state and REPO not in state.parents and state not in REPO.parents
    assert source != state and source not in state.parents and state not in source.parents
    assert source != REPO and REPO not in source.parents
    node, pg, redis = tools / 'node_modules/node/bin/node', tools / 'postgresql/bin', tools / 'redis/bin/redis-server'
    assert subprocess.check_output([node, '--version'], text=True).strip() == 'v24.21.0'
    assert '16.15' in subprocess.check_output([pg / 'postgres', '--version'], text=True)
    assert 'v=7.4.11 ' in subprocess.check_output([redis, '--version'], text=True)
    assert (BACKEND / 'dist/index.js').is_file()
    source_status = stopped(source)
    assert sha_file(source / 'c20-runtime-result.json') == PINNED_RUNTIME
    source_result = json.loads((source / 'c20-runtime-result.json').read_text())
    assert source_result['functionalCheckpointPassed'] is True
    assert all(source_result.get(key) is True for key in ['cleanupVerified', 'sourceUnchanged', 'priorSourceUnchanged', 'inputsUnchanged'])
    assert sha_file(source / 'c20-final-db-snapshot.json') == source_result['finalSnapshotSha256']
    dump = source / 'c20-new-format-restore/c20-http-new-format.dump'
    assert sha_file(dump) == PINNED_DUMP
    for name, sha in plan['fixturePins'].items():
        assert sha_file(source / name) == sha, 'frozen fixture mismatch: ' + name
    source_runtime = json.loads((source / 'runtime-private.json').read_text())
    for key, role in [('DATABASE_URL_OWNER', 'eduk12_owner'), ('DATABASE_URL', 'eduk12_runtime'), ('DATABASE_URL_RUNTIME', 'eduk12_runtime')]:
        url = urlparse(source_runtime[key])
        assert url.hostname == '127.0.0.1' and url.username == role and url.path == '/eduk12_recovery' and url.port == source_status['ports']['postgres'] and url.password
    runtime = {**source_runtime, 'BACKGROUND_WORKERS_ENABLED': 'false', 'HEAVY_PROCESSING_ENABLED': 'false', 'VIDEO_PROCESSING_ENABLED': 'false', 'PERF_ISOLATED_TEST_MODE': '1', 'PERF_SQL_EVENT_COUNT': '1'}
    effective = {**runtime, 'REDIS_URL': 'redis://127.0.0.1:0', 'PORT': '0', 'UPLOAD_DIR': '<private-state>/uploads', 'EXPORT_DIR': '<private-state>/exports'}
    for key in ['DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME']:
        url = urlparse(effective[key])
        effective[key] = url._replace(netloc=f'{url.username}:{url.password}@127.0.0.1:0').geturl()
    configuration_hash = digest(effective)
    baseline_binding = None
    if contract:
        before_state = Path(contract['beforeState']).resolve()
        assert before_state != state and before_state != source
        stopped(before_state)
        assert sha_file(before_state / 'c20-efficiency-runtime-result.json') == PINNED_BEFORE_RUNTIME
        before_result = json.loads((before_state / 'c20-efficiency-runtime-result.json').read_text())
        assert all(before_result.get(key) is True for key in ['passed', 'cleanupVerified', 'sourceUnchanged', 'inputsUnchanged'])
        baseline_binding = before_state / 'c20-efficiency-consumers-binding-private.json'
        assert sha_file(baseline_binding) == contract['beforeBindingSha256']
        baseline = json.loads(baseline_binding.read_text())
        assert baseline['passed'] is True and baseline['phase'] == 'before' and len(baseline['stages']) == 6
        assert {item['artifactName']: item['directSha256'] for item in baseline['stages']} == contract['beforeCsvSha256']
        for name, expected in contract['beforeCsvSha256'].items():
            assert Path(name).name == name and sha_file(before_state / name) == expected
        before_frozen = json.loads((before_state / 'frozen-inputs.json').read_text())
        originals = validate_before_instrumentation(before_result, before_frozen)
        for name in ['c20-efficiency-consumers.mjs', 'c20-efficiency-observer.mjs', 'c20-materials-client.mjs', 'c20-materials-fixture.mjs', 'c20-efficiency-probes-precheck.mjs']:
            assert sha_file(BASE / name) == originals[str((BASE / name).relative_to(REPO))], 'comparison instrumentation changed'
    scenarios = selected_scenarios(args.scenario)
    consumed = SUPPORT | {PRODUCERS[scenario] for scenario in scenarios}
    # The consumer's shared pure input-contract helper is consumed explicitly.
    consumed.add('c20-efficiency-probes-precheck.mjs')
    assert all((BASE / name).is_file() for name in consumed), 'efficiency input producer/helper missing'
    lock = (tools / '.measurement.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    copy_bytes = sum(p.stat().st_size for directory in ['pgdata', 'uploads', 'exports'] for p in (source / directory).rglob('*') if p.is_file())
    assert shutil.disk_usage(state.parent).free - copy_bytes - 512 * 1024 ** 2 >= FLOOR, 'clone reserve crosses 8GiB stop line; no history is deleted'
    os.umask(0o077)
    state.mkdir(mode=0o700)
    env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state), 'TZ': 'UTC', 'LANG': 'C.UTF-8', 'NODE_ENV': 'test', 'PYTHONDONTWRITEBYTECODE': '1'}
    result = {'schemaVersion': 1, 'passed': False, 'scope': 'C20_RESOURCE_BASELINE_ONLY; NOT_FUNCTIONAL_REQUALIFICATION_OR_CAPACITY', 'phase': args.phase, 'functionalBusinessHead': PINNED_HEAD, 'expectedExecutionHead': args.expected_head, 'scenarios': {}, 'sourceRuntimeSha256': PINNED_RUNTIME, 'sourceDumpSha256': PINNED_DUMP, 'planSha256': PINNED_PLAN, 'cloneBytes': copy_bytes}
    status = {'state': 'preparing', 'ports': {}, 'pids': {}, 'startedAt': time.time(), 'efficiencyPhase': args.phase}
    children, logs = [], []
    pinned = source_manifest = None
    last_checkpoint = time.monotonic()

    def write(name, value):
        temporary = state / (name + '.tmp')
        temporary.write_text(json.dumps(value, indent=2))
        temporary.replace(state / name)

    def record():
        write('status.json', status)

    def binding():
        tracked = [file for file in git_paths('ls-files', '-z', '--', *BUSINESS) if business_input(file)]
        assert tracked, 'empty business path enumeration is invalid'
        paths = {REPO / relative for relative in tracked} | {BASE / name for name in consumed}
        entries = []
        for file in sorted(paths):
            assert file.is_file() and not file.is_symlink()
            entries.append({'path': str(file.relative_to(REPO)), 'mode': file.stat().st_mode & 0o777, 'sha256': sha_file(file)})
        fingerprint = json.loads(subprocess.check_output([node, BASE / 'runtime-fingerprint.cjs', BACKEND], text=True))
        driver = json.loads(subprocess.check_output([node, '-e', "require('pg');const fs=require('fs'),c=require('crypto');process.stdout.write(JSON.stringify(Object.keys(require.cache).sort().map(p=>({path:p,sha256:c.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}))))"], cwd=BACKEND, text=True))
        return {'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(), 'sourceInputs': entries, 'sourceInputsSha256': digest(entries), 'runtimeFingerprint': fingerprint, 'toolExecutables': {str(file.relative_to(tools)): sha_file(file) for file in [node, pg / 'postgres', pg / 'psql', pg / 'pg_dump', pg / 'pg_restore', redis]}, 'generatedClientManifestSha256': digest(manifest(BACKEND / 'node_modules/.prisma/client')), 'runtimeConfigurationSha256': configuration_hash, 'readinessDriver': driver, 'planSha256': sha_file(plan_file), 'afterContractSha256': sha_file(args.after_contract) if contract else None}

    def verify():
        assert binding() == pinned, 'frozen efficiency source/runtime/tool input changed'
        if 'privateRuntimeFileSha256' in result:
            assert sha_file(state / 'runtime-private.json') == result['privateRuntimeFileSha256']

    def guard():
        nonlocal last_checkpoint
        assert shutil.disk_usage(state).free >= FLOOR, 'disk below 8GiB stop line'
        available = next(int(line.split()[1]) * 1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
        assert available >= 2 * 1024 ** 3, 'MemAvailable below 2GiB stop line'
        for name, process, service in children:
            if service:
                assert process.poll() is None, name + ' exited unexpectedly'
            if (name == 'api' or name.startswith('producer-')) and process.poll() is None:
                rss = next(int(line.split()[1]) * 1024 for line in Path(f'/proc/{process.pid}/status').read_text().splitlines() if line.startswith('VmRSS:'))
                assert rss < 1024 ** 3, name + ' reached 1GiB RSS stop line'
        if (state / 'stop').exists():
            raise KeyboardInterrupt
        if time.monotonic() - last_checkpoint >= 1200:
            write('c20-efficiency-checkpoint.json', {'at': time.time(), 'status': status, 'completedScenarios': result['scenarios'], 'sourceInputsSha256': pinned['sourceInputsSha256'], 'restartPolicy': 'STOPPED_FAILURE_REQUIRES_REVIEW; NO_AUTOMATIC_FINAL_REPLAY'})
            last_checkpoint = time.monotonic()

    def start(command, name, extra=None, service=True):
        log = (state / (name + '-private.log')).open('x')
        logs.append(log)
        process = subprocess.Popen(list(map(str, command)), cwd=BACKEND, env={**env, **(extra or {})}, stdout=log, stderr=log, start_new_session=True)
        children.append((name, process, service))
        status['pids'][name] = process.pid
        record()
        return process

    def run(command, name, extra=None, timeout=1800):
        process = start(command, name, extra, False)
        deadline = time.monotonic() + timeout
        while process.poll() is None:
            guard()
            if time.monotonic() > deadline:
                raise TimeoutError(name + ' exceeded budget; partial private journal retained, no automatic replay')
            time.sleep(.2)
        (state / (name + '.exit')).write_text(str(process.returncode) + '\n')
        assert process.returncode == 0, name + ' failed; private journal retained'
        guard()

    def ready(port, process):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            guard()
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.3):
                    executable = Path(f'/proc/{process.pid}/exe').resolve()
                    assert executable in [node.resolve(), (pg / 'postgres').resolve(), redis.resolve()]
                    result.setdefault('actualServiceExecutables', {})[str(process.pid)] = {'path': str(executable), 'sha256': sha_file(executable)}
                    return
            except OSError:
                time.sleep(.2)
        raise TimeoutError('60-second socket readiness budget exceeded')

    def postgres_ready():
        deadline, polls = time.monotonic() + 60, []
        while time.monotonic() < deadline:
            guard()
            probe = subprocess.run([node, '--require', BASE / 'loopback-only.cjs', '-e', READINESS_DRIVER], cwd=BACKEND, env={**env, 'DATABASE_URL_OWNER': runtime['DATABASE_URL_OWNER']}, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=8)
            payload = json.loads(probe.stdout)
            polls.append({'exit': probe.returncode, 'result': payload})
            write('postgres-readiness.json', polls)
            if old.postgres_readiness_status(probe.returncode, payload):
                result['postgresReadiness'] = {'polls': len(polls), 'authenticatedSelectOne': True, 'retrySqlstateOnly': '57P03'}
                return
            time.sleep(.2)
        raise TimeoutError('60-second authenticated PostgreSQL readiness budget exceeded')

    def interrupt(_signal, _frame):
        raise KeyboardInterrupt

    for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
        signal.signal(sig, interrupt)
    try:
        record()
        pinned = binding()
        # Exact runtime and generated client, not simply a similarly named build.
        if not contract:
            assert pinned['runtimeFingerprint'] == source_result['runtimeFingerprint'], 'baseline runtime dist differs from accepted functional source'
        else:
            assert digest(pinned['runtimeFingerprint']) == contract['runtimeFingerprintSha256'], 'after dist differs from frozen reviewed build'
            write('after-contract-private.json', contract)

        assert pinned['generatedClientManifestSha256'] == source_result['generatedClientManifestSha256']
        old_source = {entry['path']: entry for entry in json.loads((source / 'frozen-inputs.json').read_text())['sourceInputs'] if entry['path'].startswith('server-version/backend/')}
        current_source = {entry['path']: entry for entry in pinned['sourceInputs'] if entry['path'].startswith('server-version/backend/')}
        if not contract:
            assert current_source == old_source, 'baseline business source differs from accepted functional source'
        else:
            assert set(current_source) == set(old_source)
            actual_changes = {name for name in current_source if current_source[name] != old_source[name]}
            assert actual_changes == set(contract['businessChanges'])
            for name in actual_changes:
                assert current_source[name]['mode'] == old_source[name]['mode']
                assert current_source[name]['sha256'] == contract['businessChanges'][name]['afterSha256']
                assert old_source[name]['sha256'] == contract['businessChanges'][name]['beforeSha256']

        write('frozen-inputs.json', pinned)
        result.update({key: value for key, value in pinned.items() if key != 'sourceInputs'})
        source_manifest = manifest(source)
        write('source-byte-manifest-before.json', source_manifest)
        result['sourceManifestSha256'] = digest(source_manifest)
        for directory in ['pgdata', 'uploads', 'exports']:
            before = manifest(source / directory)
            shutil.copytree(source / directory, state / directory, copy_function=shutil.copy2)
            assert manifest(state / directory) == before
            guard()
        # Import immutable fixture credentials/facts and prior evidence only.
        # Original functional scripts, journals and failed costs are not executed.
        for file in sorted(source.glob('c20-*.json')):
            if 'private' in file.name or file.name in plan['fixturePins']:
                shutil.copy2(file, state / file.name)
        shutil.copy2(source / 'fixture-private.json', state / 'fixture-private.json')
        shutil.copy2(plan_file, state / 'c20-efficiency-plan-private.json')
        reservations = []
        try:
            for name in ['postgres', 'redis', 'api']:
                reservation = socket.socket()
                reservation.bind(('127.0.0.1', 0))
                reservations.append(reservation)
                status['ports'][name] = reservation.getsockname()[1]
        finally:
            for reservation in reservations:
                reservation.close()
        dbport, redisport, apiport = [status['ports'][key] for key in ['postgres', 'redis', 'api']]
        for key in ['DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME']:
            url = urlparse(runtime[key])
            runtime[key] = url._replace(netloc=f'{url.username}:{url.password}@127.0.0.1:{dbport}').geturl()
        runtime.update(REDIS_URL=f'redis://127.0.0.1:{redisport}', PORT=str(apiport), UPLOAD_DIR=str(state / 'uploads'), EXPORT_DIR=str(state / 'exports'))
        assert not any(str(source) in str(value) for value in runtime.values())
        write('runtime-private.json', runtime)
        result['privateRuntimeFileSha256'] = sha_file(state / 'runtime-private.json')
        public_runtime = {key: value for key, value in runtime.items() if key != 'DATABASE_URL_OWNER'}
        pg_process = start([pg / 'postgres', '-D', state / 'pgdata', '-h', '127.0.0.1', '-p', dbport, '-k', '', '-c', 'timezone=UTC', '-c', 'shared_buffers=128MB', '-c', 'max_connections=40'], 'postgres')
        ready(dbport, pg_process)
        postgres_ready()
        status.update(head=pinned['head'], node='v24.21.0', runtimeFingerprint=pinned['runtimeFingerprint'])
        record()
        db = old.m.Database(tools, state)
        assert db.snapshot() == json.loads((source / 'c20-final-db-snapshot.json').read_text()), 'clone differs from stopped source logical snapshot'
        initial_final_count = int(db.sql('SELECT count(*) FROM assessment_unit_snapshots'))
        result['initialAcceptedSnapshotCount'] = initial_final_count
        redis_process = start([redis, '--bind', '127.0.0.1', '--port', redisport, '--dir', state, '--save', '', '--appendonly', 'no', '--maxmemory', '128mb', '--maxmemory-policy', 'noeviction'], 'redis')
        ready(redisport, redis_process)
        api = start([node, '--require', BASE / 'loopback-only.cjs', 'dist/index.js'], 'api', public_runtime)
        ready(apiport, api)
        status['apiUrl'] = f'http://127.0.0.1:{apiport}'
        for endpoint in ['health', 'ready']:
            with urllib.request.urlopen(status['apiUrl'] + '/' + endpoint, timeout=8) as response:
                assert response.status == 200
        for scenario in scenarios:
            verify()
            status.update(state='running', activeScenario=scenario)
            record()
            producer_argv = [node, '--require', BASE / 'loopback-only.cjs', BASE / PRODUCERS[scenario], state, '--phase', args.phase]
            if baseline_binding:
                producer_argv += ['--baseline', baseline_binding]
            run(producer_argv, 'producer-' + scenario, public_runtime)
            receipt = state / ('c20-efficiency-' + scenario + '-result.json')
            parsed = json.loads(receipt.read_text())
            assert parsed.get('passed') is True, scenario + ' did not produce passed resource receipt'
            count = int(db.sql('SELECT count(*) FROM assessment_unit_snapshots'))
            if scenario == 'consumers':
                assert count == initial_final_count, 'consumer baseline must not create new accepted FINAL snapshots'
            assert 0 <= count - initial_final_count <= 10, 'resource fixture exceeded ten accepted FINAL snapshots'
            if contract:
                projected = [row for row in parsed['consumerMeasurements'] if row['label'].startswith('direct_export_projection_')]
                assert len(projected) == 6
                for wave in [0, 1]:
                    rows = sorted([row for row in projected if row['wave'] == wave], key=lambda row: row['selectedPerWave'])
                    assert [row['selectedPerWave'] for row in rows] == [11, 21, 51]
                    assert all(row['sqlCount'] <= 26 and row['modelCalls'].get('RAW.queryRaw', 0) <= 8 for row in rows), 'bounded batch SQL budget failed'
                    assert max(row['sqlCount'] for row in rows) - min(row['sqlCount'] for row in rows) <= 2, 'unexpected per-person SQL growth within one batch'
                result['affectedExportSqlBudgetPassed'] = True
                result['comparisonScope'] = 'SAME_STATE09_START_AND_ORDERED_51_FIXTURES; SQL_BATCH_BUDGET_ONLY; CPU_RSS_RAW_OBSERVATIONS_NOT_CAPACITY'
            result['scenarios'][scenario] = {'passed': True, 'resultSha256': sha_file(receipt), 'newAcceptedSnapshots': count - initial_final_count, 'producerSha256': sha_file(BASE / PRODUCERS[scenario]), 'argv': list(map(str, producer_argv)), 'resourceWindows': len(parsed.get('resourceMeasurements', []))}
            assert result['scenarios'][scenario]['resourceWindows'] > 0, 'resource observation is missing'
            write('c20-efficiency-checkpoint.json', {'at': time.time(), 'completedScenarios': result['scenarios'], 'sourceInputsSha256': pinned['sourceInputsSha256'], 'restartPolicy': 'NO_AUTOMATIC_FINAL_REPLAY'})
            verify()
            guard()
        result['passed'] = True
    except BaseException as error:
        result['errorType'] = type(error).__name__
        raise
    finally:
        for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
            signal.signal(sig, signal.SIG_IGN)
        cleanup = []
        # Stop a failed/in-flight producer before snapshotting or any slow cleanup.
        # Its sampler shares the producer process group. Accepted/issued FINALs
        # stay journalled and are never replayed by this launcher.
        for name, process, service in reversed(children):
            if service:
                continue
            try:
                os.killpg(process.pid, signal.SIGTERM)
                if process.poll() is None:
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=5)
            except ProcessLookupError:
                process.poll()
            except Exception as error:
                cleanup.append({'service': name, 'errorType': type(error).__name__})
        if 'db' in locals():
            try:
                write('c20-efficiency-final-db-snapshot.json', db.snapshot())
                result['finalSnapshotSha256'] = sha_file(state / 'c20-efficiency-final-db-snapshot.json')
            except Exception as error:
                result['finalSnapshotError'] = type(error).__name__
        for name, process, service in reversed(children):
            try:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGINT if name == 'postgres' else signal.SIGTERM)
                    try:
                        process.wait(timeout=25)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=5)
                # A failed producer may leave its sampler descendant in its PGID.
                if not service:
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
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
        result['cleanupVerified'] = not cleanup and all(process.poll() is not None for _, process, _ in children)
        result['processExits'] = {name: process.returncode for name, process, _ in children}
        try:
            after = manifest(source)
            write('source-byte-manifest-after.json', after)
            result['sourceUnchanged'] = source_manifest is not None and source_manifest == after and not (source / 'pgdata/postmaster.pid').exists()
        except Exception:
            result['sourceUnchanged'] = False
        try:
            result['inputsUnchanged'] = pinned is not None and binding() == pinned
        except Exception:
            result['inputsUnchanged'] = False
        isolation = all(result.get(key) is True for key in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged'])
        result['passed'] = result['passed'] and isolation
        status.update(state='stopped', cleanupVerified=result['cleanupVerified'], cleanupErrors=cleanup, endedAt=time.time())
        record()
        write('c20-efficiency-runtime-result.json', result)
        print(json.dumps({key: result[key] for key in ['passed', 'cleanupVerified', 'sourceUnchanged', 'inputsUnchanged']}), flush=True)
        lock.close()
        if not isolation:
            raise RuntimeError('C20 efficiency isolation/cleanup/input validation failed; private evidence retained')


if __name__ == '__main__':
    main()
