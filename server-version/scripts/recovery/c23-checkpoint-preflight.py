"""Pure fail-closed C23 acceptance decisions, shared by launcher and fault tests."""
FLOOR = 8 * 1024**3
RESERVE = 512 * 1024**2
MEMORY = 2 * 1024**3
PHASES = ['upgrade', 'functional', 'races', 'restore']

def clone_budget(free, clone, memory):
    assert isinstance(clone, int) and clone > 0, 'invalid clone byte inventory'
    assert free - clone - RESERVE >= FLOOR, 'clone plus 512MiB reserve crosses 8GiB floor'
    assert memory >= MEMORY, 'less than 2GiB MemAvailable'
    return {'freeBytes': free, 'cloneBytes': clone, 'reserveBytes': RESERVE,
            'projectedFreeAfterCloneAndReserve': free-clone-RESERVE, 'memAvailableBytes': memory}

def source_receipt(receipt, snapshot_sha):
    assert all(receipt.get(k) is True for k in ['passed', 'cleanupVerified', 'sourceUnchanged', 'inputsUnchanged', 'finalSnapshotVerified']), 'C21 final continuation must actually pass'
    assert receipt.get('finalSnapshotSha256') == snapshot_sha, 'C21 final snapshot is not bound'

def build_changes(paths):
    assert all(p.startswith('server-version/backend/prisma/migrations/') or
               p.startswith('server-version/scripts/recovery/c23-') for p in paths), 'compiler reuse permits only explicit migration and C23 harness paths'

def emitted_build(steps, backend, node):
    from pathlib import Path
    expected=(Path(backend)/'node_modules/typescript/bin/tsc').resolve()
    for step in steps:
        command=step.get('command',[])
        if step.get('exitCode')!=0 or len(command)<2 or Path(step.get('cwd','')).resolve()!=Path(backend).resolve():continue
        compiler=Path(command[1]);compiler=compiler if compiler.is_absolute() else Path(backend)/compiler
        if Path(command[0]).resolve()==Path(node).resolve() and compiler.resolve()==expected and command[2:] in [[],['--project','tsconfig.json']]:return
    raise AssertionError('missing exact successful emitting tsc producer; noEmit is not a runtime build')

def complete(result):
    return (set(result.get('phases', {})) == set(PHASES) and
            all(result['phases'][p].get('passed') is True for p in PHASES) and
            all(result.get(k) is True for k in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged', 'finalSnapshotVerified']))
