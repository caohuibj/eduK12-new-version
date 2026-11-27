import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
MODULES = 'server-version/backend/src/modules'
SCALE = f'{MODULES}/scale/instruments/who5'
BUNDLE = f'{MODULES}/assessment-bundle/packages/bedtime_sleep'
ARTWORK = 'server-version/frontend/src/scale-report-artwork/who5/1.0.0/1.0.0'
ORIGIN = 'https://github.com/caohuibj/eduK12-new-version.git'
IMAGE_ID = 'sha256:' + ('a' * 64)
ACTOR_ID = '5ca1e001-89a3-4adc-b219-3ded222b7121'


class ContentReleaseExport(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.scripts = self.repo / 'server-version/scripts/release'
        self.scripts.mkdir(parents=True)
        for name in ('update.sh', 'export-content-releases.py'):
            shutil.copyfile(SCRIPTS / name, self.scripts / name)
        self.git('init', '-q')
        self.git('remote', 'add', 'origin', ORIGIN)
        self.write(SCALE + '/releases.json', '{"scale": true}')
        self.write(SCALE + '/reports/1.1.0.json', '{}')
        self.write(SCALE + '/1.0.0/instrument.ts', 'not an exported runtime')
        self.write(BUNDLE + '/releases.json', '{"bundle": true}')
        self.write(BUNDLE + '/1.0.0/manifest.json', '{}')
        for fixture in ('valid', 'missing', 'invalid', 'not-applicable'):
            self.write(f'{BUNDLE}/1.0.0/fixtures/{fixture}.json', '{}')
        self.write(BUNDLE + '/1.0.0/fixtures/extra.json', '{}')
        self.write(BUNDLE + '/1.0.0/private.js', 'not a declaration')
        self.write(ARTWORK + '/report-artwork.json', '{}')
        self.commit()
        self.write(SCALE + '/releases.json', '{"uncommitted": true}')

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], text=True).strip()

    def write(self, name, content):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
        return path

    def commit(self):
        self.git('add', '-A')
        self.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                 'commit', '-qm', 'Fixture declarations')
        self.sha = self.git('rev-parse', 'HEAD')
        self.git('update-ref', 'refs/remotes/origin/main', self.sha)

    def export(self, destination, profile, *, sha=None):
        return subprocess.run(['python3', str(self.scripts / 'export-content-releases.py'),
                               str(self.repo), sha or self.sha, str(destination), profile],
                              capture_output=True, text=True)

    def dispatch(self, *args):
        return subprocess.run(['bash', str(self.scripts / 'update.sh'), 'content',
                               '--entry', str(self.repo / 'compose-entry'),
                               '--ops-overlay', str(self.repo / 'ops.json'), *args],
                              capture_output=True, text=True,
                              env={**os.environ, 'PATH': f"{self.repo}:{os.environ['PATH']}"})

    def test_committed_blob_allowlist_and_legacy_layout(self):
        destination = self.repo / 'exported'
        destination.mkdir()
        result = self.export(destination, 'content')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((destination / 'scale/who5/releases.json').read_text()), {'scale': True})
        self.assertFalse((destination / 'scale/who5/1.0.0/instrument.ts').exists())
        self.assertTrue((destination / 'bundle/bedtime_sleep/releases.json').exists())
        self.assertEqual(
            {path.name for path in (destination / 'bundle/bedtime_sleep/1.0.0/fixtures').iterdir()},
            {'valid.json', 'missing.json', 'invalid.json', 'not-applicable.json'},
        )
        self.assertFalse((destination / 'bundle/bedtime_sleep/1.0.0/private.js').exists())
        approved = json.loads((destination / 'scale/.artwork/approved.json').read_text())
        self.assertEqual(approved['files']['who5/1.0.0/1.0.0/report-artwork.json'],
                         self.git('rev-parse', 'HEAD:' + ARTWORK + '/report-artwork.json'))
        retry = self.export(destination, 'content')
        self.assertNotEqual(retry.returncode, 0)
        self.assertIn('destination must be empty', retry.stderr)

        legacy = self.repo / 'legacy'
        legacy.mkdir()
        result = self.export(legacy, 'scale')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((legacy / 'who5/releases.json').exists())
        self.assertTrue((legacy / '.artwork/approved.json').exists())
        self.assertFalse((legacy / 'bundle').exists())

    def test_cognitive_exports_only_declaration_files(self):
        prefix = f'{MODULES}/cognitive/tasks/'
        included = ('gonogo/releases.json', 'gonogo/parameters/1.1.0.json', 'gonogo/reports/1.1.0.json')
        excluded = ('gonogo/seeds.ts', 'gonogo/task-package.json', 'gonogo/fixtures/baseline.json')
        for relative in included + excluded:
            self.write(prefix + relative, '{}')
        self.commit()
        output = self.repo / 'exported'
        output.mkdir()
        result = self.export(output, 'content')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            {str(path.relative_to(output / 'cognitive')) for path in (output / 'cognitive').rglob('*') if path.is_file()},
            set(included),
        )

    def test_sjt_exports_only_declaration_files(self):
        prefix = f'{MODULES}/situational/instruments/'
        included = ('example-sjt/releases.json', 'example-sjt/parameters/1.1.0.json', 'example-sjt/reports/1.1.0.json', 'example-sjt/1.0.0/content.json')
        excluded = ('example-sjt/1.0.0/instrument.json', 'example-sjt/1.0.0/publication.json', 'example-sjt/parameters/01.1.0.json')
        for relative in included + excluded:
            self.write(prefix + relative, '{}')
        self.commit()
        output = self.repo / 'exported'
        output.mkdir()
        result = self.export(output, 'content')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            {str(path.relative_to(output / 'sjt')) for path in (output / 'sjt').rglob('*') if path.is_file()},
            set(included),
        )

    def test_form_exports_only_declaration_files(self):
        prefix = f'{MODULES}/form/templates/'
        included = ('demographics_v1/releases.json', 'demographics_v1/1.0.0.json', 'demographics_v1/reports/1.1.0.json')
        excluded = ('demographics_v1/sample.ts', 'demographics_v1/fixtures/extra.json', 'demographics_v1/reports/1..0.json')
        for relative in included + excluded:
            self.write(prefix + relative, '{}')
        self.commit()
        output = self.repo / 'exported'
        output.mkdir()
        result = self.export(output, 'content')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            {str(path.relative_to(output / 'form')) for path in (output / 'form').rglob('*') if path.is_file()},
            set(included),
        )

    def test_missing_scale_controls_fail_only_for_generalized_sync(self):
        (self.repo / (SCALE + '/releases.json')).unlink()
        self.commit()
        content = self.repo / 'exported'
        content.mkdir()
        result = self.export(content, 'content')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('must contain a Scale release control file', result.stderr)
        legacy = self.repo / 'legacy'
        legacy.mkdir()
        result = self.export(legacy, 'scale')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_ref_and_file_type_are_enforced(self):
        destination = self.repo / 'exported'
        destination.mkdir()
        result = self.export(destination, 'content', sha='f' * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('origin/main commit', result.stderr)
        manifest = self.repo / (BUNDLE + '/1.0.0/manifest.json')
        manifest.unlink()
        manifest.symlink_to('rules.json')
        self.commit()
        result = self.export(destination, 'content')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Expected a regular release JSON blob', result.stderr)

    def test_plan_validates_flags_without_running_ops(self):
        for family in ('content', 'scale'):
            with self.subTest(family=family):
                result = self.dispatch(f'--{family}-main-sha', self.sha)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(f'run {family}:sync-releases', result.stdout)
                self.assertIn(self.sha, result.stdout)

        result = self.dispatch('--content-main-sha', self.sha, '--scale-main-sha', self.sha)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('one Git release input flag', result.stderr)
        result = self.dispatch('--content-main-sha', 'b' * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('approved, fetched origin/main commit', result.stderr)
        result = self.dispatch('--content-main-sha', self.sha, '--', 'bundle:package:publish')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('selects its own synchronizer', result.stderr)

    def test_apply_mounts_verified_data_read_only_without_restarting(self):
        for family in ('content', 'scale'):
            with self.subTest(family=family):
                profile = json.dumps({'services': {'migrate': {
                    'image': IMAGE_ID,
                    'environment': {'DATABASE_URL': 'fixture-only', 'SYSTEM_GIT_RELEASE_ACTOR_ID': ACTOR_ID},
                }}})
                entry = self.write('compose-entry', f"""#!/usr/bin/env python3
import json
import sys
from pathlib import Path
args = sys.argv[1:]
if args == ['ps', '--status', 'running', '-q', 'frontend']:
    print('0123456789ab')
elif args[-3:] == ['config', '--format', 'json']:
    print({profile!r})
else:
    assert args[4:8] == ['run', '--rm', '--no-deps', '--pull'], args
    assert args[8:10] == ['never', '-v'], args
    host, mount, mode = args[10].split(':')
    assert mount == '/{family}-release-input' and mode == 'ro', args
    assert args[11:] == ['migrate', 'npm', 'run', '{family}:sync-releases', '--', mount, '{self.sha}'], args
    exported = Path(host)
    scale = exported / 'scale' if '{family}' == 'content' else exported
    assert (exported / 'bundle').exists() is ('{family}' == 'content')
    assert json.loads((scale / 'who5/releases.json').read_text()) == {{'scale': True}}
    assert (scale / '.artwork/live-0123456789ab.json').is_file()
    print('SYNCED', host)
""")
                entry.chmod(0o755)
                docker = self.write('docker', f"""#!/usr/bin/env python3
import sys
from pathlib import Path
args = sys.argv[1:]
if args == ['image', 'inspect', '--format', '{{{{.Id}}}}', '{IMAGE_ID}']:
    print('{IMAGE_ID}')
elif args[:2] == ['cp', '0123456789ab:/usr/local/share/eduk12/scale-artwork-inventory.json']:
    Path(args[2]).write_text('{{"schemaVersion":1,"files":{{}}}}')
else:
    raise SystemExit(2)
""")
                docker.chmod(0o755)
                result = self.dispatch(f'--{family}-main-sha', self.sha, '--apply')
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('SYNCED', result.stdout)
                exported_path = Path(result.stdout.split('SYNCED ', 1)[1].strip())
                self.assertFalse(exported_path.exists())
                self.assertNotIn('fixture-only', result.stdout)


if __name__ == '__main__':
    unittest.main()
