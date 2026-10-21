"""One frozen scale-authoring PR: read official evidence, never execute application checks."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

spec = importlib.util.spec_from_file_location('reuse', Path(__file__).with_name('scale-authoring-reuse.py'))
reuse = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reuse)
SOURCE = '8c56b5f7da3fdc16eca054fdf5f4c1612c421aea'
RUN = 39574936019
BASE = 'd3b51288a66843168480af99fe451914a76a020f'
CONTROL_PATHS = {
    '.github/scripts/exact-candidate-scope.mjs', '.github/scripts/exact-candidate-bindings.json',
    '.github/scripts/exact-candidate.test.mjs', '.github/workflows/ci-exact-candidate.yml',
    '.github/workflows/ci.yml', '.github/scripts/scale-authoring-bindings.json',
    '.github/scripts/scale-authoring-admission.py', '.github/scripts/scale-authoring-admission.test.py',
    'docs/release/README.md',
}
ARTIFACTS = {
    'fullSast': (12330406467, 'scale-sast-9b289945f5c782b98027ff7228c344c362247e17', 252077, '731d28c43c921637b8cda1721cba9946a32e236cf7313664f4b120894d682baa'),
    'browser': (12334042409, 'scale-browser-' + SOURCE, 2578944, '1a8acafc82e0ccb07fc0439aa8f4594e0173c2e4b8bf9eb61c7010e0705be0a0'),
    'admission': (12334141421, 'scale-browser-continuation-' + SOURCE, 116173, '9106251d99a7da246b04e9dad8f9f18181e5c796d871826edc32ecce97d46c48'),
    'sast': (12333477632, 'scale-sast-' + SOURCE, 70565, 'c73d43d981eb48821af127c7e34741d99727e6c15aa9027a82865579dafc4795'),
    'training': (12332407955, 'scale-browser-7daa3ad8cb0fb9597303a2ef3e1c28c3209dd548', 2645376, '4ed07312ff97a33673f5670432977d50ed8e3bd217c908c97280819692d6093f'),
}


def check_scope(plan):
    assert plan['candidate'] == 'scale-authoring' and plan['base'] == BASE and plan['postMerge'] is False
    assert os.environ['CI_EVENT'] == 'pull_request' and os.environ['CI_HEAD_REF'] == 'work/scale-authoring-feedback-20261021'
    assert plan['sourceHead'] == os.environ['CI_SOURCE_HEAD']
    assert plan['head'] == reuse.git('rev-parse', 'HEAD') and plan['tree'] == reuse.git('rev-parse', 'HEAD^{tree}')
    assert plan['tree'] == reuse.git('rev-parse', plan['sourceHead'] + '^{tree}'), 'PR merge tree differs from source tree'
    changed = set(reuse.git('diff', '--name-only', SOURCE, 'HEAD').splitlines())
    assert changed == CONTROL_PATHS, 'Only the reviewed nine admission controls may differ from successful browser candidate'
    for line in reuse.git('diff', '--raw', '--no-abbrev', '--no-renames', SOURCE, 'HEAD').splitlines():
        header, path = line.split('\t'); before_mode, after_mode, before, after, status = header[1:].split()
        assert path in CONTROL_PATHS and status in ['A', 'M'] and after_mode == '100644' and before_mode in ['000000', '100644']
    # Recompute the exact existing PR router, not a supplied green plan.
    source = "import {exactCandidatePlan} from './.github/scripts/exact-candidate-scope.mjs';console.log(JSON.stringify(exactCandidatePlan(process.argv[1],process.argv[2])));"
    actual = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', source, BASE, plan['head']], text=True))
    assert actual == plan, 'Recomputed candidate plan changed'


def verify_final_jobs(read=reuse.api):
    run = read('runs/' + str(RUN))
    assert run['head_sha'] == SOURCE and run['run_attempt'] == 1 and run['status'] == 'completed' and run['conclusion'] == 'success'
    assert run['path'] == '.github/workflows/ci-scale-authoring-browser-diagnostic.yml' and run['event'] == 'push'
    assert run['head_branch'] == 'ci/scale-authoring-browser-diagnostic-20261021'
    for jid, name in [(119138000303, 'scope'), (119138159777, 'browser'), (119138159971, 'sast'), (119139431753, 'ready')]:
        job = read('jobs/' + str(jid))
        assert job['run_id'] == RUN and job['head_sha'] == SOURCE and job['name'] == name and job['conclusion'] == 'success'
    for jid, run_id, head in [(119115404858, 39568118300, '312cfdc95e53b243b2de0bea9beb5ca3a3132a81'),
                              (119115404683, 39568118300, '312cfdc95e53b243b2de0bea9beb5ca3a3132a81'),
                              (119106743347, 39565491980, '9b289945f5c782b98027ff7228c344c362247e17')]:
        job = read('jobs/' + str(jid))
        assert job['run_id'] == run_id and job['head_sha'] == head and job['conclusion'] == 'success'


def download(name, output):
    previous = reuse.FRONTEND_SOURCE, reuse.FRONTEND_RUN
    reuse.FRONTEND_SOURCE, reuse.FRONTEND_RUN = (('7daa3ad8cb0fb9597303a2ef3e1c28c3209dd548', 39571934879) if name == 'training' else (SOURCE, RUN))
    if name == 'fullSast': reuse.FRONTEND_SOURCE, reuse.FRONTEND_RUN = ('9b289945f5c782b98027ff7228c344c362247e17', 39565491980)
    key = 'currentFrontendAdmission' + name
    reuse.ARTIFACTS[key] = ARTIFACTS[name]
    try:
        reuse.download(key, output)
    finally:
        reuse.FRONTEND_SOURCE, reuse.FRONTEND_RUN = previous


def verify_completed_frontend(folder):
    checks = json.loads((folder / 'frontend-resume-checks.json').read_text())
    assert checks == {'typecheck': 'PASS', 'lint': 'PASS', 'sourceRun': 39565491980, 'compilerRepeated': False, 'testsRepeated': False, 'auditRepeated': False}
    result = json.loads((folder / 'frontend-runtime-reassembly.json').read_text())
    assert result == {'sourceRun': 39565491980, 'sourceHead': '9b289945f5c782b98027ff7228c344c362247e17', 'candidateHead': '312cfdc95e53b243b2de0bea9beb5ca3a3132a81', 'compilerRepeated': False, 'runtimeReassembled': True, 'allOriginalCompilerHashesMatch': True}
    scan = json.loads((folder / 'frontend-runtime-scan.json').read_text())
    image = json.loads((folder / 'frontend-reassembled-image.json').read_text())
    assert scan['ArtifactName'] == 'scale-authoring-frontend-runtime:312cfdc95e53b243b2de0bea9beb5ca3a3132a81'
    assert scan['Metadata']['ImageID'] == image['Id'] and scan['ArtifactName'] in image['RepoTags']
    assert 'Results' in scan and not [v for row in scan['Results'] for v in row.get('Vulnerabilities', []) if v['Severity'] in ['HIGH', 'CRITICAL']]


def verify_browser(folder, training):
    report_file = folder / 'browser/result.json'
    assert hashlib.sha256(report_file.read_bytes()).hexdigest() == 'a461700ec8eb1acc5b5fa4e89407c941d91b6073aa184f7ad7275f8ce2969779'
    report = json.loads(report_file.read_text())
    script = "import {readFileSync} from 'node:fs';import {browserCheck} from './.github/scripts/scale-authoring-scope.mjs';console.log(JSON.stringify(browserCheck(JSON.parse(readFileSync(process.argv[1])),process.argv[2],Number(process.argv[3]))));"
    subprocess.run(['node', '--input-type=module', '-e', script, str(report_file), SOURCE, str(RUN)], check=True)
    assert json.loads((folder / 'cleanup.json').read_text()) == {'exitStatus': 0, 'privateMaterialRemoved': True}
    prior_file = training / 'browser/result.json'
    assert hashlib.sha256(prior_file.read_bytes()).hexdigest() == 'd7511d708d7b12dc643f02061b526da9b9bb61292ddc5172a7a1300bc95ad3e3'
    prior = json.loads(prior_file.read_text())
    assert prior['status'] == 'FAIL' and prior['phase'] == 'survey-publication'
    assert json.loads((training / 'cleanup.json').read_text()) == {'exitStatus': 0, 'privateMaterialRemoved': True}
    for key in ['checks', 'screenshots', 'layoutChecks', 'accessibility', 'computedStyles', 'participantAnswers', 'imageAuthorization']:
        name = (lambda x: x) if key == 'checks' else (lambda x: x['name'])
        filtered = lambda rows: [x for x in rows if name(x).startswith('training')]
        assert filtered(report[key]) == filtered(prior[key]), 'Training inherited observation changed: ' + key
    for shot in report['screenshots']:
        file = folder / 'browser' / shot['file']; assert file.stat().st_size > 0 and file.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
        if shot['name'].startswith('training'):
            expected = report['journeySources']['training']['screenshotHashes'][shot['file']]
            assert hashlib.sha256(file.read_bytes()).hexdigest() == expected
            assert file.read_bytes() == (training / 'browser' / shot['file']).read_bytes()
    return report


def main():
    plan = json.loads(Path(sys.argv[1]).read_text()); check_scope(plan); verify_final_jobs()
    # Read the already-reviewed official backend/PG/regression/audit evidence again; no tests/builds run.
    subprocess.run(['python3', '-B', '.github/scripts/scale-authoring-reuse.py', 'verify'], check=True)
    for key in ['backend', 'currentFrontend']:
        reuse.artifact_identity(reuse.api('artifacts/' + str(reuse.ARTIFACTS[key][0])), key)
    output = Path('scale-authoring-pr-evidence')
    for name in ARTIFACTS: download(name, output / name)
    verify_completed_frontend(output / 'admission/completed-frontend')
    report = verify_browser(output / 'browser', output / 'training')
    for name in ['sast', 'fullSast']:
        sast = json.loads((output / name / 'javascript.sarif').read_text())
        assert sast['runs'] and all(row['tool']['driver']['semanticVersion'] == '2.27.2' for row in sast['runs'])
    # Previous SAST completion, not a claim that historical full-repository findings were absent.
    receipt = {'status': 'PASS', 'plan': plan, 'officialSourceRun': RUN, 'officialSourceHead': SOURCE,
               'currentConsumerRun': os.environ['GITHUB_RUN_ID'], 'requiredEvidence': plan['required'],
               'applicationChecksRepeated': False, 'journeySources': report['journeySources'],
               'sast': 'Original application analyses completed; current changed admission controls require separate codeql success.',
               'runtimeArchiveLimitation': 'Frontend runtime scan is verified; no retained frontend runtime image tar or deployment qualification is claimed.',
               'productionAuthorized': False}
    Path('scale-authoring-pr-admission.json').write_text(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
