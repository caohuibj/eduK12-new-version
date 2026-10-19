#!/usr/bin/env python3
"""Prepared one-component C25 producer. Execution requires separate approval.

Backend: verify the existing client once, then emit once. Frontend: consume that
same client receipt and emit once. No generation, database or service startup.
"""
import argparse
import fcntl
import importlib.util
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import traceback
from pathlib import Path

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c25_producer_contracts', BASE/'c25-contracts.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--kind', choices=['backend', 'frontend'], required=True)
    p.add_argument('--tools', type=Path, required=True)
    p.add_argument('--descriptor', type=Path, required=True)
    p.add_argument('--expected-descriptor-sha256', required=True)
    p.add_argument('--expected-head', required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--client-receipt', type=Path)
    p.add_argument('--expected-client-receipt-sha256')
    a = p.parse_args()
    os.umask(0o077)
    tools = a.tools.resolve()
    source = c.module('c25_producer_source', 'c25-source.py')
    output = source.destination_path(c.private_run_path(a.output, 'producer'), source.SOURCE, protected=[tools, a.descriptor.absolute().parent, source.SOURCE.parent/'eduk12_c21_http_01'])
    node = tools/'node_modules/node/bin/node'
    component = c.REPO/'server-version'/a.kind
    lock = (tools/'.measurement.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    output.mkdir(mode=0o700)
    result = {'passed': False, 'kind': a.kind, 'expectedHead': a.expected_head, 'steps': [], 'resources': [], 'startedAt': time.time()}
    environment = {'PATH': f'{node.parent}:/usr/bin:/bin', 'HOME': str(output), 'TMPDIR': str(output), 'LANG': 'C.UTF-8', 'TZ': 'UTC', 'NODE_ENV': 'production', 'PYTHONDONTWRITEBYTECODE': '1'}
    descriptor = None
    active = None

    def write(name, value):
        with (output/name).open('x') as handle:
            json.dump(value, handle, indent=2)
            handle.write('\n')

    def resource(label, retain=True):
        clone = descriptor['plannedCloneBytes']
        free = shutil.disk_usage(output).free
        memory = next(int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
        measured = {'stage': label, 'at': time.time(), **c.clone_budget(free, clone, memory)}
        if retain:
            result['resources'].append(measured)
        result['minFreeBytes'] = min(result.get('minFreeBytes', free), free)
        result['minMemAvailableBytes'] = min(result.get('minMemAvailableBytes', memory), memory)
        return measured

    def capture():
        c.clean(a.expected_head)
        return {'head': a.expected_head, 'inputs': c.component_inputs(component), 'sourceHelperClosure': c.source_inventory(),
                'dependencies': c.dependency_inventory(component), 'client': c.file_inventory(c.BACKEND, 'node_modules/.prisma/client'),
                'compiler': c.backend_compiler() if a.kind == 'backend' else c.frontend_compiler(),
                'tools': {str(file): {'realpath': str(file.resolve()), 'sha256': c.sha_file(file)} for file in [Path(__file__), Path(sys.executable).resolve(), node, BASE/'c25-contracts.py', BASE/'c25-verify-client.py']}}

    def run(name, command, seconds):
        nonlocal active
        log = output/(name+'.log')
        entry = {'name': name, 'command': list(map(str, command)), 'cwd': str(component), 'timeoutSeconds': seconds, 'startedAt': time.time(), 'exitCode': None}
        result['steps'].append(entry)
        with log.open('xb') as handle:
            active = subprocess.Popen(entry['command'], cwd=component, env=environment, stdout=handle, stderr=subprocess.STDOUT, start_new_session=True)
            entry['pid'] = active.pid
            try:
                c.wait_child(active, seconds, lambda: resource(name, False))
            finally:
                entry.update(exitCode=active.returncode, endedAt=time.time(), log=str(log), logSha256=c.sha_file(log))
                (output/(name+'.exit')).write_text(str(active.returncode)+'\n')
                active = None
        resource(name+'-complete')

    def interrupted(*_):
        raise KeyboardInterrupt('bounded producer interrupted')

    for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP, signal.SIGALRM]:
        signal.signal(sig, interrupted)
    signal.alarm(1000 if a.kind == 'backend' else 700)
    try:
        descriptor = source.validate_descriptor(a.descriptor, a.expected_descriptor_sha256, tools/'postgresql/bin/pg_controldata')
        resource('before-producer')
        c.clean(a.expected_head)
        assert subprocess.check_output([node, '--version'], text=True, timeout=10).strip() == 'v24.21.0'
        if (component/'dist').exists():
            original = source.manifest(component/'dist')
            retained = output/'retained-prior-dist'
            assert output.stat().st_dev == (component/'dist').stat().st_dev
            os.rename(component/'dist', retained)
            assert source.manifest(retained) == original, 'retained dist bytes/metadata changed'
            write('prior-dist-relocation.json', {'source': str(component/'dist'), 'retainedPath': str(retained), 'method': 'same-filesystem rename', 'manifest': original,
                'restoreInstructions': 'Under measurement lock, stop any consumers, verify all retained bytes/path/mode/owner/mtime/xattr metadata, move a newer dist aside, then rename retained-prior-dist to the absent original dist path. This does not qualify the retained artifact.'})
        before = capture()
        write('closure-before.json', before)
        if a.kind == 'backend':
            assert a.client_receipt is None and a.expected_client_receipt_sha256 is None
            client_path = output/'current-client.receipt.json'
            run('verify-current-client', [sys.executable, BASE/'c25-verify-client.py', '--backend', c.BACKEND, '--node', node, '--expected-head', a.expected_head, '--receipt', client_path], 300)
            client_sha = c.sha_file(client_path)
        else:
            assert a.client_receipt is not None and a.expected_client_receipt_sha256
            client_path, client_sha = a.client_receipt.resolve(), a.expected_client_receipt_sha256
        client = c.validate_client(client_path, client_sha, node, a.expected_head)
        assert capture() == before, 'inputs changed during current-client acceptance'
        assert not (component/'dist').exists(), 'fresh emitting build requires absent dist'
        command = [node, 'node_modules/typescript/bin/tsc'] if a.kind == 'backend' else [node, 'node_modules/vite/bin/vite.js', 'build']
        run(a.kind+'-emit', command, 600)
        after = capture()
        write('closure-after.json', after)
        assert after == before
        assert c.sha_file(client_path) == client_sha
        c.emitted_build(result['steps'], component, node, a.kind)
        dist = c.file_inventory(component, 'dist')
        assert ('dist/index.js' if a.kind == 'backend' else 'dist/index.html') in dist
        source.assert_unchanged(descriptor, tools/'postgresql/bin/pg_controldata')
        receipt = {'passed': True, 'scope': 'C25_'+a.kind.upper()+'_SINGLE_EMITTING_BUILD', 'head': a.expected_head,
                   'producerResultPath': str(output/'producer-result.json'),
                   'nodeVersion': 'v24.21.0', 'nodeSha256': c.sha_file(node), 'producer': {'path': str(Path(__file__).resolve()), 'sha256': c.sha_file(__file__)},
                   'prismaClientReceipt': {'path': str(client_path), 'sha256': client_sha}, **before, 'dist': dist,
                   **{key: True for key in ['inputsUnchanged', 'dependenciesUnchanged', 'clientUnchanged', 'sourceHelpersUnchanged', 'compilerUnchanged', 'toolsUnchanged']},
                   'steps': result['steps'], 'executionEnvironment': environment,
                   'closureEvidence': {key: {'path': str(output/('closure-'+key+'.json')), 'sha256': c.sha_file(output/('closure-'+key+'.json'))} for key in ['before', 'after']},
                   'limitations': ['Existing generated-client consistency is not historical generation provenance.', 'No clone, migration, HTTP, browser or capacity qualification is claimed.']}
        assert client['client'] == receipt['client']
        write(a.kind+'-build.receipt.json', receipt)
        result.update(passed=True, receipt={'path': str(output/(a.kind+'-build.receipt.json')), 'sha256': c.sha_file(output/(a.kind+'-build.receipt.json'))}, distFiles=len(dist))
    except BaseException as error:
        result['errorType'] = type(error).__name__
        (output/'producer-error-private.log').write_text(traceback.format_exc())
    finally:
        signal.alarm(60)
        try:
            if descriptor is not None:
                resource('final')
                source.assert_unchanged(descriptor, tools/'postgresql/bin/pg_controldata')
        except BaseException as error:
            result.update(passed=False, finalVerificationError=type(error).__name__)
        result['endedAt'] = time.time()
        write('producer-result.json', result)
        signal.alarm(0)
        lock.close()
        print(json.dumps({key: result[key] for key in ['passed', 'kind', 'expectedHead', 'receipt', 'minFreeBytes', 'minMemAvailableBytes', 'errorType'] if key in result}))
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
