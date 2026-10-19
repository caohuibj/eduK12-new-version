#!/usr/bin/env python3
"""C19 state08: explicit shared ON/OFF production HTTP, then nonempty restore.

One persistent execution owns PG, Redis, both sequential APIs, every client and
one measurement lock. Never wrap in flock. This launcher only clones the stopped
successful analysis-only state07. All prior SHA pins are mandatory arguments;
missing or failed evidence stops before creating a state or starting a service.
Only upgrade can be reused as a current phase. Other results retain their exact
historical producers. The three boundary JS producers are never modified here.
"""
import argparse
import fcntl
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


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, BASE / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


m = module('c19_boundaries_db', 'c19-flow-db.py')
support = module('c19_boundaries_support', 'c18-study-http.py')
sha_file, digest, manifest, stopped = m.sha_file, m.digest, support.manifest, support.stopped
FLOOR = 8 * 1024 ** 3
PHASES = ['upgrade', 'boundaries-on', 'boundaries-off', 'restore']
COMMON_DB = {'c19-flow-db.py', 'c18-study-db.py', 'c16-analysis-db.py'}
COMMON_HTTP = {'c19-flow-client.mjs', 'c19-flow-fixture.mjs', 'c19-flow-boundaries.mjs',
               'c18-study-http.py', 'runtime-fingerprint.cjs', 'loopback-only.cjs'}
MODE_OVERRIDES = {
    mode: {'ASSESSMENT_COMPACT_FACTS_ENABLED': 'true',
           'ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED': enabled,
           'ASSESSMENT_SHARED_CONTROL_ENABLED': enabled}
    for mode, enabled in [('on', 'true'), ('off', 'false')]
}


