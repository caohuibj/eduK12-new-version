"""Isolated Survey migration/restore proof; never starts services or uses live data.

Usage: python3 .github/scripts/survey-candidate-recovery.py bootstrap BUILD_IMAGE EVIDENCE_DIR
       node /probe.cjs inside BUILD_IMAGE with the restricted runtime URL
       python3 .github/scripts/survey-candidate-recovery.py verify BUILD_IMAGE EVIDENCE_DIR

The caller owns disposable survey-ci-postgres / Redis containers and their cleanup.
All PostgreSQL tooling executes inside that pinned PostgreSQL 16.15 container.
Only CI=true + GITHUB_ACTIONS=true + SURVEY_CI_ISOLATED=1 permits mutation.
Exit 0 requires every assertion; errors/timeouts persist failed evidence and exit 1.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / 'server-version/backend'
CONTAINER = 'survey-ci-postgres'
CANDIDATE = 'survey_candidate_ci_test'
LEGACY = 'survey_legacy_ci_test'
RESTORE = 'survey_restore_ci_test'
ROLE = 'survey_ci_runtime'
PASSWORD = 'survey-ci-only-runtime'  # Deliberately public disposable fixture credential.
BASELINE_LAST = '20261017020000_asset_upload_deduplication'
NEW_MIGRATIONS = (
    '20261017050000_survey_cognitive_units',
    '20261017060000_survey_tool_grants',
    '20261017070000_survey_group_ip_window',
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_database(name):
    if name not in (CANDIDATE, LEGACY, RESTORE):
        raise RuntimeError('Disposable Survey test database required')
    return name


def url(name, runtime=False):
    safe_database(name)
    value = (f'postgresql://{ROLE}:{PASSWORD}' if runtime else 'postgresql://ptool:ptool123')
    value += f'@127.0.0.1:5432/{name}?schema=public'
    parsed = urlparse(value)
    assert parsed.scheme == 'postgresql' and parsed.hostname == '127.0.0.1'
    assert parsed.port == 5432 and parsed.path == '/' + name
    return value


def run(command, *, input=None, timeout=60, binary=False):
    completed = subprocess.run(command, input=input, text=not binary, capture_output=True, timeout=timeout)
    if completed.returncode:
        detail = completed.stderr if not binary else completed.stderr.decode(errors='replace')
        raise RuntimeError(f'{Path(command[0]).name} exited {completed.returncode}: {detail[-5000:]}')
    return completed.stdout


def sql(database, query, *, runtime=False):
    safe_database(database)
    command = ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
               '-U', ROLE if runtime else 'ptool', '-d', database]
    return run(command, input="SET statement_timeout='15s'; SET lock_timeout='5s';\n" + query).strip()


def image_command(database, command, *, runtime=False, timeout=120):
    safe_database(database)
    values = {
        'CI': 'true', 'GITHUB_ACTIONS': 'true', 'SURVEY_CI_ISOLATED': '1',
        'SURVEY_CI_SOURCE_SHA': SOURCE_SHA, 'SURVEY_CI_IMAGE_ID': IMAGE_ID,
        'DATABASE_URL': url(database, runtime), 'DATABASE_URL_ADMIN': url(database),
        'DATABASE_URL_RUNTIME': url(database, True), 'REDIS_URL': 'redis://127.0.0.1:6379',
        'NODE_ENV': 'production', 'RUNTIME_ROLE_REQUIRED': 'true',
        'SURVEY_WORKSPACE_ENABLED': 'true', 'SURVEY_PUBLICATION_ENABLED': 'true',
        'SURVEY_ANALYTICS_ENABLED': 'true', 'SURVEY_MFA_ENCRYPTION_KEY': '45' * 32,
        'COGNITIVE_MODULE_ENABLED': 'true',
    }
    args = ['docker', 'run', '--rm', '--network', 'host',
            '-v', str(EVIDENCE) + ':/evidence',
            '-v', str(ROOT / '.github/scripts/survey-candidate-runtime.cjs') + ':/probe.cjs:ro']
    for key, value in values.items():
        args += ['-e', key + '=' + value]
    return run(args + [IMAGE] + command, timeout=timeout)


def check(name, value=True):
    assert value, name
    RESULT['checks'].append({'name': name, 'pass': True})
    save()


def save():
    RESULT['elapsedSeconds'] = round(time.monotonic() - STARTED, 3)
    (EVIDENCE / ('recovery-bootstrap.json' if MODE == 'bootstrap' else 'recovery-result.json')).write_text(
        json.dumps(RESULT, indent=2) + '\n')


def quote_identifier(value):
    if not re.fullmatch(r'[a-zA-Z_][a-zA-Z_0-9]*', value):
        raise RuntimeError('Unexpected database identifier')
    return '"' + value + '"'


def grant_runtime(database):
    policy = json.loads((BACKEND / 'scripts/runtime-table-policy.json').read_text())
    assert policy['schemaVersion'] == 1
    live = sql(database, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
    assert live and set(live).issubset(policy['tables']), 'Every actual table must have an explicit policy classification'
    statements = [
        f'REVOKE ALL ON DATABASE {quote_identifier(database)} FROM {ROLE}',
        f'GRANT CONNECT ON DATABASE {quote_identifier(database)} TO {ROLE}',
        'REVOKE CREATE ON SCHEMA public FROM PUBLIC',
        f'REVOKE ALL ON SCHEMA public FROM {ROLE}',
        f'GRANT USAGE ON SCHEMA public TO {ROLE}',
        f'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {ROLE}',
        f'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {ROLE}',
    ]
    for table in live:
        category = policy['tables'][table]
        if category == 'OPERATOR_ONLY':
            continue
        assert category in ('RUNTIME_RW', 'RUNTIME_READ', 'MIGRATION_LEDGER')
        privileges = 'SELECT,INSERT,UPDATE,DELETE' if category == 'RUNTIME_RW' else 'SELECT'
        statements.append(f'GRANT {privileges} ON TABLE {quote_identifier(table)} TO {ROLE}')
    sequence_rows = sql(database, """SELECT c.relname||'|'||owning.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass
          AND d.objid=c.oid AND d.deptype IN ('a','i')
        JOIN pg_class owning ON owning.oid=d.refobjid
        WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname""")
    for row in sequence_rows.splitlines():
        sequence, table = row.split('|')
        assert table in policy['tables']
        if policy['tables'][table] == 'RUNTIME_RW':
            statements.append(f'GRANT USAGE,SELECT ON SEQUENCE {quote_identifier(sequence)} TO {ROLE}')
    sql(database, ';\n'.join(statements) + ';')
    output = image_command(database, ['node', 'scripts/runtime-role-contract.mjs', 'verify-current'], runtime=True)
    report = json.loads(output.strip().splitlines()[-1])
    assert report['ok'] and report['restrictedRuntimeRole']
    RESULT.setdefault('runtimeRoles', {})[database] = report
    check(database + '_actual_verify_current_no_skip')


def fingerprints(database, tables=None, *, legacy_projection=False):
    if tables is None:
        tables = sql(database, "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'survey_%' ORDER BY tablename").splitlines()
    result = {}
    for table in tables:
        projection = 'to_jsonb(t)'
        if legacy_projection and table == 'survey_waves':
            projection += " - ARRAY['group_ip_policy','group_ip_activated_at']"
        if legacy_projection and table == 'survey_instrument_drafts':
            projection += " - 'catalog_grant_id'"
        payload = sql(database, f"SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data::text),'[]'::jsonb)::text FROM (SELECT {projection} AS row_data FROM {quote_identifier(table)} t) rows")
        result[table] = {'rowCount': len(json.loads(payload)), 'sha256': sha(payload.encode())}
    return result


def reject(database, label, statement, sqlstate='23514', *, runtime=False):
    assert re.fullmatch('[A-Z0-9]{5}', sqlstate)
    # A successful mutation raises a different SQLSTATE and fails the proof.
    sql(database, "DO $guard$ BEGIN BEGIN\n" + statement +
        ";\nRAISE EXCEPTION 'Expected database rejection was absent' USING ERRCODE='P0002';\n" +
        f"EXCEPTION WHEN SQLSTATE '{sqlstate}' THEN NULL; END; END $guard$;", runtime=runtime)
    check(label)


LEGACY_SQL = """
INSERT INTO users(id,username,password_hash,role,account_domain,platform_role,updated_at)
 VALUES ('survey-ci-legacy-admin','survey_ci_legacy_admin','synthetic-only','ADMIN','LEGACY','SYSTEM_ADMIN',now()),
 ('survey-ci-legacy-owner','survey_ci_legacy_owner','synthetic-only','STUDENT','SURVEY','STANDARD',now());
