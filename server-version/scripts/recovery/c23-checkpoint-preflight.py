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

def service_exit(name, returncode):
    assert name in ['postgres','redis','api'] and returncode == 0, 'service did not exit cleanly after requested shutdown'

def complete(result):
    return (set(result.get('phases', {})) == set(PHASES) and
            all(result['phases'][p].get('passed') is True for p in PHASES) and
            all(result.get(k) is True for k in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged', 'finalSnapshotVerified']))


def accepted_binding(binding, validate, expected_head):
    """Validate the captured bytes, rejecting mutations before/during the capture."""
    before = binding()
    assert before['head'] == expected_head, 'captured HEAD differs from reviewed HEAD'
    validate()  # Clean source and ALL build/client/dependency inventories vs receipts.
    after = binding()
    assert after['head'] == expected_head and before == after, 'inputs changed across accepted binding'
    return before


def wait_child(proc, timeout, check, *, clock=None, pause=None, killpg=None):
    """One aggregate deadline for the child AND its inherited SQL process group."""
    import os, signal, time
    clock, pause, killpg = clock or time.monotonic, pause or time.sleep, killpg or os.killpg
    deadline = clock() + timeout
    try:
        while proc.poll() is None:
            if clock() >= deadline: raise TimeoutError('aggregate child deadline exceeded')
            check()
            pause(.2)
        assert proc.returncode == 0, 'bounded child failed; private raw log retained'
    except BaseException:
        try: killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        proc.wait(timeout=5)
        raise


def finish_database(audit, stop, result):
    """A failed/timed-out final audit can never skip PostgreSQL shutdown."""
    result['finalSnapshotVerified'] = False
    try:
        evidence = audit()
        assert evidence['passed'] is True and evidence['mode'] == 'final'
        assert evidence['retainedFacts']['allOriginalRowsRetained'] is True
        assert len(evidence['snapshotSha256']) == 64
        result['finalOriginalRowsPreserved'] = evidence['retainedFacts']
        result['finalSnapshotSha256'] = evidence['snapshotSha256']
        result['finalSnapshotVerified'] = True
    except BaseException as error:
        result['finalSnapshotError'] = type(error).__name__
        result['passed'] = False
    finally:
        stop()
