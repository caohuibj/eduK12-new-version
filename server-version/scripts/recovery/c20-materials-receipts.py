"""Pure receipt provenance validation. Never infer historical argv from phase names."""
import copy
import hashlib
import json
import re
from pathlib import Path


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def sha_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def source_sha(frozen, filename):
    assert re.fullmatch(r'c20-[a-z0-9-]+\.(mjs|py)', filename), 'unsafe producer filename'
    entries = [e for e in frozen['sourceInputs'] if e['path'] == 'server-version/scripts/recovery/' + filename]
    assert len(entries) == 1, 'producer missing or duplicated in frozen inputs'
    return entries[0]['sha256']


def import_receipt(state, expected_sha):
    state = Path(state)
    receipt_sha = sha_file(state / 'c20-runtime-result.json')
    assert expected_sha and receipt_sha == expected_sha, 'exact prior runtime receipt required'
    receipt = json.loads((state / 'c20-runtime-result.json').read_text())
    frozen = json.loads((state / 'frozen-inputs.json').read_text())
    assert digest(frozen['sourceInputs']) == frozen['sourceInputsSha256'] == receipt['sourceInputsSha256']
    assert frozen['phaseInputHashes'] == receipt['phaseInputHashes']
    assert all(receipt.get(k) is True for k in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged'])
    assert receipt.get('priorSourceUnchanged', True)
    reused = set(receipt.get('reusedPhases', []))
    phases = receipt['phases']
    assert reused <= set(phases)
    new = set(phases) - reused
    continuation = receipt.get('continuation')
    functional = receipt.get('functionalTail')
    if functional:
        assert functional['phase']=='consumer-functional' and functional['failedPhase']=='consumer-cost'
        assert receipt.get('passed') is False and receipt.get('efficiencyQualificationPassed') is False
        assert 'consumer-cost' not in reused and not phases.get('consumer-cost',{}).get('passed')
        failed_path=state/'c20-consumer-cost-result.json'
        assert sha_file(failed_path)==functional['failedResultSha256']
        assert json.loads(failed_path.read_text()).get('passed') is False
        assert receipt.get('acceptedPriorRuntimeSha256')==(functional['evidenceReceiptSha256'] if functional.get('reused') else functional['priorRuntimeSha256'])
        if functional.get('reused'): assert 'consumer-functional' in reused
        assert source_sha(frozen,functional['file'])==functional['sha256']
        target=phases.get('consumer-functional')
        if target:
            assert target['priorProducer']['runtimeSha256']==functional['priorRuntimeSha256']
            assert target['priorProducer']['resultSha256']==functional['failedResultSha256']
    storage = receipt.get('storageTail')
    if storage:
        assert functional and storage['phase']=='storage-functional' and storage['failedPhase']=='cost'
        assert 'cost' not in reused and not phases.get('cost',{}).get('passed')
        failed_path=state/'c20-cost-result.json'
        assert sha_file(failed_path)==storage['failedResultSha256']
        assert json.loads(failed_path.read_text()).get('passed') is False
        assert receipt.get('acceptedPriorRuntimeSha256')==(storage['evidenceReceiptSha256'] if storage.get('reused') else storage['priorRuntimeSha256'])
        if storage.get('reused'): assert 'storage-functional' in reused
        assert source_sha(frozen,storage['file'])==storage['sha256']
        target=phases.get('storage-functional')
        if target:
            assert target['priorProducer']['runtimeSha256']==storage['priorRuntimeSha256']
            assert target['priorProducer']['resultSha256']==storage['failedResultSha256']
    auxiliary=({'consumer-functional'} if functional else set())|({'storage-functional'} if storage else set())
    markers = {p for p, r in phases.items() if p not in reused and p not in auxiliary and r.get('priorProducer', {}).get('continuation')}
    if markers:
        assert continuation, 'continuation result is missing producer marker'
    if continuation:
        if continuation.get('phase'):
            phase = continuation['phase']
            assert phase not in reused, 'explicit continuation target is falsely reused'
            if phase not in new:
                failed_path = state / f'c20-{phase}-result.json'
                assert failed_path.is_file(), 'explicit failed continuation result missing'
                failed = json.loads(failed_path.read_text())
                assert failed.get('phase') == phase and failed.get('passed') is False
                assert receipt.get('failedPhaseResultsSha256', {}).get(phase) == sha_file(failed_path), 'failed continuation result hash mismatch'
                assert failed.get('priorProducer', {}).get('continuation'), 'failed continuation producer marker missing'
                assert not markers, 'unexpected second continuation marker'
                target_result = failed
            else:
                target_result = phases[phase]
        else:
            assert len(new) == 1, 'legacy continuation must identify exactly one newly executed phase'
            phase = next(iter(new))
            target_result = phases[phase]
        assert markers == ({phase} if phase in new else set()), 'continuation phase result marker missing'
        assert source_sha(frozen, continuation['file']) == continuation['sha256'], 'continuation SHA differs from frozen inputs'
        assert target_result['priorProducer']['runtimeSha256'] == continuation['priorRuntimeSha256']
        if continuation.get('phase'):
            assert target_result['priorProducer']['resultSha256'] == continuation['priorFailedResultSha256']
            assert receipt.get('acceptedPriorRuntimeSha256') == continuation['priorRuntimeSha256']
    records = {}
    for phase, value in phases.items():
        if value.get('passed') is not True:
            continue
        assert json.loads((state / f'c20-{phase}-result.json').read_text()) == value, 'phase result differs from runtime receipt'
        existing = receipt.get('phaseProducers', {}).get(phase)
        if existing:
            record = copy.deepcopy(existing)
            assert record['nominalPhaseInputHash'] == receipt['phaseInputHashes'][phase]
            assert record['phaseResultSha256'] == digest(value)
            if phase not in reused:
                assert record['sourceInputsSha256'] == frozen['sourceInputsSha256']
                assert source_sha(frozen, record['file']) == record['sha256']
                assert record.get('argv'), 'new producer lacks actual argv'
        else:
            record = {'schemaVersion': 1, 'nominalPhaseInputHash': receipt['phaseInputHashes'][phase],
                      'phaseResultSha256': digest(value), 'sourceInputsSha256': frozen['sourceInputsSha256'],
                      'evidenceReceiptSha256': receipt_sha, 'evidenceFrozenInputsSha256': sha_file(state / 'frozen-inputs.json')}
            if continuation and phase in markers:
                record.update(qualification='LEGACY_EXPLICIT_CONTINUATION', file=continuation['file'], sha256=continuation['sha256'],
                              continuation=copy.deepcopy(continuation), argv=None,
                              evidence='Unique newly executed phase plus explicit top-level continuation and frozen source entry; historical argv was not recorded.')
            else:
                record.update(qualification='LEGACY_ACCEPTED_RECEIPT_REFERENCE', argv=None,
                              evidence='Reused from verified receipt; actual historical producer is not asserted.' if phase in reused else 'Accepted legacy receipt; actual historical producer is not asserted.')
        record.setdefault('receiptChain', []).append(receipt_sha)
        records[phase] = record
    return receipt, records


def executed_producer(phase, file, argv, frozen, phase_result):
    return {'schemaVersion': 1, 'qualification': 'RECORDED_EXECUTION', 'file': file,
            'sha256': source_sha(frozen, file), 'argv': list(map(str, argv)),
            'nominalPhaseInputHash': frozen['phaseInputHashes'][phase],
            'sourceInputsSha256': frozen['sourceInputsSha256'], 'phaseResultSha256': digest(phase_result), 'receiptChain': []}
