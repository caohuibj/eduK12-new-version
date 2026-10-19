#!/usr/bin/env python3
"""C18-only stopped-clone upgrade / HTTP / restore qualification.

Run services and clients in this one persistent executor process. The launcher
owns .measurement.lock; do not wrap it in flock. Source/private state is never
inside Git. --from-state clones only accepted stopped C18 phase evidence;
completed phases are verified and reused, never silently replayed.
"""
import argparse
import ast
import difflib
import hashlib
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

HTTP03_FILES = {
    'c18-http-result.json': '951d5ad8cdb91dba631fe04c7ca8c8719c79e2400bd7c99e79b883806d1b25f1',
    'c18-runtime-result.json': '8abfaa300b42c63c16ba410cf77cc38b9701358a7e6aa2120c47ba3098ac9605',
    'frozen-inputs.json': 'ce15e7e134b821fc651d7a3bd6ba6e30acf0c403028f0f5d723e672026d6d578',
    'c18-upgrade-result.json': '47a61714c6957893860da1f98fec4cd916b532d7268f7347c0dbf0d520ef0212',
}
HTTP03_CHECKS = ['Real PG 10/20/50 study-local two-wave four-tool numerical analysis: fixed SQL count, one merged identity/governance batch, no audit scan or unselected study parameter; synthetic sources explicitly identified', 'Server body/scope hashes, immutable original acceptance, exact request replay/conflict, current-version and cross-study rejection; newer explanation preserves old eligibility and manifest', 'Unknown consent, pending withdrawal, confirmed exclusion and independent quality mix match hand calculation N=40/mean=30.5; INCLUDE cannot override withdrawal; full educational rows and completion counts unchanged', 'Original Redis queue/worker produces research V2 long/wide/dictionary/ZIP; pending withdrawal during PROCESSING fails generation and removes temp files; prior READY artifacts refuse download', 'Education-only analysis retains V1 and zero governance SQL; unrelated study withdrawal leaves its original export usable; old V1 study intent requires regeneration', 'Single visitor with no study participant never receives a cross-wave key; missing consent/identity is fingerprinted and stable during research export revalidation', 'Actual PG waiting publication/acceptance race linearizes at study row lock; old-version acceptance is either committed first or rejected 409', 'Restricted PG immutable version/acceptance/audit writes and unaudited governance fail; real AFTER-audit fault returns HTTP500, independent connection confirms rollback and exact original guards restored']
COMPLETION_PATH = 'server-version/scripts/recovery/c18-study-completion.mjs'
HTTP03_CHECKPOINT = 'd5eed774d3480c64c62da4f6dface385ecdade37'
DB_HELPER_PATH = 'server-version/scripts/recovery/c18-study-db.py'
FINALIZE_PATH = 'server-version/scripts/recovery/c18-study-finalize.mjs'
HTTP04_FILES = {
    'c18-completion-result.json': '25261da8dd5f2d6fa73da6bffd7072b88b8d85082cc93a4af689c2c8f15421a8',
    'c18-runtime-result.json': '221df413ab89accc7d8c2f6ef56188da91ce233cbfd7aa346e40419eeb190596',
    'frozen-inputs.json': '45fe9402883dc848801d52a19489169cefac61c07b79ecc55f108d90a4cdf92f',
    'c18-upgrade-result.json': HTTP03_FILES['c18-upgrade-result.json'],
    'source-c18-http-result.json': HTTP03_FILES['c18-http-result.json'],
}



def http_source_inputs(entries):
    return [e for e in entries if '/backend/' in e['path'] or e['path'].endswith(('.mjs', 'loopback-only.cjs', 'runtime-fingerprint.cjs'))]


