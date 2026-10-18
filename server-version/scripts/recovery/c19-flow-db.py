"""C19-only private PostgreSQL assertions; no source database is opened."""
import importlib.util
import json
import re
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c19_c18_db', BASE / 'c18-study-db.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
sha_file, digest, quote = old.sha_file, old.digest, old.quote
fresh_prisma = old.fresh_prisma
restored_column_equivalence = old.restored_column_equivalence
restored_snapshot_equivalence = old.restored_snapshot_equivalence
PINNED_DUMP_SHA256 = '4cb0e419328dfb45ec72a9adc8e117a6afa5400ef89737361c5e6f47c18cb313'
PINNED_RESULT_SHA256 = '25d32e2c432807808214ad131f790ebdb07347806269a23859cdc69b9d102460'
MIGRATION = '20261018153000_training_conditional_flow'
ADDED_COLUMNS = {
    'composite_assessments': {'training_flow_draft': 'jsonb', 'training_flow_frozen': 'jsonb', 'training_flow_digest': 'text'},
    'composite_assessment_attempts': {'training_flow_snapshot_encrypted': 'text', 'training_flow_snapshot_hash': 'text',
        'training_flow_path_encrypted': 'text', 'training_flow_path_hash': 'text'},
}

class Database(old.Database):
    def restore(self, database, target, label):
        assert re.fullmatch(r'eduk12_c19_[a-z_]+', database), 'restore destination must be a new C19 private database'
        self.sql('CREATE DATABASE ' + quote(database), 'postgres')
        self.run([self.pg / 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-h', '127.0.0.1',
                  '-p', self.owner.port, '-U', self.owner.username, '-d', database, target], label, self.auth)

    def snapshot(self, database='eduk12_recovery'):
        snapshot = super().snapshot(database)
        snapshot['allPublicUserGuards'] = self.guards(sorted(snapshot['columns']), database)
        return snapshot

    def original_rows_unchanged(self, original, database='eduk12_recovery'):
        metadata = self.column_metadata(database)
        for table, columns in original['columnMetadata'].items():
            retained = [column for column in metadata[table] if column['column'] in original['columns'][table]]
            assert retained == columns, f'{table}: an original column definition changed'
        current = self.rows(original['columns'], database)
        for table, rows in original['rows'].items():
            before = Counter(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in rows)
            after = Counter(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in current[table])
            assert not before - after, f'{table}: an original full logical row changed or disappeared'
        assert self.guards(sorted(original['columns']), database) == original['allPublicUserGuards'], 'an original trigger/function/guard changed'
        assert self.constraints(database) == original['constraints'], 'an original constraint changed'
        return {'oldTables': len(original['columns']), 'oldRows': sum(map(len, original['rows'].values())),
                'historicalRowsSha256': digest(original['rows']), 'allOriginalRowsRetained': True,
                'guardsUnchanged': True, 'constraintsUnchanged': True}
