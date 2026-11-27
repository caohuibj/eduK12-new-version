"""Copy only committed release declarations into a fresh, read-only ops input."""
import json
import re
import subprocess
import sys
from pathlib import Path

MODULES = 'server-version/backend/src/modules/'
SCALE_ROOT = MODULES + 'scale/instruments/'
BUNDLE_ROOT = MODULES + 'assessment-bundle/packages/'
ARTWORK_ROOT = 'server-version/frontend/src/scale-report-artwork/'
SCALE_FILES = re.compile(
    r'[a-z][a-z0-9_]*/(?:releases\.json|(?:parameters|reports)/[a-zA-Z0-9][a-zA-Z0-9._-]*\.json)'
)
BUNDLE_FILES = re.compile(
    r'[a-z][a-z0-9_]*/(?:releases\.json|[0-9]+\.[0-9]+\.[0-9]+/'
    r'(?:manifest|rules|report|publication|scientific|evidence-map|context|profile|'
    r'fixtures/(?:valid|missing|invalid|not-applicable))\.json)'
)
ARTWORK_FILES = re.compile(
    r'[a-z][a-z0-9_]*/\d+\.\d+\.\d+/[a-zA-Z0-9][a-zA-Z0-9._-]*/'
    r'(?:report-artwork\.json|[a-z][a-z0-9_-]*\.webp)'
)


def export_releases(repo: str, commit: str, output: Path, profile: str) -> None:
    if profile not in ('scale', 'content') or not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Expected a release profile and an exact Git commit SHA')
    if any(output.iterdir()):
        raise ValueError('Content export destination must be empty')

    def git(*args: str) -> bytes:
        return subprocess.check_output(['git', '--no-replace-objects', '-C', repo, *args])

    if git('rev-parse', '--verify', 'refs/remotes/origin/main^{commit}').strip().decode('ascii') != commit:
        raise ValueError('Content export requires the approved, fetched origin/main commit')

    scale = output if profile == 'scale' else output / 'scale'
    families = [(SCALE_ROOT, SCALE_FILES, scale)]
    if profile == 'content':
        families.append((BUNDLE_ROOT, BUNDLE_FILES, output / 'bundle'))
    for _, _, directory in families:
        directory.mkdir(exist_ok=True)
    roots = [root for root, _, _ in families]
    artwork_inventory = {}
    scale_control_present = False
    for record in git('ls-tree', '-rz', commit, '--', *roots, ARTWORK_ROOT).split(b'\0'):
        if not record:
            continue
        metadata, raw_path = record.split(b'\t', 1)
        source = raw_path.decode('utf-8')
        mode, kind, oid = metadata.split()
        regular_blob = mode == b'100644' and kind == b'blob'
        if source.startswith(ARTWORK_ROOT):
            relative = source.removeprefix(ARTWORK_ROOT)
            if ARTWORK_FILES.fullmatch(relative) and regular_blob:
                artwork_inventory[relative] = oid.decode('ascii')
            continue
        for root, pattern, directory in families:
            if not source.startswith(root):
                continue
            relative = source.removeprefix(root)
            if pattern.fullmatch(relative):
                if not regular_blob:
                    raise ValueError('Expected a regular release JSON blob: ' + source)
                destination = directory / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(git('cat-file', 'blob', oid.decode('ascii')))
                if root == SCALE_ROOT and destination.name == 'releases.json':
                    scale_control_present = True
            break

    if profile == 'content' and not scale_control_present:
        raise ValueError('The committed snapshot must contain a Scale release control file')

    artwork = scale / '.artwork'
    artwork.mkdir()
    (artwork / 'approved.json').write_text(
        json.dumps({'schemaVersion': 1, 'files': artwork_inventory}), encoding='utf-8'
    )


if __name__ == '__main__':
    repository, sha, destination, profile = sys.argv[1:]
    export_releases(repository, sha, Path(destination), profile)