def valid_sha(value):
    if not re.fullmatch(r'[0-9a-f]{64}', value):
        raise argparse.ArgumentTypeError('explicit lowercase SHA-256 required')
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--source-state', type=Path, required=True)
    parser.add_argument('--from-state', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--expected-head', required=True)
    parser.add_argument('--phase', choices=[*PHASES, 'all'], default='all')
    for name in ['runtime', 'result', 'inputs', 'analysis', 'fixture']:
        parser.add_argument('--prior-' + name + '-sha256', type=valid_sha, required=True)
    args = parser.parse_args()
    requested = PHASES if args.phase == 'all' else PHASES[:PHASES.index(args.phase) + 1]
    assert requested != ['upgrade'], 'upgrade is reused only; select a missing boundary/restore phase'
    tools, source, prior, state = [p.resolve() for p in [args.tools, args.source_state, args.from_state, args.state]]
    assert prior.name == 'eduk12_c19_http_07', 'only the explicitly pinned successful analysis-only state07 is admissible'
    assert state.name == 'eduk12_c19_http_08', 'this producer is scoped to a fresh state08'
    assert re.fullmatch(r'[0-9a-f]{40}', args.expected_head)
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip() == args.expected_head
    business = ['server-version/backend/src', 'server-version/backend/prisma', 'server-version/backend/scripts',
                'server-version/backend/package.json', 'server-version/backend/package-lock.json', 'server-version/backend/tsconfig.json']
    exclusions = [':(exclude)**/__tests__/**', ':(exclude)**/*.test.ts', ':(exclude)**/*.spec.ts']
    assert subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--', *business, *exclusions], cwd=REPO).returncode == 0, 'freeze consumed business input first'
    assert not subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--', *business, *exclusions], cwd=REPO).strip(), 'untracked consumed business input'
    assert not state.exists() and state != REPO and REPO not in state.parents
    for root in [source, prior]:
        assert root != state and root not in state.parents and state not in root.parents
    assert source != prior
    node, pg, redis = tools / 'node_modules/node/bin/node', tools / 'postgresql/bin', tools / 'redis/bin/redis-server'
    assert subprocess.check_output([node, '--version'], text=True).strip() == 'v24.21.0'
    assert '16.15' in subprocess.check_output([pg / 'postgres', '--version'], text=True)
    assert 'v=7.4.11 ' in subprocess.check_output([redis, '--version'], text=True)
    assert (BACKEND / 'dist/index.js').is_file()
    fresh = m.fresh_prisma(BACKEND)
    source_status, prior_status = stopped(source), stopped(prior)
    assert sha_file(source / 'c18-runtime-result.json') == m.PINNED_RESULT_SHA256
    source_result = json.loads((source / 'c18-runtime-result.json').read_text())
    assert all(source_result.get(k) is True for k in ['passed', 'cleanupVerified', 'sourceUnchanged', 'inputsUnchanged'])
    assert source_result['phases']['restore']['passed'] is True
    dump = source / 'c18-new-format-restore/c18-http-new-format.dump'
    assert sha_file(dump) == m.PINNED_DUMP_SHA256
    prior_pins = {
        'runtime-private.json': args.prior_runtime_sha256,
        'c19-runtime-result.json': args.prior_result_sha256,
        'frozen-inputs.json': args.prior_inputs_sha256,
        'c19-analysis-continuation-result.json': args.prior_analysis_sha256,
        'c19-fixture-private.json': args.prior_fixture_sha256,
    }
    for name, expected in prior_pins.items():
        assert sha_file(prior / name) == expected, 'explicit prior producer pin mismatch: ' + name
    prior_result = json.loads((prior / 'c19-runtime-result.json').read_text())
    prior_inputs = json.loads((prior / 'frozen-inputs.json').read_text())
    prior_analysis = json.loads((prior / 'c19-analysis-continuation-result.json').read_text())
    assert all(prior_result.get(k) is True for k in ['passed', 'cleanupVerified', 'sourceUnchanged', 'priorSourceUnchanged', 'inputsUnchanged'])
    assert prior_result['pinnedC18DumpSha256'] == m.PINNED_DUMP_SHA256
    assert prior_result['pinnedC18ResultSha256'] == m.PINNED_RESULT_SHA256
    assert prior_result['head'] == prior_inputs['head'] == prior_status['head']
    assert prior_result['phaseInputHashes'] == prior_inputs['phaseInputHashes']
    assert prior_result['phases']['upgrade']['passed'] is True
    assert prior_result['phases']['analysis-continuation'] == prior_analysis and prior_analysis['passed'] is True
    assert 'restore' not in prior_result['phases'], 'state07 must be analysis-only; do not rerun an accepted restore'
    assert not (prior / 'c19-main-result.json').exists(), 'restore must consume the exact accepted main-remaining history'
    assert not list(prior.glob('c19-boundaries-*')), 'boundary phases already attempted; require a distinct continuation'
    historical = json.loads(json.dumps(prior_result['acceptedHistoricalPhases']))
    for phase, accepted in historical.items():
        evidence = prior / ('c19-' + phase + '-result.json')
        assert sha_file(evidence) == accepted['resultSha256']
        assert json.loads(evidence.read_text())['passed'] is True
    historical['analysis-continuation'] = {
        'sourceHead': prior_result['head'], 'resultSha256': args.prior_analysis_sha256,
        'phaseInputHash': prior_result['phaseInputHashes']['analysis-continuation'],
        'qualification': 'HISTORICAL_PRODUCER_ONLY; accepted analysis and exports retained, not rerun or relabeled as current dist',
    }
    source_runtime = json.loads((prior / 'runtime-private.json').read_text())
    for key, role in [('DATABASE_URL_OWNER', 'eduk12_owner'), ('DATABASE_URL', 'eduk12_runtime'), ('DATABASE_URL_RUNTIME', 'eduk12_runtime')]:
        u = urlparse(source_runtime[key])
        assert u.hostname == '127.0.0.1' and u.username == role and u.path == '/eduk12_recovery' and u.port == prior_status['ports']['postgres'] and u.password
    runtime = {**source_runtime, 'BACKGROUND_WORKERS_ENABLED': 'false', 'HEAVY_PROCESSING_ENABLED': 'false',
               'VIDEO_PROCESSING_ENABLED': 'false', 'PERF_ISOLATED_TEST_MODE': '1', 'PERF_SQL_EVENT_COUNT': '1'}
    effective = {**runtime, 'REDIS_URL': 'redis://127.0.0.1:0', 'PORT': '0', 'UPLOAD_DIR': '<private-state>/uploads', 'EXPORT_DIR': '<private-state>/exports'}
    for key in ['DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME']:
        u = urlparse(effective[key]); effective[key] = u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:0').geturl()
    configuration_hash = digest({'baseRuntime': effective, 'modeOverrides': MODE_OVERRIDES, 'priorPins': prior_pins,
                                 'nodeArguments': ['--require', 'loopback-only.cjs'], 'apiEntry': 'dist/index.js',
                                 'lifecycle': 'ONE_PG_REDIS; SEQUENTIAL_ON_STOP_OFF_STOP_RESTORE', 'timeoutSeconds': 600})
    lock = (tools / '.measurement.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    copy_bytes = sum(p.stat().st_size for directory in ['pgdata', 'uploads', 'exports'] for p in (prior / directory).rglob('*') if p.is_file()) + dump.stat().st_size
    assert shutil.disk_usage(state.parent).free - copy_bytes - 512 * 1024 ** 2 >= FLOOR, 'clone reserve crosses 8GiB; no history is deleted'
    os.umask(0o077); state.mkdir(mode=0o700)
    env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state), 'TZ': 'UTC', 'LANG': 'C.UTF-8', 'NODE_ENV': 'test', 'PYTHONDONTWRITEBYTECODE': '1'}
    result = {'passed': False, 'qualificationScope': 'C19_FLOW_BOUNDARIES_' + args.phase.upper(), 'phases': {}, 'reusedPhases': [],
              'pinnedC18DumpSha256': m.PINNED_DUMP_SHA256, 'pinnedC18ResultSha256': m.PINNED_RESULT_SHA256,
              'acceptedHistoricalPhases': historical, 'priorProducerPins': prior_pins, 'sourceHead': source_status['head'],
              'freshPrisma': fresh, 'cloneBytes': copy_bytes, 'modeOverrides': MODE_OVERRIDES, 'modeRuntimeSha256': {},
              'protectedEvidenceSha256': {}}
    status = {'state': 'preparing', 'ports': {}, 'pids': {}, 'startedAt': time.time(), 'boundariesRuntimes': {}, 'intentionalServiceStops': []}
    children, logs = [], []
    pinned = source_manifest = prior_manifest = None
    consumed_c19 = {'c19-flow-http.py', Path(__file__).name, 'c19-flow-db.py', *COMMON_HTTP}
    consumed_c19 |= {'c19-flow-' + phase + ('.py' if phase in ['upgrade', 'restore'] else '.mjs') for phase in requested}

    def record():
        tmp = state / 'status.tmp'; tmp.write_text(json.dumps(status, indent=2)); tmp.replace(state / 'status.json')

    def binding():
        paths = [*business, 'server-version/scripts/recovery']
        tracked = subprocess.check_output(['git', 'ls-files', '-z', '--', *paths], cwd=REPO).split(b'\0')
        untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z', '--', *paths], cwd=REPO).split(b'\0')
        entries = []
        for relative in sorted(set(tracked + untracked) - {b''}):
            file = REPO / os.fsdecode(relative)
            if '/__tests__/' in str(file) or file.name.endswith(('.test.ts', '.spec.ts')): continue
            if file.name.startswith('c19-') and file.name not in consumed_c19: continue
            assert file.is_file() and not file.is_symlink()
            entries.append({'path': os.fsdecode(relative), 'mode': file.stat().st_mode & 0o777, 'sha256': sha_file(file)})
        fingerprint = json.loads(subprocess.check_output([node, BASE / 'runtime-fingerprint.cjs', BACKEND], text=True))
        binaries = {str(p.relative_to(tools)): sha_file(p) for p in [node, pg / 'postgres', pg / 'psql', pg / 'pg_dump', pg / 'pg_restore', redis]}
        db_source = [e for e in entries if '/backend/prisma/' in e['path'] or '/backend/scripts/' in e['path'] or e['path'].endswith(('backend/package.json', 'backend/package-lock.json')) or Path(e['path']).name in COMMON_DB]
        http_source = [e for e in entries if '/backend/' in e['path'] or Path(e['path']).name in COMMON_DB | COMMON_HTTP]
        client_manifest = digest(manifest(BACKEND / 'node_modules/.prisma/client'))
        hashes = {}
        for phase in requested:
            script = BASE / ('c19-flow-' + phase + ('.py' if phase in ['upgrade', 'restore'] else '.mjs'))
            assert script.is_file()
            if phase in ['upgrade', 'restore']:
                # Keep the already-qualified upgrade closure byte-for-byte
                # compatible. New launcher/HTTP flags do not affect migration.
                inputs = {'source': db_source, 'client': client_manifest, 'tools': {k: v for k, v in binaries.items() if 'redis' not in k}}
            else:
                inputs = {'source': http_source, 'runtime': fingerprint, 'tools': binaries, 'config': configuration_hash,
                          'launcherSha256': sha_file(Path(__file__)), 'launcherPythonSha256': sha_file(Path(sys.executable).resolve())}
            hashes[phase] = digest({**inputs, 'script': sha_file(script)})
        return {'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(),
                'sourceInputs': entries, 'sourceInputsSha256': digest(entries), 'runtimeFingerprint': fingerprint,
                'toolExecutables': binaries, 'generatedClientManifestSha256': client_manifest,
                'runtimeConfigurationSha256': configuration_hash, 'phaseInputHashes': hashes,
                'launcherPythonSha256': sha_file(Path(sys.executable).resolve())}

    def verify_runtime_files():
        if 'privateRuntimeFileSha256' in result:
            assert sha_file(state / 'runtime-private.json') == result['privateRuntimeFileSha256'], 'base DB runtime changed'
        for name, expected in result['modeRuntimeSha256'].items():
            assert sha_file(state / name) == expected, 'actual mode API environment changed'

    def protect_evidence(file):
        name = str(file.relative_to(state)); expected = sha_file(file)
        if name in result['protectedEvidenceSha256']:
            assert result['protectedEvidenceSha256'][name] == expected, 'retained evidence already changed'
        result['protectedEvidenceSha256'][name] = expected

    def verify_evidence():
        for name, expected in result['protectedEvidenceSha256'].items():
            assert sha_file(state / name) == expected, 'retained producer/fixture evidence changed: ' + name

    def guard():
        assert shutil.disk_usage(state).free >= FLOOR, 'disk below 8GiB stop line'
        assert next(int(line.split()[1]) * 1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')) >= 2 * 1024 ** 3
        for child in children:
            if child['service']: assert child['process'].poll() is None, child['name'] + ' exited unexpectedly'
        verify_runtime_files()
        if (state / 'stop').exists(): raise KeyboardInterrupt

    def start(command, name, process_env=None, service=True):
        log = (state / (name + '.log')).open('w'); logs.append(log)
        p = subprocess.Popen(list(map(str, command)), cwd=BACKEND, env=process_env if process_env is not None else env,
                             stdout=log, stderr=log, start_new_session=True)
        children.append({'name': name, 'process': p, 'service': service})
        if service: status['pids'][name] = p.pid
        record(); return p

    def run(command, name, process_env=None, timeout=600):
        p = start(command, name, process_env, False); deadline = time.monotonic() + timeout
        while p.poll() is None:
            guard()
            if time.monotonic() > deadline: raise TimeoutError(name + ' exceeded budget; private log retained')
            time.sleep(.2)
        (state / (name + '.exit')).write_text(str(p.returncode) + '\n')
        assert p.returncode == 0, name + ' failed; private log retained'
        guard()

    def ready(port, p):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            guard()
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.3):
                    actual = Path(f'/proc/{p.pid}/exe').resolve()
                    assert actual in [node.resolve(), (pg / 'postgres').resolve(), redis.resolve()]
                    result.setdefault('actualServiceExecutables', {})[str(p.pid)] = {'path': str(actual), 'sha256': sha_file(actual)}
                    return
            except OSError: time.sleep(.2)
        raise TimeoutError('60-second service readiness budget exceeded')

    def stop_api(name, p, port):
        assert p.poll() is None, name + ' died before intentional stop'
        child = next(c for c in children if c['process'] is p)
        child['service'] = False  # intentional stop only; PID stays in cleanup
        os.killpg(p.pid, signal.SIGTERM)
        deadline = time.monotonic() + 25
        while p.poll() is None:
            guard()
            if time.monotonic() > deadline: raise TimeoutError(name + ' graceful stop exceeded budget')
            time.sleep(.1)
        assert p.returncode in [0, -signal.SIGTERM], name + ' abnormal intentional stop'
        with socket.socket() as sock:
            sock.settimeout(.2); assert sock.connect_ex(('127.0.0.1', port)) != 0, name + ' port still open'
        status['intentionalServiceStops'].append({'name': name, 'pid': p.pid, 'port': port, 'exitCode': p.returncode})
        record(); guard()

    def verify():
        assert binding() == pinned, 'frozen producer/runtime/tool input changed'
        verify_runtime_files()
        verify_evidence()
        if (state / 'c18-pinned.dump').exists():
            assert sha_file(state / 'c18-pinned.dump') == m.PINNED_DUMP_SHA256, 'pinned C18 dump copy changed'

    def interrupt(_sig, _frame): raise KeyboardInterrupt
    for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]: signal.signal(sig, interrupt)
    try:
        record(); pinned = binding(); result.update({k: v for k, v in pinned.items() if k != 'sourceInputs'})
        assert pinned['head'] == args.expected_head
        (state / 'frozen-inputs.json').write_text(json.dumps(pinned, indent=2))
        protect_evidence(state / 'frozen-inputs.json')
        source_manifest, prior_manifest = manifest(source), manifest(prior)
        result['sourceManifestSha256'], result['priorManifestSha256'] = digest(source_manifest), digest(prior_manifest)
        (state / 'source-byte-manifest-before.json').write_text(json.dumps(source_manifest, indent=2))
        (state / 'prior-byte-manifest-before.json').write_text(json.dumps(prior_manifest, indent=2))
        assert prior_result['sourceManifestSha256'] == result['sourceManifestSha256']
        assert prior_result['phaseInputHashes']['upgrade'] == pinned['phaseInputHashes']['upgrade'], 'upgrade inputs changed; never silently rerun'
        result['phases']['upgrade'] = prior_result['phases']['upgrade']; result['reusedPhases'] = ['upgrade']
        assert all(phase in pinned['phaseInputHashes'] for phase in requested)
        # Retain historical artifacts verbatim. Their original result names and
        # original producer metadata remain distinguishable from current phases.
        for file in sorted(prior.glob('c19-*.json')):
            if file.name in ['c19-runtime-result.json', 'c19-accepted-history.json']: continue
            assert not file.is_symlink(); shutil.copy2(file, state / file.name)
            assert sha_file(state / file.name) == sha_file(file); protect_evidence(state / file.name)
        archive = state / 'c19-state07-producer'; archive.mkdir(mode=0o700)
        for name in ['c19-runtime-result.json', 'frozen-inputs.json', 'c19-accepted-history.json']:
            shutil.copy2(prior / name, archive / name); protect_evidence(archive / name)
        (state / 'c19-accepted-history.json').write_text(json.dumps(historical, indent=2))
        protect_evidence(state / 'c19-accepted-history.json')
        for directory in ['pgdata', 'uploads', 'exports']:
            before = manifest(prior / directory)
            shutil.copytree(prior / directory, state / directory, copy_function=shutil.copy2)
            assert manifest(state / directory) == before; guard()
        shutil.copy2(dump, state / 'c18-pinned.dump')
        assert sha_file(state / 'c18-pinned.dump') == m.PINNED_DUMP_SHA256
        for name in ['fixture-private.json', 'source-c14-http-result.json']:
            shutil.copy2(source / name, state / name); protect_evidence(state / name)
        reservations = []
        try:
            for name in ['postgres', 'redis', 'api-on', 'api-off']:
                sock = socket.socket(); sock.bind(('127.0.0.1', 0)); reservations.append(sock)
                status['ports'][name] = sock.getsockname()[1]
            assert len(set(status['ports'].values())) == 4
        finally:
            for sock in reservations: sock.close()
        dbport, redisport = status['ports']['postgres'], status['ports']['redis']
        for key in ['DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME']:
            u = urlparse(runtime[key]); runtime[key] = u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:{dbport}').geturl()
        runtime.update(REDIS_URL=f'redis://127.0.0.1:{redisport}', PORT=str(status['ports']['api-on']), UPLOAD_DIR=str(state / 'uploads'), EXPORT_DIR=str(state / 'exports'))
        assert not any(str(root) in str(v) for root in [source, prior] for v in runtime.values())
        (state / 'runtime-private.json').write_text(json.dumps(runtime))
        result['privateRuntimeFileSha256'] = sha_file(state / 'runtime-private.json')
        pg_process = start([pg / 'postgres', '-D', state / 'pgdata', '-h', '127.0.0.1', '-p', dbport, '-k', '', '-c', 'timezone=UTC', '-c', 'shared_buffers=128MB', '-c', 'max_connections=40'], 'postgres')
        ready(dbport, pg_process)
        status.update(head=pinned['head'], node='v24.21.0', runtimeFingerprint=pinned['runtimeFingerprint']); record()
        db = m.Database(tools, state)
        original = json.loads((state / 'c19-original-rows-private.json').read_text())
        result['clonedHistoricalIntegrity'] = db.original_rows_unchanged(original)
        cloned = db.snapshot()
        prior_post = json.loads((prior / 'c19-analysis-continuation-post-state.json').read_text())
        assert cloned == prior_post, 'physical clone differs from the successful analysis post-state'
        (state / 'c19-boundaries-pre-state.json').write_text(json.dumps(cloned, indent=2))
        result['preBoundaryStateSha256'] = digest(cloned)
        redis_process = None
        for phase in requested:
            if phase == 'upgrade': continue
            verify(); guard()
            if phase == 'restore':
                assert all(p['process'].poll() is not None for p in children if p['name'].startswith('api-')), 'both APIs must be stopped before dump/restore'
                status['state'] = 'restoring'; record()
                run(['python3', BASE / 'c19-flow-restore.py', '--tools', tools, '--state', state], 'c19-restore', timeout=300)
            else:
                mode = phase.removeprefix('boundaries-'); api_name = 'api-' + mode; port = status['ports'][api_name]
                if redis_process is None:
                    redis_process = start([redis, '--bind', '127.0.0.1', '--port', redisport, '--dir', state, '--save', '', '--appendonly', 'no', '--maxmemory', '128mb', '--maxmemory-policy', 'noeviction'], 'redis')
                    ready(redisport, redis_process)
                assert all(c['process'].poll() is not None for c in children if c['name'].startswith('api-')), 'APIs must be sequential'
                mode_env = {**env, **{k: v for k, v in runtime.items() if k != 'DATABASE_URL_OWNER'}, **MODE_OVERRIDES[mode], 'PORT': str(port)}
                runtime_name = 'c19-boundaries-' + mode + '-runtime-private.json'
                assert not (state / runtime_name).exists()
                (state / runtime_name).write_text(json.dumps(mode_env))
                runtime_sha = sha_file(state / runtime_name); result['modeRuntimeSha256'][runtime_name] = runtime_sha
                api = start([node, '--require', BASE / 'loopback-only.cjs', 'dist/index.js'], api_name, mode_env)
                status['apiUrl'] = f'http://127.0.0.1:{port}'
                status['boundariesRuntimes'][mode] = {'apiUrl': status['apiUrl'], 'apiPid': api.pid, 'runtimeFile': runtime_name, 'runtimeSha256': runtime_sha}
                if mode == 'off':
                    assert result['phases']['boundaries-on']['passed'] is True
                    status['boundariesOnResultSha256'] = sha_file(state / 'c19-boundaries-on-result.json')
                    status['boundariesOnPrivateSha256'] = sha_file(state / 'c19-boundaries-on-private.json')
                status['state'] = 'running'; record(); ready(port, api)
                for endpoint in ['health', 'ready']:
                    with urllib.request.urlopen(status['apiUrl'] + '/' + endpoint, timeout=8) as response: assert response.status == 200
                run([node, '--require', BASE / 'loopback-only.cjs', BASE / ('c19-flow-' + phase + '.mjs'), state], 'c19-' + phase, mode_env)
                db.original_rows_unchanged(original)
                (state / ('c19-' + phase + '-post-state.json')).write_text(json.dumps(db.snapshot(), indent=2))
                stop_api(api_name, api, port)
            evidence = json.loads((state / ('c19-' + phase + '-result.json')).read_text())
            assert evidence['passed'] is True; result['phases'][phase] = evidence
            protect_evidence(state / ('c19-' + phase + '-result.json'))
            protect_evidence(state / ('c19-' + phase + '-post-state.json'))
            if phase.startswith('boundaries-'):
                private = state / ('c19-' + phase + '-private.json')
                assert sha_file(private) == evidence['privateCheckpointSha256']
                protect_evidence(private)
            verify(); guard()
        result['passed'] = all(result['phases'].get(phase, {}).get('passed') is True for phase in requested)
    except BaseException as error:
        result['errorType'] = type(error).__name__; raise
    finally:
        for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]: signal.signal(sig, signal.SIG_IGN)
        cleanup = []
        for child in reversed(children):
            name, p = child['name'], child['process']
            try:
                if p.poll() is None:
                    os.killpg(p.pid, signal.SIGINT if name == 'postgres' else signal.SIGTERM)
                    try: p.wait(timeout=25)
                    except subprocess.TimeoutExpired: os.killpg(p.pid, signal.SIGKILL); p.wait(timeout=5)
            except ProcessLookupError: p.poll()
            except Exception as error: cleanup.append({'service': name, 'errorType': type(error).__name__})
        for log in logs: log.close()
        for name, port in status['ports'].items():
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.2): cleanup.append({'service': name, 'errorType': 'PortStillOpen'})
            except OSError: pass
        if (state / 'pgdata/postmaster.pid').exists(): cleanup.append({'service': 'postgres', 'errorType': 'PostmasterPidStillPresent'})
        result['cleanupVerified'] = not cleanup and all(c['process'].poll() is not None for c in children)
        result['processExits'] = {c['name']: c['process'].returncode for c in children}
        for key, root, expected, label in [('sourceUnchanged', source, source_manifest, 'source'), ('priorSourceUnchanged', prior, prior_manifest, 'prior')]:
            try:
                after = manifest(root); (state / (label + '-byte-manifest-after.json')).write_text(json.dumps(after, indent=2))
                result[key] = expected is not None and after == expected and not (root / 'pgdata/postmaster.pid').exists()
            except Exception: result[key] = False
        try:
            result['inputsUnchanged'] = pinned is not None and binding() == pinned
            verify_runtime_files(); result['privateRuntimeFilesUnchanged'] = True
            verify_evidence(); result['retainedEvidenceUnchanged'] = True
            result['pinnedDumpCopyUnchanged'] = not (state / 'c18-pinned.dump').exists() or sha_file(state / 'c18-pinned.dump') == m.PINNED_DUMP_SHA256
        except Exception:
            result['inputsUnchanged'] = False; result['privateRuntimeFilesUnchanged'] = False; result['pinnedDumpCopyUnchanged'] = False; result['retainedEvidenceUnchanged'] = False
        isolation = all(result.get(k) is True for k in ['cleanupVerified', 'sourceUnchanged', 'priorSourceUnchanged', 'inputsUnchanged', 'privateRuntimeFilesUnchanged', 'pinnedDumpCopyUnchanged', 'retainedEvidenceUnchanged'])
        result['passed'] = result['passed'] and isolation
        status.update(state='stopped', cleanupVerified=result['cleanupVerified'], cleanupErrors=cleanup, endedAt=time.time()); record()
        (state / 'c19-runtime-result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps({k: result[k] for k in ['passed', 'cleanupVerified', 'sourceUnchanged', 'priorSourceUnchanged', 'inputsUnchanged', 'privateRuntimeFilesUnchanged']}), flush=True)
        lock.close()
        if not isolation: raise RuntimeError('C19 boundary isolation/cleanup/input validation failed')


if __name__ == '__main__':
    main()
