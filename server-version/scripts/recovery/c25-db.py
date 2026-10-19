#!/usr/bin/env python3
"""Exact C22-over-C23 upgrade/restore adapter, invoked only by the private launcher.

Every invocation is a tracked launcher child, including finalization audits.
The launcher must enforce a 300-second aggregate audit/process-group deadline;
per-statement timeouts here do not replace that deadline. This module starts no
services, generates no client, performs no HTTP reads, and never cleans drafts.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import traceback

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c25_prior', BASE / 'c23-checkpoint-db.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
sha_file, digest, quote = old.sha_file, old.digest, old.quote
# C20 is the existing exact 73-column / three-parser wrapper. Do not normalize
# additional columns or CHECKs merely because a new migration is being tested.
restore_equivalence = old.old.old.restored_snapshot_equivalence
MIGRATION = '20261019060000_training_feedback_release'
MIGRATION_SHA256 = 'c14fbc1105a2e21f8479fb632547d13af30f3e507ef38470e5379f7908c899e6'
ACCEPTED_SNAPSHOT_SHA256 = '4dd59702b756e0d16cf9fe1c2b821118ba1aa5587f0408a9ccb8527d3d8a01e5'
RESTORE_DATABASE = 'eduk12_c25_joint_restore'
CHECKPOINT_TABLE = 'training_attempt_checkpoints'
ADDED = {
    'composite_assessments': ['training_feedback_policy', 'training_feedback_policy_hash'],
    'composite_assessment_attempts': ['training_feedback_snapshot', 'training_feedback_snapshot_hash'],
}
BASELINE_WIDTHS = {'composite_assessments': 39, 'composite_assessment_attempts': 44}
GUARDS = {
    ('composite_assessments', 'training_feedback_parent_guard'): 'UPDATE',
    ('composite_assessment_attempts', 'training_feedback_attempt_guard'): 'INSERT OR UPDATE',
}
CHECKS = {
    ('composite_assessments', 'training_feedback_policy_pair'),
    ('composite_assessment_attempts', 'training_feedback_snapshot_pair'),
}
RESTORE_PHASES = ('prepare', 'scheduled', 'consumers', 'guards')
REQUIRED_CASES = {
    ('IMMEDIATE', 'AUTHENTICATED', False),
    ('SCHEDULED', 'AUTHENTICATED', False),
    ('SCHEDULED', 'ANONYMOUS', True),
    ('SCHEDULED', 'ANONYMOUS', False),
}


def private_json(path, value):
    """Exclusive creation: failures and accepted evidence are never overwritten."""
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        json.dump(value, handle, indent=2)


def indexed(rows, *keys):
    result = {tuple(row[key] for key in keys): row for row in rows}
    assert len(result) == len(rows), 'duplicate inventory identity'
    return result


def validate_baseline(snapshot):
    assert len(snapshot['columns']) == 217, 'accepted C23 table count differs'
    assert set(snapshot['projection']) == set(snapshot['columnMetadata']) == set(snapshot['columns'])
    assert sum(item['rows'] for item in snapshot['projection'].values()) == 6529
    assert snapshot['projection'][CHECKPOINT_TABLE]['rows'] == 16
    assert 'training_public_rounds' in snapshot['columns']
    for table, width in BASELINE_WIDTHS.items():
        assert len(snapshot['columns'][table]) == width, 'affected baseline width differs'
        assert [c['ordinal'] for c in snapshot['columnMetadata'][table]] == list(range(1, width + 1)), 'affected baseline has ordinal holes'
        assert not set(ADDED[table]) & set(snapshot['columns'][table]), 'C22 already applied'
    for table, columns in snapshot['columns'].items():
        assert [c['column'] for c in snapshot['columnMetadata'][table]] == columns


def expected_guard(table, name, operation, migration_sql):
    marker = f'CREATE FUNCTION {name}() RETURNS trigger LANGUAGE plpgsql AS $$'
    assert migration_sql.count(marker) == 1
    body = migration_sql.split(marker, 1)[1].split('$$;', 1)[0]
    return {'table': table, 'name': name, 'enabled': 'O', 'deferrable': False,
            'initiallyDeferred': False,
            'trigger': f'CREATE TRIGGER {name} BEFORE {operation} ON public.{table} FOR EACH ROW EXECUTE FUNCTION {name}()',
            'function': f'CREATE OR REPLACE FUNCTION public.{name}()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function${body}$function$\n'}


def expected_check(before, table, name):
    """Exact substitution in the already accepted, same-table C23 CHECK only."""
    prior_name = name.replace('training_feedback_', 'training_persistence_')
    previous = indexed(before['constraints'], 'table', 'name')[(table, prior_name)]
    assert previous['type'] == 'c' and previous['validated'] is True
    return {**previous, 'name': name,
            'columns': [c.replace('training_persistence_', 'training_feedback_') for c in previous['columns']],
            'definition': previous['definition'].replace('training_persistence_', 'training_feedback_')}


def added_metadata(table, column, rank):
    data_type = 'text' if column.endswith('_hash') else 'jsonb'
    return {'column': column, 'ordinal': rank, 'type': data_type, 'udtSchema': 'pg_catalog',
            'udt': data_type, 'nullable': 'YES', 'default': None, 'characterLength': None,
            'numericPrecision': None, 'numericScale': None, 'datetimePrecision': None,
            'identity': 'NO', 'generated': 'NEVER', 'generation': None}


def validate_schema_inventory(before, after, migration_sql):
    """Pure exact schema decision, also used after fixture rows are added."""
    validate_baseline(before)
    assert hashlib.sha256(migration_sql.encode()).hexdigest() == MIGRATION_SHA256
    assert set(after) == set(before), 'snapshot shape changed'
    assert set(after['columns']) == set(before['columns']), 'C22 must not add or remove tables'
    assert set(after['columnMetadata']) == set(before['columnMetadata'])
    assert set(after['projection']) == set(before['projection'])
    for table, columns in before['columns'].items():
        added = ADDED.get(table, [])
        assert after['columns'][table] == columns + added, 'unexpected column inventory'
        expected = before['columnMetadata'][table] + [
            added_metadata(table, column, len(columns) + offset) for offset, column in enumerate(added, 1)]
        assert after['columnMetadata'][table] == expected, 'column metadata or old physical ordinal changed'
    previous = indexed(before['allPublicUserGuards'], 'table', 'name')
    current = indexed(after['allPublicUserGuards'], 'table', 'name')
    assert all(current.get(key) == value for key, value in previous.items()), 'old guard changed'
    assert set(current) - set(previous) == set(GUARDS), 'unexpected additive guard inventory'
    assert all(guard['enabled'] == 'O' for guard in current.values()), 'disabled guard'
    for (table, name), operation in GUARDS.items():
        assert current[(table, name)] == expected_guard(table, name, operation, migration_sql), 'new guard differs from pinned SQL'
    previous = indexed(before['constraints'], 'table', 'name')
    current = indexed(after['constraints'], 'table', 'name')
    assert all(current.get(key) == value for key, value in previous.items()), 'old constraint changed'
    assert set(current) - set(previous) == CHECKS, 'unexpected additive CHECK inventory'
    for table, name in CHECKS:
        assert current[(table, name)] == expected_check(before, table, name), 'new nullable-pair CHECK differs'
    for key in set(before) - {'columns', 'columnMetadata', 'projection', 'constraints', 'allPublicUserGuards'}:
        assert after[key] == before[key], 'other snapshot fact changed'


def validate_upgrade(before, after, migration_sql):
    """Pure exact schema and zero-backfill inventory; full rows are separate."""
    validate_schema_inventory(before, after, migration_sql)
    for table in before['columns']:
        assert after['projection'][table]['rows'] == before['projection'][table]['rows'] + (table == '_prisma_migrations'), 'unexpected upgrade row count'
        if table not in ADDED and table != '_prisma_migrations':
            assert after['projection'][table] == before['projection'][table], 'unaffected logical rows changed'


def validate_migration_inputs(ledger, files):
    assert files.get(MIGRATION) == MIGRATION_SHA256, 'C22 SQL is not pinned'
    assert MIGRATION not in {row['migration_name'] for row in ledger}, 'C22 already in ledger'
    assert set(files) == {row['migration_name'] for row in ledger} | {MIGRATION}, 'more than C22 is pending or an old migration is missing'
    for row in ledger:
        assert files.get(row['migration_name']) == row['checksum'], 'existing migration checksum differs from candidate'


def row_counter(rows):
    return Counter(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in rows)


def validate_old_rows(original_rows, current_rows):
    assert set(original_rows) == set(current_rows), 'old-row projection has different tables'
    for table, rows in original_rows.items():
        assert not row_counter(rows) - row_counter(current_rows[table]), 'old full logical row changed or disappeared: ' + table


def validate_historical_nulls(original_rows, current_affected):
    for table, columns in ADDED.items():
        old_ids = {row['id'] for row in original_rows[table]}
        rows = {key[0]: row for key, row in indexed(current_affected[table], 'id').items()}
        assert old_ids <= set(rows), 'historical affected row is missing'
        assert all(all(rows[row_id][column] is None for column in columns) for row_id in old_ids), 'historical C22 NULL was backfilled'


def validate_migration_ledger(before, after, files):
    validate_migration_inputs(before, files)
    assert not row_counter(before) - row_counter(after), 'old migration ledger row changed'
    added = list((row_counter(after) - row_counter(before)).elements())
    assert len(after) == len(before) + 1 and len(added) == 1, 'C22 must add exactly one ledger row'
    row = json.loads(added[0])
    assert row['migration_name'] == MIGRATION and row['checksum'] == MIGRATION_SHA256
    assert row['finished_at'] is not None and row['rolled_back_at'] is None
    assert row['applied_steps_count'] == 1, 'C22 migration did not complete normally'


def validate_prerequisites(receipts):
    assert set(receipts) == set(RESTORE_PHASES), 'restore prerequisite set differs'
    assert all(receipts[name].get('passed') is True for name in RESTORE_PHASES), 'a required C25 phase did not pass'


def nonempty(value):
    return isinstance(value, str) and 0 < len(value) <= 200 and '\x00' not in value


def validate_fixture_manifest(manifest):
    assert manifest.get('schemaVersion') == 1 and manifest.get('scope') == 'NEW_SYNTHETIC_C25_ONLY'
    cases = manifest.get('restoreCases', [])
    checkpoints = manifest.get('checkpointCases', [])
    assert len(cases) == 4 and len(checkpoints) == 4, 'four explicit joint restore cases are required'
    indexed(cases, 'name'); indexed(cases, 'attemptId'); indexed(checkpoints, 'name'); indexed(checkpoints, 'attemptId')
    combinations = set()
    for case in cases:
        assert set(case) == {'name', 'mode', 'participant', 'compositeId', 'attemptId', 'courseId', 'accessTokenId', 'roundId'}
        assert all(nonempty(case[key]) for key in ['name', 'compositeId', 'attemptId', 'courseId'])
        assert all(case[key] is None or nonempty(case[key]) for key in ['accessTokenId', 'roundId'])
        assert case['roundId'] is None or case['accessTokenId'] is not None
        assert (case['accessTokenId'] is None) == (case['participant'] == 'AUTHENTICATED')
        combinations.add((case['mode'], case['participant'], case['roundId'] is not None))
    assert combinations == REQUIRED_CASES, 'joint restore mode/identity/round matrix incomplete'
    assert {c['attemptId'] for c in checkpoints} == {c['attemptId'] for c in cases}
    for checkpoint in checkpoints:
        assert set(checkpoint) == {'name', 'attemptId', 'state'} and nonempty(checkpoint['name'])
        case = next(c for c in cases if c['attemptId'] == checkpoint['attemptId'])
        expected = 'PAYLOAD' if (case['mode'], case['participant'], case['roundId'] is not None) == ('SCHEDULED', 'ANONYMOUS', False) else 'TOMBSTONE'
        assert checkpoint['state'] == expected, 'joint checkpoint matrix differs'
    return cases


def canonical_hash(value):
    # Only the closed C22 schema (strings/nulls/integer epoch/version) is used.
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def iso_milliseconds(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)  # PostgreSQL timestamp(3), PGOPTIONS UTC.
    return parsed.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def validate_restore_cases(manifest, observations, original_rows):
    """Pure manifest-scoped C22+C23 persisted-case validation, never all-old inference."""
    cases = validate_fixture_manifest(manifest)
    mapping = {'parents': ('composite_assessments', 'compositeId'),
               'attempts': ('composite_assessment_attempts', 'attemptId'),
               'courses': ('courses', 'courseId'),
               'tokens': ('composite_assessment_access_tokens', 'accessTokenId'),
               'rounds': ('training_public_rounds', 'roundId')}
    rows = {}
    for label, (table, field) in mapping.items():
        ids = {case[field] for case in cases if case[field] is not None}
        rows[label] = {key[0]: value for key, value in indexed(observations[label], 'id').items()}
        assert set(rows[label]) == ids, 'manifest-scoped restore row missing or unexpected'
        assert not ids & {row['id'] for row in original_rows[table]}, 'restore case uses an accepted old fixture'
    checkpoints = {key[0]: value for key, value in indexed(observations['checkpoints'], 'attempt_id').items()}
    assert set(checkpoints) == {case['attemptId'] for case in cases}
    assert not set(checkpoints) & {row['attempt_id'] for row in original_rows[CHECKPOINT_TABLE]}
    for case in cases:
        parent = rows['parents'][case['compositeId']]
        attempt = rows['attempts'][case['attemptId']]
        policy = parent['training_feedback_policy']
        snapshot = attempt['training_feedback_snapshot']
        assert isinstance(policy, dict) and isinstance(snapshot, dict), 'nonempty C22 policy/snapshot required'
        assert type(policy.get('schemaVersion')) is int and policy['schemaVersion'] == 1 and policy.get('mode') == case['mode']
        assert set(policy) == ({'schemaVersion', 'mode', 'releaseAt'} if case['mode'] == 'SCHEDULED' else {'schemaVersion', 'mode'})
        if case['mode'] == 'SCHEDULED':
            assert iso_milliseconds(policy['releaseAt']) == policy['releaseAt'], 'scheduled timestamp is not canonical'
        assert canonical_hash(policy) == parent['training_feedback_policy_hash']
        assert parent['status'] == 'PUBLISHED' and parent['product_kind'] == 'QUESTIONNAIRE' and parent['questionnaire_type'] == 'COURSE'
        assert rows['courses'][case['courseId']]['course_type'] == 'TRAINING_COURSE'
        assert type(attempt['attempt_epoch']) is int and attempt['attempt_epoch'] > 0
        assert attempt['composite_assessment_id'] == case['compositeId'] and attempt['delivery_course_id'] == case['courseId']
        assert attempt['access_token_id'] == case['accessTokenId']
        assert (attempt['user_id'] is not None) == (case['participant'] == 'AUTHENTICATED')
        publication = {'schemaVersion': 1, 'compositeId': parent['id'], 'courseId': case['courseId'],
                       'publishedAt': iso_milliseconds(parent['published_at']), 'productKind': parent['product_kind'],
                       'questionnaireType': parent['questionnaire_type'], 'trainingFlowDigest': parent['training_flow_digest'],
                       'trainingVariantDigest': parent['training_variant_digest']}
        expected = {'schemaVersion': 1, 'attemptId': attempt['id'], 'attemptEpoch': attempt['attempt_epoch'],
                    'compositeId': case['compositeId'], 'courseId': case['courseId'], 'publicationIdentity': publication,
                    'publicationHash': canonical_hash(publication), 'policy': policy, 'policyHash': canonical_hash(policy),
                    'accessTokenId': case['accessTokenId'], 'roundId': case['roundId']}
        assert type(snapshot.get('schemaVersion')) is int and type(snapshot.get('attemptEpoch')) is int
        assert snapshot == expected and canonical_hash(snapshot) == attempt['training_feedback_snapshot_hash'], 'C22 frozen identity/hash differs'
        if case['accessTokenId'] is not None:
            token = rows['tokens'][case['accessTokenId']]
            assert token['composite_assessment_id'] == case['compositeId'] and token['training_round_id'] == case['roundId']
        if case['roundId'] is not None:
            round_row = rows['rounds'][case['roundId']]
            assert round_row['composite_id'] == case['compositeId'] and round_row['course_id'] == case['courseId']
            assert round_row['publication_identity'] == publication and round_row['publication_hash'] == canonical_hash(publication)
        checkpoint = checkpoints[attempt['id']]
        persistence = attempt['training_persistence_snapshot']
        assert isinstance(persistence, dict) and canonical_hash(persistence) == attempt['training_persistence_snapshot_hash']
        assert all(persistence.get(key) == expected[key] for key in ['schemaVersion', 'attemptId', 'attemptEpoch', 'compositeId', 'courseId', 'publicationIdentity', 'publicationHash', 'roundId'])
        assert persistence['policy'] == parent['training_persistence_policy']
        assert canonical_hash(persistence['policy']) == persistence['policyHash'] == parent['training_persistence_policy_hash']
        assert checkpoint['snapshot_hash'] == attempt['training_persistence_snapshot_hash']
        assert checkpoint['definition_hash'] == attempt['frozen_active_slot_set_hash']
        assert checkpoint['attempt_epoch'] == attempt['attempt_epoch'] and checkpoint['round_id'] == case['roundId']
        assert checkpoint['revision'] >= 1 and 1 <= checkpoint['successful_save_count'] <= 100
        expected_state = next(c['state'] for c in manifest['checkpointCases'] if c['attemptId'] == attempt['id'])
        if expected_state == 'PAYLOAD':
            assert isinstance(checkpoint['payload_encrypted'], str) and checkpoint['payload_encrypted']
            assert all(nonempty(checkpoint[key]) for key in ['payload_hash', 'expires_at'])
            assert re.fullmatch('[0-9a-f]{64}', checkpoint['payload_hash'])
            assert attempt['status'] == 'IN_PROGRESS'
        else:
            assert all(checkpoint[key] is None for key in ['payload_encrypted', 'payload_hash', 'expires_at'])
            assert attempt['status'] == 'COMPLETED'
    return {'cases': len(cases), 'immediate': 1, 'scheduled': 3, 'authenticated': 2,
            'anonymous': 2, 'boundRound': 1, 'newPayloads': 1, 'newTombstones': 3,
            'manifestScoped': True, 'frozenPoliciesSnapshotsAndCheckpointBindingsVerified': True}


def literal(value):
    assert nonempty(value)
    return "'" + value.replace("'", "''") + "'"


class Database(old.Database):
    def sql(self, query, database='eduk12_recovery'):
        assert database in {'eduk12_recovery', RESTORE_DATABASE, 'postgres'}
        # Suppress stderr from public callers; SQL failures are retained privately.
        process = subprocess.run(list(map(str, [*self.psql, '-A', '-t', '-d', database, '-c', query])),
                                 cwd=self.backend, env={**self.env, **self.auth}, text=True,
                                 capture_output=True, timeout=90)
        label = 'c25-sql-' + str(len(self.exits) + 1)
        self.exits[label] = process.returncode
        if process.returncode != 0:
            private_json(self.state / (label + '-failure-private.json'),
                         {'query': query, 'stdout': process.stdout, 'stderr': process.stderr, 'exitCode': process.returncode})
        assert process.returncode == 0, 'SQL failed; see private diagnostic'
        return process.stdout.strip()

    def restore(self, database, target, label):
        assert database == RESTORE_DATABASE, 'only the new C25 joint restore database is allowed'
        assert self.sql('SELECT count(*) FROM pg_database WHERE datname=' + literal(database), 'postgres') == '0', 'restore destination already exists'
        self.sql('CREATE DATABASE ' + quote(database), 'postgres')
        self.run([self.pg / 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-h', '127.0.0.1',
                  '-p', self.owner.port, '-U', self.owner.username, '-d', database, target], label, self.auth)

    def apply_role(self, database):
        # The existing official script reconciles ACLs, never creates a new role.
        roles_query = "SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY rolname),'[]'::jsonb)::text FROM pg_roles r"
        memberships_query = "SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY roleid,member),'[]'::jsonb)::text FROM pg_auth_members m"
        roles, memberships = self.sql(roles_query, database), self.sql(memberships_query, database)
        assert {'eduk12_owner', 'eduk12_runtime'} <= {r['rolname'] for r in json.loads(roles)}
        super().apply_role(database)
        assert self.sql(roles_query, database) == roles and self.sql(memberships_query, database) == memberships, 'role creation, attributes or memberships changed'

    def original_rows_unchanged(self, original, database='eduk12_recovery'):
        retained = super().original_rows_unchanged(original, database)
        assert retained['oldTables'] == 217 and retained['oldRows'] == 6529
        before = {key: value for key, value in original.items() if key != 'rows'}
        # Verify both NEW and old guards/constraints throughout the run, not
        # only during the migration or by comparing two equally damaged dumps.
        schema = {**before, 'columns': self.columns(database), 'columnMetadata': self.column_metadata(database),
                  'allPublicUserGuards': self.guards(sorted(original['columns']), database),
                  'constraints': self.constraints(database)}
        migration_sql = (self.backend / 'prisma/migrations' / MIGRATION / 'migration.sql').read_text()
        validate_schema_inventory(before, schema, migration_sql)
        for table, columns in ADDED.items():
            ids = ','.join(literal(row['id']) for row in original['rows'][table])
            assert ids
            assert self.sql(f'SELECT count(*) FROM {quote(table)} WHERE id IN ({ids}) AND (' +
                            ' OR '.join(quote(column) + ' IS NOT NULL' for column in columns) + ')', database) == '0', 'historical C22 NULL was backfilled'
        # Explicit evidence for the 16 original C23 rows; ciphertext/expiry and
        # tombstones are full logical row values in the original-column checks.
        assert len(original['rows'][CHECKPOINT_TABLE]) == 16
        assert sum(row['payload_encrypted'] is not None for row in original['rows'][CHECKPOINT_TABLE]) == 7
        retained.update(originalCheckpointRowsRetained=16, originalCheckpointPayloadRowsRetained=7,
                        originalCheckpointTombstonesRetained=9, historicalFeedbackNullsRetained=True,
                        exactNewAndOldSchemaGuardsConstraintsRetained=True)
        return retained

    def fixture_observations(self, manifest, database='eduk12_recovery'):
        cases = validate_fixture_manifest(manifest)
        result = {}
        for label, table, field, column in [
            ('parents', 'composite_assessments', 'compositeId', 'id'),
            ('attempts', 'composite_assessment_attempts', 'attemptId', 'id'),
            ('courses', 'courses', 'courseId', 'id'),
            ('tokens', 'composite_assessment_access_tokens', 'accessTokenId', 'id'),
            ('rounds', 'training_public_rounds', 'roundId', 'id'),
            ('checkpoints', CHECKPOINT_TABLE, 'attemptId', 'attempt_id')]:
            ids = sorted({case[field] for case in cases if case[field] is not None})
            result[label] = json.loads(self.sql(f"SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY {quote(column)}),'[]'::jsonb)::text FROM {quote(table)} v WHERE {quote(column)} IN ({','.join(map(literal, ids))})", database)) if ids else []
        return result


def read_original(state):
    original = json.loads((state / 'c25-original-rows-private.json').read_text())
    validate_baseline({key: value for key, value in original.items() if key != 'rows'})
    assert set(original['rows']) == set(original['columns'])
    assert sum(map(len, original['rows'].values())) == 6529
    assert all({'rows': len(rows), 'sha256': digest(rows)} == original['projection'][table] for table, rows in original['rows'].items()), 'original full rows do not match accepted projection'
    return original


def accepted_baseline(db, expected_snapshot):
    assert expected_snapshot is not None, 'accepted C23 snapshot is required'
    assert sha_file(expected_snapshot) == ACCEPTED_SNAPSHOT_SHA256, 'accepted C23 snapshot bytes differ'
    expected = json.loads(expected_snapshot.read_text())
    validate_baseline(expected)
    actual = db.snapshot()
    assert actual == expected, 'clone differs from accepted C23 final snapshot'
    return actual


def audit(db, state, mode, label, expected_snapshot=None):
    assert label and re.fullmatch(r'c25-audit-[a-z-]+', label)
    target = state / (label + '-result.json')
    assert not target.exists()
    result = {'passed': False, 'mode': mode}
    try:
        if mode == 'baseline':
            accepted_baseline(db, expected_snapshot)
            result['acceptedSnapshotSha256'] = ACCEPTED_SNAPSHOT_SHA256
        else:
            original = read_original(state)
            result['retainedFacts'] = db.original_rows_unchanged(original)
            if mode == 'final':
                snapshot = db.snapshot()
                destination = state / 'c25-final-db-snapshot.json'
                private_json(destination, snapshot)
                result['snapshotSha256'] = sha_file(destination)
        result['passed'] = True
    except BaseException as error:
        result['errorType'] = type(error).__name__
        raise
    finally:
        result['processExits'] = db.exits
        private_json(target, result)


def phase(db, state, name, expected_snapshot=None):
    target = state / f'c25-{name}-result.json'
    assert not target.exists()
    result = {'passed': False, 'checks': []}
    try:
        if name == 'upgrade':
            before = accepted_baseline(db, expected_snapshot)
            original = {**before, 'rows': db.rows(before['columns'])}
            private_json(state / 'c25-original-rows-private.json', original)
            original = read_original(state)
            assert db.sql('SELECT count(*) FROM training_attempt_checkpoints WHERE payload_encrypted IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP') == '7', 'accepted seven expired checkpoint payloads must remain present'
            result['originalExpiredCheckpointPayloadRows'] = 7
            migrations = db.backend / 'prisma/migrations'
            files = {file.parent.name: sha_file(file) for file in migrations.glob('*/migration.sql')}
            validate_migration_inputs(original['rows']['_prisma_migrations'], files)
            migration_sql = (migrations / MIGRATION / 'migration.sql').read_text()
            db.run([db.node, 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrate-c25',
                   {'DATABASE_URL': db.url(db.owner, 'eduk12_recovery')})
            after = db.snapshot()
            validate_upgrade(before, after, migration_sql)
            current_ledger = db.rows({'_prisma_migrations': before['columns']['_prisma_migrations']})['_prisma_migrations']
            validate_migration_ledger(original['rows']['_prisma_migrations'], current_ledger, files)
            for table, columns in ADDED.items():
                assert db.sql(f'SELECT count(*) FROM {quote(table)} WHERE ' + ' OR '.join(quote(column) + ' IS NOT NULL' for column in columns)) == '0', 'upgrade backfilled historical C22 fields'
            db.apply_role('eduk12_recovery')
            assert db.snapshot() == after, 'ACL reconciliation changed logical state'
            result['migrationSqlSha256'] = MIGRATION_SHA256
            result['acceptedSnapshotSha256'] = ACCEPTED_SNAPSHOT_SHA256
            result['checks'] = ['Exactly four nullable typed columns, two named CHECKs and two pinned guards; no new table or backfill',
                                'Every existing migration checksum and full ledger row retained; only C22 added',
                                'Official restricted-role ACL apply and verification; existing roles and memberships unchanged']
        else:
            receipts = {p: json.loads((state / f'c25-{p}-result.json').read_text()) for p in RESTORE_PHASES}
            validate_prerequisites(receipts)
            result['prerequisiteSha256'] = {p: sha_file(state / f'c25-{p}-result.json') for p in RESTORE_PHASES}
            original = read_original(state)
            manifest_path = state / 'c25-fixture-private.json'
            manifest = json.loads(manifest_path.read_text())
            result['fixtureManifestSha256'] = sha_file(manifest_path)
            observations = db.fixture_observations(manifest)
            result['jointRestoreCases'] = validate_restore_cases(manifest, observations, original['rows'])
            after = db.snapshot()
            assert len(after['columns']) == 217
            validate_schema_inventory({key: value for key, value in original.items() if key != 'rows'}, after,
                                      (db.backend / 'prisma/migrations' / MIGRATION / 'migration.sql').read_text())
            out = state / 'c25-new-format-restore'
            out.mkdir(mode=0o700)
            dump = out / 'c25-joint-new-format.dump'
            result['dumpSha256'] = db.dump('eduk12_recovery', dump, 'dump-c25')
            assert db.snapshot() == after, 'source changed during dump'
            db.restore(RESTORE_DATABASE, dump, 'restore-c25')
            restored = db.snapshot(RESTORE_DATABASE)
            result['restoreEquivalence'] = restore_equivalence(after, restored, db, RESTORE_DATABASE)
            restored_cases = db.fixture_observations(manifest, RESTORE_DATABASE)
            assert restored_cases == observations, 'joint fixture full rows changed across restore'
            validate_restore_cases(manifest, restored_cases, original['rows'])
            # The known 73 physical ordinals belong to old unaffected tables.
            # Full original values are retained separately without normalizing rows.
            validate_old_rows(original['rows'], db.rows(original['columns'], RESTORE_DATABASE))
            validate_historical_nulls(original['rows'], db.rows({table: after['columns'][table] for table in ADDED}, RESTORE_DATABASE))
            db.apply_role(RESTORE_DATABASE)
            assert db.snapshot(RESTORE_DATABASE) == restored
            assert db.snapshot() == after, 'source changed during restore'
            assert sha_file(manifest_path) == result['fixtureManifestSha256']
            assert all(sha_file(state / f'c25-{p}-result.json') == result['prerequisiteSha256'][p] for p in RESTORE_PHASES)
            result['checks'] = ['New IMMEDIATE/SCHEDULED, authenticated/anonymous, bound-round C22 policies and snapshots restored',
                                'Original 16 C23 checkpoints plus new encrypted payload and three tombstones retained',
                                'All 217 tables, full old rows, exact new constraints and guards restored with unchanged 73-column/three-parser whitelist',
                                'Restricted role verified in new eduk12_c25_joint_restore; existing C23 restore database untouched']
        result['retainedFacts'] = db.original_rows_unchanged(original)
        result['postStateSha256'] = digest(after)
        private_json(state / f'c25-{name}-post-state-private.json', after)
        result['passed'] = True
    except BaseException as error:
        result['errorType'] = type(error).__name__
        raise
    finally:
        result['processExits'] = db.exits
        private_json(target, result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument('--phase', choices=['upgrade', 'restore'])
    choice.add_argument('--audit', choices=['baseline', 'preserve', 'final'])
    parser.add_argument('--label')
    parser.add_argument('--expected-snapshot', type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        db = Database(args.tools, args.state)
        if args.audit:
            audit(db, args.state, args.audit, args.label, args.expected_snapshot)
        else:
            phase(db, args.state, args.phase, args.expected_snapshot)
    except BaseException as error:
        private_json(args.state / f'c25-db-{args.audit or args.phase}-error-private.json',
                     {'errorType': type(error).__name__, 'traceback': traceback.format_exc()})
        print('C25 database adapter failed; private diagnostics retained.', file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
