#!/usr/bin/env python3
"""One PG-only, read-only C18 HTTP05 clone; never replay accepted HTTP groups.

--wait-for-probe pauses after candidate discovery until the caller supplies
private probe-request.json with the reviewed probe's exact sha256. No probe is
run in discovery-only mode. This process owns the measurement lock and services.
"""
import argparse
import fcntl
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c18_readonly_http', BASE / 'c18-study-http.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
PROBE = BASE / 'c18-study-anonymous-cost.mjs'
SOURCE_RESULT_SHA = '25d32e2c432807808214ad131f790ebdb07347806269a23859cdc69b9d102460'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--source-state', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--wait-for-probe', action='store_true')
    args = parser.parse_args()
    tools, source, state = (p.resolve() for p in [args.tools, args.source_state, args.state])
    assert state != source and state not in source.parents and source not in state.parents
    assert h.REPO not in state.parents and state != h.REPO and not state.exists()
    assert h.sha_file(source / 'c18-runtime-result.json') == SOURCE_RESULT_SHA
    accepted = json.loads((source / 'c18-runtime-result.json').read_text())
    assert all(accepted[k] is True for k in ['passed', 'cleanupVerified', 'sourceUnchanged', 'priorSourceUnchanged', 'inputsUnchanged'])
    h.stopped(source)
    lock = (tools / '.measurement.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    size = sum(p.stat().st_size for p in (source / 'pgdata').rglob('*') if p.is_file())
    assert shutil.disk_usage(state.parent).free - size - 256 * 1024 ** 2 >= h.FLOOR
    os.umask(0o077)
    state.mkdir(mode=0o700)
    result = {'passed': False, 'scope': 'C18_ORDINARY_ANONYMOUS_READONLY_QUERY_COST_ONLY',
              'sourceState': str(source), 'sourceRuntimeResultSha256': SOURCE_RESULT_SHA,
              'replayedHttpScenarioGroups': 0, 'probeExecuted': False}
    node, pg = tools / 'node_modules/node/bin/node', tools / 'postgresql/bin'
    previous = json.loads((source / 'frozen-inputs.json').read_text())

    def inputs():
        entries = []
        for old in previous['sourceInputs']:
            path = h.REPO / old['path']
            item = {'path': old['path'], 'sha256': h.sha_file(path), 'mode': path.stat().st_mode & 0o777}
            assert item == old, 'accepted producer source input changed'
            entries.append(item)
        runtime = json.loads(subprocess.check_output([str(node), str(BASE / 'runtime-fingerprint.cjs'), str(h.BACKEND)], text=True))
        assert runtime == previous['runtimeFingerprint']
        binaries = {relative: h.sha_file(tools / relative) for relative in previous['toolExecutables']}
        assert binaries == previous['toolExecutables']
        client = h.digest(h.manifest(h.BACKEND / 'node_modules/.prisma/client'))
        assert client == previous['generatedClientManifestSha256']
        return {'sourceInputsSha256': h.digest(entries), 'runtimeFingerprint': runtime,
                'toolExecutables': binaries, 'generatedClientManifestSha256': client,
                'launcherSha256': h.sha_file(Path(__file__))}

    pinned = inputs()
    (state / 'frozen-inputs.json').write_text(json.dumps(pinned, indent=2))
    before = h.manifest(source)
    result['sourceManifestSha256'] = h.digest(before)
    (state / 'source-byte-manifest.json').write_text(json.dumps(before, indent=2))
    process = child = None
    logs = []
    db = snapshot = None
    port = None
    result['cleanupVerified'] = False
    try:
        shutil.copytree(source / 'pgdata', state / 'pgdata', copy_function=shutil.copy2)
        assert h.manifest(state / 'pgdata') == h.manifest(source / 'pgdata')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        runtime = json.loads((source / 'runtime-private.json').read_text())
        for key in ['DATABASE_URL_OWNER', 'DATABASE_URL', 'DATABASE_URL_RUNTIME']:
            u = urlparse(runtime[key])
            runtime[key] = u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:{port}').geturl()
        runtime.update(BACKGROUND_WORKERS_ENABLED='false', HEAVY_PROCESSING_ENABLED='false', VIDEO_PROCESSING_ENABLED='false', PERF_ISOLATED_TEST_MODE='1', PERF_SQL_EVENT_COUNT='1')
        (state / 'runtime-private.json').write_text(json.dumps(runtime))
        status = {'state': 'starting', 'ports': {'postgres': port}}
        (state / 'status.json').write_text(json.dumps(status))
        env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state), 'TZ': 'UTC', 'LANG': 'C.UTF-8', 'NODE_ENV': 'test', 'PYTHONDONTWRITEBYTECODE': '1', 'PGOPTIONS': '-c timezone=UTC -c statement_timeout=30000 -c lock_timeout=5000'}
        log = (state / 'postgres.log').open('w'); logs.append(log)
        process = subprocess.Popen(list(map(str, [pg / 'postgres', '-D', state / 'pgdata', '-h', '127.0.0.1', '-p', port, '-k', '', '-c', 'timezone=UTC', '-c', 'shared_buffers=128MB', '-c', 'max_connections=30'])), env=env, stdout=log, stderr=log, start_new_session=True)
        db = h.db_module.Database(tools, state)
        for _ in range(150):
            assert process.poll() is None
            ready = subprocess.run(list(map(str, [*db.psql, '-A', '-t', '-d', 'eduk12_recovery', '-c', 'SHOW default_transaction_read_only'])), env={**db.env, **db.auth}, capture_output=True, text=True)
            if ready.returncode == 0:
                break
            time.sleep(.2)
        assert ready.returncode == 0 and ready.stdout.strip() == 'off'
        result.update(defaultTransactionReadOnly=False, allowedOriginalAuthorizationRowLocks=True, preservationContract='NO_FACT_CHANGES; EXACT_ALL_211_TABLES_AND_ALL_PUBLIC_GUARDS_BEFORE_AFTER')
        snapshot = h.partial_database_snapshot(db)
        assert {k: v for k, v in snapshot.items() if k != 'allPublicUserGuards'} == json.loads((source / 'c18-restore-post-state.json').read_text())
        result['beforeSnapshotSha256'] = h.digest(snapshot)
        (state / 'before-snapshot.json').write_text(json.dumps(snapshot, indent=2))
        query = """SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.\"courseId\",x.\"taskId\",x.\"attemptId\"),'[]'::jsonb)::text FROM (
          SELECT a.id AS "attemptId",c.id AS "taskId",co.id AS "courseId",co.creator_id AS "actorId",
            u.account_domain AS "actorDomain",u.role AS "actorRole",c.product_kind AS "productKind",
            c.published_at AS "publishedAt",a.delivery_course_id AS "deliveryCourseId",
            a.runtime_generation AS "runtimeGeneration",a.attempt_epoch AS "attemptEpoch",
            (SELECT count(*) FROM assessment_unit_snapshots f WHERE f.composite_attempt_id=a.id) AS "unitSnapshotCount",
            (SELECT count(*) FROM composite_assessment_items i WHERE i.composite_assessment_id=c.id AND i.type='FORM' AND i.form_definition IS NOT NULL) AS "typedFormItemCount"
          FROM composite_assessment_attempts a JOIN composite_assessments c ON c.id=a.composite_assessment_id
          JOIN courses co ON co.id=COALESCE(a.delivery_course_id,c.course_id) JOIN users u ON u.id=co.creator_id
          WHERE a.status='COMPLETED' AND a.user_id IS NULL AND a.assignment_ref IS NULL
            AND co.course_type='TRAINING_COURSE' AND u.account_domain='TRAINING'
            AND NOT EXISTS(SELECT 1 FROM anonymous_study_attempts sa WHERE sa.attempt_id=a.id)
            AND NOT EXISTS(SELECT 1 FROM anonymous_study_waves w WHERE w.access_token_id=a.access_token_id)
        ) x"""
        candidates = json.loads(db.sql(query))
        candidate = {'candidates': candidates, 'selectionPredicate': 'COMPLETED / user_id NULL / no study attempt / no access-token study wave / TRAINING course and owner'}
        if candidates:
            candidate.update({k: candidates[0][k] for k in ['actorId', 'courseId', 'taskId', 'actorRole']})
            candidate['taskIds'] = sorted({row['taskId'] for row in candidates if row['courseId'] == candidate['courseId']})
        (state / 'c18-anonymous-candidate.json').write_text(json.dumps(candidate, indent=2))
        result['candidates'] = candidates
        status['state'] = 'awaiting-probe' if args.wait_for_probe else 'discovered'
        (state / 'status.json').write_text(json.dumps(status))
        print(json.dumps({'candidateFile': str(state / 'c18-anonymous-candidate.json'), 'candidates': candidates}), flush=True)
        if args.wait_for_probe:
            deadline = time.monotonic() + 600
            request = state / 'probe-request.json'
            while not request.exists():
                assert process.poll() is None and time.monotonic() < deadline, 'probe connection wait expired'
                assert shutil.disk_usage(state).free >= h.FLOOR
                if (state / 'stop').exists():
                    raise RuntimeError('caller stopped read-only diagnostic before probe')
                time.sleep(.2)
            instruction = json.loads(request.read_text())
            probe_sha = h.sha_file(PROBE)
            assert instruction == {'probeSha256': probe_sha}, 'probe bytes differ from caller-reviewed connection request'
            assert inputs() == pinned
            result['probeSha256'] = probe_sha
            log = (state / 'c18-anonymous-cost.log').open('w'); logs.append(log)
            child = subprocess.Popen([str(node), '--require', str(BASE / 'loopback-only.cjs'), str(PROBE), str(state)], cwd=h.BACKEND, env={**env, **{k: v for k, v in runtime.items() if k != 'DATABASE_URL_OWNER'}}, stdout=log, stderr=log, start_new_session=True)
            result['probeExecuted'] = True
            deadline = time.monotonic() + 180
            while child.poll() is None:
                assert process.poll() is None and time.monotonic() < deadline
                assert shutil.disk_usage(state).free >= h.FLOOR
                time.sleep(.2)
            result['probeExitCode'] = child.returncode
            assert child.returncode == 0, 'read-only analysis probe failed; private log retained'
            assert h.sha_file(PROBE) == probe_sha
            probe_result = json.loads((state / 'c18-anonymous-cost-result.json').read_text())
            assert probe_result['passed'] is True
            assert probe_result['queries'] and all(re.match(r'\A\s*(SELECT|BEGIN|SET|COMMIT|ROLLBACK)\b', entry['sql'], re.IGNORECASE) for entry in probe_result['queries']), 'analysis emitted a statement outside the read/transaction allowlist'
            result['analysisStatementAllowlistVerified'] = True
        after = h.partial_database_snapshot(db)
        (state / 'after-snapshot.json').write_text(json.dumps(after, indent=2))
        result.update(afterSnapshotSha256=h.digest(after), all211TablesAndGuardsUnchanged=after == snapshot)
        assert result['all211TablesAndGuardsUnchanged']
        assert inputs() == pinned
        result['inputsUnchanged'] = True
        result['passed'] = True
    finally:
        if db is not None and snapshot is not None and process is not None and process.poll() is None and 'afterSnapshotSha256' not in result:
            try:
                after = h.partial_database_snapshot(db)
                (state / 'after-snapshot.json').write_text(json.dumps(after, indent=2))
                result.update(afterSnapshotSha256=h.digest(after), all211TablesAndGuardsUnchanged=after == snapshot)
            except Exception:
                result['all211TablesAndGuardsUnchanged'] = False
        for proc in [child, process]:
            if proc is not None and proc.poll() is None:
                os.killpg(proc.pid, signal.SIGINT if proc is process else signal.SIGTERM)
                try:
                    proc.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL); proc.wait(timeout=10)
        for log in logs:
            log.close()
        result['postgresExitCode'] = process.returncode if process else None
        with socket.socket() as sock:
            result['portClosed'] = port is None or sock.connect_ex(('127.0.0.1', port)) != 0
        result['sourceUnchanged'] = h.manifest(source) == before
        result['cleanupVerified'] = result['portClosed'] and not (state / 'pgdata/postmaster.pid').exists() and (process is None or process.returncode == 0)
        result['passed'] = result['passed'] and result['cleanupVerified'] and result['sourceUnchanged']
        if result['cleanupVerified'] and (state / 'pgdata').exists():
            shutil.rmtree(state / 'pgdata')
            result['diagnosticPgdataRemoved'] = True
        (state / 'c18-anonymous-readonly-result.json').write_text(json.dumps(result, indent=2))
        (state / 'status.json').write_text(json.dumps({'state': 'stopped', 'ports': {'postgres': port}, 'cleanupVerified': result['cleanupVerified']}))
        print(json.dumps({k: result.get(k) for k in ['passed', 'probeExecuted', 'all211TablesAndGuardsUnchanged', 'cleanupVerified', 'sourceUnchanged', 'diagnosticPgdataRemoved']}), flush=True)
        lock.close()


if __name__ == '__main__':
    main()