INSERT INTO survey_accounts(user_id,login_name,normalized_login)
 VALUES ('survey-ci-legacy-owner','survey_ci_legacy','survey_ci_legacy');
INSERT INTO survey_researcher_grants(user_id,status,granted_by)
 VALUES ('survey-ci-legacy-owner','ACTIVE','survey-ci-legacy-admin');
INSERT INTO survey_projects(id,owner_user_id,title,collection_mode,status,public_id,first_published_at)
 VALUES ('survey-ci-legacy-project','survey-ci-legacy-owner','Historical synthetic Survey','SINGLE_UNLINKED','ACTIVE','survey-ci-legacy-public',now());
INSERT INTO survey_instrument_drafts(id,project_id,instrument_key,kind,title,definition)
 VALUES ('survey-ci-legacy-draft','survey-ci-legacy-project','form','FORM','Historical form','{"schemaVersion":1,"syntheticHistorical":true}');
INSERT INTO survey_publications(id,project_id,definition_digest,compiled_snapshot,consent_version,version)
 VALUES ('survey-ci-legacy-publication','survey-ci-legacy-project',repeat('1',64),'{"schemaVersion":1,"syntheticHistorical":true}',1,1);
INSERT INTO survey_waves(id,project_id,publication_id,ordinal,title,status,consent_text,opens_at,closes_at,finish_until)
 VALUES ('survey-ci-legacy-wave','survey-ci-legacy-project','survey-ci-legacy-publication',1,'Historical wave','OPEN','Synthetic consent',now()-interval '1 day',now()+interval '1 day',now()+interval '2 days');
