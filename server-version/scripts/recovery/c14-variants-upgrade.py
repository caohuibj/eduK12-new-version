#!/usr/bin/env python3
"""Clone a verified stopped C13 synthetic PG16 cluster; qualify C14 migration.

Never starts, changes, or reconnects to the original C13 state. Only the clone is
started on a fresh loopback port. Full pre-existing column projections include
ciphertexts, timestamps, raw responses and hashes. New null columns are excluded
only by projecting the actual old column list, never by rewriting old records.
Run under the coordinator's TOOLS/.measurement.lock; no API/full C13 suite.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import time
from urllib.parse import urlparse, unquote

p = argparse.ArgumentParser()
p.add_argument('--tools', type=Path, required=True)
p.add_argument('--source-state', type=Path, required=True)
p.add_argument('--state', type=Path, required=True)
p.add_argument('--baseline-dump-sha256', default='6e8c25425e04cce31814a00215e4fc4e7d6c6ac3b5106f2bf0cd8163859d8d84')
a = p.parse_args()
source, state = a.source_state.resolve(), a.state.resolve()
backend = Path(__file__).resolve().parents[2] / 'backend'
node, pg = a.tools.resolve() / 'node_modules/node/bin/node', a.tools.resolve() / 'postgresql/bin'
assert source != state and source not in state.parents and state not in source.parents
assert not state.exists(), 'new private state required'
source_status_bytes = (source / 'status.json').read_bytes()
source_status = json.loads(source_status_bytes)
assert source_status.get('state') == 'stopped' and source_status.get('cleanupVerified') is True
assert source_status.get('cleanupErrors') == []
source_evidence = json.loads((source / 'c13-followup-result.json').read_text())
assert source_evidence.get('passed') is True and source_evidence.get('cleanupVerified') is True
baseline_dump = source / 'c13-new-format-restore/c13-http-new-format.dump'
assert hashlib.sha256(baseline_dump.read_bytes()).hexdigest() == a.baseline_dump_sha256
assert not (source / 'pgdata/postmaster.pid').exists()
assert (source / 'pgdata/PG_VERSION').read_text().strip() == '16'
assert not any((source / 'pgdata/pg_tblspc').iterdir()), 'external tablespaces not allowed'
source_runtime = json.loads((source / 'runtime-private.json').read_text())
owner = urlparse(source_runtime['DATABASE_URL_OWNER'])
runtime = urlparse(source_runtime['DATABASE_URL'])
assert owner.hostname == runtime.hostname == '127.0.0.1'
assert owner.path == runtime.path == '/eduk12_recovery'
assert owner.username == 'eduk12_owner' and runtime.username == 'eduk12_runtime'
state.mkdir(mode=0o700)
os.umask(0o077)
result = {'passed': False, 'checks': [], 'sourceHead': source_evidence['candidateHead'], 'pinnedC13DumpSha256': a.baseline_dump_sha256,
          'sourceStatusSha256': hashlib.sha256(source_status_bytes).hexdigest()}
child = None
log_handle = None
env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state),
       'LANG': 'C.UTF-8', 'NODE_ENV': 'test'}

def stop_signal(_signum, _frame):
    raise KeyboardInterrupt

for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
    signal.signal(sig, stop_signal)

def run(command, name, extra=None, data=None, timeout=360):
    with (state / f'{name}.log').open('w') as log:
        subprocess.run(list(map(str, command)), cwd=backend, env={**env, **(extra or {})},
                       input=data, text=True, stdout=log, stderr=log, check=True, timeout=timeout)

def quote(name):
    return '"' + name.replace('"', '""') + '"'

def pgdata_manifest(directory):
    manifest = []
    for entry in sorted(directory.rglob('*')):
        assert not entry.is_symlink(), 'PGdata symlinks are not allowed in this isolated clone'
        relative = str(entry.relative_to(directory))
        if entry.is_dir():
            manifest.append({'path': relative, 'type': 'directory'})
        else:
            assert entry.is_file(), 'unexpected PGdata special file'
            digest = hashlib.sha256()
            with entry.open('rb') as handle:
                for block in iter(lambda: handle.read(1024 * 1024), b''):
                    digest.update(block)
            manifest.append({'path': relative, 'type': 'file', 'size': entry.stat().st_size,
                             'sha256': digest.hexdigest()})
    return manifest

try:
    result['harnessSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    result['candidateHead'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=backend, text=True).strip()
    result['schemaSha256'] = hashlib.sha256((backend / 'prisma/schema.prisma').read_bytes()).hexdigest()
    result['migrationInputs'] = {str(f.relative_to(backend)): hashlib.sha256(f.read_bytes()).hexdigest()
                                 for f in sorted((backend / 'prisma/migrations').glob('*/migration.sql'))}
    source_manifest = pgdata_manifest(source / 'pgdata')
    result['sourcePgdataManifestSha256'] = hashlib.sha256(json.dumps(source_manifest, sort_keys=True).encode()).hexdigest()
    result['sourcePgdataFileCount'] = sum(item['type'] == 'file' for item in source_manifest)
    (state / 'source-pgdata-manifest.json').write_text(json.dumps(source_manifest, indent=2))
    shutil.copytree(source / 'pgdata', state / 'pgdata', copy_function=shutil.copy2)
    assert pgdata_manifest(source / 'pgdata') == source_manifest, 'source PGdata changed during copy'
    assert pgdata_manifest(state / 'pgdata') == source_manifest, 'initial clone differs from pinned source PGdata'
    result['checks'].append('Before startup: source PGdata path/size/SHA-256 unchanged across copy; initial clone byte-identical')
    assert (source / 'status.json').read_bytes() == source_status_bytes and not (source / 'pgdata/postmaster.pid').exists()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    log_handle = (state / 'postgres.log').open('w')
    child = subprocess.Popen([str(pg / 'postgres'), '-D', str(state / 'pgdata'), '-h', '127.0.0.1', '-p', str(port),
                              '-k', '', '-c', 'timezone=UTC', '-c', 'shared_buffers=128MB', '-c', 'max_connections=40'],
                             cwd=backend, env=env, stdout=log_handle, stderr=log_handle)
    until = time.monotonic() + 60
    while time.monotonic() < until:
        if child.poll() is not None:
            raise RuntimeError('cloned PostgreSQL exited during startup')
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=1):
                break
        except OSError:
            time.sleep(.2)
    else:
        raise TimeoutError('cloned PostgreSQL startup')
    auth = {'PGPASSWORD': unquote(owner.password)}
    psql = [pg / 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port, '-U', owner.username]
    def sql(query, database='eduk12_recovery'):
        return subprocess.check_output(list(map(str, [*psql, '-A', '-t', '-d', database, '-c', query])),
                                       cwd=backend, env={**env, **auth}, text=True).strip()
    def url(parsed, database):
        # Password remains in memory/private child environment, never logs/results.
        return f'postgresql://{parsed.username}:{parsed.password}@127.0.0.1:{port}/{database}?connection_limit=6'
    def columns(database='eduk12_recovery'):
        return json.loads(sql("SELECT coalesce(jsonb_object_agg(table_name, cols), '{}'::jsonb)::text FROM (SELECT table_name,jsonb_agg(column_name ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' GROUP BY table_name) s", database))
    def projection(tables, database='eduk12_recovery'):
        records = {}
        for table, cols in sorted(tables.items()):
            names = ','.join(quote(c) for c in cols)
            data = sql(f"SELECT coalesce(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text FROM (SELECT to_jsonb(old_row) v FROM (SELECT {names} FROM {quote(table)}) old_row) rows", database)
            records[table] = {'rows': int(sql(f'SELECT count(*) FROM {quote(table)}', database)),
                              'sha256': hashlib.sha256(data.encode()).hexdigest()}
        return records
    old_columns = columns()
    before = projection(old_columns)
    result['oldMigrationNames'] = sql('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name').splitlines()
    assert len(old_columns) == 204 and len(result['oldMigrationNames']) == 170, 'pinned C13 205 tables including migrations / 170 migrations required'
    assert not any('weighted_variant' in name.lower() for name in result['oldMigrationNames'])
    assert 'training_variant_draft' not in old_columns['composite_assessments']
    assert 'training_variant_allocation_encrypted' not in old_columns['composite_assessment_attempts']
    sql('CREATE DATABASE eduk12_c13_pinned_restore', 'postgres')
    run([pg / 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-h', '127.0.0.1', '-p', port, '-U', owner.username, '-d', 'eduk12_c13_pinned_restore', baseline_dump], 'restore-pinned-c13', auth)
    assert columns('eduk12_c13_pinned_restore') == old_columns
    assert projection(old_columns, 'eduk12_c13_pinned_restore') == before, 'pinned new-format C13 dump differs from stopped source data'
    result['checks'].append('Pinned nonempty C13 new-format dump SHA-256 and exact restored old-column projection verified before upgrade')
    assert before['sjt_author_releases']['rows'] > 0 and before['situational_raw_submissions']['rows'] > 0, 'actual C13 authored releases and HTTP-written raw responses required'
    old_dump = state / 'c13-stopped-clone-baseline.dump'
    run([pg / 'pg_dump', '-Fc', '--no-owner', '--no-acl', '-h', '127.0.0.1', '-p', port, '-U', owner.username,
         '-d', 'eduk12_recovery', '-f', old_dump], 'dump-c13-clone', auth)
    result['baselineDumpSha256'] = hashlib.sha256(old_dump.read_bytes()).hexdigest()
    (state / 'old-table-projections.json').write_text(json.dumps(before, indent=2))
    run([node, 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrate-c14',
        {'DATABASE_URL': url(owner, 'eduk12_recovery')})
    assert projection(old_columns) == before, 'pre-existing column projection changed'
    new_columns = columns()
    additions = {}
    for table, old in old_columns.items():
        assert table in new_columns and set(old) <= set(new_columns[table])
        extra = [c for c in new_columns[table] if c not in old]
        if extra:
            additions[table] = extra
            for c in extra:
                assert sql(f'SELECT count(*) FROM {quote(table)} WHERE {quote(c)} IS NOT NULL') == '0', f'{table}.{c} was backfilled'
    assert {k: sorted(v) for k, v in additions.items()} == {'composite_assessment_attempts': sorted(['training_variant_allocation_encrypted', 'training_variant_allocation_hash']), 'composite_assessments': sorted(['training_variant_draft', 'training_variant_frozen', 'training_variant_digest'])}, additions
    assert set(new_columns) == set(old_columns), 'no private child-composite tables permitted'
    result['checks'].append('Actual stopped C13 synthetic state → C14: every old table/column projection unchanged; new columns NULL; no backfill')
    result['historicalTableCount'] = len(old_columns)
    result['addedNullableColumns'] = additions
    result['oldProjectionSha256'] = hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()
    policy = (backend / 'scripts/runtime-table-policy.json').read_text()
    def acl(database):
        run([*psql, '-d', database, '-v', f'target_database={database}', '-v', 'migration_owner=eduk12_owner',
             '-v', 'runtime_role=eduk12_runtime', '-v', f'table_policy={policy}', '-f', 'scripts/runtime-role-defaults.sql'],
            f'{database}-acl', auth)
        run([node, 'scripts/runtime-role-contract.mjs', 'verify-current'], f'{database}-runtime-role',
            {'DATABASE_URL': url(runtime, database), 'DATABASE_URL_RUNTIME': url(runtime, database)})
    acl('eduk12_recovery')
    result['checks'].append('C14 runtime role verify-current with actual limited runtime identity')
    upgraded = projection(new_columns)
    new_dump = state / 'c14-upgraded.dump'
    run([pg / 'pg_dump', '-Fc', '--no-owner', '--no-acl', '-h', '127.0.0.1', '-p', port, '-U', owner.username,
         '-d', 'eduk12_recovery', '-f', new_dump], 'dump-c14', auth)
    result['upgradedDumpSha256'] = hashlib.sha256(new_dump.read_bytes()).hexdigest()
    sql('CREATE DATABASE eduk12_c14_restore', 'postgres')
    run([pg / 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-h', '127.0.0.1', '-p', port, '-U', owner.username,
         '-d', 'eduk12_c14_restore', new_dump], 'restore-c14', auth)
    assert columns('eduk12_c14_restore') == new_columns
    assert projection(new_columns, 'eduk12_c14_restore') == upgraded
    assert sql('SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),\'[]\'::jsonb)::text FROM "_prisma_migrations" m', 'eduk12_c14_restore') == sql('SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),\'[]\'::jsonb)::text FROM "_prisma_migrations" m')
    acl('eduk12_c14_restore')
    result['checks'].append('C14 pg_dump→new database pg_restore: all tables/columns/ciphertexts and migration rows exact; restricted-role contract rechecked')
    result['upgradedProjectionSha256'] = hashlib.sha256(json.dumps(upgraded, sort_keys=True).encode()).hexdigest()
    assert (source / 'status.json').read_bytes() == source_status_bytes and not (source / 'pgdata/postmaster.pid').exists()
    assert pgdata_manifest(source / 'pgdata') == source_manifest, 'original C13 PGdata changed'
    result['checks'].append('Original stopped C13 PGdata path/size/SHA-256 still exact after clone migration and restore')
    assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest() == result['harnessSha256']
    assert hashlib.sha256((backend / 'prisma/schema.prisma').read_bytes()).hexdigest() == result['schemaSha256']
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
    result['passed'] = result['passed'] and result['cleanupVerified']
    (state / 'c14-upgrade-result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'resultPath': str(state / 'c14-upgrade-result.json'), 'passed': result['passed'],
                      'cleanupVerified': result['cleanupVerified']}), flush=True)
