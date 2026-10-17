"""Bounded viewer authentication for the existing eduK12 media CDN."""
import argparse
import datetime
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import time
import urllib.error
import urllib.request

DOMAIN = 'cdn.eduk12.top'
ENDPOINT = 'cdn.tencentcloudapi.com'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def viewer_auth(key):
    if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9]{32}', key):
        raise ValueError('CDN_KEY_INVALID')
    return {'Switch': 'on', 'AuthAlgorithm': 'sha256', 'TypeA': None, 'TypeB': None, 'TypeC': None,
            'TypeD': {'SecretKey': key, 'ExpireTime': 600, 'FileExtensions': ['*'],
                      'FilterType': 'blacklist', 'SignParam': 'sign', 'TimeParam': 't', 'TimeFormat': 'dec'}}


def is_protected(value):
    try:
        expected = viewer_auth(value['TypeD']['SecretKey'])
        return all(value.get(k) == v for k, v in expected.items() if k != 'TypeD') and all(
            value['TypeD'].get(k) == v for k, v in expected['TypeD'].items())
    except (ValueError, KeyError, TypeError):
        return False


def headers(credentials, action, payload, timestamp):
    date = datetime.datetime.fromtimestamp(timestamp, datetime.timezone.utc).strftime('%Y-%m-%d')
    ct = 'application/json; charset=utf-8'
    signed = 'content-type;host;x-tc-action'
    canonical = 'POST\n/\n\ncontent-type:' + ct + '\nhost:' + ENDPOINT + '\nx-tc-action:' + action.lower() + '\n\n' + signed + '\n' + hashlib.sha256(payload).hexdigest()
    scope = date + '/cdn/tc3_request'
    text = 'TC3-HMAC-SHA256\n' + str(timestamp) + '\n' + scope + '\n' + hashlib.sha256(canonical.encode()).hexdigest()
    def sign(key, message):
        return hmac.new(key, message.encode(), hashlib.sha256).digest()
    key = sign(sign(sign(('TC3' + credentials['COS_SECRET_KEY']).encode(), date), 'cdn'), 'tc3_request')
    authorization = 'TC3-HMAC-SHA256 Credential=' + credentials['COS_SECRET_ID'] + '/' + scope + ', SignedHeaders=' + signed + ', Signature=' + hmac.new(key, text.encode(), hashlib.sha256).hexdigest()
    result = {'Authorization': authorization, 'Content-Type': ct, 'Host': ENDPOINT,
              'X-TC-Action': action, 'X-TC-Version': '2018-06-06', 'X-TC-Timestamp': str(timestamp)}
    if credentials.get('COS_SECURITY_TOKEN'):
        result['X-TC-Token'] = credentials['COS_SECURITY_TOKEN']
    return result


class Cloud:
    def __init__(self, credentials):
        self.credentials = credentials

    def call(self, action, params):
        if action not in ['DescribeDomainsConfig', 'UpdateDomainConfig']:
            raise ValueError('CDN_ACTION_DENIED')
        payload = json.dumps(params, separators=(',', ':')).encode()
        request = urllib.request.Request('https://' + ENDPOINT + '/', data=payload,
                                        headers=headers(self.credentials, action, payload, int(time.time())), method='POST')
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.load(response)['Response']
        if result.get('Error'):
            code = result['Error'].get('Code', '')
            raise ValueError(code if re.fullmatch(r'[A-Za-z0-9.]{1,100}', code) else 'CDN_API_FAILED')
        return result

    def describe(self):
        result = self.call('DescribeDomainsConfig', {'Offset': 0, 'Limit': 10, 'Filters': [
            {'Name': 'domain', 'Value': [DOMAIN], 'Fuzzy': False}]})
        domains = result.get('Domains', [])
        if len(domains) != 1 or domains[0].get('Domain') != DOMAIN:
            raise ValueError('CDN_DOMAIN_MISMATCH')
        return domains[0]


def install_auth(cloud, expected_hash, candidate):
    if not is_protected(candidate):
        raise ValueError('CDN_CANDIDATE_UNSAFE')
    current = cloud.describe()
    if is_protected(current.get('Authentication')) and current['Authentication']['TypeD']['SecretKey'] == candidate['TypeD']['SecretKey']:
        return False
    if digest(current.get('Authentication')) != expected_hash:
        raise ValueError('CDN_CONFIGURATION_CHANGED')
    # Only viewer authentication changes. Origin, TLS, caching, DNS and COS policies stay intact.
    cloud.call('UpdateDomainConfig', {'Domain': DOMAIN, 'Authentication': {k: v for k, v in candidate.items() if v is not None}})
    return True


def private_json(file, value=None):
    if value is not None:
        fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as out:
            json.dump(value, out)
            out.flush()
            os.fsync(out.fileno())
    metadata = file.lstat()
    if not stat.S_ISREG(metadata.st_mode) or file.is_symlink() or metadata.st_uid != os.geteuid() or metadata.st_mode & 0o077:
        raise ValueError('CDN_STATE_NOT_PRIVATE')
    return json.loads(file.read_text())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['inspect', 'prepare', 'apply'])
    parser.add_argument('--state', type=Path)
    args = parser.parse_args()
    runtime = json.loads(subprocess.check_output(['docker', 'inspect', 'eduk12-prod-backend'], text=True))[0]
    credentials = dict(value.split('=', 1) for value in runtime['Config']['Env'] if '=' in value)
    cloud = Cloud(credentials)
    current = cloud.describe()
    if args.command == 'prepare':
        if not args.state:
            raise ValueError('CDN_STATE_REQUIRED')
        args.state.mkdir(mode=0o700, parents=True, exist_ok=True)
        state = args.state.lstat()
        if args.state.is_symlink() or state.st_uid != os.geteuid() or state.st_mode & 0o077:
            raise ValueError('CDN_STATE_NOT_PRIVATE')
        before = args.state / 'authentication.before.private.json'
        candidate = args.state / 'authentication.candidate.private.json'
        if not before.exists():
            private_json(before, {'domain': DOMAIN, 'authentication': current.get('Authentication')})
        if not candidate.exists():
            private_json(candidate, viewer_auth(secrets.token_hex(16)))
        private_json(before)
        private_json(candidate)
    elif args.command == 'apply':
        if not args.state:
            raise ValueError('CDN_STATE_REQUIRED')
        before = private_json(args.state / 'authentication.before.private.json')
        if before.get('domain') != DOMAIN:
            raise ValueError('CDN_DOMAIN_MISMATCH')
        install_auth(cloud, digest(before['authentication']), private_json(args.state / 'authentication.candidate.private.json'))
        current = cloud.describe()
    print(json.dumps({'domain': DOMAIN, 'status': current.get('Status'),
                      'viewerProtected': is_protected(current.get('Authentication')),
                      'authenticationHash': digest(current.get('Authentication'))}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        message = str(error)
        print(json.dumps({'error': message if re.fullmatch(r'[A-Za-z0-9_.]{1,100}', message) else 'CDN_OPERATION_FAILED'}))
        raise SystemExit(1)
