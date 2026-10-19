#!/usr/bin/env python3
"""New pure C25 adapter mutation tests. No service, migration, HTTP or build.

Run only under the launcher's measurement lock. Synthetic dictionaries below
exercise acceptance decisions; they are not qualified database snapshots.
"""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c25_database_tested', BASE / 'c25-db.py')
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
MIGRATION_SQL = (BASE.parents[1] / 'backend/prisma/migrations' / db.MIGRATION / 'migration.sql').read_text()


def inventory_fixture():
    tables = ['composite_assessments', 'composite_assessment_attempts', 'training_public_rounds',
              db.CHECKPOINT_TABLE, '_prisma_migrations', 'courses'] + ['synthetic_' + str(i) for i in range(211)]
    before = {'columns': {table: ['id'] for table in tables}, 'columnMetadata': {},
              'projection': {table: {'rows': 0, 'sha256': '0' * 64} for table in tables},
              'constraints': [], 'allPublicUserGuards': [], 'governanceGuards': [], 'qualityGuards': []}
    before['projection'][db.CHECKPOINT_TABLE]['rows'] = 16
    before['projection']['_prisma_migrations']['rows'] = 1
    before['projection']['courses']['rows'] = 6512
    for table, width in db.BASELINE_WIDTHS.items():
        kind = 'policy' if table == 'composite_assessments' else 'snapshot'
        before['columns'][table] = ['id'] + ['old_' + str(i) for i in range(width - 3)] + [
            'training_persistence_' + kind, 'training_persistence_' + kind + '_hash']
        column = 'training_persistence_' + kind
        before['constraints'].append({
            'table': table, 'name': column + '_pair', 'type': 'c', 'validated': True,
            'definition': f"CHECK (((({column} IS NULL) = ({column}_hash IS NULL)) AND (({column}_hash IS NULL) OR ({column}_hash ~ '^[0-9a-f]{{64}}$'::text))))",
            'columns': [column, column + '_hash'], 'deferrable': False, 'initiallyDeferred': False,
            'isLocal': True, 'inheritCount': 0, 'noInherit': False, 'updateAction': ' ', 'deleteAction': ' ',
            'matchType': ' ', 'referenceTable': None, 'referenceColumns': None})
    for table, columns in before['columns'].items():
        before['columnMetadata'][table] = [db.added_metadata(table, column, rank) for rank, column in enumerate(columns, 1)]
    before['allPublicUserGuards'].append({'table': db.CHECKPOINT_TABLE, 'name': 'training_checkpoint_guard',
                                        'enabled': 'O', 'function': 'synthetic old guard bytes', 'trigger': 'synthetic old trigger bytes'})
    after = copy.deepcopy(before)
    for table, columns in db.ADDED.items():
        after['columns'][table] += columns
        after['columnMetadata'][table] += [db.added_metadata(table, column, db.BASELINE_WIDTHS[table] + rank)
                                            for rank, column in enumerate(columns, 1)]
    after['projection']['_prisma_migrations'] = {'rows': 2, 'sha256': '1' * 64}
    after['allPublicUserGuards'] += [db.expected_guard(table, name, operation, MIGRATION_SQL)
                                    for (table, name), operation in db.GUARDS.items()]
    after['constraints'] += [db.expected_check(before, table, name) for table, name in sorted(db.CHECKS)]
    return before, after


