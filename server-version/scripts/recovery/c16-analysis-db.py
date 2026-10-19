"""Private loopback DB helpers shared by C16-only migration/restore checks."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse, unquote


def quote(value):
    return '"' + value.replace('"', '""') + '"'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


class Database:
    def __init__(self, tools, state):
        self.tools, self.state = tools.resolve(), state.resolve()
        self.backend = Path(__file__).resolve().parents[2] / 'backend'
        self.node, self.pg = self.tools / 'node_modules/node/bin/node', self.tools / 'postgresql/bin'
        self.status = json.loads((state / 'status.json').read_text())
        self.runtime = json.loads((state / 'runtime-private.json').read_text())
        self.owner, self.role = (urlparse(self.runtime[key]) for key in ['DATABASE_URL_OWNER', 'DATABASE_URL'])
        assert self.owner.hostname == self.role.hostname == '127.0.0.1'
        assert self.owner.path == self.role.path == '/eduk12_recovery'
        assert self.owner.username == 'eduk12_owner' and self.role.username == 'eduk12_runtime'
        assert self.owner.port == self.role.port == self.status['ports']['postgres']
        self.env = {'PATH': f'{self.node.parent}:{self.pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state), 'LANG': 'C.UTF-8', 'TZ': 'UTC', 'NODE_ENV': 'test'}
        self.auth = {'PGPASSWORD': unquote(self.owner.password)}
        self.psql = [self.pg / 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', self.owner.port, '-U', self.owner.username]
        self.exits = {}

    def run(self, command, label, extra=None, out=None):
        target = out or self.state
        with (target / (label + '.log')).open('w') as log:
            process = subprocess.run(list(map(str, command)), cwd=self.backend, env={**self.env, **(extra or {})}, stdout=log, stderr=log, timeout=240)
        self.exits[label] = process.returncode
        (target / (label + '.exit')).write_text(str(process.returncode) + '\n')
        assert process.returncode == 0, f'{label} failed; see private log'

    def sql(self, query, database='eduk12_recovery'):
        return subprocess.check_output(list(map(str, [*self.psql, '-A', '-t', '-d', database, '-c', query])), cwd=self.backend, env={**self.env, **self.auth}, text=True).strip()

    def url(self, identity, database):
        return identity._replace(netloc=f'{identity.username}:{identity.password}@127.0.0.1:{identity.port}', path='/' + database, query='connection_limit=6').geturl()

    def columns(self, database='eduk12_recovery'):
        return json.loads(self.sql("SELECT coalesce(jsonb_object_agg(table_name, cols),'{}'::jsonb)::text FROM (SELECT table_name,jsonb_agg(column_name ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) s", database))

    def rows(self, tables, database='eduk12_recovery'):
        return {table: json.loads(self.sql(f"SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY to_jsonb(v)::text),'[]'::jsonb)::text FROM (SELECT {','.join(quote(column) for column in columns)} FROM {quote(table)}) v", database)) for table, columns in sorted(tables.items())}

    def projection(self, tables, database='eduk12_recovery'):
        return {table: {'rows': len(rows), 'sha256': digest(rows)} for table, rows in self.rows(tables, database).items()}

    def apply_role(self, database):
        policy = (self.backend / 'scripts/runtime-table-policy.json').read_text()
        self.run([*self.psql, '-d', database, '-v', f'target_database={database}', '-v', 'migration_owner=eduk12_owner', '-v', 'runtime_role=eduk12_runtime', '-v', f'table_policy={policy}', '-f', 'scripts/runtime-role-defaults.sql'], database + '-acl', self.auth)
        runtime_url = self.url(self.role, database)
        self.run([self.node, 'scripts/runtime-role-contract.mjs', 'verify-current'], database + '-runtime-role', {'DATABASE_URL': runtime_url, 'DATABASE_URL_RUNTIME': runtime_url})

    def dump(self, database, target, label):
        self.run([self.pg / 'pg_dump', '-Fc', '--no-owner', '--no-acl', '-h', '127.0.0.1', '-p', self.owner.port, '-U', self.owner.username, '-d', database, '-f', target], label, self.auth)
        return hashlib.sha256(target.read_bytes()).hexdigest()

    def restore(self, database, target, label):
        assert database.startswith('eduk12_c16_')
        self.sql('CREATE DATABASE ' + quote(database), 'postgres')
        self.run([self.pg / 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-h', '127.0.0.1', '-p', self.owner.port, '-U', self.owner.username, '-d', database, target], label, self.auth)
