#!/usr/bin/env python3
"""Normal login for ONE allowlisted synthetic student, stdlib only (no httpx on production).
Mirrors the validated normal_session.py flow: csrf -> training-login(expectedRole) -> me.
No retries, no MFA enrollment, no credential values printed or logged.
Credential material stays on this host; only the resulting session is transferred later via strict SSH.
"""
import argparse, datetime, http.cookiejar, json, pathlib, time, urllib.request

PORTAL = 'https://training.eduk12.top'


def request(opener, method, path, body=None, headers=None):
    url = PORTAL + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Accept', 'application/json')
    req.add_header('User-Agent', 'eduK12-authprep-stdlib/20261101')
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        req.add_header('Origin', PORTAL)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    t0 = time.monotonic()
    with opener.open(req, timeout=10) as resp:
        payload = json.loads(resp.read().decode())
    return payload, (time.monotonic() - t0) * 1000


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--spec', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    spec = json.loads(pathlib.Path(args.spec).read_text())
    assert spec.get('synthetic') is True, 'NOT_SYNTHETIC'
    assert spec['userId'] in spec.get('exactSyntheticUserAllowlist', []), 'ALLOWLIST'
    assert spec.get('role') == 'STUDENT', 'ROLE_NOT_STUDENT'
    expiry = datetime.datetime.fromisoformat(spec['currentExpiresAt'].replace('Z', '+00:00'))
    assert expiry > datetime.datetime.now(datetime.timezone.utc), 'ACCOUNT_EXPIRED_NO_LOGIN_ATTEMPT'
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    events = []
    began = time.monotonic()
    csrf, ms = request(opener, 'GET', '/api/auth/csrf')
    events.append({'action': 'csrf', 'status': csrf.get('code'), 'ok': csrf.get('code') == 0, 'ms': round(ms, 1)})
    assert csrf.get('code') == 0, 'CSRF_REJECTED'
    token = csrf['data']['csrfToken']
    body = {'username': spec['username'], 'password': spec['password'], 'expectedRole': spec['role']}
    login, ms = request(opener, 'POST', '/api/auth/training-login', body, headers={'X-CSRF-Token': token})
    events.append({'action': 'password', 'status': login.get('code'),
                   'ok': login.get('code') == 0, 'ms': round(ms, 1)})
    assert login.get('code') == 0, 'LOGIN_REJECTED'
    assert not login.get('data', {}).get('mfaRequired'), 'MFA_INPUT_REQUIRED_NO_ENROLLMENT'
    me, ms = request(opener, 'GET', '/api/auth/me', headers={'X-CSRF-Token': token})
    events.append({'action': 'identity', 'status': me.get('code'), 'ok': me.get('code') == 0, 'ms': round(ms, 1)})
    identity = me.get('data', {})
    assert identity.get('id') == spec['userId'] and identity.get('role') == spec['role'], 'ALLOWLIST_IDENTITY_MISMATCH'
    cookie = '; '.join(c.name + '=' + c.value for c in jar)
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, mode=0o700, exist_ok=False)
    (out / 'auth-events.json').write_text(json.dumps(
        {'userId': spec['userId'], 'portal': 'training', 'events': events}, indent=2))
    sp = out / 'session.private.json'
    sp.write_text(json.dumps({'id': spec['userId'], 'role': spec['role'],
                              'portal': 'training', 'cookie': cookie, 'csrf': token}))
    sp.chmod(0o600)
    print(json.dumps({'userId': spec['userId'], 'normalLoginSucceeded': True,
                      'requests': len(events), 'totalMs': round((time.monotonic() - began) * 1000, 1),
                      'rawCredentialsPrinted': False}))


if __name__ == '__main__':
    main()
