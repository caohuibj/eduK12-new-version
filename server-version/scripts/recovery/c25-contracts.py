"""Closed C25 artifact acceptance. No compiler, database or service is started here."""
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
BACKEND = REPO / 'server-version/backend'
FRONTEND = REPO / 'server-version/frontend'
QUALIFICATION_PATHS = ['server-version/backend', 'server-version/frontend', 'server-version/scripts/recovery']
PHASES = ['upgrade', 'prepare', 'scheduled', 'guards', 'consumers', 'restore']
PHASE_SECONDS = {'upgrade': 600, 'prepare': 300, 'scheduled': 600, 'guards': 300, 'consumers': 300, 'restore': 600}
FLOOR, RESERVE, MEMORY = 8*1024**3, 512*1024**2, 2*1024**3


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, BASE/filename)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


prior = module('c25_unchanged_deadline_contracts', 'c23-checkpoint-preflight.py')
clone_budget, accepted_binding = prior.clone_budget, prior.accepted_binding
wait_child, finish_database, service_exit = prior.wait_child, prior.finish_database, prior.service_exit


def sha_file(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024*1024), b''):
            value.update(block)
    return value.hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def git(*args, repo=REPO):
    return subprocess.check_output(['git', *args], cwd=repo, timeout=15)


def clean(expected_head, repo=REPO):
    assert git('rev-parse', 'HEAD', repo=repo).decode().strip() == expected_head, 'HEAD changed'
    assert subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--', *QUALIFICATION_PATHS], cwd=repo, timeout=15).returncode == 0, 'qualified source has uncommitted changes'
    assert not git('ls-files', '--others', '--exclude-standard', '-z', '--', *QUALIFICATION_PATHS, repo=repo), 'untracked qualification source'


def source_inventory(repo=REPO, paths=QUALIFICATION_PATHS):
    result = {}
    for raw in sorted(git('ls-files', '-z', '--', *paths, repo=repo).split(b'\0')):
        if not raw:
            continue
        relative = os.fsdecode(raw)
        file = repo/relative
        assert file.is_file() and not file.is_symlink(), 'source must be a regular tracked file'
        result[relative] = {'realpath': str(file.resolve()), 'mode': file.stat().st_mode & 0o777, 'sha256': sha_file(file)}
    assert result
    return result


def dependency_inventory(component):
    result = {}
    for directory, dirs, files in os.walk(component/'node_modules', followlinks=True):
        dirs[:] = sorted(d for d in dirs if d not in ['.cache', '.vite', '.vite-temp'])
        for name in sorted(files):
            file = Path(directory)/name
            if file.is_file():
                result[str(file.relative_to(component))] = {'realpath': str(file.resolve()), 'sha256': sha_file(file)}
    assert result, 'missing installed dependency closure'
    return result


def file_inventory(component, subdirectory):
    root = component/subdirectory
    assert root.is_dir()
    result = {}
    for file in sorted(root.rglob('*')):
        assert not file.is_symlink(), 'artifact symlink is forbidden'
        if file.is_file():
            result[str(file.relative_to(component))] = sha_file(file)
    assert result, 'empty artifact inventory'
    return result


def component_inputs(component, repo=REPO):
    """Tracked component closure plus actual source/config/env inputs.

    Ignored .env.local or an extra ignored source file can affect a compiler,
    so clean Git status alone is insufficient. Bind those bytes as well.
    """
    prefix = str(component.relative_to(repo))
    result = {name[len(prefix)+1:]: entry['sha256'] for name, entry in source_inventory(repo, [prefix]).items()}
    paths = list(component.iterdir())
    for root in ['src', 'prisma', 'public', 'scripts']:
        if (component/root).exists():
            paths.extend((component/root).rglob('*'))
    for file in paths:
        if file.is_file():
            assert not file.is_symlink(), 'source/config symlink is forbidden'
            result[str(file.relative_to(component))] = sha_file(file)
    return result


def private_run_path(path, kind, root=REPO.parent):
    """Use only dedicated new C25 destinations, never an old recovery tree."""
    path = Path(os.path.abspath(path))
    for ancestor in [path, *path.parents]:
        assert not ancestor.is_symlink(), 'private destination has a symlink ancestor'
    assert kind in ['producer', 'runtime']
    parent = root/'c25-build-evidence' if kind == 'producer' else root
    assert path.parent == parent, 'destination must be a direct child of its dedicated C25 parent'
    pattern = r'[a-z0-9][a-z0-9-]{0,100}' if kind == 'producer' else r'eduk12_c25_http_[0-9]{2}'
    assert re.fullmatch(pattern, path.name), 'unexpected C25 destination name'
    assert parent.is_dir() and not path.exists(), 'destination must be new, under an existing directory'
    return path


