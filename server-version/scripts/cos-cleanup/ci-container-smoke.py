#!/usr/bin/env python3
"""Run the exact cleanup transaction suite in its isolated production resource envelope."""
import json
import os
from pathlib import Path
import subprocess
import uuid

assert os.geteuid() == 0 and os.environ.get('CI') == 'true' and os.environ.get('GITHUB_ACTIONS') == 'true'
source = Path(__file__).resolve().parent
ident = uuid.uuid4().hex; name = 'eduk12-cos-cleanup-' + ident; label = 'eduk12.cos-cleanup-task'
def output(args): return subprocess.check_output(args).decode().splitlines()
containers = set(output(['docker', 'ps', '-aq'])); volumes = set(output(['docker', 'volume', 'ls', '-q']))
try:
    result = subprocess.run(['docker', 'run', '--rm', '--name', name, '--label', label + '=' + ident,
        '--network', 'none', '--user', '0:0', '--read-only', '--cap-drop', 'ALL', '--cap-add', 'DAC_OVERRIDE',
        '--security-opt', 'no-new-privileges', '--memory', '256m', '--cpus', '0.3', '--pids-limit', '64',
        '--tmpfs', '/tmp:size=64m,noexec,nosuid',
        '--mount', 'type=bind,src=' + str(source) + ',dst=/ops,readonly',
        '--mount', 'type=bind,src=' + str(source.parent / 'attachment-backup') + ',dst=/attachment-backup,readonly',
        'node:24.21.0-bookworm-slim', 'node', '--test', '/ops/cleanup.test.mjs'], capture_output=True, timeout=180)
    if result.returncode: print(result.stdout.decode()); print(result.stderr.decode()); raise RuntimeError('ISOLATED_CLEANUP_SUITE_FAILED')
finally:
    item = subprocess.run(['docker', 'inspect', name], capture_output=True)
    if item.returncode == 0:
        data = json.loads(item.stdout)[0]
        assert data['Config']['Labels'][label] == ident and not any(m['Type'] == 'volume' for m in data['Mounts'])
        subprocess.run(['docker', 'rm', '-f', name], check=True, capture_output=True)
assert set(output(['docker', 'ps', '-aq'])) == containers
assert set(output(['docker', 'volume', 'ls', '-q'])) == volumes
print(json.dumps({'isolatedCleanupTransactionSuite':'PASS','memoryMiB':256,'cpu':0.3,'network':'none','foreignContainersAndVolumesPreserved':True}))
