#!/usr/bin/env python3
"""Restore this run's HTTP-written C14 format while its isolated PG is alive.

No new API/services and no second HTTP suite. The parent owns stack cleanup.
Only the loopback synthetic recovery DB is accepted; owner secret is never output.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlparse, unquote

p = argparse.ArgumentParser()
p.add_argument('--tools', type=Path, required=True)
p.add_argument('--state', type=Path, required=True)
a = p.parse_args()
state = a.state.resolve()
status = json.loads((state / 'status.json').read_text())
runtime = json.loads((state / 'runtime-private.json').read_text())
http = json.loads((state / 'c14-http-result.json').read_text())
assert status['state'] == 'running' and http['passed'] is True
assert len(http['allocations']) >= 2, 'real HTTP-frozen weighted allocations required'
assert len({row['variantKey'] for row in http['completed']}) == 2, 'both actually completed variants required'
owner, role = urlparse(runtime['DATABASE_URL_OWNER']), urlparse(runtime['DATABASE_URL'])
assert owner.hostname == role.hostname == '127.0.0.1'
assert owner.path == role.path == '/eduk12_recovery' and owner.port == status['ports']['postgres']
assert owner.username == 'eduk12_owner' and role.username == 'eduk12_runtime'
backend = Path(__file__).resolve().parents[2] / 'backend'
node, pg = a.tools.resolve() / 'node_modules/node/bin/node', a.tools.resolve() / 'postgresql/bin'
out = state / 'c14-new-format-restore'
out.mkdir(mode=0o700)
os.umask(0o077)
result = {'passed': False, 'checks': []}
env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state), 'LANG': 'C.UTF-8', 'NODE_ENV': 'test'}
auth = {'PGPASSWORD': unquote(owner.password)}
psql = [pg / 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', owner.port, '-U', owner.username]

def run(command, label, extra=None):
    with (out / (label + '.log')).open('w') as log:
        subprocess.run(list(map(str, command)), cwd=backend, env={**env, **(extra or {})}, stdout=log, stderr=log, check=True, timeout=240)

def sql(query, database='eduk12_recovery'):
    return subprocess.check_output(list(map(str, [*psql, '-A', '-t', '-d', database, '-c', query])), cwd=backend, env={**env, **auth}, text=True).strip()

def quote(name):
    return '"' + name.replace('"', '""') + '"'

def columns(database='eduk12_recovery'):
    return json.loads(sql("SELECT jsonb_object_agg(table_name, cols)::text FROM (SELECT table_name,jsonb_agg(column_name ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) s", database))

def projection(tables, database='eduk12_recovery'):
    values = {}
    for table, cols in sorted(tables.items()):
        data = sql(f"SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY to_jsonb(v)::text),'[]'::jsonb)::text FROM (SELECT {','.join(quote(c) for c in cols)} FROM {quote(table)}) v", database)
        values[table] = {'rows': int(sql(f'SELECT count(*) FROM {quote(table)}', database)), 'sha256': hashlib.sha256(data.encode()).hexdigest()}
    return values

try:
    schema = columns()
    before = projection(schema)
    for table in ['composite_assessments', 'composite_assessment_attempts', 'composite_form_answers', 'assessments', 'cognitive_sessions', 'cognitive_raw_submissions', 'situational_attempts', 'situational_raw_submissions', 'assessment_unit_snapshots', 'asset_references']:
        assert before[table]['rows'] > 0, f'{table}: HTTP-written nonempty new format required'
    assert int(sql('SELECT count(*) FROM composite_assessments WHERE training_variant_frozen IS NOT NULL AND training_variant_digest IS NOT NULL')) >= 1
    assert int(sql('SELECT count(*) FROM composite_assessment_attempts WHERE training_variant_allocation_encrypted IS NOT NULL AND training_variant_allocation_hash IS NOT NULL')) >= 2
    dump = out / 'c14-http-new-format.dump'
    run([pg / 'pg_dump', '-Fc', '--no-owner', '--no-acl', '-h', '127.0.0.1', '-p', owner.port, '-U', owner.username, '-d', 'eduk12_recovery', '-f', dump], 'dump', auth)
    result['dumpSha256'] = hashlib.sha256(dump.read_bytes()).hexdigest()
    assert projection(schema) == before, 'source changed while dumping: cannot claim a consistent exact projection'
    restored = 'eduk12_c14_http_restore'
    sql(f'CREATE DATABASE {restored}', 'postgres')
    run([pg / 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-h', '127.0.0.1', '-p', owner.port, '-U', owner.username, '-d', restored, dump], 'restore', auth)
    assert columns(restored) == schema
    assert projection(schema, restored) == before
    result['checks'].append('Real HTTP-written C14 config/frozen/digest, encrypted allocations, all four-tool answers/raw/canonical records and every old table column survive pg_dump→new DB restore exactly')
    for evidence in http['allocations']:
        attempt = evidence['attemptId']
        assert len(attempt) == 36 and all(c in 'abcdef0123456789-' for c in attempt)
        ciphertext = sql(f"SELECT training_variant_allocation_encrypted FROM composite_assessment_attempts WHERE id='{attempt}'", restored)
        assert hashlib.sha256(ciphertext.encode()).hexdigest() == evidence['ciphertextSha256']
        assert sql(f"SELECT training_variant_allocation_hash FROM composite_assessment_attempts WHERE id='{attempt}'", restored) == evidence['allocationHash']
    result['verifiedFrozenAllocations'] = len(http['allocations'])
    result['checks'].append('Every recorded actual HTTP allocation retains byte-identical ciphertext and allocation hash after restore')
    assets = json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'objectKey',object_key,'provider',provider,'sha256',sha256,'sizeBytes',size_bytes)),'[]'::jsonb)::text FROM stored_assets WHERE access_scope='PRIVATE' AND scope_id='sjt-authoring' AND deleted_at IS NULL", restored))
    assert assets, 'new private online image required'
    upload_root = Path(runtime['UPLOAD_DIR']).resolve()
    image_dir = out / 'images'
    image_dir.mkdir(mode=0o700)
    for asset in assets:
        assert asset['provider'] == 'local', 'this isolated fixture must not access remote storage'
        original = (upload_root / asset['objectKey']).resolve()
        assert upload_root in original.parents and original.is_file()
        copied = image_dir / (asset['id'] + '.bin')
        shutil.copyfile(original, copied)
        assert copied.stat().st_size == asset['sizeBytes']
        assert hashlib.sha256(copied.read_bytes()).hexdigest() == asset['sha256']
    result['verifiedPrivateImageCopies'] = len(assets)
    result['checks'].append('New private image bytes copied separately and matched against restored asset identity/hash/size; retained references exact')
    policy = (backend / 'scripts/runtime-table-policy.json').read_text()
    run([*psql, '-d', restored, '-v', f'target_database={restored}', '-v', 'migration_owner=eduk12_owner', '-v', 'runtime_role=eduk12_runtime', '-v', f'table_policy={policy}', '-f', 'scripts/runtime-role-defaults.sql'], 'acl', auth)
    runtime_url = f'postgresql://{role.username}:{role.password}@127.0.0.1:{role.port}/{restored}?connection_limit=6'
    run([node, 'scripts/runtime-role-contract.mjs', 'verify-current'], 'runtime-role', {'DATABASE_URL': runtime_url, 'DATABASE_URL_RUNTIME': runtime_url})
    result['checks'].append('Restored C14 new-format DB passes unchanged restricted runtime role contract; no API/old HTTP replay')
    result['tableCount'] = len(schema)
    result['projectionSha256'] = hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()
    (out / 'table-projections.json').write_text(json.dumps(before, indent=2))
    result['passed'] = True
except BaseException as error:
    result['errorType'] = type(error).__name__
    raise
finally:
    (state / 'c14-new-format-restore-result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'passed': result['passed'], 'resultPath': str(state / 'c14-new-format-restore-result.json')}), flush=True)