def backend_compiler(backend=BACKEND):
    names = ['node_modules/typescript/bin/tsc', 'node_modules/typescript/lib/_tsc.js', 'node_modules/typescript/package.json']
    return {name: sha_file(backend/name) for name in names}


def frontend_compiler(frontend=FRONTEND):
    names = ['node_modules/vite/bin/vite.js', 'node_modules/vite/package.json']
    return {name: sha_file(frontend/name) for name in names}


def build_changes(paths):
    # Unlike C23, even a post-producer migration edit requires a new review.
    assert all(path.startswith('server-version/scripts/recovery/c25-') for path in paths), 'producer reuse permits only C25 harness changes'


def validate_source_reuse(recorded, current, changed):
    """Compiler inputs stay exact; later C25 harness bytes get their own runtime binding.

    The current-client Python-helper check separately forbids changing consumed
    Python after verification. This exception cannot authorize business bytes.
    """
    build_changes(changed)
    differences = {name for name in set(recorded) | set(current) if recorded.get(name) != current.get(name)}
    assert differences <= set(changed), 'producer source closure differs outside committed C25 harness changes'


def emitted_build(steps, component, node, kind):
    expected = [str(node), 'node_modules/typescript/bin/tsc'] if kind == 'backend' else [str(node), 'node_modules/vite/bin/vite.js', 'build']
    expected_names = ['verify-current-client', 'backend-emit'] if kind == 'backend' else ['frontend-emit']
    assert [step.get('name') for step in steps] == expected_names, 'exact ordered producer steps required; no alternate or duplicate emit'
    assert all(step.get('exitCode') == 0 and step.get('cwd') == str(component) for step in steps)
    assert steps[-1].get('command') == expected, 'one exact successful emitting command required'
    if kind == 'backend':
        command = steps[0].get('command', [])
        assert len(command) == 10 and command[:6] == [sys.executable, str(BASE/'c25-verify-client.py'), '--backend', str(component), '--node', str(node)]
        assert command[6] == '--expected-head' and command[8] == '--receipt'


def validate_client(path, expected_sha, node, expected_head, repo=REPO, backend=BACKEND):
    assert sha_file(path) == expected_sha
    receipt = json.loads(Path(path).read_text())
    verifier = module('c25_current_client_contract', 'c25-verify-client.py')
    assert receipt['scope'] == 'EXISTING_GENERATED_CLIENT_VERIFIED_NOT_GENERATION_PROVENANCE'
    assert all(receipt.get(key) is True for key in ['passed', 'inputsUnchanged', 'clientUnchanged', 'dependenciesUnchanged', 'pythonHelpersUnchanged', 'installedNativeEngineMatches', 'pythonUnchanged', 'compilerUnchanged'])
    assert receipt['nodeVersion'] == 'v24.21.0' and receipt['nodeSha256'] == sha_file(node)
    assert subprocess.run(['git', 'merge-base', '--is-ancestor', receipt['head'], expected_head], cwd=repo, timeout=15).returncode == 0
    changed = git('diff', '--name-only', receipt['head'], expected_head, repo=repo).decode().splitlines()
    build_changes(changed)
    assert receipt['verificationToolSha256'] == sha_file(BASE/'c25-verify-client.py')
    assert receipt['pythonHelperClosure'] == verifier.python_helper_closure(BASE), 'current-client consumed Python helpers changed'
    assert receipt['python'] == verifier.python_identity(), 'current-client Python executable changed'
    assert receipt['compiler'] == backend_compiler(backend), 'current-client compiler bytes changed'
    assert receipt['dependencies'] == dependency_inventory(backend)
    assert receipt['client'] == file_inventory(backend, 'node_modules/.prisma/client')
    assert receipt['inputs'] == {name: sha_file(backend/name) for name in receipt['inputs']}
    assert set(receipt['inputs']) == {'prisma/schema.prisma', 'package.json', 'package-lock.json', 'tsconfig.json'}
    assert receipt['schemaAgreement'] == verifier.schema_agreement(backend)
    assert all(receipt['runtimeMetadata'].get(key) is True for key in ['inlineSchemaExact', 'runtimeFieldMetadataMatches', 'modelMappingsMatch', 'enumValuesAndMappingsMatch'])
    return receipt