INSERT INTO survey_wave_attempts(id,project_id,wave_id,session_hash,status,completed_at)
 VALUES ('survey-ci-legacy-attempt','survey-ci-legacy-project','survey-ci-legacy-wave',repeat('2',64),'COMPLETED',now());
INSERT INTO survey_consents(id,project_id,wave_id,attempt_id,consent_version,accepted)
 VALUES ('survey-ci-legacy-consent','survey-ci-legacy-project','survey-ci-legacy-wave','survey-ci-legacy-attempt',1,true);
INSERT INTO survey_wave_finals(id,attempt_id,project_id,wave_id,publication_id,submission_id,payload_hash,definition_digest,results_cipher,results_hash)
 VALUES ('survey-ci-legacy-final','survey-ci-legacy-attempt','survey-ci-legacy-project','survey-ci-legacy-wave','survey-ci-legacy-publication','synthetic-legacy-submission-20261017',repeat('3',64),repeat('1',64),'synthetic-opaque-historical-ciphertext',repeat('4',64));
INSERT INTO survey_entry_tokens(id,project_id,wave_id,token_hash,expires_at)
 VALUES ('survey-ci-legacy-entry','survey-ci-legacy-project','survey-ci-legacy-wave',repeat('5',64),now()+interval '1 day');
"""
GROUP_SQL = """
INSERT INTO survey_publications(id,project_id,definition_digest,compiled_snapshot,consent_version,version)
 VALUES ('survey-ci-group-publication','survey-ci-legacy-project',repeat('6',64),
 '{"schemaVersion":1,"purpose":"RESEARCH_ONLY","runtimeStatus":"SURVEY_FINAL_V1","projectId":"survey-ci-legacy-project","waveId":"survey-ci-group-wave","groupIpPolicy":{"schemaVersion":1,"timeZone":"Asia/Shanghai","activationDate":"2026-10-17"}}',1,2);
INSERT INTO survey_waves(id,project_id,publication_id,ordinal,title,status,consent_text,group_ip_policy,group_ip_activated_at,opens_at,closes_at,finish_until)
 VALUES ('survey-ci-group-wave','survey-ci-legacy-project','survey-ci-group-publication',2,'Synthetic group','OPEN','Synthetic consent',
 '{"schemaVersion":1,"timeZone":"Asia/Shanghai","activationDate":"2026-10-17"}',
 '2026-10-17T00:00:00Z','2026-10-17T00:00:00Z','2026-10-19T00:00:00Z','2026-10-19T00:00:00Z');
