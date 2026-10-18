"""C18 private PostgreSQL evidence helpers. Never writes to the C16 source.

Reuses the existing C16 connection/role implementation, with a separate C18
restore namespace. Projection bytes are canonical logical column values, not
physical PostgreSQL pages (which necessarily change when a cluster starts).
"""
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import uuid

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('c18_c16_db', BASE / 'c16-analysis-db.py')
_old = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_old)
quote, digest = _old.quote, _old.digest
NEW_TABLES = sorted(['anonymous_study_consent_versions', 'anonymous_study_consent_acceptances',
                    'anonymous_study_research_states', 'anonymous_study_research_audit'])
QUALITY_TABLES = ['training_analysis_quality', 'training_analysis_quality_audit']
PINNED_DUMP_SHA256 = '8918ed028d494ff2a90f6199b363c636efd643b18036a96f19a43863025db6f9'


def sha_file(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def fresh_prisma(backend):
    """Verify generated schema agreement; generation itself precedes input freeze."""
    def tokens(path):
        raw = [v for v in re.findall(r'"(?:\\.|[^"\\])*"|//[^\n]*|/\*[\s\S]*?\*/|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|[^\s]', path.read_text())
               if not v.startswith(('//', '/*'))]
        # Prisma's formatter reorders field attributes and model @@ attributes.
        # Normalize those orders only; identifiers, arguments and field order
        # remain exact, so this is not a relaxed schema compatibility check.
        result, model_attributes, index = [], [], 0
        def attribute_end(start, double=False):
            end = start + (3 if double else 2)
            while end < len(raw) and raw[end] == '.':
                end += 2
            if end < len(raw) and raw[end] == '(':
                depth, end = 1, end + 1
                while depth:
                    depth += (raw[end] == '(') - (raw[end] == ')')
                    end += 1
            return end
        while index < len(raw):
            if raw[index:index + 2] == ['@', '@']:
                end = attribute_end(index, True)
                model_attributes.append(raw[index:end])
                index = end
            elif raw[index] == '@':
                attributes = []
                while index < len(raw) and raw[index] == '@' and raw[index:index + 2] != ['@', '@']:
                    end = attribute_end(index)
                    attributes.append(raw[index:end])
                    index = end
                for attribute in sorted(attributes):
                    result.extend(attribute)
            else:
                if raw[index] == '}':
                    for attribute in sorted(model_attributes):
                        result.extend(attribute)
                    model_attributes = []
                result.append(raw[index])
                index += 1
        return result
    source = backend / 'prisma/schema.prisma'
    client = backend / 'node_modules/.prisma/client/schema.prisma'
    assert tokens(source) == tokens(client), 'generated Prisma schema is stale; generate before freezing inputs'
    assert (client.parent / 'index.js').is_file()
    return {'sourceSchemaSha256': sha_file(source), 'generatedSchemaSha256': sha_file(client),
            'generatedClientSha256': sha_file(client.parent / 'index.js'), 'schemaTokensMatch': True,
            'generationPolicy': 'PREREQUISITE_GENERATE_BEFORE_FROZEN_RUNTIME_NOT_REGENERATED_BY_HARNESS'}


def restored_column_equivalence(expected, actual):
    """Preserve every logical column property and order across pg_dump/restore.

    PostgreSQL attnum/ordinal_position retains holes left by historic dropped
    columns; pg_dump omits those dead slots. Compare visible order ranks across
    restore only. Same-database upgrade comparisons keep exact physical ordinals.
    Return the exact physical ordinal differences as evidence, never hide them.
    """
    assert set(expected) == set(actual), 'restored table set changed'
    differences = []
    for table, columns in expected.items():
        restored = actual[table]
        assert len(columns) == len(restored), f'{table}: restored column count changed'
        for rank, (before, after) in enumerate(zip(columns, restored), start=1):
            assert {**before, 'ordinal': rank} == {**after, 'ordinal': rank}, f'{table}: restored logical column definition/order changed'
            if before['ordinal'] != after['ordinal']:
                differences.append({'table': table, 'column': before['column'], 'visibleRank': rank,
                                    'sourceOrdinal': before['ordinal'], 'restoredOrdinal': after['ordinal']})
    return differences


def restored_snapshot_equivalence(expected, actual):
    differences = restored_column_equivalence(expected['columnMetadata'], actual['columnMetadata'])
    assert {k: v for k, v in expected.items() if k != 'columnMetadata'} == {k: v for k, v in actual.items() if k != 'columnMetadata'}, 'restored logical rows/schema/constraints/guards differ'
    return differences


class Database(_old.Database):
    def __init__(self, tools, state):
        super().__init__(tools, state)
        self.env['PGOPTIONS'] = '-c timezone=UTC -c statement_timeout=30000 -c lock_timeout=5000'

    def sql(self, query, database='eduk12_recovery'):
        return subprocess.check_output(list(map(str, [*self.psql, '-A', '-t', '-d', database, '-c', query])),
                                       cwd=self.backend, env={**self.env, **self.auth}, text=True, timeout=90).strip()

    def restore(self, database, target, label):
        assert re.fullmatch(r'eduk12_c18_[a-z_]+', database), 'only new private C18 databases may be restored'
        self.sql('CREATE DATABASE ' + quote(database), 'postgres')
        self.run([self.pg / 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-h', '127.0.0.1',
                  '-p', self.owner.port, '-U', self.owner.username, '-d', database, target], label, self.auth)

    def column_metadata(self, database='eduk12_recovery'):
        return json.loads(self.sql("""SELECT coalesce(jsonb_object_agg(table_name,cols),'{}'::jsonb)::text FROM (
          SELECT table_name,jsonb_agg(jsonb_build_object('column',column_name,'ordinal',ordinal_position,
          'type',data_type,'udtSchema',udt_schema,'udt',udt_name,'nullable',is_nullable,'default',column_default,
          'characterLength',character_maximum_length,'numericPrecision',numeric_precision,'numericScale',numeric_scale,
          'datetimePrecision',datetime_precision,'identity',is_identity,'generated',is_generated,'generation',generation_expression)
          ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) s""", database))

    def guards(self, tables, database='eduk12_recovery'):
        names = ','.join("'" + table.replace("'", "''") + "'::regclass" for table in tables)
        return json.loads(self.sql(f"""SELECT coalesce(jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,
          'name',t.tgname,'enabled',t.tgenabled,'deferrable',t.tgdeferrable,'initiallyDeferred',t.tginitdeferred,
          'trigger',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid)) ORDER BY t.tgrelid::regclass::text,t.tgname),'[]'::jsonb)
          FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ({names})""", database))

    def constraints(self, database='eduk12_recovery'):
        return json.loads(self.sql("""SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,
          'name',c.conname,'type',c.contype,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid))
          ORDER BY c.conrelid::regclass::text,c.conname),'[]'::jsonb) FROM pg_constraint c
          JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.conrelid<>0""", database))

    def snapshot(self, database='eduk12_recovery'):
        columns = self.columns(database)
        return {'columns': columns, 'columnMetadata': self.column_metadata(database),
                'projection': self.projection(columns, database), 'constraints': self.constraints(database),
                'governanceGuards': self.guards(NEW_TABLES, database), 'qualityGuards': self.guards(QUALITY_TABLES, database)}

    def original_rows_unchanged(self, original, database='eduk12_recovery'):
        current_columns = self.column_metadata(database)
        assert all(current_columns[t] == v for t, v in original['columnMetadata'].items()), 'old column definitions changed'
        current = self.rows(original['columns'], database)
        for table, rows in original['rows'].items():
            # The ledger gets one new row; all prior ledger rows still must survive.
            before = Counter(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in rows)
            after = Counter(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in current[table])
            assert not before - after, f'{table}: an original full logical row changed or disappeared'
        for table, count in [('training_analysis_quality', 5), ('training_analysis_quality_audit', 7)]:
            assert len(original['rows'][table]) == count
            assert current[table] == original['rows'][table], f'{table}: C18 must not change the accepted C16 quality facts'
        for table in ['export_batches', 'export_artifacts']:
            assert len(original['rows'][table]) == 17
        return {'oldTables': len(original['columns']), 'oldRows': sum(map(len, original['rows'].values())),
                'qualityRows': 5, 'qualityAuditRows': 7, 'retainedExportBatches': 17, 'retainedExportArtifacts': 17}

    def governance_guard_probe(self, database='eduk12_recovery'):
        """Real restricted-principal, rollback-only probes; no fixture survives."""
        from urllib.parse import unquote
        baseline = self.projection(self.columns(database), database)
        owner = self.sql("SELECT id FROM users WHERE role::text IN ('TEACHER','ADMIN') ORDER BY id LIMIT 1", database)
        assert owner and '\n' not in owner
        literal = lambda value: "'" + value.replace("'", "''") + "'"
        scope = {'purpose': 'C18 rollback-only governance probe', 'dataCategories': ['FORM'], 'waveCoverage': 'EXISTING_AND_FUTURE'}
        body = 'C18 rollback-only synthetic consent text.'
        checks = []
        probes = [
            ('consent-immutable', 'UPDATE anonymous_study_consent_versions SET body=body WHERE id={v}', 'append-only'),
            ('acceptance-immutable', 'DELETE FROM anonymous_study_consent_acceptances WHERE id={a}', 'append-only'),
            ('audit-immutable', 'UPDATE anonymous_study_research_audit SET reason=reason WHERE id={a}', 'append-only'),
            ('state-retained', 'DELETE FROM anonymous_study_research_states WHERE participant_id={p}', 'history is retained'),
            ('unaudited-commit', 'SET CONSTRAINTS anonymous_study_research_requires_audit DEFERRED; UPDATE anonymous_study_research_states SET status=\'WITHDRAWAL_PENDING\',revision=2 WHERE participant_id={p}; COMMIT', 'requires immutable audit'),
            ('audit-binding', "INSERT INTO anonymous_study_research_audit(id,study_id,participant_id,acceptance_id,status,previous_status,revision) VALUES({b},{s},{p},{a},'CONSENTED','CONSENTED',2)", 'must bind current decision'),
        ]
        for label, mutation, expected in probes:
            ids = {key: str(uuid.uuid4()) for key in ['s', 'p', 'v', 'a', 'b']}
            values = {key: literal(value) for key, value in ids.items()}
            full_scope = {'scopeId': ids['s'], **scope}
            sql = f"""BEGIN;
              INSERT INTO anonymous_studies(id,owner_user_id,title) VALUES({values['s']},{literal(owner)},'C18 rollback-only probe');
              INSERT INTO anonymous_study_participants(id,study_id,credential_hash,display_code)
                VALUES({values['p']},{values['s']},{literal(hashlib.sha256(ids['p'].encode()).hexdigest())},'C18PROBE');
              INSERT INTO anonymous_study_consent_versions(id,study_id,version,body,body_hash,published_by,scope_id,scope,scope_hash)
                VALUES({values['v']},{values['s']},1,{literal(body)},{literal(hashlib.sha256(body.encode()).hexdigest())},
                  {literal(owner)},{values['s']},{literal(json.dumps(scope))}::jsonb,{literal(digest(full_scope))});
              INSERT INTO anonymous_study_consent_acceptances(id,study_id,participant_id,version_id,body_hash)
                VALUES({values['a']},{values['s']},{values['p']},{values['v']},{literal(hashlib.sha256(body.encode()).hexdigest())});
              INSERT INTO anonymous_study_research_states(participant_id,study_id,acceptance_id,status,revision)
                VALUES({values['p']},{values['s']},{values['a']},'CONSENTED',1);
              INSERT INTO anonymous_study_research_audit(id,study_id,participant_id,acceptance_id,status,previous_status,revision)
                VALUES({values['a']},{values['s']},{values['p']},{values['a']},'CONSENTED','UNKNOWN',1);
              SET CONSTRAINTS anonymous_study_research_requires_audit IMMEDIATE;
              SELECT 'C18_PROBE_SETUP_OK',current_user;
              {mutation.format(**values)};
              ROLLBACK;"""
            command = [self.pg / 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
                       '-h', '127.0.0.1', '-p', self.role.port, '-U', self.role.username, '-d', database]
            process = subprocess.run(list(map(str, command)), input=sql, text=True, capture_output=True, timeout=30,
                                     cwd=self.backend, env={**self.env, 'PGPASSWORD': unquote(self.role.password)})
            output = process.stdout + process.stderr
            (self.state / f'{database}-{label}.log').write_text(output)
            self.exits[f'{database}-{label}'] = process.returncode
            assert 'C18_PROBE_SETUP_OK|eduk12_runtime' in process.stdout, f'{label}: fixture failed before the guard probe'
            assert process.returncode != 0 and 'P0001' in process.stderr and expected in process.stderr, f'{label}: expected database guard denial absent'
            checks.append({'guard': label, 'role': 'eduk12_runtime', 'exit': process.returncode, 'sqlState': 'P0001'})
        assert self.projection(self.columns(database), database) == baseline, 'rollback-only guard probes left persisted changes'
        return {'probes': checks, 'allRowsUnchanged': True}
