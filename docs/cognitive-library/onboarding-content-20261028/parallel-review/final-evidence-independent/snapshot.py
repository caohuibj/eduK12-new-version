"""Read-only evidence/source alignment; no task, scorer or test invocation."""
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/workspace/eduK12-new-version')
HERE = Path(__file__).resolve().parent
BASE = 'a67f425269283d8281379fdf8234f9fd6b0acebc'
EVIDENCE = ROOT / 'docs/cognitive-library/onboarding-content-20261028/parallel-review'

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def match_receipts(refs, digest):
    # Keep representative provenance compact; all receipt bytes are separately hashed.
    names = sorted({r['receipt'] for r in refs if r['sha256'] == digest}, key=lambda n: ('types' in n, n))
    return {'matchingReceiptCount': len(names), 'matchingEvidenceReferences': names[:4]}

def source_path(value):
    if not isinstance(value, str) or 'server-version/' not in value:
        return None
    candidate = value[value.index('server-version/'):]
    return candidate if (ROOT / candidate).is_file() else None

references = {}
originals = []
def visit(value, receipt, location=''):
    if isinstance(value, dict):
        for key, item in value.items():
            source = source_path(key)
            if source and isinstance(item, str) and re.fullmatch('[0-9a-f]{64}', item):
                references.setdefault(source, []).append({'receipt': receipt, 'field': location + '/' + key, 'sha256': item})
        source = source_path(value.get('file', value.get('path')))
        if source:
            for key in ['currentSHA256', 'afterSHA256', 'sha256']:
                item = value.get(key)
                if isinstance(item, str) and re.fullmatch('[0-9a-f]{64}', item):
                    references.setdefault(source, []).append({'receipt': receipt, 'field': location + '/' + key, 'sha256': item})
        file = value.get('file')
        digest = value.get('sha256')
        if isinstance(file, str) and file.startswith('docs/') and isinstance(digest, str) and re.fullmatch('[0-9a-f]{64}', digest):
            p = ROOT / file
            originals.append({'receipt': receipt, 'file': file, 'expectedSHA256': digest, 'actualSHA256': sha(p) if p.is_file() else None, 'identical': p.is_file() and sha(p) == digest})
        for key, item in value.items():
            visit(item, receipt, location + '/' + key)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            visit(item, receipt, location + '/' + str(index))

evidence_files = []
for path in sorted(EVIDENCE.rglob('*.json')):
    evidence_files.append({'file': str(path.relative_to(ROOT)), 'sha256': sha(path)})
    try:
        visit(json.loads(path.read_text()), str(path.relative_to(ROOT)))
    except (UnicodeDecodeError, json.JSONDecodeError):
        pass
for folder in ['entry-adapters', 'grad-freeze']:
    for path in sorted((ROOT / 'docs/parallel-review' / folder).glob('*.json')):
        evidence_files.append({'file': str(path.relative_to(ROOT)), 'sha256': sha(path)})
        visit(json.loads(path.read_text()), str(path.relative_to(ROOT)))

changed = set(git('diff', '--name-only', BASE, '--', 'server-version').splitlines())
changed.update(git('ls-files', '--others', '--exclude-standard', 'server-version').splitlines())
changed.discard('')
sources = []
for name in sorted(changed):
    p = ROOT / name
    if not p.is_file() or 'node_modules' in p.parts:
        continue
    digest = sha(p)
    refs = references.get(name, [])
    sources.append({'file': name, 'sha256': digest, 'trackedWIP': bool(git('diff', 'HEAD', '--', name)), **match_receipts(refs, digest), 'otherRecordedHashes': sorted({r['sha256'] for r in refs if r['sha256'] != digest})})

tool_names = ['balloon-effort', 'horizon-exploration', 'precision-working-memory', 'gradcpt', 'visual-search', 'attentional-blink', 'dual-arrow', 'hearts-flowers', 'ant', 'mot', 'enumeration', 'continuous-recognition']
reused = []
for name, refs in sorted(references.items()):
    if name in changed or '.test.' in name or '/__tests__/' in name:
        continue
    if not any('/content-candidates/' + tool + '/' in name or '/tasks/' + tool + '/' in name for tool in tool_names):
        continue
    digest = sha(ROOT / name)
    reused.append({'file': name, 'sha256': digest, **match_receipts(refs, digest)})
result = {'recordedAt': datetime.now(timezone.utc).isoformat(), 'operation': 'read-only SHA256 and git metadata; no tests/scoring', 'base': BASE, 'rootHEAD': git('rev-parse', 'HEAD'), 'rootStatus': git('status', '--short'), 'sources': sources, 'unchangedToolSourceReferences': reused, 'evidenceFiles': evidence_files, 'originalFileReferences': originals, 'limits': 'Hash equality supports input reuse, not execution success. Old before hashes remain historical. Later root edits require targeted refresh.'}
(HERE / 'source-evidence-snapshot.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
product = [s for s in sources if '/__tests__/' not in s['file'] and '.test.' not in s['file'] and '/scripts/' not in s['file']]
print(json.dumps({'rootHEAD': result['rootHEAD'], 'sources': len(sources), 'productSources': len(product), 'productWithoutRecordedHashMatch': [s['file'] for s in product if not s['matchingEvidenceReferences']], 'originalReferences': len(originals), 'changedOriginalReferences': [r for r in originals if not r['identical']]}, indent=2, ensure_ascii=False))
