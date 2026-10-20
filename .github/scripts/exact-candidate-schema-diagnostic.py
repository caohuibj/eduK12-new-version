"""Failed schema-comparison diagnosis only; never grants runtime qualification."""
import argparse
import difflib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import time
import zipfile

SPEC = importlib.util.spec_from_file_location('exact_runtime', Path(__file__).with_name('exact-candidate-runtime.py'))
RUNTIME = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNTIME)

# Original failed phase: official run 39442752356, artifact 12274733369.
POSTGRES = 'postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4'
NODE_TOOL = 'node:24.21.0-bookworm'
ACL_FIXTURE = (
    'CREATE ROLE exact_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; '
    'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO exact_runtime; '
    'GRANT SELECT ON measurement_content_releases,measurement_reference_candidates,measurement_reference_reviews TO exact_runtime;'
)


def comparison(original, restored):
    # Identical to the failed comparator. No new normalization or ignored DDL.
    texts = ['\n'.join(line for line in raw.splitlines() if not line.startswith(('\\restrict ', '\\unrestrict ')))
             for raw in (original, restored)]
    lines = list(difflib.unified_diff(texts[0].splitlines(), texts[1].splitlines(),
                                    fromfile='synthetic-original-schema', tofile='synthetic-restored-schema', n=4))
    changed = [line for line in lines[2:] if line[:1] in ('+', '-')]
    details = {
        'schemasEqual': texts[0] == texts[1],
        'schemaSha256': [RUNTIME.digest(text.encode()) for text in texts],
        'diffLineCount': len(lines),
        'addedLineCount': sum(line.startswith('+') for line in changed),
        'removedLineCount': sum(line.startswith('-') for line in changed),
        'changedCommentLineCount': sum(line[1:].lstrip().startswith('--') for line in changed),
        'changedNonCommentLineCount': sum(bool(line[1:].strip()) and not line[1:].lstrip().startswith('--') for line in changed),
    }
    return details, '\n'.join(lines) + ('\n' if lines else '')


def backend_tooling(q):
    """Re-materialize only the exact original Prisma tooling; no compilation."""
    pin = q.inputs['components']['backend']
    RUNTIME.validate_producer(pin, q.api('/actions/runs/' + pin['runId']),
                              q.api('/actions/jobs/' + str(pin['jobId'])),
                              q.api('/actions/artifacts/' + str(pin['artifactId'])))
    archive = q.private / 'backend-official.zip'
    q.download(pin, archive)
    compiled = q.private / 'backend-build.tar.gz'
    with zipfile.ZipFile(archive) as zipped:
        RUNTIME.require(set(zipped.namelist()) == {'backend-build.json', 'backend-build.tar.gz'} and len(zipped.namelist()) == 2, 'Unexpected ZIP members')
        receipt = RUNTIME.validate_receipt('backend', pin, zipped.read('backend-build.json'))
        with zipped.open('backend-build.tar.gz') as source, compiled.open('wb') as target:
            shutil.copyfileobj(source, target)
    RUNTIME.require(RUNTIME.sha(compiled) == pin['archiveSha256'], 'Changed compiled archive')
    context = q.private / 'backend'
    RUNTIME.require(not context.exists(), 'Existing diagnostic context')
    source = q.private / 'backend-source.tar'
    q.command(['git', 'archive', '--format=tar', '--output=' + str(source), 'HEAD:server-version/backend'])
    RUNTIME.safe_extract(source, context)
    RUNTIME.safe_extract(compiled, context, {'dist', 'node_modules'})
    for path, expected in receipt['requiredFiles'].items():
        RUNTIME.require(RUNTIME.sha(context / path) == expected, 'Changed required original tooling/source')
    return context


