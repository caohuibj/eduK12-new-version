#!/usr/bin/env python3
"""Static receipt-chain checks only; no services, database, or runtime qualification."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('receipts', Path(__file__).with_name('c20-materials-receipts.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


def main():
    old = '1' * 64
    filename = 'c20-materials-main-authoring-continuation.mjs'
    frozen = {'sourceInputs': [{'path': 'server-version/scripts/recovery/' + filename, 'sha256': '2' * 64}],
              'phaseInputHashes': {'upgrade': '3' * 64, 'main': '4' * 64}}
    frozen['sourceInputsSha256'] = m.digest(frozen['sourceInputs'])
    receipt = {'cleanupVerified': True, 'sourceUnchanged': True, 'inputsUnchanged': True,
               'sourceInputsSha256': frozen['sourceInputsSha256'], 'phaseInputHashes': frozen['phaseInputHashes'],
               'reusedPhases': ['upgrade'], 'phases': {'upgrade': {'passed': True}, 'main': {'passed': True,
               'priorProducer': {'continuation': 'Exact reviewed continuation', 'runtimeSha256': old}}},
               'continuation': {'file': filename, 'sha256': '2' * 64, 'priorRuntimeSha256': old}}
    checks = []
    with tempfile.TemporaryDirectory(prefix='c20-receipts-') as directory:
        root = Path(directory)
        def write(r):
            (root / 'frozen-inputs.json').write_text(json.dumps(frozen))
            (root / 'c20-runtime-result.json').write_text(json.dumps(r))
            for phase, result in r['phases'].items():
                (root / f'c20-{phase}-result.json').write_text(json.dumps(result))
            return m.sha_file(root / 'c20-runtime-result.json')
        def rejects(name, r, expected=None):
            sha = write(r)
            try:
                m.import_receipt(root, expected or sha)
            except AssertionError:
                checks.append(name); return
            raise AssertionError(name + ' unexpectedly accepted')
        sha = write(receipt)
        _, records = m.import_receipt(root, sha)
        assert records['main']['file'] == filename and records['main']['argv'] is None
        assert records['upgrade']['qualification'] == 'LEGACY_ACCEPTED_RECEIPT_REFERENCE'
        checks.append('legacy exact continuation and explicitly unknown reused upgrade')
        bad = copy.deepcopy(receipt); del bad['continuation']; rejects('missing continuation marker rejected', bad)
        bad = copy.deepcopy(receipt); bad['continuation']['sha256'] = '5' * 64; rejects('frozen producer hash mismatch rejected', bad)
        bad = copy.deepcopy(receipt); bad['reusedPhases'] = []; rejects('multiple new phases rejected', bad)
        rejects('incorrect exact runtime receipt rejected', receipt, '6' * 64)
        second = copy.deepcopy(receipt); del second['continuation']; second['reusedPhases'] = ['upgrade', 'main']; second['phaseProducers'] = records
        sha2 = write(second); _, imported = m.import_receipt(root, sha2)
        assert imported['main']['receiptChain'] == [sha, sha2]
        assert imported['main']['sha256'] == '2' * 64 and imported['main']['argv'] is None
        checks.append('second import preserves actual legacy producer and receipt chain')
        bad = copy.deepcopy(second); bad['phaseProducers']['main']['phaseResultSha256'] = '7' * 64
        rejects('mapped phase result mismatch rejected', bad)
    print(json.dumps({'passed': True, 'scope': 'STATIC_RECEIPT_VALIDATION_ONLY', 'checks': checks}, indent=2))

if __name__ == '__main__': main()