def joint_fixture():
    manifest = {'schemaVersion': 1, 'scope': 'NEW_SYNTHETIC_C25_ONLY', 'restoreCases': [], 'checkpointCases': []}
    observations = {key: [] for key in ['parents', 'attempts', 'courses', 'tokens', 'rounds', 'checkpoints']}
    original = {table: [] for table in ['composite_assessments', 'composite_assessment_attempts', 'courses',
                                       'composite_assessment_access_tokens', 'training_public_rounds', db.CHECKPOINT_TABLE]}
    for name, mode, participant, bound in [('A', 'IMMEDIATE', 'AUTHENTICATED', False),
                                         ('B', 'SCHEDULED', 'AUTHENTICATED', False),
                                         ('C', 'SCHEDULED', 'ANONYMOUS', True),
                                         ('D', 'SCHEDULED', 'ANONYMOUS', False)]:
        case = {'name': name, 'mode': mode, 'participant': participant, 'compositeId': 'parent-' + name,
                'attemptId': 'attempt-' + name, 'courseId': 'course-' + name,
                'accessTokenId': 'token-' + name if participant == 'ANONYMOUS' else None,
                'roundId': 'round-' + name if bound else None}
        manifest['restoreCases'].append(case)
        manifest['checkpointCases'].append({'name': name, 'attemptId': case['attemptId'], 'state': 'PAYLOAD' if name == 'D' else 'TOMBSTONE'})
        policy = {'schemaVersion': 1, 'mode': mode}
        if mode == 'SCHEDULED':
            policy['releaseAt'] = '2099-01-01T00:00:00.000Z'
        persistence_policy = {'schemaVersion': 1, 'checkpoint': {'enabled': True, 'ttlHours': 1}, 'localCognitive': None}
        parent = {'id': case['compositeId'], 'training_feedback_policy': policy,
                  'training_feedback_policy_hash': db.canonical_hash(policy), 'status': 'PUBLISHED',
                  'product_kind': 'QUESTIONNAIRE', 'questionnaire_type': 'COURSE',
                  'published_at': '2026-10-19T08:00:00', 'training_flow_digest': None, 'training_variant_digest': None,
                  'training_persistence_policy': persistence_policy, 'training_persistence_policy_hash': db.canonical_hash(persistence_policy)}
        observations['parents'].append(parent)
        publication = {'schemaVersion': 1, 'compositeId': parent['id'], 'courseId': case['courseId'],
                       'publishedAt': '2026-10-19T08:00:00.000Z', 'productKind': 'QUESTIONNAIRE', 'questionnaireType': 'COURSE',
                       'trainingFlowDigest': None, 'trainingVariantDigest': None}
        snapshot = {'schemaVersion': 1, 'attemptId': case['attemptId'], 'attemptEpoch': 1, 'compositeId': case['compositeId'],
                    'courseId': case['courseId'], 'publicationIdentity': publication, 'publicationHash': db.canonical_hash(publication),
                    'policy': policy, 'policyHash': db.canonical_hash(policy), 'accessTokenId': case['accessTokenId'], 'roundId': case['roundId']}
        persistence = {**snapshot, 'policy': persistence_policy, 'policyHash': db.canonical_hash(persistence_policy),
                       'frozenCutoff': '2099-01-01T00:00:00.000Z'}
        del persistence['accessTokenId']
        attempt = {'id': case['attemptId'], 'composite_assessment_id': case['compositeId'], 'delivery_course_id': case['courseId'],
                   'attempt_epoch': 1, 'access_token_id': case['accessTokenId'], 'user_id': 'synthetic-user' if participant == 'AUTHENTICATED' else None,
                   'training_feedback_snapshot': snapshot, 'training_feedback_snapshot_hash': db.canonical_hash(snapshot),
                   'training_persistence_snapshot': persistence, 'training_persistence_snapshot_hash': db.canonical_hash(persistence),
                   'frozen_active_slot_set_hash': 'a' * 64, 'status': 'IN_PROGRESS' if name == 'D' else 'COMPLETED'}
        observations['attempts'].append(attempt)
        observations['courses'].append({'id': case['courseId'], 'course_type': 'TRAINING_COURSE'})
        if case['accessTokenId']:
            observations['tokens'].append({'id': case['accessTokenId'], 'composite_assessment_id': case['compositeId'], 'training_round_id': case['roundId']})
        if case['roundId']:
            observations['rounds'].append({'id': case['roundId'], 'composite_id': case['compositeId'], 'course_id': case['courseId'],
                                            'publication_identity': publication, 'publication_hash': db.canonical_hash(publication)})
        observations['checkpoints'].append({'attempt_id': case['attemptId'], 'snapshot_hash': attempt['training_persistence_snapshot_hash'],
                                            'definition_hash': attempt['frozen_active_slot_set_hash'], 'attempt_epoch': 1,
                                            'round_id': case['roundId'], 'revision': 2, 'successful_save_count': 1,
                                            'payload_encrypted': 'synthetic-encrypted-' * 50 if name == 'D' else None,
                                            'payload_hash': 'b' * 64 if name == 'D' else None,
                                            'expires_at': '2099-01-01T00:00:00' if name == 'D' else None})
    return manifest, observations, original