def diagnose(q, result):
    RUNTIME.validate_plan(q.plan, q.inputs)
    RUNTIME.require(os.environ.get('CI') == os.environ.get('GITHUB_ACTIONS') == 'true', 'Official isolated Actions only')
    RUNTIME.require(os.environ.get('GITHUB_SHA') == q.plan['head'] and os.environ.get('GITHUB_REPOSITORY') == 'caohuibj/eduK12-new-version', 'Wrong diagnostic source')
    context = backend_tooling(q)
    node = q.base_image(NODE_TOOL)
    q.command(['docker', 'pull', POSTGRES], timeout=600)
    postgres = json.loads(q.command(['docker', 'image', 'inspect', POSTGRES]).stdout)[0]
    RUNTIME.require(POSTGRES in postgres['RepoDigests'] and postgres['Architecture'] == 'amd64', 'Changed PostgreSQL diagnostic base')
    result.update(backendProducer=q.producer('backend'), nodeToolImage=node, postgresImage=POSTGRES,
                  setup='candidate migrations directly; no historical application or data gate replay')
    name, network, migrator = (q.prefix + suffix for suffix in ('-diag-postgres', '-diag-network', '-diag-migrator'))
    owner = 'exact_owner'
    databases = ('exact_upgrade_test', 'exact_restore_test')
    attempted_network = attempted_container = attempted_migrator = False
    try:
        existing = q.command(['docker', 'container', 'ls', '--all', '--format', '{{.Names}}']).stdout.splitlines()
        RUNTIME.require(name not in existing and migrator not in existing, 'Diagnostic container name exists')
        RUNTIME.require(network not in q.command(['docker', 'network', 'ls', '--format', '{{.Name}}']).stdout.splitlines(), 'Diagnostic network name exists')
        attempted_network = True
        q.command(['docker', 'network', 'create', '--internal', network])
        attempted_container = True
        q.command(['docker', 'run', '-d', '--name', name, '--network', network,
                   '--tmpfs', '/var/lib/postgresql/data:rw', '-e', 'POSTGRES_USER=' + owner,
                   '-e', 'POSTGRES_PASSWORD=synthetic-only', '-e', 'POSTGRES_DB=' + databases[0], POSTGRES])
        for _ in range(60):
            if q.command(['docker', 'exec', name, 'pg_isready', '-U', owner, '-d', databases[0]], accepted=(0, 1, 2)).returncode == 0:
                break
            time.sleep(1)
        else:
            raise ValueError('Disposable diagnostic PostgreSQL not ready')
        url = f'postgresql://{owner}:synthetic-only@{name}:5432/{databases[0]}?schema=public'
        attempted_migrator = True
        q.command(['docker', 'run', '--rm', '--name', migrator, '--network', network,
                   '--mount', f'type=bind,src={context},dst=/app,readonly', '-w', '/app',
                   '-e', 'DATABASE_URL=' + url, node, 'node', '/app/node_modules/prisma/build/index.js',
                   'migrate', 'deploy', '--schema', '/app/prisma/schema.prisma'], timeout=240)
        q.command(['docker', 'exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                   '-U', owner, '-d', databases[0]], input=ACL_FIXTURE)
        # Only schema definitions are needed to diagnose the failing comparison.
        # No synthetic row/data assertions from the successful path are replayed.
        dump = q.command(['docker', 'exec', name, 'pg_dump', '-U', owner, '-d', databases[0],
                          '-Fc', '--no-owner'], binary=True, timeout=180).stdout
        q.command(['docker', 'exec', name, 'createdb', '-U', owner, databases[1]])
        q.command(['docker', 'exec', '-i', name, 'pg_restore', '--exit-on-error', '--no-owner',
                   '-U', owner, '-d', databases[1]], input=dump, binary=True, timeout=180)
        schemas = [q.command(['docker', 'exec', name, 'pg_dump', '-U', owner, '-d', database,
                              '--schema-only', '--no-owner']).stdout for database in databases]
        details, delta = comparison(*schemas)
        result.update(details)
        # The source is a new synthetic cluster containing public repository DDL
        # only. Roles/connection arguments and table data are not schema dumps.
        (q.out / 'schema-diagnostic.diff.txt').write_text(delta)
        result.update(diffSha256=RUNTIME.digest(delta.encode()), status='diagnostic-completed')
    finally:
        cleanup_errors = []
        for container, attempted, remove_network in ((migrator, attempted_migrator, False), (name, attempted_container, attempted_network)):
            try:
                RUNTIME.remove_isolated_resources(q.command, container, network, attempted, remove_network)
            except Exception as error:
                cleanup_errors.append(type(error).__name__)
        RUNTIME.require(not cleanup_errors, 'Diagnostic isolated resource cleanup failed')
        result['isolatedResourcesRemoved'] = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    q = None
    result = {'diagnosticOnly': True, 'qualified': False, 'originalFailedRunId': '39442752356',
              'originalFailedArtifactId': 12274733369, 'status': 'failure'}
    try:
        q = RUNTIME.Qualification(args.plan, args.output)
        result.update(q.identity)
        diagnose(q, result)
    except Exception as error:
        result.update(RUNTIME.safe_error_details(error), status='failure')
        print('Schema diagnosis failed: ' + json.dumps(RUNTIME.safe_error_details(error), sort_keys=True), file=sys.stderr)
        raise SystemExit(1) from None
    finally:
        if q is not None:
            (q.out / 'schema-diagnostic.json').write_text(json.dumps(result, indent=2) + '\n')
            shutil.rmtree(q.private)


if __name__ == '__main__':
    main()