def validate_build(path, expected_sha, kind, expected_head, node, repo=REPO):
    clean(expected_head, repo)
    assert sha_file(path) == expected_sha
    receipt = json.loads(Path(path).read_text())
    component = repo/'server-version'/kind
    producer_result = json.loads(Path(receipt['producerResultPath']).read_text())
    assert producer_result.get('passed') is True and producer_result.get('kind') == kind
    assert producer_result['receipt'] == {'path': str(Path(path).resolve()), 'sha256': expected_sha}, 'producer final result does not accept this exact receipt'
    assert receipt['scope'] == 'C25_'+kind.upper()+'_SINGLE_EMITTING_BUILD'
    assert all(receipt.get(key) is True for key in ['passed', 'inputsUnchanged', 'dependenciesUnchanged', 'clientUnchanged', 'sourceHelpersUnchanged', 'compilerUnchanged', 'toolsUnchanged'])
    assert receipt['nodeVersion'] == 'v24.21.0' and receipt['nodeSha256'] == sha_file(node)
    assert subprocess.run(['git', 'merge-base', '--is-ancestor', receipt['head'], expected_head], cwd=repo, timeout=15).returncode == 0
    changed = git('diff', '--name-only', receipt['head'], expected_head, repo=repo).decode().splitlines()
    build_changes(changed)
    emitted_build(receipt['steps'], component, node, kind)
    assert receipt['inputs'] == component_inputs(component, repo)
    assert receipt['dependencies'] == dependency_inventory(component)
    assert receipt['dist'] == file_inventory(component, 'dist')
    expected_entry = 'dist/index.js' if kind == 'backend' else 'dist/index.html'
    assert expected_entry in receipt['dist']
    compiler = backend_compiler(component) if kind == 'backend' else frontend_compiler(component)
    assert receipt['compiler'] == compiler
    validate_source_reuse(receipt['sourceHelperClosure'], source_inventory(repo), changed)
    assert all(sha_file(Path(name)) == value['sha256'] and str(Path(name).resolve()) == value['realpath'] for name, value in receipt['tools'].items())
    assert receipt['producer'] == {'path': str(BASE/'c25-produce.py'), 'sha256': sha_file(BASE/'c25-produce.py')}
    ref = receipt['prismaClientReceipt']
    if kind == 'backend':
        assert receipt['steps'][0]['command'][7:] == [receipt['head'], '--receipt', ref['path']]
    client = validate_client(Path(ref['path']), ref['sha256'], node, expected_head, repo, repo/'server-version/backend')
    assert receipt['client'] == client['client']
    if kind == 'backend':
        assert receipt['dependencies'] == client['dependencies']
        config = json.loads((component/'tsconfig.json').read_text())['compilerOptions']
        assert config.get('noEmit', False) is False and config.get('emitDeclarationOnly', False) is False and config['outDir'] == './dist'
    for item in receipt['closureEvidence'].values():
        assert sha_file(item['path']) == item['sha256']
    before, after = [json.loads(Path(receipt['closureEvidence'][key]['path']).read_text()) for key in ['before', 'after']]
    assert before == after, 'producer before/after closure differs'
    for key in ['inputs', 'dependencies', 'client', 'compiler', 'sourceHelperClosure', 'tools']:
        assert before[key] == receipt[key], 'receipt is not bound to captured producer closure'
    return receipt


class ApiLifetime:
    """Independent elapsed-time interrupt; phase/audit polling is insufficient.

    Signal scheduling/clock/writer termination are injected so fault tests never
    start a service, wait 45 minutes, send a real signal or modify the OS clock.
    """
    def __init__(self, clock, schedule, terminate_writers, seconds=2700):
        assert 0 < seconds <= 2700
        self.clock, self.schedule, self.terminate_writers = clock, schedule, terminate_writers
        self.seconds, self.started, self.deadline = seconds, None, None
        self.stopped = self.expired = False

    def start(self):
        assert self.started is None and not self.stopped, 'API lifetime cannot restart or extend its deadline'
        self.started = self.clock()
        self.deadline = self.started + self.seconds
        self.schedule(self.seconds)

    def interrupt(self, *_):
        if self.deadline is None or self.stopped:
            return
        remaining = self.deadline - self.clock()
        if remaining > 0:
            self.schedule(remaining)  # An early external signal never moves T0.
            return
        self.expired = True
        self.schedule(0)
        try:
            self.terminate_writers()
        finally:
            raise TimeoutError('independent API lifetime deadline exceeded')

    def stop(self):
        self.schedule(0)
        self.stopped = True

    def evidence(self):
        return {'limitSeconds': self.seconds, 'startedMonotonic': self.started,
                'deadlineMonotonic': self.deadline, 'stopped': self.stopped,
                'expired': self.expired, 'restartAllowed': False}


def complete(result):
    return (set(result.get('phases', {})) == set(PHASES)
            and all(result['phases'][phase].get('passed') is True for phase in PHASES)
            and all(result.get(key) is True for key in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged', 'finalSnapshotVerified', 'apiStoppedAfterScheduled'])
            and result.get('apiLifetime', {}).get('stopped') is True
            and result.get('apiLifetime', {}).get('expired') is False)