class UpgradeInventoryFaults(unittest.TestCase):
    def test_exact_additive_inventory_accepts(self):
        before, after = inventory_fixture()
        db.validate_upgrade(before, after, MIGRATION_SQL)

    def test_wrong_baseline_width_count_or_holes_rejected(self):
        for mutation in [lambda x: x['columns'].pop('synthetic_0'),
                         lambda x: x['projection']['courses'].update(rows=6511),
                         lambda x: x['projection'][db.CHECKPOINT_TABLE].update(rows=15),
                         lambda x: x['columnMetadata']['composite_assessments'][2].update(ordinal=4),
                         lambda x: x['columns']['composite_assessments'].append('unknown')]:
            before, _ = inventory_fixture()
            mutation(before)
            with self.assertRaises(AssertionError):
                db.validate_baseline(before)

    def test_no_table_column_or_metadata_expansion(self):
        for mutation in [lambda x: x['columns'].update(extra=['id']),
                         lambda x: x['columns']['courses'].append('extra'),
                         lambda x: x['columns']['composite_assessments'].reverse(),
                         lambda x: x['columnMetadata']['composite_assessment_attempts'][-1].update(nullable='NO'),
                         lambda x: x['columnMetadata']['composite_assessments'][-2].update(type='json'),
                         lambda x: x['columnMetadata']['composite_assessments'][-1].update(default="'backfill'"),
                         lambda x: x['columnMetadata']['composite_assessments'][0].update(ordinal=2),
                         lambda x: x['columnMetadata']['composite_assessments'][-1].update(ordinal=42)]:
            before, after = inventory_fixture()
            mutation(after)
            with self.assertRaises(AssertionError):
                db.validate_upgrade(before, after, MIGRATION_SQL)

    def test_old_and_new_guards_are_exact(self):
        for mutation in [lambda x: x['allPublicUserGuards'][0].update(function='rewritten'),
                         lambda x: x['allPublicUserGuards'][0].update(enabled='D'),
                         lambda x: x['allPublicUserGuards'][-1].update(enabled='D'),
                         lambda x: x['allPublicUserGuards'][-1].update(function='rewritten'),
                         lambda x: x['allPublicUserGuards'][-1].update(trigger='wrong timing or operations'),
                         lambda x: x['allPublicUserGuards'][-1].update(deferrable=True),
                         lambda x: x['allPublicUserGuards'].pop(),
                         lambda x: x['allPublicUserGuards'].append(copy.deepcopy(x['allPublicUserGuards'][0]))]:
            before, after = inventory_fixture()
            mutation(after)
            with self.assertRaises(AssertionError):
                db.validate_upgrade(before, after, MIGRATION_SQL)

    def test_exact_two_checks_and_original_metadata(self):
        for mutation in [lambda x: x['constraints'][0].update(definition='CHECK (true)'),
                         lambda x: x['constraints'][-1].update(definition='CHECK (true)'),
                         lambda x: x['constraints'][-1].update(validated=False),
                         lambda x: x['constraints'][-1].update(columns=['wrong']),
                         lambda x: x['constraints'][-1].update(noInherit=True),
                         lambda x: x['constraints'].pop(),
                         lambda x: x['constraints'].append({**x['constraints'][-1], 'name': 'extra_check'}),
                         lambda x: x['constraints'].append(copy.deepcopy(x['constraints'][-1]))]:
            before, after = inventory_fixture()
            mutation(after)
            with self.assertRaises(AssertionError):
                db.validate_upgrade(before, after, MIGRATION_SQL)

    def test_row_count_digest_and_sql_bytes_are_not_waived(self):
        for mutation in [lambda x: x['projection']['courses'].update(rows=6513),
                         lambda x: x['projection'][db.CHECKPOINT_TABLE].update(sha256='changed'),
                         lambda x: x['projection']['_prisma_migrations'].update(rows=3),
                         lambda x: x['qualityGuards'].append({'changed': True})]:
            before, after = inventory_fixture()
            mutation(after)
            with self.assertRaises(AssertionError):
                db.validate_upgrade(before, after, MIGRATION_SQL)
        before, after = inventory_fixture()
        with self.assertRaises(AssertionError):
            db.validate_upgrade(before, after, MIGRATION_SQL + '\n')

    def test_preservation_schema_still_requires_new_guards_after_fixture_rows(self):
        before, after = inventory_fixture()
        after['projection']['courses']['rows'] += 10
        db.validate_schema_inventory(before, after, MIGRATION_SQL)
        after['allPublicUserGuards'].pop()
        with self.assertRaises(AssertionError):
            db.validate_schema_inventory(before, after, MIGRATION_SQL)

    def test_full_row_preservation_uses_old_projection_and_multiplicity(self):
        original = {'old': [{'id': 'same', 'payload': None}, {'id': 'same', 'payload': None}]}
        db.validate_old_rows(original, {'old': original['old'] + [{'id': 'new', 'payload': 'new'}]})
        for current in [{'old': original['old'][:1]}, {'old': [{'id': 'same', 'payload': 'backfilled'}] * 2}, {'wrong': []}]:
            with self.assertRaises(AssertionError):
                db.validate_old_rows(original, current)

    def test_existing_migration_checksums_and_exact_single_new_ledger_row(self):
        previous = [{'id': 'old-row', 'migration_name': 'accepted-old', 'checksum': 'a' * 64,
                     'finished_at': 'then', 'rolled_back_at': None, 'applied_steps_count': 1}]
        new = {'id': 'new-row', 'migration_name': db.MIGRATION, 'checksum': db.MIGRATION_SHA256,
               'finished_at': 'now', 'rolled_back_at': None, 'applied_steps_count': 1}
        files = {'accepted-old': 'a' * 64, db.MIGRATION: db.MIGRATION_SHA256}
        db.validate_migration_ledger(previous, previous + [new], files)
        for bad in [{**files, 'other-pending': 'x'}, {**files, 'accepted-old': 'changed'},
                    {db.MIGRATION: db.MIGRATION_SHA256}, {**files, db.MIGRATION: 'changed'}]:
            with self.assertRaises(AssertionError):
                db.validate_migration_inputs(previous, bad)
        for current in [previous, previous + [new, new], [{**previous[0], 'checksum': 'changed'}, new],
                        previous + [{**new, 'finished_at': None}], previous + [{**new, 'rolled_back_at': 'now'}],
                        previous + [{**new, 'applied_steps_count': 0}], previous + [{**new, 'migration_name': 'wrong'}]]:
            with self.assertRaises(AssertionError):
                db.validate_migration_ledger(previous, current, files)

    def test_all_sixteen_old_checkpoint_rows_remain_full_values(self):
        checkpoints = [{'attempt_id': str(i), 'payload_encrypted': 'expired-ciphertext-' + str(i) if i < 7 else None,
                        'payload_hash': 'a' * 64 if i < 7 else None, 'expires_at': '2026-10-18T00:00:00' if i < 7 else None,
                        'revision': i + 1, 'successful_save_count': i} for i in range(16)]
        original = {db.CHECKPOINT_TABLE: checkpoints}
        db.validate_old_rows(original, {db.CHECKPOINT_TABLE: copy.deepcopy(checkpoints) + [{'attempt_id': 'new'}]})
        for mutation in [lambda rows: rows.pop(), lambda rows: rows[0].update(payload_encrypted=None),
                         lambda rows: rows[0].update(expires_at='2026-10-19T00:00:00'),
                         lambda rows: rows[-1].update(successful_save_count=0), lambda rows: rows[-1].update(revision=99)]:
            current = copy.deepcopy(checkpoints)
            mutation(current)
            with self.assertRaises(AssertionError):
                db.validate_old_rows(original, {db.CHECKPOINT_TABLE: current})

    def test_historical_nulls_reject_writes_but_allow_new_configured_rows(self):
        original = {table: [{'id': 'old'}] for table in db.ADDED}
        current = {table: [{'id': 'old', **dict.fromkeys(columns)}, {'id': 'new', **dict.fromkeys(columns, 'new-config')}]
                   for table, columns in db.ADDED.items()}
        db.validate_historical_nulls(original, current)
        for table, columns in db.ADDED.items():
            for column in columns:
                altered = copy.deepcopy(current)
                altered[table][0][column] = 'forbidden-backfill'
                with self.assertRaises(AssertionError):
                    db.validate_historical_nulls(original, altered)
            altered = copy.deepcopy(current)
            altered[table].pop(0)
            with self.assertRaises(AssertionError):
                db.validate_historical_nulls(original, altered)


