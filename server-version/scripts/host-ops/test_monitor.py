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

    def test_joint_recovery_failure_and_stale_status_alert_but_baseline_wait_is_normal(self):
        import datetime as dt
        config = copy.deepcopy(CONFIG); config['tls_hosts'] = []; config['ready_urls'] = []; config['backup_roots'] = []
        with tempfile.TemporaryDirectory() as tmp:
            status = Path(tmp, 'recovery.json'); config['cos_recovery_status'] = str(status)
            for state, hours, expected in [('FAILED',0,'critical'),('VERIFIED',4,'warning'),('BLOCKED',0,'ok'),('SKIPPED',0,'ok')]:
                status.write_text(json.dumps({'at':(dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=hours)).isoformat(),'status':state,'error':'code-only'}))
                with patch.object(m,'command',side_effect=RuntimeError('isolated')):data,checks=m.collect(config)
                self.assertEqual(next(c['level'] for c in checks if c['key']=='cos_joint_recovery_health'),expected)
                self.assertNotIn('error',data['cos_recovery'])

    def test_skipped_attempt_never_refreshes_last_success_and_pending_recovery_is_critical(self):
        import datetime as dt
        config=copy.deepcopy(CONFIG);config.update(tls_hosts=[],ready_urls=[],backup_roots=[])
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp,'attempt.json');config['periodic_backup_attempt']=str(p)
            p.write_text(json.dumps({'at':dt.datetime.now(dt.timezone.utc).isoformat(),'status':'SKIPPED','reason':'COS_CLEANUP_TRANSACTION_PENDING'}))
            r=Path(tmp,'recovery.json');config['cos_recovery_status']=str(r)
            r.write_text(json.dumps({'at':dt.datetime.now(dt.timezone.utc).isoformat(),'status':'SKIPPED','reason':'pending_cleanup_requires_resume'}))
            with patch.object(m,'command',side_effect=RuntimeError('isolated')):data,checks=m.collect(config)
            levels={x['key']:x['level'] for x in checks}
            self.assertEqual(levels['database_backup_attempt'],'critical')
            self.assertEqual(levels['cos_joint_recovery_health'],'critical')
            self.assertEqual(data['database_backup_attempt']['status'],'SKIPPED')

    def test_space_maintenance_skip_is_not_a_fresh_success(self):
        import datetime as dt
        config=copy.deepcopy(CONFIG);config.update(tls_hosts=[],ready_urls=[],backup_roots=[])
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp,'storage.json');config['storage_status']=str(p)
            for status,level in [('COMPLETE','ok'),('SKIPPED','warning'),('FAILED','critical')]:
                p.write_text(json.dumps({'at':dt.datetime.now(dt.timezone.utc).isoformat(),'status':status}))
                with patch.object(m,'command',side_effect=RuntimeError('isolated')):_,checks=m.collect(config)
                self.assertEqual(next(x['level'] for x in checks if x['key']=='storage_maintenance'),level)

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
                return name + '|running|healthy|0|sha256:same|' + json.dumps(ports) + '|false|bridge||id-' + name
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

    def replica_checks(self, edit=None, explicit=True):
        config = copy.deepcopy(CONFIG)
        names = ['ui', 'api-1', 'api-2', 'job-1', 'job-2']
        config.update(containers=names, tls_hosts=[], ready_urls=[], backup_roots=[])
        roles = {'api-1': 'backend', 'api-2': 'backend', 'job-1': 'worker', 'job-2': 'worker'}
        if explicit:
            config['runtime_container_roles'] = roles
        else:
            config.pop('runtime_container_roles', None)
        rows = {name: {'image': 'sha256:ui' if name == 'ui' else 'sha256:runtime',
                       'status': 'running', 'health': 'none', 'service': roles.get(name, 'frontend')} for name in names}
        if edit:
            edit(config, rows)
        visited = []
        def docker(args, **kwargs):
            if args[1] != 'inspect':
                return ''
            name = args[-1]; visited.append(name)
            row = rows.get(name)
            if row is None:
                raise RuntimeError('must-not-leak-command-error')
            return '|'.join([name, row['status'], row['health'], '0', row['image'], '{}', 'false', 'bridge', row['service'], 'id-' + name])
        with patch.object(m, 'command', side_effect=docker):
            data, checks = m.collect(config)
        return data, {check['key']: check['level'] for check in checks}, checks, visited

    def test_every_configured_runtime_replica_is_compared_by_explicit_role_or_compose_service(self):
        for explicit in [True, False]:
            _, levels, _, _ = self.replica_checks(explicit=explicit)
            self.assertEqual(levels['runtime_image_match'], 'ok')
        for name in ['api-1', 'api-2', 'job-1', 'job-2']:
            _, levels, _, _ = self.replica_checks(lambda _config, rows: rows[name].update(image='sha256:wrong'))
            self.assertEqual(levels['runtime_image_match'], 'critical', name)

    def test_missing_replica_keeps_other_observations_and_never_claims_complete_parity(self):
        data, levels, checks, visited = self.replica_checks(lambda _config, rows: rows.pop('api-2'))
        self.assertEqual(levels['container:api-2'], 'critical')
        self.assertEqual(levels['collector:containers'], 'critical')
        self.assertEqual(levels['runtime_image_match'], 'critical')
        self.assertEqual(levels['container:job-2'], 'ok')
        self.assertIn('job-2', visited)
        self.assertIn('job-2', data['containers'])
        self.assertNotIn('must-not-leak-command-error', json.dumps(checks))

    def test_each_single_restart_opens_once_then_uses_existing_reminder_and_recovery(self):
        previous, alerts, all_events = {}, {}, []
        def sample(count):
            return {'worker': {'id': 'same-container', 'image': 'same-image', 'restarts': count}}
        for count, now in [(0, 100), (1, 400), (2, 700), (3, 1000), (4, 400 + CONFIG['repeat_seconds'])]:
            current = sample(count)
            checks = m.restart_findings(current, previous)
            self.assertEqual(checks[0]['level'], 'ok' if count == 0 else 'warning')
            alerts, events = m.transitions(alerts, checks, now, CONFIG)
            all_events.extend(events); previous = current
        self.assertEqual([event['event'] for event in all_events], ['opened', 'reminder'])
        _, events = m.transitions(alerts, m.restart_findings(sample(4), previous), 23000, CONFIG)
        self.assertEqual([event['event'] for event in events], ['recovered'])

    def test_unchanged_counters_and_replacement_or_legacy_baselines_do_not_alert(self):
        old = {'worker': {'id': 'old-id', 'image': 'old-image', 'restarts': 1}}
        for item in [
            {'id': 'old-id', 'image': 'old-image', 'restarts': 1},
            {'id': 'old-id', 'image': 'old-image', 'restarts': 0},
            {'id': 'new-id', 'image': 'old-image', 'restarts': 5},
            {'id': 'old-id', 'image': 'new-image', 'restarts': 5},
        ]:
            checks = m.restart_findings({'worker': item}, old)
            self.assertEqual(checks[0]['details']['delta'], 0)
            self.assertEqual(m.transitions({}, checks, 100, CONFIG)[1], [])
        checks = m.restart_findings({'worker': {'id': 'current-id', 'image': 'old-image', 'restarts': 5}},
                                   {'worker': {'image': 'old-image', 'restarts': 0}})
        self.assertEqual(checks[0]['level'], 'ok')

    def test_unhealthy_or_exited_replica_is_critical(self):
        for edit in [{'status': 'exited'}, {'health': 'unhealthy'}]:
            _, levels, _, _ = self.replica_checks(lambda _config, rows: rows['job-2'].update(edit))
            self.assertEqual(levels['container:job-2'], 'critical')

    def test_missing_runtime_group_or_invalid_explicit_roles_cannot_report_parity(self):
        for edit in [
            lambda config, rows: config.update(runtime_container_roles={'api-1': 'backend', 'api-2': 'backend', 'job-1': 'backend', 'job-2': 'backend'}),
            lambda config, rows: config.update(runtime_container_roles={'unknown': 'worker'}),
            lambda config, rows: config.update(runtime_container_roles={'job-1': 'typo'}),
            lambda config, rows: config['containers'].append('api-1'),
        ]:
            _, levels, _, _ = self.replica_checks(edit)
            self.assertNotEqual(levels.get('runtime_image_match'), 'ok')

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