def exact_http03(root):
    """Only the captured eight-check expiry-fixture failure is admissible."""
    for name, expected in HTTP03_FILES.items():
        assert sha_file(root / name) == expected, f'HTTP03 exact evidence changed: {name}'
    runtime = json.loads((root / 'c18-runtime-result.json').read_text())
    http = json.loads((root / 'c18-http-result.json').read_text())
    assert runtime['passed'] is False and runtime['phases']['upgrade']['passed'] is True
    assert set(runtime['phases']) == {'upgrade'}
    assert all(runtime[k] is True for k in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged'])
    assert http['passed'] is False and http['checks'] == HTTP03_CHECKS
    assert len(http['requests']) == 198 and len(http['measurements']) == 4 and len(http['exports']) == 6
    assert http['requests'][-1]['method'] == 'POST' and http['requests'][-1]['status'] == 400
    assert re.fullmatch(r'/anonymous-studies/[0-9a-f-]{36}/waves/create-with-link', http['requests'][-1]['route'])
    assert http['error']['name'] == 'AssertionError'
    assert '公开链接有效期必须在未来一年内，且不能晚于综合测评有效期' in http['error']['message']
    assert http['versionRace']['actualPgWaiters'] == 2 and http['auditHttpFault']['httpStatus'] == 500
    assert len(http['duringGeneration']) == 1
    return http


def exact_http04(root):
    """Only HTTP04's captured unfinalized Form parent and two passed races."""
    for name, expected in HTTP04_FILES.items():
        assert sha_file(root / name) == expected, f'HTTP04 exact evidence changed: {name}'
    runtime = json.loads((root / 'c18-runtime-result.json').read_text())
    completion = json.loads((root / 'c18-completion-result.json').read_text())
    original = json.loads((root / 'source-c18-http-result.json').read_text())
    assert runtime['passed'] is False and set(runtime['phases']) == {'upgrade'}
    assert runtime['phases']['upgrade']['passed'] is True
    assert all(runtime[k] is True for k in ['cleanupVerified', 'sourceUnchanged', 'priorSourceUnchanged', 'inputsUnchanged'])
    assert runtime['acceptedPartialSnapshot']['clonedDatabaseVerifiedBeforeCompletion'] is True
    assert original['passed'] is False and original['checks'] == HTTP03_CHECKS
    assert completion['passed'] is False and completion['checks'] == []
    assert len(completion['requests']) == 20 and completion['measurements'] == completion['exports'] == []
    assert completion['priorHttpEvidenceSha256'] == HTTP03_FILES['c18-http-result.json']
    assert completion['reverseVersionRace'] == {'queuedPublicationBeforeAcceptance': True, 'firstObservedWaiters': 1, 'totalObservedWaiters': 2, 'publishStatus': 200, 'acceptStatus': 409, 'acceptanceUnchanged': True}
    assert completion['startWithdrawalRace'] == {'actualPgWaiters': 2, 'withdrawalState': 'WITHDRAWAL_PENDING', 'educationStartState': 'IN_PROGRESS'}
    last = completion['requests'][-1]
    assert last['method'] == 'POST' and last['status'] == 200
    assert last['route'] == '/public/anonymous-studies/4f4593e0-0dc5-454c-bc12-0d81844feb45/waves/b22c9c5c-5b6e-468c-83c0-9193011e12a5/recover'
    assert completion['error']['name'] == 'AssertionError'
    assert completion['error']['message'] == "Expected values to be strictly equal:\n+ actual - expected\n\n+ 'IN_PROGRESS'\n- 'COMPLETED'\n"
    return original, completion


def http04_input_equivalence(previous, current, runtime):
    launcher_path = 'server-version/scripts/recovery/c18-study-http.py'
    old = {e['path']: e for e in previous['sourceInputs']}
    new = {e['path']: e for e in current['sourceInputs']}
    assert set(new) - set(old) == {FINALIZE_PATH}, 'only the missing HTTP04 finalize script may be added'
    assert all(new.get(path) == entry for path, entry in old.items() if path != launcher_path), 'HTTP04 source changed beyond exact continuation launcher/new finalize script'
    assert new[launcher_path]['mode'] == old[launcher_path]['mode']
    assert old[COMPLETION_PATH]['sha256'] == 'a478c29ff7658f755c60d0171b34d8173a8d768d09e9b772063ad421c0fdd7df'
    assert old[DB_HELPER_PATH]['sha256'] == 'beb042ffe77eef53f516ec5af1238d57b2b197746522c182f162a1cb11329f22'
    for key in ['runtimeFingerprint', 'toolExecutables', 'generatedClientManifestSha256', 'runtimeConfigurationSha256']:
        assert previous[key] == current[key], f'HTTP04 producer {key} changed'
    old_http = http_source_inputs(previous['sourceInputs'])
    assert [e for e in http_source_inputs(current['sourceInputs']) if e['path'] != FINALIZE_PATH] == old_http
    reproduced = digest({'source': old_http, 'runtime': current['runtimeFingerprint'], 'tools': current['toolExecutables'], 'config': current['runtimeConfigurationSha256']})
    assert reproduced == previous['phaseInputHashes']['http']
    for phase in ['upgrade', 'restore']:
        assert previous['phaseInputHashes'][phase] == current['phaseInputHashes'][phase]
    original = runtime['acceptedPartialSnapshot']['producerInputs']
    assert original['unchangedOriginalProducerInputs'] is True and original['reuseScope'] == 'EXACT_HTTP03_EIGHT_CHECKS_NOT_REPLAYED'
    return {'originalHttpPhaseInputSha256': original['originalHttpPhaseInputSha256'],
            'http04PhaseInputSha256': reproduced, 'finalizeSource': new[FINALIZE_PATH],
            'unchangedOriginalProducerInputs': True, 'unchangedHttp04ProducerInputs': True,
            'reuseScope': 'EXACT_HTTP03_EIGHT_CHECKS_AND_HTTP04_TWO_RACES_NOT_REPLAYED',
            'backendProductionInputsSha256': original['backendProductionInputsSha256'],
            'sameRuntimeDist': current['runtimeFingerprint']['dist'],
            'sameGeneratedClientManifestSha256': current['generatedClientManifestSha256'],
            'priorLauncherSha256': old[launcher_path]['sha256'], 'newLauncherSha256': new[launcher_path]['sha256'],
            'originalFullInputSha256': previous['sourceInputsSha256'], 'newFullInputSha256': current['sourceInputsSha256'],
            'fullHarnessInputsIdentical': False, 'originalUpgradePhaseInputSha256': previous['phaseInputHashes']['upgrade'],
            'originalRestorePhaseInputSha256': previous['phaseInputHashes']['restore'],
            'originalHttp03Provenance': original}


def partial_database_snapshot(db):
    value = db.snapshot()
    value['allPublicUserGuards'] = db.guards(sorted(value['columns']))
    return value


def partial_input_equivalence(previous, current):
    launcher_path = 'server-version/scripts/recovery/c18-study-http.py'
    old_all = {e['path']: e for e in previous['sourceInputs']}
    current_all = {e['path']: e for e in current['sourceInputs']}
    assert set(current_all) - set(old_all) == {COMPLETION_PATH}, 'new source inputs exceed the authorized completion script'
    assert all(current_all.get(path) == entry for path, entry in old_all.items() if path not in [launcher_path, DB_HELPER_PATH]), 'existing source changed beyond the authorized continuation launcher/retained-quality assertion'
    assert old_all[launcher_path]['mode'] == current_all[launcher_path]['mode']
    old_inputs = http_source_inputs(previous['sourceInputs'])
    current_inputs = http_source_inputs(current['sourceInputs'])
    added = [e for e in current_inputs if e['path'] == COMPLETION_PATH]
    assert len(added) == 1 and added[0]['sha256'], 'exact completion script is required'
    assert [e for e in current_inputs if e['path'] != COMPLETION_PATH] == old_inputs, 'HTTP03 producer inputs changed beyond the new completion script'
    for key in ['runtimeFingerprint', 'toolExecutables', 'generatedClientManifestSha256', 'runtimeConfigurationSha256']:
        assert previous[key] == current[key], f'HTTP03 producer {key} changed'
    original_helper = subprocess.check_output(['git', 'show', HTTP03_CHECKPOINT + ':' + DB_HELPER_PATH], cwd=REPO).decode()
    current_helper = (REPO / DB_HELPER_PATH).read_text()
    assert hashlib.sha256(original_helper.encode()).hexdigest() == old_all[DB_HELPER_PATH]['sha256']
    def without_retained_quality_assertion(source):
        tree = ast.parse(source)
        cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'Database')
        method = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == 'original_rows_unchanged')
        lines = source.splitlines(keepends=True)
        return ''.join(lines[:method.lineno - 1] + ['    # AUTHORIZED_EXACT_RETAINED_QUALITY_ASSERTION\n'] + lines[method.end_lineno:])
    assert without_retained_quality_assertion(original_helper) == without_retained_quality_assertion(current_helper), 'DB helper changed outside the authorized old-row/new-fixture assertion'
    helper_diff = ''.join(difflib.unified_diff(original_helper.splitlines(keepends=True), current_helper.splitlines(keepends=True), fromfile='http03/c18-study-db.py', tofile='http04/c18-study-db.py'))
    shared = [e for e in previous['sourceInputs'] if '/backend/prisma/' in e['path'] or '/backend/scripts/' in e['path'] or e['path'].endswith(('backend/package.json', 'backend/package-lock.json', 'c18-study-db.py', 'c16-analysis-db.py'))]
    db_inputs = {'source': shared, 'client': manifest(BACKEND / 'node_modules/.prisma/client'), 'tools': {k: v for k, v in current['toolExecutables'].items() if 'redis' not in k}}
    original_upgrade_hash = digest({**db_inputs, 'script': sha_file(BASE / 'c18-study-upgrade.py')})
    original_restore_hash = digest({**db_inputs, 'script': sha_file(BASE / 'c18-study-restore.py')})
    assert original_upgrade_hash == previous['phaseInputHashes']['upgrade']
    assert original_restore_hash == previous['phaseInputHashes']['restore']
    reproduced = digest({'source': old_inputs, 'runtime': current['runtimeFingerprint'], 'tools': current['toolExecutables'], 'config': current['runtimeConfigurationSha256']})
    assert reproduced == previous['phaseInputHashes']['http'], 'original HTTP03 phase input hash cannot be reproduced'
    return {'originalHttpPhaseInputSha256': reproduced, 'completionSource': added[0],
            'unchangedOriginalProducerInputs': True, 'reuseScope': 'EXACT_HTTP03_EIGHT_CHECKS_NOT_REPLAYED',
            'backendProductionInputsSha256': digest([e for e in old_inputs if '/backend/' in e['path']]),
            'sameRuntimeDist': current['runtimeFingerprint']['dist'],
            'sameGeneratedClientManifestSha256': current['generatedClientManifestSha256'],
            'priorLauncherSha256': old_all[launcher_path]['sha256'], 'newLauncherSha256': current_all[launcher_path]['sha256'],
            'originalFullInputSha256': previous['sourceInputsSha256'], 'newFullInputSha256': current['sourceInputsSha256'],
            'fullHarnessInputsIdentical': False, 'originalUpgradePhaseInputSha256': original_upgrade_hash,
            'originalRestorePhaseInputSha256': original_restore_hash,
            'priorDatabaseHelperSha256': old_all[DB_HELPER_PATH]['sha256'], 'newDatabaseHelperSha256': current_all[DB_HELPER_PATH]['sha256'],
            'databaseHelperChangeScope': 'ONLY_original_rows_unchanged_METHOD; ORIGINAL_PK_VALUES_EXACT_PLUS_C18_FIXTURE_ADDITIONS',
            'databaseHelperDiff': helper_diff, 'databaseHelperDiffSha256': hashlib.sha256(helper_diff.encode()).hexdigest()}


