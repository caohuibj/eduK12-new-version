"""Real isolated SIGTERM cleanup test; preserves all created state and logs."""
import argparse
import json
from pathlib import Path
import signal
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--tools', required=True)
parser.add_argument('--state', type=Path, required=True)
args = parser.parse_args()
assert not args.state.exists(), 'new state path required'
process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('local-stack.py')),
                           '--tools', args.tools, '--state', str(args.state), '--hold-seconds', '180'])
try:
    deadline = time.monotonic() + 120
    status = None
    while time.monotonic() < deadline:
        assert process.poll() is None, 'launcher exited before readiness'
        try:
            status = json.loads((args.state / 'status.json').read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            time.sleep(0.2)
            continue
        if status.get('state') == 'running':
            break
        time.sleep(0.2)
    assert status and status['state'] == 'running', 'readiness deadline exceeded'
    process.send_signal(signal.SIGTERM)
    assert process.wait(timeout=100) == 0
    final = json.loads((args.state / 'status.json').read_text())
    assert final['state'] == 'stopped' and final['cleanupVerified'] is True
    assert final['stopReason'] == f'signal_{signal.SIGTERM}'
    for pid in status['pids'].values():
        assert not Path(f'/proc/{pid}').exists(), 'owned child remains after SIGTERM'
    print('PASS real SIGTERM cleans up all four owned services and records stopped status')
finally:
    if process.poll() is None:
        if args.state.exists():
            (args.state / 'stop').touch()
        process.wait(timeout=100)