"""


def legacy_migration():
    run(['docker', 'exec', CONTAINER, 'createdb', '-U', 'ptool', LEGACY], timeout=30)
    # Deploy the exact candidate's historical migration bytes, omitting only the
    # three explicitly scoped additive Survey migrations. Prisma writes its real ledger.
    prepare = "set -eu; cp -a /app/prisma /tmp/survey-legacy-prisma; "
    for migration in NEW_MIGRATIONS:
        prepare += f'rm -r /tmp/survey-legacy-prisma/migrations/{migration}; '
    prepare += '/app/node_modules/.bin/prisma migrate deploy --schema /tmp/survey-legacy-prisma/schema.prisma'
    image_command(LEGACY, ['sh', '-c', prepare], timeout=150)
    before_names = sql(LEGACY, 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name').splitlines()
    expected_before = [name for name in MIGRATION_NAMES if name not in NEW_MIGRATIONS]
    check('Baseline_is_exact_main_schema_through_20261017020000', before_names == expected_before and before_names[-1] == BASELINE_LAST)
    sql(LEGACY, LEGACY_SQL)
    before = fingerprints(LEGACY, legacy_projection=True)
    check('Historical_Survey_FINAL_fixture_exists', before['survey_wave_finals']['rowCount'] == 1)
    image_command(LEGACY, ['/app/node_modules/.bin/prisma', 'migrate', 'deploy', '--schema', '/app/prisma/schema.prisma'], timeout=90)
    after_names = sql(LEGACY, 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name').splitlines()
    check('Only_three_exact_Survey_migrations_added', after_names == MIGRATION_NAMES and sorted(set(after_names)-set(before_names)) == list(NEW_MIGRATIONS))
    after = fingerprints(LEGACY, before, legacy_projection=True)
    check('Historical_Survey_rows_and_ciphertext_byte_fingerprints_retained', before == after)
    RESULT['legacyFingerprints'] = before
    check('Historical_waves_remain_ordinary', sql(LEGACY, "SELECT count(*) FROM survey_waves WHERE group_ip_policy IS NULL AND group_ip_activated_at IS NULL") == '1')
    sql(LEGACY, GROUP_SQL)
    reject(LEGACY, 'Published_group_policy_is_frozen', "UPDATE survey_waves SET group_ip_policy=NULL WHERE id='survey-ci-group-wave'")
    reject(LEGACY, 'Group_48_hour_deadline_cannot_extend', "UPDATE survey_waves SET closes_at=closes_at+interval '1 millisecond',finish_until=finish_until+interval '1 millisecond' WHERE id='survey-ci-group-wave'")
    reject(LEGACY, 'Group_activation_cannot_restart', "UPDATE survey_waves SET group_ip_activated_at=group_ip_activated_at+interval '1 second',opens_at=opens_at+interval '1 second' WHERE id='survey-ci-group-wave'")
    reject(LEGACY, 'Group_cannot_borrow_other_publication', "UPDATE survey_waves SET publication_id='survey-ci-legacy-publication' WHERE id='survey-ci-group-wave'")
    reject(LEGACY, 'Group_frozen_snapshot_cannot_change', "UPDATE survey_publications SET compiled_snapshot='{}' WHERE id='survey-ci-group-publication'")
    reject(LEGACY, 'Missing_group_policy_JSON_fields_rejected', "INSERT INTO survey_waves(id,project_id,ordinal,title,consent_text,group_ip_policy) VALUES ('survey-ci-invalid-json','survey-ci-legacy-project',3,'Invalid','Synthetic','{}')")
    reject(LEGACY, 'Group_publication_wave_binding_rejected', "INSERT INTO survey_waves(id,project_id,publication_id,ordinal,title,consent_text,group_ip_policy) VALUES ('survey-ci-wrong-binding','survey-ci-legacy-project','survey-ci-group-publication',3,'Invalid','Synthetic','{\"schemaVersion\":1,\"timeZone\":\"Asia/Shanghai\",\"activationDate\":\"2026-10-17\"}')")
    # This new row has a correctly bound frozen publication; the window CHECK,
    # rather than a policy mismatch, must reject 48 hours + 1 millisecond.
    reject(LEGACY, 'New_group_window_over_48_hours_rejected', """
      INSERT INTO survey_publications(id,project_id,definition_digest,compiled_snapshot,consent_version,version)
      SELECT 'survey-ci-too-long-pub',project_id,definition_digest,jsonb_set(compiled_snapshot,'{waveId}','"survey-ci-too-long-wave"'),1,3
      FROM survey_publications WHERE id='survey-ci-group-publication';
      INSERT INTO survey_waves(id,project_id,publication_id,ordinal,title,status,consent_text,group_ip_policy,group_ip_activated_at,opens_at,closes_at,finish_until)
      SELECT 'survey-ci-too-long-wave',project_id,'survey-ci-too-long-pub',3,title,status,consent_text,group_ip_policy,group_ip_activated_at,opens_at,closes_at+interval '1 millisecond',finish_until+interval '1 millisecond'
      FROM survey_waves WHERE id='survey-ci-group-wave'
    """)
    sql(LEGACY, "UPDATE survey_waves SET closes_at=closes_at-interval '1 hour',finish_until=finish_until-interval '1 hour' WHERE id='survey-ci-group-wave'")
    check('Group_deadline_may_shorten_without_reactivation', sql(LEGACY, "SELECT EXTRACT(EPOCH FROM closes_at-group_ip_activated_at)::int FROM survey_waves WHERE id='survey-ci-group-wave'") == str(47*3600))
    grant_runtime(LEGACY)


def restore_candidate():
    runtime = json.loads((EVIDENCE / 'runtime-result.json').read_text())
    fixture = json.loads((EVIDENCE / 'runtime-fixture.json').read_text())
    assert runtime['status'] == 'pass' and runtime['serverStopped']
    assert runtime['binding']['sourceSha'] == SOURCE_SHA and runtime['binding']['imageId'] == IMAGE_ID
    assert fixture['sourceSha'] == SOURCE_SHA and fixture['distSha256'] == runtime['binding']['distSha256']
    before = fingerprints(CANDIDATE)
    for name in ('survey_cognitive_sessions', 'survey_cognitive_results', 'survey_tool_grants', 'survey_wave_finals', 'survey_export_tickets'):
        check('Dump_contains_' + name, before[name]['rowCount'] > 0)
    check('Dump_contains_activated_group_policy', int(sql(CANDIDATE, 'SELECT count(*) FROM survey_waves WHERE group_ip_policy IS NOT NULL AND group_ip_activated_at IS NOT NULL')) > 0)
    archive = EVIDENCE / 'survey-synthetic.dump'
    try:
        with archive.open('wb') as target:
            subprocess.run(['docker', 'exec', CONTAINER, 'pg_dump', '-U', 'ptool', '-Fc', CANDIDATE], stdout=target, check=True, timeout=90)
        RESULT['backupSha256'] = sha(archive.read_bytes())
        run(['docker', 'exec', CONTAINER, 'createdb', '-U', 'ptool', RESTORE], timeout=30)
        with archive.open('rb') as source:
            subprocess.run(['docker', 'exec', '-i', CONTAINER, 'pg_restore', '--exit-on-error', '-U', 'ptool', '-d', RESTORE], stdin=source, check=True, timeout=120)
        after = fingerprints(RESTORE)
        check('All_Survey_table_row_counts_and_fingerprints_match_after_actual_restore', before == after)
        RESULT['restoredSurveyTables'] = before
        grant_runtime(RESTORE)
        # Test the restored triggers while connected as the real restricted role.
        rid, sid, gid = (fixture[name] for name in ('resultId', 'sessionId', 'grantId'))
        assert all(re.fullmatch(r'[0-9a-f-]{36}', value) for value in (rid, sid, gid))
        reject(RESTORE, 'Restored_cognitive_FINAL_immutable', f"UPDATE survey_cognitive_results SET trial_count=119 WHERE id='{rid}'", 'P0001', runtime=True)
        reject(RESTORE, 'Restored_terminal_cognitive_session_frozen', f"UPDATE survey_cognitive_sessions SET status='IN_PROGRESS' WHERE id='{sid}'", 'P0001', runtime=True)
        reject(RESTORE, 'Restored_tool_grant_snapshot_frozen', f"UPDATE survey_tool_grants SET snapshot='{{}}' WHERE id='{gid}'", 'P0001', runtime=True)
        reject(RESTORE, 'Restored_tool_grant_audit_not_deletable', f"DELETE FROM survey_tool_grants WHERE id='{gid}'", 'P0001', runtime=True)
        output = image_command(RESTORE, ['node', '/probe.cjs', '--verify-restore'], runtime=True, timeout=120)
        report = json.loads((EVIDENCE / 'runtime-restore.json').read_text())
        check('Restored_compiled_runtime_export_decryption_and_fresh_persistence', report['status'] == 'pass' and report['serverStopped'])
        RESULT['compiledRestoreChecks'] = report['checks']
        RESULT['distSha256'] = report['binding']['distSha256']
    finally:
        # Retain actual fingerprints and results, never upload the synthetic DB dump.
        archive.unlink(missing_ok=True)


def main():
    if any(os.environ.get(key) != value for key, value in {'CI': 'true', 'GITHUB_ACTIONS': 'true', 'SURVEY_CI_ISOLATED': '1'}.items()):
        raise RuntimeError('Official explicitly isolated CI only')
    if not re.fullmatch('[0-9a-f]{40}', SOURCE_SHA) or not re.fullmatch('sha256:[0-9a-f]{64}', IMAGE_ID):
        raise RuntimeError('Exact source SHA and build-image ID required')
    actual_image = run(['docker', 'image', 'inspect', '--format', '{{.Id}}', IMAGE]).strip()
    check('Actual_candidate_build_image_identity', actual_image == IMAGE_ID)
    check('Actual_PostgreSQL_16_15', sql(CANDIDATE, "SELECT current_setting('server_version_num')") == '160015')
    check('No_migrations_outside_frozen_main_plus_three_Survey_additions', MIGRATION_NAMES[-4:] == [BASELINE_LAST, *NEW_MIGRATIONS])
    RESULT['migrationSha256'] = {name: sha((BACKEND/'prisma/migrations'/name/'migration.sql').read_bytes()) for name in NEW_MIGRATIONS}
    if MODE == 'bootstrap':
        sql(CANDIDATE, f"CREATE ROLE {ROLE} LOGIN PASSWORD '{PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
        grant_runtime(CANDIDATE)
    else:
        assert json.loads((EVIDENCE/'recovery-bootstrap.json').read_text())['status'] == 'pass'
        legacy_migration()
        restore_candidate()
    RESULT['status'] = 'pass'
    save()
    print(json.dumps({'status': 'pass', 'phase': MODE, 'checks': len(RESULT['checks']), 'elapsedSeconds': RESULT['elapsedSeconds']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['bootstrap', 'verify'])
    parser.add_argument('build_image')
    parser.add_argument('evidence_directory', type=Path)
    arguments = parser.parse_args()
    MODE, IMAGE, EVIDENCE = arguments.phase, arguments.build_image, arguments.evidence_directory.resolve()
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    SOURCE_SHA = os.environ.get('SURVEY_CI_SOURCE_SHA', '')
    IMAGE_ID = os.environ.get('SURVEY_CI_IMAGE_ID', '')
    MIGRATION_NAMES = sorted(p.name for p in (BACKEND/'prisma/migrations').iterdir() if p.is_dir())
    STARTED = time.monotonic()
    RESULT = {'status': 'running', 'phase': MODE, 'sourceSha': SOURCE_SHA, 'buildImageId': IMAGE_ID,
              'scope': 'Synthetic isolated Survey migration, full Survey table restore, restricted compiled runtime; no production data or deployment',
              'scriptSha256': sha(Path(__file__).read_bytes()), 'checks': []}
    try:
        main()
    except Exception as error:
        RESULT['status'] = 'failed'
        RESULT['error'] = {'name': type(error).__name__, 'message': str(error)}
        save()
        print(f'Survey {MODE} failed: {error}', file=sys.stderr)
        sys.exit(1)