class RestoreCaseFaults(unittest.TestCase):
    def test_four_required_phases_must_really_pass(self):
        receipts = {name: {'passed': True} for name in db.RESTORE_PHASES}
        db.validate_prerequisites(receipts)
        for name in db.RESTORE_PHASES:
            missing = copy.deepcopy(receipts)
            del missing[name]
            with self.assertRaises(AssertionError):
                db.validate_prerequisites(missing)
            for false_pass in [False, None, 1, 'true']:
                with self.assertRaises(AssertionError):
                    db.validate_prerequisites({**receipts, name: {'passed': false_pass}})

    def test_nonempty_joint_policies_and_checkpoint_matrix_accepts(self):
        manifest, observations, original = joint_fixture()
        result = db.validate_restore_cases(manifest, observations, original)
        self.assertEqual((result['cases'], result['newPayloads'], result['newTombstones']), (4, 1, 3))

    def test_manifest_omissions_duplicates_and_wrong_matrix_rejected(self):
        for mutate in [lambda f: f.update(scope='OLD_FIXTURE'), lambda f: f['restoreCases'].pop(),
                       lambda f: f['restoreCases'][1].update(attemptId=f['restoreCases'][0]['attemptId']),
                       lambda f: f['restoreCases'][0].update(mode='SCHEDULED'),
                       lambda f: f['restoreCases'][2].update(roundId=None),
                       lambda f: f['restoreCases'][3].update(accessTokenId=None),
                       lambda f: f['restoreCases'][0].update(extra='undeclared'),
                       lambda f: f['checkpointCases'].pop(),
                       lambda f: f['checkpointCases'][3].update(state='TOMBSTONE')]:
            manifest, _, _ = joint_fixture()
            mutate(manifest)
            with self.assertRaises(AssertionError):
                db.validate_fixture_manifest(manifest)

    def test_unlisted_old_or_missing_fixture_ids_never_establish_cases(self):
        for label, field, table in [('parents', 'compositeId', 'composite_assessments'),
                                    ('attempts', 'attemptId', 'composite_assessment_attempts'),
                                    ('courses', 'courseId', 'courses'),
                                    ('tokens', 'accessTokenId', 'composite_assessment_access_tokens'),
                                    ('rounds', 'roundId', 'training_public_rounds')]:
            manifest, observations, original = joint_fixture()
            original[table].append({'id': observations[label][0]['id']})
            with self.assertRaises(AssertionError):
                db.validate_restore_cases(manifest, observations, original)
            original[table] = []
            observations[label].pop()
            with self.assertRaises(AssertionError):
                db.validate_restore_cases(manifest, observations, original)
        manifest, observations, original = joint_fixture()
        original[db.CHECKPOINT_TABLE].append({'attempt_id': 'attempt-D'})
        with self.assertRaises(AssertionError):
            db.validate_restore_cases(manifest, observations, original)

    def test_policy_snapshot_identity_and_hash_mutations_rejected(self):
        changes = [lambda o: o['parents'][0].update(training_feedback_policy=None),
                   lambda o: o['parents'][0].update(training_feedback_policy_hash='0' * 64),
                   lambda o: o['parents'][0].update(status='DRAFT'),
                   lambda o: o['parents'][0].update(product_kind='SURVEY'),
                   lambda o: o['parents'][0].update(published_at='2026-10-19T09:00:00'),
                   lambda o: o['parents'][1]['training_feedback_policy'].update(releaseAt='invalid'),
                   lambda o: o['attempts'][0].update(training_feedback_snapshot_hash='0' * 64),
                   lambda o: o['attempts'][0].update(delivery_course_id='wrong'),
                   lambda o: o['attempts'][0].update(attempt_epoch=2),
                   lambda o: o['attempts'][0].update(user_id=None),
                   lambda o: o['attempts'][2].update(access_token_id='wrong'),
                   lambda o: o['tokens'][0].update(training_round_id='wrong'),
                   lambda o: o['rounds'][0].update(publication_hash='0' * 64),
                   lambda o: o['rounds'][0].update(course_id='wrong')]
        for change in changes:
            manifest, observations, original = joint_fixture()
            change(observations)
            with self.assertRaises((AssertionError, ValueError)):
                db.validate_restore_cases(manifest, observations, original)

    def test_rehashed_wrong_snapshot_cannot_match_a_different_identity(self):
        for field, value in [('attemptId', 'wrong'), ('attemptEpoch', 2), ('compositeId', 'wrong'),
                             ('courseId', 'wrong'), ('roundId', 'wrong'), ('accessTokenId', 'wrong'),
                             ('policyHash', '0' * 64), ('publicationHash', '0' * 64), ('schemaVersion', True)]:
            manifest, observations, original = joint_fixture()
            attempt = observations['attempts'][0]
            attempt['training_feedback_snapshot'][field] = value
            attempt['training_feedback_snapshot_hash'] = db.canonical_hash(attempt['training_feedback_snapshot'])
            with self.assertRaises(AssertionError):
                db.validate_restore_cases(manifest, observations, original)

    def test_payload_tombstone_and_persistence_bindings_not_inferred_from_old_rows(self):
        for change in [lambda o: o['checkpoints'][3].update(payload_encrypted=None),
                       lambda o: o['checkpoints'][3].update(payload_hash=None),
                       lambda o: o['checkpoints'][3].update(expires_at=None),
                       lambda o: o['checkpoints'][0].update(payload_encrypted='not-cleared'),
                       lambda o: o['checkpoints'][3].update(successful_save_count=0),
                       lambda o: o['checkpoints'][3].update(successful_save_count=101),
                       lambda o: o['checkpoints'][3].update(snapshot_hash='wrong'),
                       lambda o: o['checkpoints'][3].update(definition_hash='wrong'),
                       lambda o: o['checkpoints'][2].update(round_id='wrong'),
                       lambda o: o['attempts'][0].update(training_persistence_snapshot_hash='wrong'),
                       lambda o: o['attempts'][3].update(status='COMPLETED'),
                       lambda o: o['attempts'][0].update(status='IN_PROGRESS')]:
            manifest, observations, original = joint_fixture()
            change(observations)
            with self.assertRaises(AssertionError):
                db.validate_restore_cases(manifest, observations, original)

    def test_restore_destination_rejects_existing_c23_database_before_any_sql(self):
        class Recorder:
            def sql(self, *_):
                raise AssertionError('SQL must not run for the wrong destination')
        for target in ['eduk12_c23_http_restore', 'eduk12_recovery', 'postgres', 'eduk12_c25_other']:
            with self.assertRaisesRegex(AssertionError, 'only the new C25'):
                db.Database.restore(Recorder(), target, Path('/not-read'), 'not-run')

    def test_exact_old_restore_wrapper_is_reused(self):
        self.assertIs(db.restore_equivalence, db.old.old.old.restored_snapshot_equivalence)
        self.assertEqual(len(db.old.old.old.old.old.CHECK_REPARSE_PAIRS), 3)

    def test_baseline_requires_pinned_snapshot_before_database_access(self):
        class ForbiddenDatabase:
            def snapshot(self):
                raise AssertionError('database must not be queried before snapshot digest validation')
        with self.assertRaisesRegex(AssertionError, 'required'):
            db.accepted_baseline(ForbiddenDatabase(), None)
        with patch.object(db, 'sha_file', return_value='0' * 64):
            with self.assertRaisesRegex(AssertionError, 'bytes differ'):
                db.accepted_baseline(ForbiddenDatabase(), Path('/synthetic-not-read'))


if __name__ == '__main__':
    unittest.main()
