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
        explicit = copy.deepcopy(receipt)
        explicit['continuation'].update(phase='main', priorFailedResultSha256='8' * 64)
        explicit['acceptedPriorRuntimeSha256'] = old
        explicit['phases']['main']['priorProducer']['resultSha256'] = '8' * 64
        explicit['phases']['later'] = {'passed': True}
        frozen['phaseInputHashes']['later'] = '9' * 64
        explicit['phaseInputHashes'] = copy.deepcopy(frozen['phaseInputHashes'])
        m.import_receipt(root, write(explicit))
        checks.append('explicit target permits later newly executed phases')
        bad = copy.deepcopy(explicit); bad['continuation']['phase'] = 'later'; rejects('wrong explicit continuation phase rejected', bad)
        bad = copy.deepcopy(explicit); bad['reusedPhases'].append('main'); rejects('falsely reused continuation target rejected', bad)
        bad = copy.deepcopy(explicit); del bad['acceptedPriorRuntimeSha256']; rejects('missing predecessor receipt rejected', bad)
        bad = copy.deepcopy(explicit); bad['acceptedPriorRuntimeSha256'] = '0' * 64; rejects('mismatched predecessor receipt rejected', bad)
        bad = copy.deepcopy(explicit); bad['continuation']['priorFailedResultSha256'] = '0' * 64; rejects('mismatched failed phase receipt rejected', bad)
        partial = copy.deepcopy(explicit)
        failed = partial['phases'].pop('main'); failed.update(phase='main', passed=False)
        del partial['phases']['later']
        (root / 'c20-main-result.json').write_text(json.dumps(failed))
        partial['failedPhaseResultsSha256'] = {'main': m.sha_file(root / 'c20-main-result.json')}
        _, accepted = m.import_receipt(root, write(partial))
        assert set(accepted) == {'upgrade'}
        checks.append('failed explicit continuation imports only previously accepted phases')
        bad = copy.deepcopy(partial); bad['failedPhaseResultsSha256']['main'] = '0' * 64
        rejects('failed continuation file hash mismatch rejected', bad)
        functional = copy.deepcopy(second)
        functional.update(passed=False, functionalCheckpointPassed=True, efficiencyQualificationPassed=False, acceptedPriorRuntimeSha256=old)
        functional['phaseInputHashes']=copy.deepcopy(frozen['phaseInputHashes'])
        failed_cost={'phase':'consumer-cost','passed':False,'checks':['functional population reached'],'error':{'message':'budget exceeded'}}
        (root/'c20-consumer-cost-result.json').write_text(json.dumps(failed_cost))
        failed_sha=m.sha_file(root/'c20-consumer-cost-result.json')
        functional['functionalTail']={'phase':'consumer-functional','file':filename,'sha256':'2'*64,'priorRuntimeSha256':old,'failedPhase':'consumer-cost','failedResultSha256':failed_sha}
        functional['phases']['consumer-functional']={'passed':True,'priorProducer':{'runtimeSha256':old,'resultSha256':failed_sha,'continuation':'Remaining functional assertions only'}}
        frozen['phaseInputHashes']['consumer-functional']='a'*64
        functional['phaseInputHashes']=copy.deepcopy(frozen['phaseInputHashes'])
        _,accepted=m.import_receipt(root,write(functional))
        assert 'consumer-cost' not in accepted and 'consumer-functional' in accepted
        checks.append('functional checkpoint preserves false efficiency and excludes failed cost')
        bad=copy.deepcopy(functional);bad['passed']=True;rejects('functional checkpoint cannot claim overall pass',bad)
        bad=copy.deepcopy(functional);bad['functionalTail']['failedResultSha256']='0'*64;rejects('functional checkpoint failed-result pin mismatch rejected',bad)
        storage = copy.deepcopy(functional)
        storage['reusedPhases'].append('consumer-functional')
        storage['functionalTail'].update(reused=True,evidenceReceiptSha256=old)
        failed_storage={'phase':'cost','passed':False,'error':{'message':'911 != 919'}}
        (root/'c20-cost-result.json').write_text(json.dumps(failed_storage));storage_sha=m.sha_file(root/'c20-cost-result.json')
        storage['storageTail']={'phase':'storage-functional','file':filename,'sha256':'2'*64,'priorRuntimeSha256':old,'failedPhase':'cost','failedResultSha256':storage_sha}
        storage['phases']['storage-functional']={'passed':True,'priorProducer':{'runtimeSha256':old,'resultSha256':storage_sha,'continuation':'Exact codec explanation only'}}
        frozen['phaseInputHashes']['storage-functional']='b'*64;storage['phaseInputHashes']=copy.deepcopy(frozen['phaseInputHashes'])
        _,accepted=m.import_receipt(root,write(storage));assert 'cost' not in accepted and 'consumer-cost' not in accepted and 'storage-functional' in accepted
        checks.append('storage tail preserves both failures and reuses accepted functional tail')
        bad=copy.deepcopy(storage);bad['storageTail']['failedResultSha256']='0'*64;rejects('storage tail wrong failure hash rejected',bad)
        bad=copy.deepcopy(storage);bad['storageTail']['phase']='cost';rejects('storage tail cannot relabel failed cost as accepted',bad)
    print(json.dumps({'passed': True, 'scope': 'STATIC_RECEIPT_VALIDATION_ONLY', 'checks': checks}, indent=2))

if __name__ == '__main__': main()
