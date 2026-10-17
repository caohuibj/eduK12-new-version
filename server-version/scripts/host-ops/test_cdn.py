import copy
import unittest
from cdn import DOMAIN, digest, headers, install_auth, is_protected, viewer_auth


class Cloud:
    def __init__(self, auth):
        self.auth = auth
        self.calls = []
    def describe(self):
        return {'Domain': DOMAIN, 'Authentication': self.auth}
    def call(self, action, body):
        self.calls.append((action, body))
        self.auth = copy.deepcopy(body['Authentication'])
        return {}


class ViewerAuthenticationTests(unittest.TestCase):
    def test_all_files_and_bounded_sha256_authentication(self):
        value = viewer_auth('a' * 32)
        self.assertTrue(is_protected(value))
        for key, replacement in [('FileExtensions', ['mp4']), ('FilterType', 'whitelist'), ('ExpireTime', 3600)]:
            altered = copy.deepcopy(value)
            altered['TypeD'][key] = replacement
            self.assertFalse(is_protected(altered))
        for key, replacement in [('Switch', 'off'), ('AuthAlgorithm', 'md5'), ('TypeA', {})]:
            altered = copy.deepcopy(value)
            altered[key] = replacement
            self.assertFalse(is_protected(altered))
        for key in ['', 'a' * 31, '../' + 'a' * 29, None]:
            with self.assertRaises(ValueError):
                viewer_auth(key)

    def test_only_exact_current_authentication_can_change(self):
        before = {'Switch': 'off'}
        cloud = Cloud(before)
        candidate = viewer_auth('b' * 32)
        self.assertTrue(install_auth(cloud, digest(before), candidate))
        self.assertEqual(cloud.calls, [('UpdateDomainConfig', {'Domain': DOMAIN, 'Authentication': {k: v for k, v in candidate.items() if v is not None}})])
        self.assertFalse(install_auth(cloud, digest(before), candidate))
        self.assertEqual(len(cloud.calls), 1)
        with self.assertRaisesRegex(ValueError, 'CONFIGURATION_CHANGED'):
            install_auth(Cloud({'Switch': 'on'}), digest(before), candidate)
        with self.assertRaisesRegex(ValueError, 'CANDIDATE_UNSAFE'):
            install_auth(Cloud(before), digest(before), before)

    def test_signer_utc_payload_binding_and_temporary_identity(self):
        credentials = {'COS_SECRET_ID': 'test-id', 'COS_SECRET_KEY': 'test-key', 'COS_SECURITY_TOKEN': 'test-session'}
        first = headers(credentials, 'DescribeDomainsConfig', b'{}', 1551113065)
        self.assertIn('/2019-02-25/cdn/tc3_request', first['Authorization'])
        self.assertEqual(first['X-TC-Token'], 'test-session')
        self.assertNotEqual(first['Authorization'], headers(credentials, 'DescribeDomainsConfig', b'{ }', 1551113065)['Authorization'])
        self.assertNotIn('test-key', str(first))


if __name__ == '__main__':
    unittest.main()
