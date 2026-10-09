"""Fail-closed evidence applicability; DR status never implies application status."""
import hashlib, json, re, time
SHA = re.compile(r'^[a-f0-9]{64}$')
DIGEST = re.compile(r'^sha256:[a-f0-9]{64}$')

def require(ok, reason):
    if not ok: raise ValueError(reason)

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def inputs(plan, check, images, configuration):
    # Only genuinely consumed inputs invalidate a receipt; no global SHA shortcut.
    components = []
    if check.startswith('frontend'): components = ['frontend']
    elif check.startswith(('backend', 'login')): components = ['backend', 'frontend']
    elif check in ['compatibility', 'rollback', 'readiness']: components = ['frontend', 'backend']
    tool = 'browser' if check.endswith('browser') else 'scan' if check.endswith('scan') else 'frontendChecks' if check=='frontend-checks' else 'backendChecks' if check in ['backend-checks','login-contracts'] else 'executor' if check in ['compatibility', 'rollback', 'readiness'] else 'policy'
    return {'components': {c: plan['components'][c]['candidate'] for c in components},
            'images': {c: images[c] for c in components if c in images},
            'configuration': configuration, 'tool': plan['tools'][tool],
            'policy': plan['tools']['policy'], 'parameters': {'route': plan['route'], 'surfaces': plan['surfaces']}}

def validate(plan, records, images, configuration, now=None, required=None):
    require(plan['schema'] == 1 and plan['route'] in ['A', 'B', 'C'], 'Malformed plan')
    require(all(DIGEST.fullmatch(v) for v in images.values()), 'Nonimmutable image')
    require(SHA.fullmatch(configuration) is not None, 'Configuration fingerprint required')
    selected = required if required is not None else plan['required']
    require(isinstance(records, list), 'Missing evidence')
    ids = [r.get('check') for r in records]
    require(len(ids) == len(set(ids)), 'Duplicate evidence')
    by_id = {r['check']: r for r in records}; now = time.time() if now is None else now
    for check in selected:
        r = by_id.get(check)
        require(r is not None and r.get('status') == 'success', 'Required check missing/non-success: '+check)
        require(r.get('inputs') == inputs(plan, check, images, configuration), 'Evidence input changed: '+check)
        require(isinstance(r.get('completedAt'), (int,float)) and 0 <= now-r['completedAt'] <= 86400, 'Expired/future evidence: '+check)
        require(bool(r.get('run')) and bool(r.get('sourceHead')), 'Evidence origin missing: '+check)
    return True

def record(plan, check, images, configuration, run, **details):
    return {'check': check, 'status': 'success', 'completedAt': time.time(), 'sourceHead': plan['head'],
            'run': run, 'inputs': inputs(plan, check, images, configuration), 'details': details}

def compatibility(plan):
    require(plan['route'] in ['A','B'], 'C uses existing heavy deployment with migration/recovery gates')
    require(not any('/prisma/' in e['file'] or '/Dockerfile' in e['file'] or 'docker-compose' in e['file']
                    or e['file'].endswith(('package.json','package-lock.json')) for e in plan['changes']), 'Compatibility not proven')
    require(plan['base'] != plan['head'], 'Empty release')