def merge_http03_completion(original, completion, provenance):
    assert original['checks'] == HTTP03_CHECKS and original['passed'] is False
    assert completion['passed'] is True and len(completion['checks']) == 2
    assert len(set(completion['checks'])) == 2 and not set(completion['checks']) & set(original['checks'])
    assert isinstance(completion.get('requests'), list) and completion['requests']
    merged = {**original, 'passed': True, 'qualificationScope': 'C18_HTTP03_REUSED_EIGHT_PLUS_TWO_NEW_CHECKS',
              'checks': original['checks'] + completion['checks'], 'newChecks': completion['checks'],
              'reusedChecks': original['checks'], 'reusedEvidence': provenance,
              'priorFailure': original['error'], 'completionResult': completion}
    merged.pop('error', None)
    for key in ['requests', 'measurements', 'exports']:
        merged[key] = original.get(key, []) + completion.get(key, [])
    merged['executionCounts'] = {'reusedChecks': 8, 'newChecks': 2, 'reusedRequests': len(original['requests']), 'newRequests': len(completion['requests'])}
    return merged



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
    resume = parser.add_mutually_exclusive_group()
    resume.add_argument('--from-state', type=Path, help='Read-only stopped C18 clone with accepted complete earlier phases')
    resume.add_argument('--finalize-http-from-state', type=Path, help='Only exact HTTP04: preserve accepted Form FINAL and two races, execute missing finalization/assertions')
    resume.add_argument('--continue-http-from-state', type=Path, help='Only the exact HTTP03 eight-check expiry failure, with a separately pinned complete partial snapshot')
    parser.add_argument('--accepted-partial-snapshot', type=Path)
    parser.add_argument('--partial-snapshot-sha256')
    args = parser.parse_args()
    tools, source, state = [p.resolve() for p in [args.tools, args.source_state, args.state]]
    finalization = bool(args.finalize_http_from_state)
    continuation = bool(args.continue_http_from_state or finalization)
    prior_arg = args.finalize_http_from_state or args.continue_http_from_state or args.from_state
    prior = prior_arg.resolve() if prior_arg else None
    assert continuation == bool(args.accepted_partial_snapshot) == bool(args.partial_snapshot_sha256), 'partial snapshot parameters require an exact captured C18 continuation mode'
    partial_evidence = partial_http = partial_completion = None
    partial_files = HTTP04_FILES if finalization else HTTP03_FILES
    partial_kind = 'C18_HTTP04_EXACT_UNFINALIZED_FORM_PARTIAL_SNAPSHOT' if finalization else 'C18_HTTP03_EXACT_EIGHT_CHECK_PARTIAL_SNAPSHOT'
    if continuation:
        assert args.phase in ['http', 'all'], 'exact captured continuation runs missing HTTP assertions, optionally followed by restore'
        assert re.fullmatch(r'[0-9a-f]{64}', args.partial_snapshot_sha256)
        assert sha_file(args.accepted_partial_snapshot) == args.partial_snapshot_sha256
        partial_evidence = json.loads(args.accepted_partial_snapshot.read_text())
        assert partial_evidence['schemaVersion'] == 1 and partial_evidence['kind'] == partial_kind
        assert Path(partial_evidence['sourceState']).resolve() == prior
        assert partial_evidence['sourceEvidenceSha256'] == partial_files
        assert all(partial_evidence[k] is True for k in ['cleanupVerified', 'sourceUnchanged', 'diagnosticPgdataRemoved', 'originalRowsUnchanged'])
        assert partial_evidence['snapshotSha256'] == digest(partial_evidence['snapshot'])
        assert partial_evidence['captureDatabaseHelperSha256'] == sha_file(BASE / 'c18-study-db.py')
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
        if finalization:
            partial_http, partial_completion = exact_http04(prior)
        elif (prior / 'c18-http-result.json').exists():
            partial = json.loads((prior / 'c18-http-result.json').read_text())
            if continuation:
                partial_http = exact_http03(prior)
            else:
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
                        'http': digest({'source': http_source_inputs(entries), 'runtime': runtime, 'tools': binaries, 'config': runtime_config_hash}),
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
            if continuation:
                assert result['priorManifestSha256'] == partial_evidence['sourceManifestSha256'], 'captured partial source differs from the independently pinned snapshot'
                prior_binding = json.loads((prior / 'frozen-inputs.json').read_text())
                producer = http04_input_equivalence(prior_binding, pinned, prior_result) if finalization else partial_input_equivalence(prior_binding, pinned)
                original_launcher = partial_evidence['priorLauncherSource'].encode() if finalization else subprocess.check_output(['git', 'show', prior_result['head'] + ':server-version/scripts/recovery/c18-study-http.py'], cwd=REPO)
                assert hashlib.sha256(original_launcher).hexdigest() == producer['priorLauncherSha256'], 'original launcher bytes do not match original frozen input'
                launcher_diff = ''.join(difflib.unified_diff(original_launcher.decode().splitlines(keepends=True), Path(__file__).read_text().splitlines(keepends=True), fromfile=('http04' if finalization else 'http03') + '/c18-study-http.py', tofile=('http05' if finalization else 'http04') + '/c18-study-http.py'))
                (state / 'c18-continuation-launcher.diff').write_text(launcher_diff)
                if not finalization:
                    (state / 'c18-continuation-db-helper.diff').write_text(producer.pop('databaseHelperDiff'))
                producer['launcherDiffSha256'] = hashlib.sha256(launcher_diff.encode()).hexdigest()
                result['acceptedPartialSnapshot'] = {'evidenceSha256': args.partial_snapshot_sha256, 'snapshotSha256': partial_evidence['snapshotSha256'], 'sourceManifestSha256': partial_evidence['sourceManifestSha256'], 'sourceEvidenceSha256': partial_files, 'producerInputs': producer, 'reusedChecks': HTTP03_CHECKS, 'reuseIsNotRerun': True}
                shutil.copy2(args.accepted_partial_snapshot, state / 'c18-accepted-partial-snapshot.json')
                shutil.copy2(prior / ('source-c18-http-result.json' if finalization else 'c18-http-result.json'), state / 'source-c18-http-result.json')
                if finalization:
                    shutil.copy2(prior / 'c18-completion-result.json', state / 'source-c18-completion-result.json')
                    result['acceptedPartialSnapshot']['reusedSubchecks'] = {key: partial_completion[key] for key in ['reverseVersionRace', 'startWithdrawalRace']}
                    result['acceptedPartialSnapshot']['originalHttp03Snapshot'] = prior_result['acceptedPartialSnapshot']
            assert prior_result['sourceManifestSha256'] == result['sourceManifestSha256']
            for phase in PHASES:
                if prior_result['phases'].get(phase, {}).get('passed'):
                    if continuation and phase == 'upgrade':
                        assert producer['originalUpgradePhaseInputSha256'] == prior_result['phaseInputHashes']['upgrade']
                    else:
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
            if continuation:
                assert partial_database_snapshot(db) == partial_evidence['snapshot'], 'cloned partial database differs from the independently pinned complete snapshot'
                db.original_rows_unchanged(json.loads((state / 'c18-original-rows-private.json').read_text()))
                result['acceptedPartialSnapshot']['clonedDatabaseVerifiedBeforeCompletion'] = True
            else:
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
                if continuation:
                    label = 'c18-finalize' if finalization else 'c18-completion'
                    script = 'c18-study-finalize.mjs' if finalization else 'c18-study-completion.mjs'
                    run([node, '--require', BASE / 'loopback-only.cjs', BASE / script, state], label, public_runtime, timeout=300)
                    completion = json.loads((state / (label + '-result.json')).read_text())
                    http = merge_http03_completion(partial_http, completion, result['acceptedPartialSnapshot'])
                    if finalization:
                        http['qualificationScope'] = 'C18_HTTP03_EIGHT_PLUS_HTTP04_RACES_REUSED_AND_TWO_FINALIZED_GROUPS'
                        http['priorCompletionFailure'] = partial_completion['error']
                        http['reusedPartialCompletionEvidence'] = partial_completion
                        http['requests'] = partial_http['requests'] + partial_completion['requests'] + completion['requests']
                        http['executionCounts'].update(reusedRequests=218, reusedHttp04Requests=20, reusedHttp04RaceSubchecks=2)
                    (state / 'c18-http-result.json').write_text(json.dumps(http, indent=2))
                else:
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
