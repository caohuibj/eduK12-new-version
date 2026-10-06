import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('monitor', Path(__file__).with_name('monitor.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
CONFIG = json.loads(Path(__file__).with_name('config.example.json').read_text())


class MonitoringSafetyTests(unittest.TestCase):
    def test_cleanup_failure_and_pending_transaction_are_critical(self):
        import datetime as dt
        config = copy.deepcopy(CONFIG); config['tls_hosts'] = []; config['ready_urls'] = []; config['backup_roots'] = []
        with tempfile.TemporaryDirectory() as tmp:
            status = Path(tmp, 'cleanup.json'); config['cos_cleanup_status'] = str(status)
            for edit in [{'status': 'FAILED'}, {'status': 'SUCCESS', 'pendingTransaction': True}, {'status': 'BLOCKED', 'mode': 'plan_only'}]:
                status.write_text(json.dumps({'at': dt.datetime.now(dt.timezone.utc).isoformat(), **edit}))
                with patch.object(m, 'command', side_effect=RuntimeError('isolated')):
                    _, checks = m.collect(config)
                level = next(c['level'] for c in checks if c['key'] == 'cos_cleanup_health')
                self.assertEqual(level, 'ok' if edit['status'] == 'BLOCKED' else 'critical')

    def test_failure_debounce_recovery_and_reminder(self):
        bad = [m.finding('http:api', 'critical', {'status': 503})]
        good = [m.finding('http:api', 'ok', {'status': 200})]
        state, events = m.transitions({}, bad, 100, CONFIG)
        self.assertEqual(events, [])
        state, events = m.transitions(state, bad, 400, CONFIG)
        self.assertEqual(events[0]['event'], 'opened')
        state, events = m.transitions(state, bad, 700, CONFIG)
        self.assertEqual(events, [])
        state, events = m.transitions(state, bad, 400 + CONFIG['repeat_seconds'], CONFIG)
        self.assertEqual(events[0]['event'], 'reminder')
        state, events = m.transitions(state, good, 23000, CONFIG)
        self.assertEqual(events, [])
        state, events = m.transitions(state, good, 23300, CONFIG)
        self.assertEqual(events[0]['event'], 'recovered')

    def test_flapping_does_not_open_and_missing_checks_do_not_recover(self):
        bad = [m.finding('container:x', 'critical', {})]
        good = [m.finding('container:x', 'ok', {})]
        state, _ = m.transitions({}, bad, 1, CONFIG)
        state, events = m.transitions(state, good, 2, CONFIG)
        self.assertEqual(events, [])
        state, events = m.transitions(state, bad, 3, CONFIG)
        self.assertEqual(events, [])
        state, _ = m.transitions(state, bad, 4, CONFIG)
        state, events = m.transitions(state, [], 5, CONFIG)
        self.assertEqual(state['container:x']['confirmed'], 'critical')
        self.assertEqual(events, [])

    def test_critical_disk_and_restart_delta_are_immediate(self):
        checks = [m.finding('disk:/:free', 'critical', {'bytes': 1}),
                  m.finding('restarts:worker', 'warning', {'delta': 2})]
        _, events = m.transitions({}, checks, 100, CONFIG)
        self.assertEqual(len(events), 2)

    def test_resources_thresholds(self):
        metrics = {'disks': {'/': {'used_percent': 91, 'available_bytes': 1, 'inode_percent': 20}},
                   'memory_available_percent': 9, 'load_per_cpu': 3}
        checks = {c['key']: c['level'] for c in m.resource_findings(metrics, CONFIG)}
        self.assertEqual(checks['disk:/:used_percent'], 'critical')
        self.assertEqual(checks['disk:/:free'], 'critical')
        self.assertEqual(checks['disk:/:inode_percent'], 'ok')
        self.assertEqual(checks['memory'], 'warning')

    def test_command_failure_never_leaks_stderr_and_siblings_still_run(self):
        config = copy.deepcopy(CONFIG)
        config['tls_hosts'] = []
        config['ready_urls'] = []
        config['backup_roots'] = []
        with patch.object(m, 'command', side_effect=RuntimeError('secret-token')):
            data, checks = m.collect(config)
        encoded = json.dumps(checks)
        self.assertNotIn('secret-token', encoded)
        self.assertIn('collector:containers', encoded)
        self.assertIn('collector:volume_inventory', encoded)
        self.assertIn('local_backup', data)

    def test_local_sidecar_does_not_claim_restore_or_cos_verification(self):
        config = copy.deepcopy(CONFIG)
        config['tls_hosts'] = []
        config['ready_urls'] = []
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'sample.edubackup.enc').write_bytes(b'encrypted-placeholder')
            Path(tmp, 'sample.edubackup.enc.sha256').write_text('not-validated')
            config['backup_roots'] = [tmp]
            with patch.object(m, 'command', side_effect=RuntimeError('no docker')):
                data, _ = m.collect(config)
        self.assertFalse(data['local_backup']['restore_verified'])
        self.assertFalse(data['local_backup']['cos_verified'])
        self.assertIsNotNone(data['local_backup']['age_seconds'])

    def test_successful_collector_recovers_previous_failure_and_detects_exposure(self):
        config = copy.deepcopy(CONFIG)
        config['tls_hosts'] = []
        config['ready_urls'] = []
        config['backup_roots'] = []
        config['cos_backup_receipt'] = None
        def docker(args, **kwargs):
            if args[1] == 'inspect':
                name = args[-1]
                ports = {'5432/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '5432'}]} if name.endswith('postgres') else {}
                return name + '|running|healthy|0|sha256:same|' + json.dumps(ports) + '|false|bridge'
            return ''
        with patch.object(m, 'command', side_effect=docker):
            _, checks = m.collect(config)
        levels = {c['key']: c['level'] for c in checks}
        self.assertEqual(levels['collector:containers'], 'ok')
        self.assertEqual(levels['isolation:eduk12-prod-postgres'], 'critical')
        old = {'collector:containers': {'observed': 'critical', 'consecutive': 2, 'confirmed': 'critical', 'last_event': 1}}
        state, _ = m.transitions(old, checks, 2, CONFIG)
        _, events = m.transitions(state, checks, 3, CONFIG)
        self.assertTrue(any(e['key'] == 'collector:containers' and e['event'] == 'recovered' for e in events))

    def test_cos_receipt_is_historical_evidence_and_future_timestamp_is_rejected(self):
        config = copy.deepcopy(CONFIG)
        config['tls_hosts'] = []
        config['ready_urls'] = []
        config['backup_roots'] = []
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, 'manifest.json')
            config['cos_backup_receipt'] = str(path)
            receipt = {'at': m.dt.datetime.now(m.dt.timezone.utc).isoformat(),
                       'objects': [{'downloadVerified': True, 'authenticatedDecryptionVerified': True}]}
            path.write_text(json.dumps(receipt))
            with patch.object(m, 'command', side_effect=RuntimeError('no docker')):
                data, checks = m.collect(config)
            self.assertTrue(data['backup_evidence']['cos_receipt_verified'])
            self.assertFalse(data['backup_evidence']['live_cos_check'])
            self.assertEqual(next(c['level'] for c in checks if c['key'] == 'backup_evidence_freshness'), 'ok')
            receipt['at'] = '2099-01-01T00:00:00+00:00'
            path.write_text(json.dumps(receipt))
            with patch.object(m, 'command', side_effect=RuntimeError('no docker')):
                _, checks = m.collect(config)
            self.assertEqual(next(c['level'] for c in checks if c['key'] == 'collector:backups'), 'critical')

    def test_atomic_state_is_private_and_complete(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, 'state.json')
            m.atomic_json(path, {'value': 1})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(path.read_text()), {'value': 1})
            self.assertFalse(path.with_suffix('.tmp').exists())

    def test_failed_or_stale_periodic_backup_is_not_masked_by_fresh_local_artifact(self):
        config = copy.deepcopy(CONFIG)
        config.update(tls_hosts=[], ready_urls=[])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'fresh.edubackup.enc').write_bytes(b'not-verified')
            (root / 'fresh.edubackup.enc.sha256').write_text('not-verified')
            config.update(backup_roots=[tmp], cos_backup_receipt=str(root / 'receipt.json'), periodic_backup_status=str(root / 'status.json'))
            receipt = {'at': m.dt.datetime.now(m.dt.timezone.utc).isoformat(), 'status': 'VERIFIED',
                       'restore': {'status': 'PASS'}, 'objects': [{'downloadVerified': True, 'authenticatedDecryptionVerified': True}]}
            (root / 'receipt.json').write_text(json.dumps(receipt))
            for status, expected in [('VERIFIED', 'ok'), ('FAILED', 'critical')]:
                (root / 'status.json').write_text(json.dumps({'status': status}))
                with patch.object(m, 'command', side_effect=RuntimeError('no docker')):
                    _, checks = m.collect(config)
                self.assertEqual(next(c['level'] for c in checks if c['key'] == 'periodic_backup_success'), expected)
            receipt['at'] = '2020-01-01T00:00:00+00:00'
            (root / 'receipt.json').write_text(json.dumps(receipt)); (root / 'status.json').write_text(json.dumps({'status': 'VERIFIED'}))
            with patch.object(m, 'command', side_effect=RuntimeError('no docker')):
                data, checks = m.collect(config)
            self.assertEqual(next(c['level'] for c in checks if c['key'] == 'periodic_backup_success'), 'critical')
            self.assertLess(data['local_backup']['age_seconds'], 5)


if __name__ == '__main__':
    unittest.main()
