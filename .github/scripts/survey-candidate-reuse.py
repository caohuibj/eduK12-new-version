"""Fixed PR309 evidence chain: original compile A, browser-failed candidate B,
then the exact two-line accessibility repair C. This is not a general cache.
Original failed jobs and reports remain unchanged; only explicitly unaffected
qualifications are retained. New frontend bytes and browser must qualify in C.
Importing does no I/O. Official downloads and Docker loads are Actions-only.
"""
import datetime
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
import urllib.request
import zipfile

REPOSITORY = 'caohuibj/eduK12-new-version'
PR_NUMBER = 309
SOURCE_RUN = 39025859313
SOURCE_JOB = 117376623723
SOURCE_HEAD = '351b2b31656e23a6302d7f1cd91ba3d464a15697'
SOURCE_MERGE = '0ae2f862fc333e7d6ea144a58f9a04ed0284d57c'
SOURCE_TREE = 'd9317b41d90437eb4fe350db80cc3597076e5b1a'
SOURCE_ARTIFACT = 12098149475
SOURCE_ARTIFACT_DIGEST = 'sha256:a4fc034c58fb819d0caab0e49d733c02b6d0332119381902a23a706888a34226'
SOURCE_ARTIFACT_SIZE = 1044554171
REUSED_PHASES = (
    'backend-compile', 'backend-builder-archive', 'backend-dependency-audit',
    'backend-runtime', 'backend-archive', 'frontend-compile', 'frontend-builder-archive',
)
FAILED_PHASE = 'frontend-changed-types-lint'
COMPILE_STEP = 'compile changed components once, types, lint, audits and immutable archives'
DOWNSTREAM_STEPS = (
    'scan exact backend-worker and frontend runtime images',
    'migrate disposable services and enforce restricted runtime',
    'run missing and integrated-schema backend contracts only',
    'run affected and missing frontend contracts only',
    'production Redis behavior, legacy upgrade and new-format restore',
    'install official pinned browser tools',
    'real three-role Chromium and Survey retention smoke',
)
CLEANUP_STEP = "remove only this run's isolated resources and private browser material"
# Refreshed only from the owner's exact reviewed transition manifest. A missing
# executor/test transition intentionally prevents admission until integration.
PARTIAL_TRANSITIONS_FINALIZED = True
SELF_PATH = '.github/scripts/survey-candidate-reuse.py'
REVIEWED_TRANSITIONS = {
    '.github/workflows/ci.yml': {
        'before': '77b87d41e9ab422edfb8253bed8fbf26da5fd39c',
        'after': '3e26ce8e887b4fce7bbb53e8bc01d6b9df5d30ec',
    },
    '.github/workflows/ci-survey-candidate.yml': {
        'before': '540757c3a3f99659cc3d480fa62ab4a102ead9e8',
        'after': 'e4b773693870680bb582c068aabbb305713e5b79',
    },
    '.github/scripts/survey-candidate-scope.mjs': {
        'before': '88806955c5c6d406c6fc70f19bcfcd92ebed671c',
        'after': '4de4991e160cf7b6752e4a9a82974c3e5ebf0539',
    },
    '.github/scripts/survey-candidate-scope.test.mjs': {
        'before': '0bafd973defbdd1485d9f67874c478eace515665',
        'after': '43cb0b94a0c59e1e43e915e4dcfc2c219a4f703d',
    },
    '.github/scripts/survey-candidate.py': {
        'before': '48a5e939518ddf73fd74de50b079c93b3df7193b',
        'after': 'fcc8d9927ac6ddf43de7921c4375b7a3d263f7f6',
    },
    '.github/scripts/survey-candidate-reuse.test.py': {
        'before': None,
        'after': 'aeffdaf4fd378ee87531341f000368edf87b939b',
    },
    'docs/release/README.md': {
        'before': 'b921dba1ba1ee10dbd01bbcfd22448ef8e07d63a',
        'after': '135b74709a2d873dddea6f57829436acaf2ee226',
    },
}


# A supplied the immutable builders/backend runtime; B completed all contracts
# and failed at precisely the researcher QR accessible-name browser assertion.
ORIGIN_A = {'run': SOURCE_RUN, 'job': SOURCE_JOB, 'head': SOURCE_HEAD,
            'merge': SOURCE_MERGE, 'tree': SOURCE_TREE, 'artifact': SOURCE_ARTIFACT,
            'digest': SOURCE_ARTIFACT_DIGEST, 'size': SOURCE_ARTIFACT_SIZE}
ORIGIN_B = {
    'run': 39027388711, 'job': 117381086707,
    'head': '1f6e309eec12a573207dfc98772225d2ae0ce8a9',
    'merge': 'f4cf2bb399e8f46a7d0caffd6858db4cdab5be6b',
    'tree': '5c4e1c58f70bff23cedf105978bbb84990a8e949',
    'artifact': 12098789719,
    'digest': 'sha256:99b78c424d1bd93d7bb648ad3dd9d6a27343d36b15373f3dee8351a6e61822d4',
    'size': 1077596361,
}
B_VERIFIER_BLOB = 'fe285c1b768c9a4b4c8772b26e633e899090843b'
REPAIR_TRANSITIONS_FINALIZED = True
REPAIR_TRANSITIONS = {
    '.github/scripts/survey-candidate-bindings.json': {
        'before': '5dc809344db0bfa9be251dab06d574a554d81d89',
        'after': '43c2fc04118aa6ed112be3bc119bfef6b33331a7',
    },
    '.github/scripts/survey-candidate.py': {
        'before': 'fcc8d9927ac6ddf43de7921c4375b7a3d263f7f6',
        'after': '56b60a851634d6abce0c9815202158c2ccfdf42d',
    },
    '.github/workflows/ci-survey-candidate.yml': {
        'before': 'e4b773693870680bb582c068aabbb305713e5b79',
        'after': '0aa206b2f9bb1c1f02180877deb1d326fcae7163',
    },
    'server-version/frontend/src/survey/SurveyWaveStudio.tsx': {
        'before': '935e1787752d5729b44bd21898bb47ab210d15b9',
        'after': 'e6340fbfb5d2b4c3e25f7d12d782b4fbbc0e80ae',
    },
    'server-version/frontend/src/survey/SurveyWaveStudio.group-ip.test.tsx': {
        'before': 'e6d12858bbd357ad2bcf89431428698f85078cb0',
        'after': '75beb3b57f5759c1d7b8ddf1d5564096070b7be2',
    },
    '.github/scripts/survey-candidate-reuse.test.py': {
        'before': 'aeffdaf4fd378ee87531341f000368edf87b939b',
        'after': 'a0cd16fddc131b3fbf2aea3fe0ec93c810c0efd0',
    },
}
REPAIR_PRODUCT_PATHS = (
    'server-version/frontend/src/survey/SurveyWaveStudio.tsx',
    'server-version/frontend/src/survey/SurveyWaveStudio.group-ip.test.tsx',
)
REPAIR_TESTS = (
    'src/survey/SurveyWaveStudio.group-ip.test.tsx',
    'src/survey/SurveyWaveStudio.preview.test.tsx',
    'src/survey/SurveyWorkspace.requests.test.tsx',
)
B_SUCCESS_PHASES = (
    'frontend-app-types', 'frontend-cognitive-types', 'frontend-changed-lint',
    'frontend-dependency-audit', 'frontend-runtime', 'frontend-archive',
    'integrated-migration', 'restricted-runtime-bootstrap',
    'selected-backend-contracts', 'selected-frontend-contracts',
    'production-redis-runtime', 'legacy-upgrade-new-schema-restore',
)
B_FAILED_PHASE = 'three-role-real-browser'
B_REQUIRED_SUCCESS_STEPS = (
    'restore only verified original successful build phases',
    'resume failed frontend checks and package its existing compiled bytes',
    *DOWNSTREAM_STEPS[:-1], CLEANUP_STEP,
)
B_REPORT_SHA256 = {'survey-candidate-evidence/backend-scan.json': '3fb994e7af0ccdf792913a4b3297af17cce0793df69ce1444f0c09d93f33672e',
    'survey-candidate-evidence/backend-tests.json': 'aa76efcdf357b28e755f06c95d0df492bb635ee3f486fb63349c766d2fa3cf81',
    'survey-candidate-evidence/browser/result.json': 'a19294df5da12940e0c6d532831272a29eb9e3952907bde25418b387a62aae78',
    'survey-candidate-evidence/checks.json': 'c7725cb736e7cd38fc25f5b1e2f20914c39c954aa17dee3b1ff4b615b18ba1ae',
    'survey-candidate-evidence/frontend-scan.json': 'd56e00ea0575c0712c4f7619186f540354adbcd2709debe4131da54798dd5c05',
    'survey-candidate-evidence/frontend-tests.json': '0c5e78f6f10b23a766ca0684ce24863b76d601c423e5ebd1009ea2c239709790',
    'survey-candidate-evidence/original-evidence/survey-candidate-evidence/checks.json': '0cb843dd43ee25c97ae7936e918e80d4d9bf3939d3c636ef16f9ddc95925d0ff',
    'survey-candidate-evidence/original-evidence/survey-candidate-plan.json': '7279fecfabf0c7ff7b478bbde2593065ed9dbd2396a66758a67629c3af40902d',
    'survey-candidate-evidence/qualified-original-checks.json': '0cb843dd43ee25c97ae7936e918e80d4d9bf3939d3c636ef16f9ddc95925d0ff',
    'survey-candidate-evidence/qualified-original-plan.json': '7279fecfabf0c7ff7b478bbde2593065ed9dbd2396a66758a67629c3af40902d',
    'survey-candidate-evidence/recovery-bootstrap.json': '1771a8b6d8ffeaa9ab44a644fb14085ec66032e2e5f3aca20e3295f68b2c685b',
    'survey-candidate-evidence/recovery-result.json': '6ec342145628a7a6f7bef5162058dc8fca803459ab50db16558ee5e25c66b565',
    'survey-candidate-evidence/resume-proof.json': '3273b03a9a20fbdf6ad8b37c2818146ad8dd0e1fb7826846ee1338d2a6b8ca44',
    'survey-candidate-evidence/runtime-fixture.json': 'd085be7a7fec308dab7007a729cbc575533bd796cd8f768fafaad2f0204c6771',
    'survey-candidate-evidence/runtime-restore.json': '8cac2f0ff51b96d62ec915ada9839785c6e042c10374ddf6c70c9470226ea9e4',
    'survey-candidate-evidence/runtime-result.json': 'c3a02921bc84d38f49e86f57a6b53c8a221314cb97f655178f5767c38700576e',
    'survey-candidate-plan.json': '588bbac5e0740e1fd0b3c8cf54c33571923c78bc807440020063540839af820e'}

MAX_DOWNLOAD_BYTES = 12 * 1024**3
MAX_ZIP_EXPANDED_BYTES = 16 * 1024**3
MAX_DOCKER_TAR_BYTES = 40 * 1024**3
MAX_JSON_BYTES = 32 * 1024**2


class ReuseRejected(ValueError):
    """An explicit stop; never a signal to silently rebuild or retest."""


def require(condition, reason):
    if not condition:
        raise ReuseRejected(reason)


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        while chunk := source.read(1024**2):
            digest.update(chunk)
    return digest.hexdigest()


def recent(value, now=None):
    try:
        require(isinstance(value, str), 'MISSING_TIMESTAMP')
        date = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
        require(date.tzinfo is not None, 'TIMESTAMP_WITHOUT_TIMEZONE')
        age = (now or datetime.datetime.now(datetime.timezone.utc)) - date
        return datetime.timedelta(0) <= age < datetime.timedelta(hours=24)
    except (ValueError, TypeError):
        return False


def require_official_ci(environment=None):
    env = os.environ if environment is None else environment
    require(env.get('CI') == 'true' and env.get('GITHUB_ACTIONS') == 'true', 'OFFICIAL_ACTIONS_ONLY')
    require(env.get('GITHUB_REPOSITORY') == REPOSITORY, 'WRONG_REPOSITORY')
    require(env.get('GITHUB_EVENT_NAME') == 'pull_request', 'WRONG_EVENT')
    require(str(env.get('PR_NUMBER')) == str(PR_NUMBER), 'WRONG_PR')


def validate_current_event(event, plan, source_head):
    require(event.get('repository', {}).get('full_name') == REPOSITORY, 'CURRENT_EVENT_REPOSITORY')
    pr = event.get('pull_request', {})
    require(pr.get('number') == PR_NUMBER and event.get('number') == PR_NUMBER, 'CURRENT_EVENT_PR')
    require(pr.get('head', {}).get('repo', {}).get('full_name') == REPOSITORY, 'CURRENT_EVENT_FORK')
    require(bool(re.fullmatch('[0-9a-f]{40}', source_head or '')), 'CURRENT_SOURCE_SHA')
    require(pr.get('head', {}).get('sha') == source_head, 'CURRENT_SOURCE_EVENT_MISMATCH')
    require(plan.get('schema') == 1 and plan.get('route') == 'survey-candidate', 'CURRENT_PLAN_ROUTE')
    require(bool(re.fullmatch('[0-9a-f]{40}', plan.get('head', ''))), 'CURRENT_MERGE_SHA')
    require(bool(re.fullmatch('[0-9a-f]{40}', plan.get('tree', ''))), 'CURRENT_TREE')


def validate_official_source(run, job, artifact, now=None, origin=None):
    """Validate either fixed origin; failed jobs never become whole successes."""
    origin = ORIGIN_A if origin is None else origin
    require(origin in (ORIGIN_A, ORIGIN_B), 'UNKNOWN_EVIDENCE_ORIGIN')
    require(run.get('id') == origin['run'], 'WRONG_SOURCE_RUN')
    require(run.get('repository', {}).get('full_name') == REPOSITORY, 'SOURCE_REPOSITORY')
    require(run.get('head_repository', {}).get('full_name') == REPOSITORY, 'SOURCE_FORK')
    require(run.get('event') == 'pull_request' and run.get('path') == '.github/workflows/ci.yml', 'SOURCE_WORKFLOW_EVENT')
    require(run.get('head_sha') == origin['head'], 'SOURCE_RUN_HEAD')
    require(run.get('status') == 'completed' and recent(run.get('created_at'), now), 'SOURCE_RUN_NOT_TERMINAL_OR_STALE')
    prs = [p for p in run.get('pull_requests', []) if p.get('number') == PR_NUMBER]
    require(len(prs) == 1, 'SOURCE_PR_ASSOCIATION')
    # GitHub updates the linked PR head when its branch moves. The immutable
    # run/job/artifact head fields bind history; this object binds PR identity.
    linked_head, linked_base = prs[0].get('head', {}), prs[0].get('base', {})
    require(linked_head.get('ref') == 'fix/survey-storage-export-roundtrip-20261017'
            and linked_head.get('repo', {}).get('id') == 1338215995
            and bool(re.fullmatch('[0-9a-f]{40}', linked_head.get('sha', ''))), 'SOURCE_PR_HEAD_IDENTITY')
    require(linked_base.get('ref') == 'main' and linked_base.get('repo', {}).get('id') == 1338215995
            and linked_base.get('sha') == '21c1778a545c1988bef65900789c701208b647e5', 'SOURCE_PR_BASE_IDENTITY')
    require(job.get('id') == origin['job'] and job.get('run_id') == origin['run'], 'SOURCE_JOB_ID')
    require(job.get('name') == 'survey-candidate / candidate', 'SOURCE_JOB_NAME')
    require(job.get('head_sha') == origin['head'], 'SOURCE_JOB_HEAD')
    require(job.get('status') == 'completed' and job.get('conclusion') in ('success', 'failure'), 'SOURCE_JOB_NOT_TERMINAL')
    require(recent(job.get('completed_at'), now), 'SOURCE_JOB_STALE')
    require(artifact.get('workflow_run', {}).get('id') == origin['run'], 'ARTIFACT_RUN')
    require(artifact.get('workflow_run', {}).get('head_sha') == origin['head'], 'ARTIFACT_SOURCE_HEAD')
    require(artifact.get('name') == 'survey-candidate-' + origin['merge'], 'ARTIFACT_NAME')
    require(artifact.get('id') == origin['artifact'], 'ARTIFACT_ID')
    require(not artifact.get('expired') and recent(artifact.get('created_at'), now), 'ARTIFACT_EXPIRED_OR_STALE')
    require(type(artifact.get('size_in_bytes')) is int and 0 < artifact['size_in_bytes'] <= MAX_DOWNLOAD_BYTES, 'ARTIFACT_SIZE')
    require(artifact.get('digest') == origin['digest'], 'OFFICIAL_DIGEST_REQUIRED')
    require(artifact.get('size_in_bytes') == origin['size'], 'SOURCE_ARTIFACT_SIZE')
    return {'runId': origin['run'], 'jobId': origin['job'], 'jobConclusion': job['conclusion'],
            'artifactId': artifact['id'], 'artifactDigest': artifact['digest'],
            'sourceHead': origin['head'], 'mergeHead': origin['merge'],
            'observedLinkedPrHead': linked_head['sha'], 'wholeCandidateQualified': False}


def require_candidate_success(job):
    require(job.get('id') == SOURCE_JOB and job.get('run_id') == SOURCE_RUN,
            'WRONG_SUCCESS_JOB')
    require(job.get('status') == 'completed' and job.get('conclusion') == 'success',
            'FAILED_SKIPPED_OR_INCOMPLETE_CANDIDATE_CANNOT_QUALIFY')


def validate_plan_binding(original, proof, current):
    require(original.get('head') == SOURCE_MERGE and proof.get('head') == SOURCE_MERGE, 'ORIGINAL_MERGE_HEAD')
    require(proof.get('sourceHead') == SOURCE_HEAD, 'ORIGINAL_SOURCE_HEAD')
    require(original.get('tree') == SOURCE_TREE and proof.get('tree') == SOURCE_TREE, 'ORIGINAL_TREE')
    for key in ('schema', 'route', 'base', 'changed', 'components', 'backendTests', 'frontendTests', 'selectionBlob', 'required'):
        require(key in original and original[key] == current.get(key), 'CHANGED_PLAN_' + key)
    require(proof.get('components') == original.get('components'), 'PROOF_COMPONENTS')
    require(original.get('changed') == ['frontend', 'backend'], 'EXPECTED_BOTH_COMPONENTS')
    require(set(original.get('components', {})) == {'frontend', 'backend'}, 'COMPONENT_SET')
    for component in ('frontend', 'backend'):
        require(bool(re.fullmatch('[0-9a-f]{40}', original['components'][component])), 'COMPONENT_TREE')
    return True


def require_success_phase(proof, phase_name):
    phases = proof.get('phases', [])
    require(isinstance(phases, list), 'PHASE_LEDGER_REQUIRED')
    names = [phase.get('name') for phase in phases]
    require(len(names) == len(set(names)), 'DUPLICATE_PHASE_LEDGER')
    matches = [phase for phase in phases if phase.get('name') == phase_name]
    require(len(matches) == 1 and matches[0].get('status') == 'success', 'FAILED_SKIPPED_OR_MISSING_PHASE_' + phase_name)
    duration = matches[0].get('seconds')
    require(isinstance(duration, (int, float)) and not isinstance(duration, bool)
            and math.isfinite(duration) and duration >= 0, 'INVALID_PHASE_DURATION')
    require('errorType' not in matches[0], 'CONTRADICTORY_PHASE_ERROR')
    return matches[0]


def validate_test_report(report, selected):
    require(selected and len(selected) == len(set(selected)), 'EXACT_NONEMPTY_TEST_SELECTION')
    require(report.get('success') is True and report.get('numTotalTests', 0) > 0, 'UNSUCCESSFUL_TEST_REPORT')
    require(report.get('numPassedTests') == report['numTotalTests'], 'UNPASSED_TESTS')
    for key in ('numFailedTests', 'numPendingTests', 'numTodoTests', 'numFailedTestSuites', 'numPendingTestSuites'):
        require(report.get(key, 0) == 0, 'FAILED_OR_SKIPPED_' + key)
    suites = report.get('testResults', [])
    require(isinstance(suites, list) and suites, 'TEST_SUITES_REQUIRED')
    for suite in suites:
        require(suite.get('status') == 'passed', 'FAILED_OR_SKIPPED_SUITE')
        require(suite.get('assertionResults') and all(a.get('status') == 'passed' for a in suite['assertionResults']), 'FAILED_OR_SKIPPED_ASSERTION')
    for path in selected:
        require(bool(re.fullmatch(r'src/.+\.test\.tsx?', path)), 'INVALID_SELECTED_TEST_PATH')
        matches = [suite for suite in suites if suite.get('name', '').replace('\\', '/').endswith('/' + path)]
        require(len(matches) == 1, 'MISSING_OR_DUPLICATE_SELECTED_SUITE_' + path)
    return True


def validate_tree_transition(before, after, verifier_blob, transitions=None):
    """Pure Git-tree comparison; entries are path -> (mode, type, object ID)."""
    reviewed = REVIEWED_TRANSITIONS if transitions is None else transitions
    require(bool(re.fullmatch('[0-9a-f]{40}', verifier_blob)), 'VERIFIER_BLOB_REQUIRED')
    expected = set(reviewed) | {SELF_PATH}
    changed = {path for path in set(before) | set(after) if before.get(path) != after.get(path)}
    require(changed == expected, 'UNREVIEWED_GIT_DIFF')
    require(SELF_PATH not in before and after.get(SELF_PATH) == ('100644', 'blob', verifier_blob), 'VERIFIER_MUST_BE_EXACT_NEW_REGULAR_FILE')
    for path, values in reviewed.items():
        require((path not in before if values['before'] is None else before.get(path) == ('100644', 'blob', values['before'])), 'UNREVIEWED_BEFORE_' + path)
        require(after.get(path) == ('100644', 'blob', values['after']), 'UNREVIEWED_AFTER_' + path)
    unchanged = [(path, list(before[path])) for path in sorted(before) if path not in expected]
    return {'unchangedGitObjects': len(unchanged),
            'unchangedInputsSha256': sha256(json.dumps(unchanged, separators=(',', ':')).encode()),
            'reviewedTransitions': reviewed}


def git(*arguments):
    return subprocess.check_output(['git', *arguments], timeout=60)


def git_objects(ref):
    require(bool(re.fullmatch('[0-9a-f]{40}', ref)), 'INVALID_GIT_REF')
    entries = {}
    for entry in git('ls-tree', '-rz', '--full-tree', ref).split(b'\0'):
        if not entry:
            continue
        metadata, path = entry.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split(' ')
        name = path.decode('utf8')
        require(name not in entries, 'DUPLICATE_GIT_PATH')
        entries[name] = (mode, kind, oid)
    return entries


def fetch_source_commits():
    require_official_ci()
    for ref in (SOURCE_HEAD, SOURCE_MERGE):
        if subprocess.run(['git', 'cat-file', '-e', ref + '^{commit}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            subprocess.run(['git', 'fetch', '--no-tags', 'origin', ref], check=True, timeout=120)
        require(git('rev-parse', ref + '^{tree}').decode().strip() == SOURCE_TREE, 'SOURCE_COMMIT_TREE_MISMATCH')


def validate_git_inputs(current, current_source):
    require_official_ci()
    fetch_source_commits()
    require(git('rev-parse', 'HEAD').decode().strip() == current['head'], 'CHECKOUT_HEAD_MISMATCH')
    require(current['head'] == os.environ.get('GITHUB_SHA'), 'ACTIONS_HEAD_MISMATCH')
    require(git('rev-parse', current['head'] + '^{tree}').decode().strip() == current['tree'], 'CURRENT_PLAN_TREE_MISMATCH')
    require(git('rev-parse', current_source + '^{tree}').decode().strip() == current['tree'], 'CURRENT_PR_MERGE_TREE_MISMATCH')
    subprocess.run(['git', 'merge-base', '--is-ancestor', current['base'], current_source], check=True, timeout=30)
    before, after = git_objects(SOURCE_HEAD), git_objects(current_source)
    actual_verifier = git('hash-object', str(Path(__file__).resolve())).decode().strip()
    return validate_tree_transition(before, after, actual_verifier)


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    max_redirections = 5

    def redirect_request(self, request, response, code, message, headers, target):
        parsed = urllib.parse.urlsplit(target)
        require(parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password,
                'UNSAFE_ARTIFACT_REDIRECT')
        host = parsed.hostname.lower()
        allowed = host == 'api.github.com' or any(host.endswith(suffix) for suffix in (
            '.githubusercontent.com', '.blob.core.windows.net', '.s3.amazonaws.com', '.amazonaws.com'))
        require(allowed, 'NON_OFFICIAL_ARTIFACT_REDIRECT')
        redirected = super().redirect_request(request, response, code, message, headers, target)
        if host != 'api.github.com':
            redirected.remove_header('Authorization')
        return redirected


def official_request(path):
    require_official_ci()
    require(path.startswith('/actions/') and '..' not in path and not path.startswith('//'), 'INVALID_API_PATH')
    token = os.environ.get('GH_TOKEN')
    require(bool(token), 'ACTIONS_READ_TOKEN_REQUIRED')
    request = urllib.request.Request('https://api.github.com/repos/' + REPOSITORY + path,
        headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    return urllib.request.build_opener(SafeRedirect()).open(request, timeout=90)


def official_json(path):
    with official_request(path) as response:
        data = response.read(MAX_JSON_BYTES + 1)
    require(len(data) <= MAX_JSON_BYTES, 'OVERSIZED_API_JSON')
    return json.loads(data)


def source_metadata(origin=None):
    origin = ORIGIN_A if origin is None else origin
    require(origin in (ORIGIN_A, ORIGIN_B), 'UNKNOWN_EVIDENCE_ORIGIN')
    run = official_json(f"/actions/runs/{origin['run']}")
    job = official_json(f"/actions/jobs/{origin['job']}")
    candidates = []
    for page in range(1, 101):
        body = official_json(f"/actions/runs/{origin['run']}/artifacts?per_page=100&page={page}")
        rows = body.get('artifacts')
        require(isinstance(rows, list), 'ARTIFACT_API_RESPONSE')
        candidates.extend(a for a in rows if a.get('name') == 'survey-candidate-' + origin['merge'])
        if len(rows) < 100:
            break
    else:
        raise ReuseRejected('ARTIFACT_PAGINATION_LIMIT')
    require(len(candidates) == 1, 'MISSING_OR_AMBIGUOUS_OFFICIAL_ARTIFACT')
    artifact = candidates[0]
    validate_official_source(run, job, artifact, origin=origin)
    return run, job, artifact


def verify_official_digest(path, expected):
    require(bool(re.fullmatch('sha256:[0-9a-f]{64}', expected or '')), 'OFFICIAL_DIGEST_REQUIRED')
    actual = 'sha256:' + file_sha256(path)
    require(actual == expected, 'OFFICIAL_ARTIFACT_DIGEST_MISMATCH')
    return actual


def safe_zip_entries(infos, origin=None):
    seen, total = set(), 0
    for info in infos:
        name = info.filename
        require(name and '\\' not in name and '\0' not in name, 'UNSAFE_ZIP_NAME')
        raw = name[:-1] if name.endswith('/') else name
        parts = raw.split('/')
        require(not name.startswith('/') and all(part not in ('', '.', '..') for part in parts), 'UNSAFE_ZIP_PATH')
        require(parts[0] in ('survey-candidate-plan.json', 'survey-candidate-evidence'), 'UNEXPECTED_ZIP_ROOT')
        require(parts[0] != 'survey-candidate-plan.json' or len(parts) == 1 and not info.is_dir(), 'INVALID_PLAN_ENTRY')
        require(raw not in seen, 'DUPLICATE_ZIP_ENTRY')
        seen.add(raw)
        kind = stat.S_IFMT(info.external_attr >> 16)
        require(kind in (0, stat.S_IFREG, stat.S_IFDIR), 'SPECIAL_ZIP_ENTRY')
        require(not info.flag_bits & 1, 'ENCRYPTED_ZIP_ENTRY')
        require(0 <= info.file_size <= MAX_ZIP_EXPANDED_BYTES, 'OVERSIZED_ZIP_ENTRY')
        total += info.file_size
        require(total <= MAX_ZIP_EXPANDED_BYTES, 'ZIP_EXPANSION_BUDGET')
    require('survey-candidate-plan.json' in seen and 'survey-candidate-evidence/checks.json' in seen, 'REQUIRED_ZIP_EVIDENCE_MISSING')
    chain_markers = {name for name in seen if name.endswith(('/resume-proof.json', '/reuse.json', '/qualified-original-plan.json', '/qualified-original-checks.json'))}
    expected_chain = {'survey-candidate-evidence/resume-proof.json',
                      'survey-candidate-evidence/qualified-original-plan.json',
                      'survey-candidate-evidence/qualified-original-checks.json'}
    if origin == ORIGIN_B:
        require(chain_markers == expected_chain, 'ONLY_FIXED_A_TO_B_CHAIN_ALLOWED')
        require(all(path in seen for path in B_REPORT_SHA256), 'B_CHAIN_REPORTS_MISSING')
        allowed_nested = {'survey-candidate-evidence/original-evidence/survey-candidate-plan.json',
                          'survey-candidate-evidence/original-evidence/survey-candidate-evidence/checks.json'}
        nested = {name for name in seen if '/original-evidence/' in name and not name.endswith('/')
                  and name not in ('survey-candidate-evidence/original-evidence/survey-candidate-evidence',)}
        require(nested <= allowed_nested, 'UNEXPECTED_DEEP_EVIDENCE_CHAIN')
    else:
        require(origin in (None, ORIGIN_A) and not chain_markers, 'CHAINED_REUSE_FORBIDDEN')

    return True


def safe_extract(archive, destination, origin=None):
    destination = Path(destination)
    require(not destination.exists(), 'EXTRACTION_DESTINATION_EXISTS')
    infos = archive.infolist()
    safe_zip_entries(infos, origin)
    destination.mkdir(parents=True, mode=0o700)
    for info in infos:
        target = destination.joinpath(*PurePosixPath(info.filename).parts)
        if info.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(info) as source, target.open('xb') as output:
            shutil.copyfileobj(source, output, length=1024**2)
        require(target.stat().st_size == info.file_size, 'INCOMPLETE_ZIP_EXTRACTION')
    return destination


def download_verified_artifact(artifact, destination, origin=None):
    """Actions-only intake. Retains original bytes; grants no reuse eligibility."""
    require_official_ci()
    origin = ORIGIN_A if origin is None else origin
    require(origin in (ORIGIN_A, ORIGIN_B), 'UNKNOWN_DOWNLOAD_ORIGIN')
    destination = Path(destination)
    require(not destination.exists(), 'ARTIFACT_DESTINATION_EXISTS')
    require(artifact.get('workflow_run', {}).get('id') == origin['run'], 'WRONG_DOWNLOAD_RUN')
    require(artifact.get('id') == origin['artifact'] and artifact.get('digest') == origin['digest'], 'WRONG_PINNED_DOWNLOAD')
    require(type(artifact.get('id')) is int and artifact['id'] > 0, 'INVALID_DOWNLOAD_ID')
    require(artifact.get('name') == 'survey-candidate-' + origin['merge'], 'WRONG_DOWNLOAD_NAME')
    require(not artifact.get('expired') and recent(artifact.get('created_at')), 'STALE_DOWNLOAD')
    with tempfile.TemporaryDirectory(prefix='survey-official-intake-', dir=str(destination.parent)) as temporary:
        archive_path = Path(temporary) / 'official.zip'
        size = 0
        with official_request(f"/actions/artifacts/{artifact['id']}/zip") as response, archive_path.open('xb') as output:
            while chunk := response.read(1024**2):
                size += len(chunk)
                require(size <= MAX_DOWNLOAD_BYTES, 'DOWNLOAD_SIZE_BUDGET')
                output.write(chunk)
        verify_official_digest(archive_path, artifact.get('digest'))
        with zipfile.ZipFile(archive_path) as archive:
            unpacked = safe_extract(archive, Path(temporary) / 'original', origin)
        # A rename preserves original evidence files without rewriting their heads,
        # phases, image revisions, test reports, scans or timestamps.
        os.replace(unpacked, destination)
    return destination


def read_json(path):
    path = Path(path)
    require(path.is_file() and path.stat().st_size <= MAX_JSON_BYTES, 'MISSING_OR_OVERSIZED_EVIDENCE_JSON')
    return json.loads(path.read_bytes())


def verify_image_archive(path, expected_id, expected_tag, revision=SOURCE_MERGE):
    """Hash archive and inspect Docker-save config without loading/running images."""
    require_official_ci()
    path = Path(path)
    require(bool(re.fullmatch('sha256:[0-9a-f]{64}', expected_id or '')), 'IMAGE_ID_REQUIRED')
    checksum = Path(str(path) + '.sha256').read_text().split()
    require(len(checksum) == 2 and checksum[1] == path.name
            and re.fullmatch('[0-9a-f]{64}', checksum[0]), 'IMAGE_CHECKSUM_MANIFEST')
    require(file_sha256(path) == checksum[0], 'IMAGE_ARCHIVE_SHA256_MISMATCH')
    digest = expected_id.removeprefix('sha256:')
    config_names = {digest + '.json', 'blobs/sha256/' + digest}
    manifest, config, config_path, total, seen = None, None, None, 0, set()
    process = subprocess.Popen(['zstd', '-dc', '--', str(path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|') as archive:
            for member in archive:
                name = member.name.removeprefix('./')
                require(name and not name.startswith('/') and '\\' not in name
                        and all(part not in ('', '.', '..') for part in name.rstrip('/').split('/')), 'UNSAFE_IMAGE_ARCHIVE_PATH')
                require(name not in seen, 'DUPLICATE_IMAGE_ARCHIVE_ENTRY')
                seen.add(name)
                require(member.isfile() or member.isdir(), 'SPECIAL_IMAGE_ARCHIVE_ENTRY')
                total += member.size
                require(total <= MAX_DOCKER_TAR_BYTES, 'IMAGE_EXPANSION_BUDGET')
                if name == 'manifest.json' or name in config_names:
                    require(member.isfile() and member.size <= MAX_JSON_BYTES, 'IMAGE_METADATA_SIZE')
                    stream = archive.extractfile(member)
                    require(stream is not None, 'IMAGE_METADATA_MISSING')
                    data = stream.read(MAX_JSON_BYTES + 1)
                    require(len(data) == member.size, 'IMAGE_METADATA_TRUNCATED')
                    if name == 'manifest.json':
                        manifest = json.loads(data)
                    else:
                        require(config is None and sha256(data) == digest, 'IMAGE_CONFIG_DIGEST_MISMATCH')
                        config, config_path = json.loads(data), name
        require(process.wait(timeout=60) == 0, 'IMAGE_DECOMPRESSION_FAILED')
    finally:
        if process.stdout:
            process.stdout.close()
        if process.poll() is None:
            process.kill()
            process.wait(timeout=10)
    require(isinstance(manifest, list) and len(manifest) == 1, 'IMAGE_MANIFEST_REQUIRED')
    require(manifest[0].get('Config') == config_path and config is not None, 'IMAGE_MANIFEST_CONFIG_MISMATCH')
    require(manifest[0].get('RepoTags') == [expected_tag], 'IMAGE_TAG_MISMATCH')
    layers = manifest[0].get('Layers')
    require(isinstance(layers, list) and layers and all(layer in seen for layer in layers), 'IMAGE_LAYERS_MISSING')
    require(len(config.get('rootfs', {}).get('diff_ids', [])) == len(layers), 'IMAGE_LAYER_CONFIG_MISMATCH')
    require(config.get('os') == 'linux' and config.get('architecture') == 'amd64', 'IMAGE_PLATFORM_MISMATCH')
    require(config.get('config', {}).get('Labels', {}).get('org.opencontainers.image.revision') == revision, 'IMAGE_REVISION_MISMATCH')
    return {'file': path.name, 'sha256': checksum[0], 'imageId': expected_id,
            'tag': expected_tag, 'revision': revision, 'loaded': False, 'executed': False}


def validate_runtime_scan(report, image_id, image_tag):
    require(report.get('ArtifactType') == 'container_image', 'SCAN_ARTIFACT_TYPE')
    require(report.get('ArtifactName') == image_tag, 'SCAN_IMAGE_TAG')
    require(report.get('Metadata', {}).get('ImageID') == image_id, 'SCAN_IMAGE_ID')
    require(isinstance(report.get('Results'), list), 'SCAN_RESULTS_REQUIRED')
    require(not any(v.get('Severity') in ('HIGH', 'CRITICAL')
                    for result in report['Results'] for v in result.get('Vulnerabilities', [])), 'HIGH_CRITICAL_RUNTIME_VULNERABILITY')
    return True



def validate_partial_candidate(job, proof):
    """Pure admission for exactly this failure, never a general phase cache."""
    require(job.get('id') == SOURCE_JOB and job.get('run_id') == SOURCE_RUN, 'PARTIAL_JOB_ID')
    require(job.get('status') == 'completed' and job.get('conclusion') == 'failure', 'EXPECTED_FAILED_SOURCE_JOB')
    steps = job.get('steps')
    require(isinstance(steps, list) and steps, 'JOB_STEPS_REQUIRED')
    by_name = {}
    for step in steps:
        name = step.get('name')
        require(isinstance(name, str) and name not in by_name, 'DUPLICATE_OR_INVALID_JOB_STEP')
        by_name[name] = step
    require([step.get('name') for step in steps if step.get('conclusion') == 'failure'] == [COMPILE_STEP], 'UNEXPECTED_FAILED_STEP')
    require(by_name.get(COMPILE_STEP, {}).get('status') == 'completed', 'COMPILE_STEP_NOT_TERMINAL')
    for name in DOWNSTREAM_STEPS:
        require(by_name.get(name, {}).get('conclusion') == 'skipped', 'DOWNSTREAM_NOT_SKIPPED_' + name)
    require(by_name.get(CLEANUP_STEP, {}).get('conclusion') == 'success', 'SOURCE_CLEANUP_STEP_NOT_SUCCESSFUL')
    phases = proof.get('phases')
    require(isinstance(phases, list) and [phase.get('name') for phase in phases] == [*REUSED_PHASES, FAILED_PHASE], 'UNEXPECTED_PARTIAL_PHASE_LEDGER')
    for name in REUSED_PHASES:
        require_success_phase(proof, name)
    require(phases[-1].get('status') == 'failure' and phases[-1].get('errorType') == 'CalledProcessError', 'WRONG_FRONTEND_FAILURE')
    require(proof.get('privateBrowserMaterialRemoved') is True and proof.get('isolatedResourcesRemoved') is True
            and proof.get('cleanupErrors') == [], 'SOURCE_CLEANUP_UNCONFIRMED')
    require(set(proof.get('builders', {})) == {'backend', 'frontend'}, 'BOTH_SUCCESSFUL_BUILDERS_REQUIRED')
    require(set(proof.get('images', {})) == {'backend'}, 'ONLY_BACKEND_RUNTIME_QUALIFIED')
    for image_id in [*proof['builders'].values(), proof['images']['backend']]:
        require(bool(re.fullmatch('sha256:[0-9a-f]{64}', image_id or '')), 'QUALIFIED_IMAGE_ID_REQUIRED')
    require(proof.get('executionInputs', {}).get('node') == 'v24.21.0'
            and proof['executionInputs'].get('runnerOS') == 'Linux', 'SOURCE_EXECUTION_ENVIRONMENT')
    return list(REUSED_PHASES)


def validate_execution_inputs(proof):
    before = git_objects(SOURCE_HEAD)
    expected = {path: record[2] for path, record in before.items()
                if path.startswith('.github/scripts/survey-candidate') and record[:2] == ('100644', 'blob')}
    inputs = proof.get('executionInputs', {})
    normalized = {}
    for raw, digest in inputs.get('scripts', {}).items():
        marker = '/.github/scripts/'
        path = '.github/scripts/' + raw.rsplit(marker, 1)[1] if marker in raw else raw
        require(path not in normalized, 'DUPLICATE_EXECUTION_INPUT')
        normalized[path] = digest
    require(normalized == expected, 'ORIGINAL_EXECUTED_SCRIPT_OBJECT_MISMATCH')
    require(inputs.get('workflow') == REVIEWED_TRANSITIONS['.github/workflows/ci-survey-candidate.yml']['before'], 'ORIGINAL_EXECUTED_WORKFLOW_MISMATCH')
    require(bool(re.fullmatch('[0-9a-f]{64}', inputs.get('environmentSha256', ''))), 'ORIGINAL_ENVIRONMENT_FINGERPRINT_MISSING')
    for component in ('frontend', 'backend'):
        require(bool(re.fullmatch('[0-9a-f]{64}', proof.get('effectiveDockerfiles', {}).get(component, ''))), 'ORIGINAL_EFFECTIVE_DOCKERFILE_MISSING')
    # Full tree equality outside reviewed tooling transitions already covers the
    # root golden fixture as well as generated backend identities and test configs.
    require('server-version/cognitive-randomization-golden-v1.json' in before, 'ROOT_GOLDEN_FIXTURE_MISSING')
    return {'scripts': normalized, 'workflow': inputs['workflow'],
            'environmentSha256': inputs['environmentSha256'],
            'effectiveDockerfiles': proof['effectiveDockerfiles'],
            'rootGoldenFixtureBlob': before['server-version/cognitive-randomization-golden-v1.json'][2]}


def load_and_alias(path, image_id, alias):
    require_official_ci()
    decoder = subprocess.Popen(['zstd', '-dc', '--', str(path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        subprocess.run(['docker', 'load'], stdin=decoder.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       check=True, timeout=600)
        decoder.stdout.close()
        require(decoder.wait(timeout=30) == 0, 'LOAD_ARCHIVE_DECOMPRESSION_FAILED')
    finally:
        if decoder.stdout and not decoder.stdout.closed:
            decoder.stdout.close()
        if decoder.poll() is None:
            decoder.kill()
            decoder.wait(timeout=10)
    raw = subprocess.check_output(['docker', 'image', 'inspect', image_id], timeout=60)
    rows = json.loads(raw)
    require(len(rows) == 1 and rows[0].get('Id') == image_id, 'LOADED_IMAGE_ID_MISMATCH')
    require(rows[0].get('Config', {}).get('Labels', {}).get('org.opencontainers.image.revision') == SOURCE_MERGE,
            'LOADED_IMAGE_ORIGINAL_REVISION_MISMATCH')
    subprocess.run(['docker', 'image', 'tag', image_id, alias], check=True, timeout=60)
    actual = subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', alias], timeout=60).decode().strip()
    require(actual == image_id, 'CURRENT_ALIAS_CHANGED_IMAGE_ID')
    return {'alias': alias, 'imageId': image_id, 'originalRevision': SOURCE_MERGE}



def validate_repair_transition(before, after, verifier_blob, transitions=None):
    """Exactly B -> C, including the two reviewed accessible-name lines."""
    reviewed = REPAIR_TRANSITIONS if transitions is None else transitions
    require(bool(reviewed) and bool(re.fullmatch('[0-9a-f]{40}', verifier_blob)), 'REPAIR_REVIEW_REQUIRED')
    changed = {path for path in set(before) | set(after) if before.get(path) != after.get(path)}
    require(changed == set(reviewed) | {SELF_PATH}, 'UNREVIEWED_REPAIR_DIFF')
    require(before.get(SELF_PATH) == ('100644', 'blob', B_VERIFIER_BLOB)
            and after.get(SELF_PATH) == ('100644', 'blob', verifier_blob), 'REPAIR_VERIFIER_TRANSITION')
    require(set(REPAIR_PRODUCT_PATHS) <= set(reviewed), 'BOTH_REPAIR_PRODUCT_BINDINGS_REQUIRED')
    for path, values in reviewed.items():
        require(before.get(path) == ('100644', 'blob', values['before']), 'REPAIR_BEFORE_' + path)
        require(after.get(path) == ('100644', 'blob', values['after']), 'REPAIR_AFTER_' + path)
    product = {path for path in changed if path.startswith('server-version/')}
    require(product == set(REPAIR_PRODUCT_PATHS), 'REPAIR_PRODUCT_SCOPE')
    unaffected = [(path, list(before[path])) for path in sorted(before) if path not in changed]
    return {'changedPaths': sorted(changed), 'unchangedGitObjects': len(unaffected),
            'unchangedInputsSha256': sha256(json.dumps(unaffected, separators=(',', ':')).encode()),
            'reviewedTransitions': reviewed, 'verifierBlob': verifier_blob}


def fetch_fixed_chain():
    require_official_ci()
    for origin in (ORIGIN_A, ORIGIN_B):
        for ref in (origin['head'], origin['merge']):
            if subprocess.run(['git', 'cat-file', '-e', ref + '^{commit}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
                subprocess.run(['git', 'fetch', '--no-tags', 'origin', ref], check=True, timeout=120)
            require(git('rev-parse', ref + '^{tree}').decode().strip() == origin['tree'], 'FIXED_CHAIN_TREE_MISMATCH')
    a, b = git_objects(SOURCE_HEAD), git_objects(ORIGIN_B['head'])
    return validate_tree_transition(a, b, B_VERIFIER_BLOB)


def validate_repair_inputs(current, current_source):
    require_official_ci()
    require(REPAIR_TRANSITIONS_FINALIZED, 'REPAIR_TRANSITIONS_NOT_FINALIZED')
    require(bool(re.fullmatch('[0-9a-f]{40}', current_source or '')), 'REPAIR_CURRENT_SOURCE_SHA')
    if subprocess.run(['git', 'cat-file', '-e', current_source + '^{commit}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        subprocess.run(['git', 'fetch', '--no-tags', 'origin', current_source], check=True, timeout=120)
    previous = fetch_fixed_chain()
    require(current['head'] == os.environ.get('GITHUB_SHA')
            and git('rev-parse', 'HEAD').decode().strip() == current['head'], 'REPAIR_CHECKOUT_MISMATCH')
    for ref in (current['head'], current_source):
        require(git('rev-parse', ref + '^{tree}').decode().strip() == current['tree'], 'REPAIR_CURRENT_TREE_MISMATCH')
    subprocess.run(['git', 'merge-base', '--is-ancestor', current['base'], current_source], check=True, timeout=30)
    before, after = git_objects(ORIGIN_B['head']), git_objects(current_source)
    verifier = git('hash-object', str(Path(__file__).resolve())).decode().strip()
    result = validate_repair_transition(before, after, verifier)
    result['compileToContractTransition'] = previous
    return result


def validate_browser_failure_candidate(job, proof):
    """No unexpected missing/failed phases or broader browser failure qualifies."""
    require(job.get('id') == ORIGIN_B['job'] and job.get('run_id') == ORIGIN_B['run']
            and job.get('head_sha') == ORIGIN_B['head']
            and job.get('status') == 'completed' and job.get('conclusion') == 'failure', 'B_FAILED_JOB_REQUIRED')
    steps = job.get('steps', [])
    require(isinstance(steps, list), 'B_STEPS_REQUIRED')
    by_name = {}
    for name in (*B_REQUIRED_SUCCESS_STEPS, DOWNSTREAM_STEPS[-1]):
        matches = [step for step in steps if step.get('name') == name]
        require(len(matches) == 1, 'B_MISSING_OR_DUPLICATE_SELECTED_STEP_' + name)
        by_name[name] = matches[0]
    # GitHub gives both separate artifact uploads the same display name.
    # Only selected qualification steps require a unique, non-overwritten match.
    require([step.get('name') for step in steps if step.get('conclusion') == 'failure'] == [DOWNSTREAM_STEPS[-1]], 'B_ONLY_BROWSER_STEP_FAILED')
    for name in B_REQUIRED_SUCCESS_STEPS:
        require(by_name.get(name, {}).get('status') == 'completed'
                and by_name[name].get('conclusion') == 'success', 'B_SELECTED_STEP_NOT_SUCCESS_' + name)
    require(by_name[DOWNSTREAM_STEPS[-1]].get('status') == 'completed', 'B_BROWSER_NOT_TERMINAL')
    phases = proof.get('phases', [])
    require([phase.get('name') for phase in phases] == [*B_SUCCESS_PHASES, B_FAILED_PHASE], 'B_EXACT_PHASE_LEDGER')
    for name in B_SUCCESS_PHASES:
        require_success_phase(proof, name)
    require(phases[-1].get('status') == 'failure' and phases[-1].get('errorType') == 'CalledProcessError', 'B_ORIGINAL_BROWSER_FAILURE')
    require(proof.get('head') == ORIGIN_B['merge'] and proof.get('sourceHead') == ORIGIN_B['head']
            and proof.get('tree') == ORIGIN_B['tree'], 'B_PROOF_SOURCE_BINDING')
    require(proof.get('privateBrowserMaterialRemoved') is True and proof.get('isolatedResourcesRemoved') is True
            and proof.get('cleanupErrors') == [], 'B_CLEANUP_UNCONFIRMED')
    require(set(proof.get('builders', {})) == {'backend', 'frontend'}
            and set(proof.get('images', {})) == {'backend', 'frontend'}, 'B_IMAGE_SET')
    inputs = proof.get('executionInputs', {})
    require(inputs.get('node') == 'v24.21.0' and inputs.get('runnerOS') == 'Linux'
            and inputs.get('docker') == '28.0.4', 'B_EXECUTION_ENVIRONMENT')
    require(inputs.get('workflow') == REVIEWED_TRANSITIONS['.github/workflows/ci-survey-candidate.yml']['after']
            and inputs.get('executor') == REVIEWED_TRANSITIONS['.github/scripts/survey-candidate.py']['after'], 'B_EXECUTION_SOURCE')
    require(inputs.get('environmentSha256') == 'bc50178d55dd2f5cdb9564a5ba742ab6cb786f5e4e42ccfbc10d5d95aaf4fa31', 'B_EXECUTION_ENVIRONMENT_FINGERPRINT')
    return list(B_SUCCESS_PHASES)


def validate_repair_plan(original, proof, current):
    require(original.get('head') == ORIGIN_B['merge'] and original.get('tree') == ORIGIN_B['tree'], 'B_PLAN_SOURCE')
    require(proof.get('components') == original.get('components'), 'B_PLAN_COMPONENTS')
    for key in ('schema', 'route', 'base', 'changed', 'backendTests', 'frontendTests', 'selectionBlob', 'required'):
        require(key in original and original[key] == current.get(key), 'REPAIR_CHANGED_PLAN_' + key)
    require(current.get('components', {}).get('backend') == original['components']['backend'], 'REPAIR_BACKEND_CHANGED')
    require(current.get('components', {}).get('frontend') != original['components']['frontend'], 'REPAIR_FRONTEND_NOT_CHANGED')
    selected = original['frontendTests']
    require(len(selected) == 16 and all(name in selected for name in REPAIR_TESTS), 'REPAIR_FRONTEND_SELECTION')
    return [name for name in selected if name not in REPAIR_TESTS]


def validate_fixed_chain_receipt(receipt, a_plan, a_checks, b_plan, b_checks):
    require(receipt.get('schema') == 1 and receipt.get('status') == 'QUALIFIED_PARTIAL_RESUME', 'B_OLD_RECEIPT_KIND')
    require(receipt.get('currentHead') == ORIGIN_B['merge'] and receipt.get('currentSourceHead') == ORIGIN_B['head'], 'B_OLD_RECEIPT_TARGET')
    require(receipt.get('sourceRun') == SOURCE_RUN and receipt.get('sourceJob') == SOURCE_JOB
            and receipt.get('sourceHead') == SOURCE_HEAD and receipt.get('sourceMergeHead') == SOURCE_MERGE, 'B_OLD_RECEIPT_ORIGIN')
    artifact = {'id': SOURCE_ARTIFACT, 'digest': SOURCE_ARTIFACT_DIGEST, 'size_in_bytes': SOURCE_ARTIFACT_SIZE}
    require(receipt.get('artifact') == artifact and receipt.get('artifactId') == SOURCE_ARTIFACT
            and receipt.get('artifactDigest') == SOURCE_ARTIFACT_DIGEST, 'B_OLD_RECEIPT_ARTIFACT')
    require(receipt.get('originalPlan') == a_plan and receipt.get('originalChecks') == a_checks, 'B_RAW_A_EVIDENCE_MISMATCH')
    require(receipt.get('reusedPhases') == list(REUSED_PHASES)
            and receipt.get('wholeCandidateQualified') is False
            and receipt.get('originalJobConclusion') == 'failure'
            and receipt.get('originalFailedPhase') == FAILED_PHASE, 'B_OLD_RECEIPT_QUALIFICATION')
    validate_plan_binding(a_plan, a_checks, b_plan)
    retained = b_checks.get('reusedQualification', {})
    require(retained.get('sourceRun') == SOURCE_RUN and retained.get('sourceHead') == SOURCE_HEAD
            and retained.get('sourceMergeHead') == SOURCE_MERGE and retained.get('artifact') == artifact
            and retained.get('phases') == list(REUSED_PHASES)
            and retained.get('rawChecks') == 'qualified-original-checks.json'
            and retained.get('rawPlan') == 'qualified-original-plan.json', 'B_CHECKS_A_ORIGIN')
    require(b_checks.get('builders') == a_checks.get('builders')
            and b_checks.get('images', {}).get('backend') == a_checks.get('images', {}).get('backend'), 'B_ORIGINAL_IMAGES_CHANGED')
    require(b_checks.get('bases') == a_checks.get('bases'), 'B_ORIGINAL_BASES_CHANGED')
    return True


def passed_checks(report, count, context):
    checks = report.get('checks', [])
    require(report.get('status') == 'pass' and isinstance(checks, list) and len(checks) == count
            and all(check.get('pass') is True for check in checks)
            and len({check.get('name') for check in checks}) == count, context + '_NOT_ALL_PASSED')


def validate_repair_reports(reports, plan, checks, runtime_sha, recovery_sha, browser_sha):
    backend, frontend = reports['backend-tests.json'], reports['frontend-tests.json']
    validate_test_report(backend, plan['backendTests'])
    validate_test_report(frontend, plan['frontendTests'])
    require(backend.get('numTotalTests') == 132 and frontend.get('numTotalTests') == 166, 'B_CONTRACT_COUNTS')
    require(len(backend['testResults']) == len(plan['backendTests'])
            and len(frontend['testResults']) == len(plan['frontendTests']), 'B_CONTRACT_EXACT_SUITES')
    repair_suites = [suite for suite in frontend['testResults']
                    if any(suite.get('name', '').endswith('/' + name) for name in REPAIR_TESTS)]
    require(len(repair_suites) == 3 and sum(len(suite['assertionResults']) for suite in repair_suites) == 30, 'B_AFFECTED_CONTRACT_COUNTS')
    for component in ('backend', 'frontend'):
        validate_runtime_scan(reports[component + '-scan.json'], checks['images'][component],
                              'eduk12-survey-candidate-' + component + ':' + ORIGIN_B['merge'])
    builder = checks['builders']['backend']
    dist = None
    for name, count in [('runtime-result.json', 39), ('runtime-restore.json', 11)]:
        report = reports[name]
        passed_checks(report, count, name)
        binding = report.get('binding', {})
        require(binding.get('sourceSha') == ORIGIN_B['merge'] and binding.get('imageId') == builder
                and binding.get('probeSha256') == runtime_sha and binding.get('node') == '24.21.0'
                and binding.get('postgres') == '160015' and binding.get('redis') == '7.4.11', 'B_RUNTIME_BINDING')
        require(report.get('serverStopped') is True and report.get('runtimeRole', {}).get('restrictedRuntimeRole') is True, 'B_RUNTIME_CLEANUP_ROLE')
        require(bool(re.fullmatch('[0-9a-f]{64}', binding.get('distSha256', ''))), 'B_RUNTIME_DIST')
        dist = binding['distSha256'] if dist is None else dist
        require(binding['distSha256'] == dist, 'B_RESTORE_DIST_CHANGED')
    for name, count, phase in [('recovery-bootstrap.json', 4, 'bootstrap'), ('recovery-result.json', 31, 'verify')]:
        report = reports[name]
        passed_checks(report, count, name)
        require(report.get('phase') == phase and report.get('sourceSha') == ORIGIN_B['merge']
                and report.get('buildImageId') == builder and report.get('scriptSha256') == recovery_sha, 'B_RECOVERY_BINDING')
        require(report.get('runtimeRoles') and all(role.get('ok') is True and role.get('restrictedRuntimeRole') is True
                and role.get('migrationCount') == 165 for role in report['runtimeRoles'].values()), 'B_RECOVERY_RESTRICTED_ROLES')
    recovery = reports['recovery-result.json']
    require(recovery.get('distSha256') == dist and recovery.get('compiledRestoreChecks') == reports['runtime-restore.json']['checks'], 'B_RECOVERY_COMPILED_RESTORE')
    browser = reports['browser/result.json']
    require(browser.get('status') == 'failed' and browser.get('sourceCommit') == ORIGIN_B['merge']
            and browser.get('images') == checks['images'] and browser.get('harnessSha256') == browser_sha, 'B_ORIGINAL_BROWSER_BINDING')
    require(browser.get('browserErrors') == [] and browser.get('phase') == 'researcher four-type composition and publication', 'B_UNEXPECTED_BROWSER_FAILURE')
    failure = browser.get('failure', {})
    require(failure.get('name') == 'AssertionError' and failure.get('phase') == browser['phase']
            and failure.get('message') == 'researcher-published-wave has no WCAG A/AA violations, including serious/critical', 'B_UNEXPECTED_BROWSER_ASSERTION')
    accessibility = browser.get('accessibility', [])
    require(len(accessibility) == 2 and accessibility[0].get('state') == 'admin-invitation-grants'
            and accessibility[0].get('violations') == [] and accessibility[1].get('state') == 'researcher-published-wave'
            and accessibility[1].get('violations') == [{'id': 'svg-img-alt', 'impact': 'serious', 'nodeCount': 1}], 'B_UNEXPECTED_ACCESSIBILITY_FINDING')
    return {'backendAssertions': 132, 'frontendRetainedAssertions': 136, 'frontendInvalidatedAssertions': 30,
            'runtimeChecks': 39, 'recoveryChecks': 31, 'restoredRuntimeChecks': 11,
            'backendDistSha256': dist, 'browserQualified': False}


def browser_repair_main():
    require_official_ci()
    require(REPAIR_TRANSITIONS_FINALIZED, 'REPAIR_TRANSITIONS_NOT_FINALIZED')
    current = read_json('survey-candidate-plan.json')
    current_source = os.environ.get('SURVEY_SOURCE_HEAD', '')
    validate_current_event(read_json(os.environ['GITHUB_EVENT_PATH']), current, current_source)
    binding = validate_repair_inputs(current, current_source)
    a_run, a_job, a_artifact = source_metadata(ORIGIN_A)
    b_run, b_job, b_artifact = source_metadata(ORIGIN_B)
    require(a_job.get('conclusion') == 'failure' and b_job.get('conclusion') == 'failure', 'FIXED_FAILED_ORIGINS_REQUIRED')
    evidence = Path('survey-candidate-evidence')
    require(not evidence.exists(), 'CURRENT_EVIDENCE_ALREADY_EXISTS')
    evidence.mkdir(mode=0o700)
    original_root = download_verified_artifact(b_artifact, evidence / 'original-evidence', ORIGIN_B)
    # The exact inspected report bytes must also exist in the full image artifact.
    for name, digest in B_REPORT_SHA256.items():
        require(file_sha256(original_root / name) == digest, 'B_REVIEWED_REPORT_HASH_' + name)
    original = original_root / 'survey-candidate-evidence'
    b_plan = read_json(original_root / 'survey-candidate-plan.json')
    b_checks = read_json(original / 'checks.json')
    a_plan = read_json(original / 'qualified-original-plan.json')
    a_checks = read_json(original / 'qualified-original-checks.json')
    old_receipt = read_json(original / 'resume-proof.json')
    validate_partial_candidate(a_job, a_checks)
    validate_browser_failure_candidate(b_job, b_checks)
    validate_fixed_chain_receipt(old_receipt, a_plan, a_checks, b_plan, b_checks)
    require(old_receipt.get('inputBinding') == binding['compileToContractTransition'], 'B_COMPILE_TRANSITION_RECEIPT')
    require(old_receipt.get('originalExecutionInputs') == validate_execution_inputs(a_checks), 'B_COMPILE_EXECUTION_RECEIPT')
    retained_tests = validate_repair_plan(b_plan, b_checks, current)
    report_names = ('backend-tests.json', 'frontend-tests.json', 'backend-scan.json', 'frontend-scan.json',
                    'runtime-result.json', 'runtime-restore.json', 'recovery-bootstrap.json', 'recovery-result.json', 'browser/result.json')
    reports = {name: read_json(original / name) for name in report_names}
    qualifications = validate_repair_reports(reports, b_plan, b_checks,
        sha256(git('show', ORIGIN_B['head'] + ':.github/scripts/survey-candidate-runtime.cjs')),
        sha256(git('show', ORIGIN_B['head'] + ':.github/scripts/survey-candidate-recovery.py')),
        sha256(git('show', ORIGIN_B['head'] + ':server-version/e2e/survey-candidate-browser.cjs')))
    specs = (
        ('backendBuilder', 'backend', True, b_checks['builders']['backend']),
        ('backendRuntime', 'backend', False, b_checks['images']['backend']),
        ('frontendBuilder', 'frontend', True, b_checks['builders']['frontend']),
    )
    archives, aliases = {}, {}
    for key, component, builder, image_id in specs:
        filename = component + ('-builder' if builder else '') + '-image.tar.zst'
        tag = 'eduk12-survey-candidate-' + component + ':' + SOURCE_MERGE + ('-build' if builder else '')
        archive = verify_image_archive(original / filename, image_id, tag)
        require(archive == old_receipt.get('archives', {}).get(key), 'A_B_ARCHIVE_BYTES_OR_ID_CHANGED')
        archives[key] = archive
    # Validate, but never load/requalify, the old frontend runtime. It remains
    # alongside its original failed browser proof and scan in B's evidence.
    archives['invalidatedFrontendRuntime'] = verify_image_archive(original / 'frontend-image.tar.zst',
        b_checks['images']['frontend'], 'eduk12-survey-candidate-frontend:' + ORIGIN_B['merge'], ORIGIN_B['merge'])
    for key, component, builder, image_id in specs:
        filename = archives[key]['file']
        path = original / filename
        if component == 'backend':
            for suffix in ('', '.sha256'):
                os.replace(original / (filename + suffix), evidence / (filename + suffix))
            path = evidence / filename
        suffix = '-repair-base' if component == 'frontend' else '-build' if builder else ''
        alias = 'eduk12-survey-candidate-' + component + ':' + current['head'] + suffix
        aliases[key] = load_and_alias(path, image_id, alias)
        archives[key]['retainedPath'] = str(path)
    for source, name in [(original_root / 'survey-candidate-plan.json', 'qualified-original-plan.json'),
                         (original / 'checks.json', 'qualified-original-checks.json')]:
        shutil.copy2(source, evidence / name)
    retained_a = [name for name in REUSED_PHASES if name.startswith('backend-')]
    retained_b = ['frontend-cognitive-types', 'frontend-dependency-audit', 'integrated-migration', 'restricted-runtime-bootstrap',
                  'selected-backend-contracts', 'production-redis-runtime', 'legacy-upgrade-new-schema-restore']
    receipt = {
        'schema': 1, 'status': 'QUALIFIED_BROWSER_REPAIR',
        'currentHead': current['head'], 'currentSourceHead': current_source,
        'sourceHead': ORIGIN_B['head'], 'sourceMergeHead': ORIGIN_B['merge'],
        'sourceRun': ORIGIN_B['run'], 'sourceJob': ORIGIN_B['job'],
        'artifact': {key: b_artifact[key] for key in ('id', 'digest', 'size_in_bytes')},
        'originalPlan': b_plan, 'originalChecks': b_checks,
        'compileOrigin': {'sourceRun': SOURCE_RUN, 'sourceJob': SOURCE_JOB, 'sourceHead': SOURCE_HEAD,
                          'sourceMergeHead': SOURCE_MERGE, 'artifact': old_receipt['artifact'],
                          'originalPlan': a_plan, 'originalChecks': a_checks},
        'reusedPhases': retained_a + retained_b,
        'phaseOrigins': {**{name: SOURCE_RUN for name in retained_a}, **{name: ORIGIN_B['run'] for name in retained_b}},
        'retainedBackendTests': 132, 'retainedFrontendTests': 136,
        'frontendTestsToRun': list(REPAIR_TESTS), 'frontendTestsReused': retained_tests,
        'retainedBackendScan': True, 'retainedFrontendAudit': True,
        'invalidatedFrontend': ['compile', 'app-types', 'changed-lint', 'runtime', 'scan', 'affected-30-contracts', 'browser'],
        'originalFailedPhase': B_FAILED_PHASE, 'originalJobConclusion': 'failure',
        'originalEvidencePath': str(original), 'reportPaths': {name: str(original / name) for name in report_names},
        'archives': archives, 'currentAliases': aliases, 'inputBinding': binding,
        'qualifications': qualifications,
        'provenance': {'compile': validate_official_source(a_run, a_job, a_artifact),
                       'contracts': validate_official_source(b_run, b_job, b_artifact, origin=ORIGIN_B)},
        'qualifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'wholeCandidateQualified': False, 'rebuilt': False, 'retested': False, 'rescanned': False,
    }
    (evidence / 'resume-proof.json').write_text(json.dumps(receipt, indent=2) + '\n')
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write('restored=true\n')
    print(json.dumps({'status': receipt['status'], 'sourceRun': ORIGIN_B['run'],
                      'retainedBackendTests': 132, 'retainedFrontendTests': 136,
                      'frontendTestsToRun': list(REPAIR_TESTS), 'wholeCandidateQualified': False}))


SCOPE_RUN = 39026966367
SCOPE_JOB = 117379774345
SCOPE_HEAD = 'dd4c97dac14dd66d2a940f10e9f04025c5f97e93'
SCOPE_TREE = '89ee92a46e944bba1825f5dd700acdd621d09954'
SCOPE_TEST_FILES = ('survey-candidate-scope.test.mjs', 'content-workflows.test.mjs', 'ci-topology.test.mjs')

def validate_scope_transition(before, after, verifier_blob):
    paths = {SELF_PATH, '.github/scripts/survey-candidate-reuse.test.py', '.github/workflows/ci.yml'}
    changed = {path for path in set(before) | set(after) if before.get(path) != after.get(path)}
    require(changed == paths, 'UNREVIEWED_SCOPE_TRANSITION')
    require(before.get(SELF_PATH) == ('100644', 'blob', 'beec7418fe7d0d42a0c9bf07cd4cb3efcc601f2f')
            and after.get(SELF_PATH) == ('100644', 'blob', verifier_blob), 'SCOPE_ADAPTER_TRANSITION')
    for path, old in {'.github/scripts/survey-candidate-reuse.test.py': 'a1f0f1bd3e51ecfaf47d769d4e81c730f8699fe1',
                      '.github/workflows/ci.yml': 'fb85b9d59cac47cf9cfd886bc7e9c3f26c04916e'}.items():
        require(before.get(path) == ('100644', 'blob', old)
                and after.get(path) == ('100644', 'blob', REVIEWED_TRANSITIONS[path]['after']), 'SCOPE_REVIEWED_INPUT_' + path)
    return {'changedPaths': sorted(paths), 'unchangedObjects': len(before) - len(paths)}

def validate_scope_tap(output, affected):
    passed = re.findall(r'^ok \d+ - (.+)$', output, re.M)
    passed = [name for name in passed if ' # SKIP' not in name]
    require(sorted(passed) == sorted(affected), 'SCOPE_EXECUTED_NAMES')
    for key, count in [('pass', 17), ('fail', 0), ('cancelled', 0), ('todo', 0)]:
        require(re.search(r'^# ' + key + r' ' + str(count) + r'$', output, re.M), 'SCOPE_EXECUTED_' + key)
    return True

SCOPE_B_JOB = 117381035363
SCOPE_REPAIR_TESTS = (
    'exact Survey source boundary rejects missing, changed, unknown, duplicate and unsafe entries',
    'Survey workflow keeps explicit isolation, source binding, scans and artifact failure evidence',
    'all versioned jobs are pinned to hosted Ubuntu and cannot accept local runner overrides',
)


def validate_scope_repair_tap(output, affected):
    require(list(affected) == list(SCOPE_REPAIR_TESTS), 'SCOPE_REPAIR_EXACT_SELECTION')
    passed = re.findall(r'^ok \d+ - (.+)$', output, re.M)
    require(sorted(passed) == sorted(affected), 'SCOPE_REPAIR_EXECUTED_NAMES')
    for key, count in [('pass', 3), ('fail', 0), ('cancelled', 0), ('skipped', 0), ('todo', 0)]:
        require(re.search(r'^# ' + key + r' ' + str(count) + r'$', output, re.M), 'SCOPE_REPAIR_EXECUTED_' + key)
    return True


def scope_repair_receipt():
    require_official_ci()
    require(REPAIR_TRANSITIONS_FINALIZED, 'REPAIR_TRANSITIONS_NOT_FINALIZED')
    require(os.environ.get('RUNNER_OS') == 'Linux'
            and subprocess.check_output(['node', '--version'], text=True).strip() == 'v24.21.0', 'SCOPE_ENVIRONMENT')
    current = git('rev-parse', 'HEAD').decode().strip()
    source = os.environ.get('SURVEY_SOURCE_HEAD', '')
    require(current == os.environ.get('GITHUB_SHA') and bool(re.fullmatch('[0-9a-f]{40}', source)), 'SCOPE_CURRENT_SOURCE')
    tree = git('rev-parse', current + '^{tree}').decode().strip()
    event = read_json(os.environ['GITHUB_EVENT_PATH'])
    plan = {'head': current, 'tree': tree, 'schema': 1, 'route': 'survey-candidate',
            'base': '21c1778a545c1988bef65900789c701208b647e5'}
    validate_current_event(event, plan, source)
    binding = validate_repair_inputs(plan, source)
    if subprocess.run(['git', 'cat-file', '-e', SCOPE_HEAD + '^{commit}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        subprocess.run(['git', 'fetch', '--no-tags', '--depth=1', 'origin', SCOPE_HEAD], check=True, timeout=120)
    require(git('rev-parse', SCOPE_HEAD + '^{tree}').decode().strip() == SCOPE_TREE, 'SCOPE_ORIGINAL_TREE')
    previous_binding = validate_scope_transition(git_objects(SCOPE_HEAD), git_objects(ORIGIN_B['head']), B_VERIFIER_BLOB)
    logs = {}
    for label, run_id, job_id, source_head in [('original', SCOPE_RUN, SCOPE_JOB, SCOPE_HEAD),
                                               ('previous', ORIGIN_B['run'], SCOPE_B_JOB, ORIGIN_B['head'])]:
        run = official_json(f'/actions/runs/{run_id}')
        job = official_json(f'/actions/jobs/{job_id}')
        require(run.get('id') == run_id and run.get('head_sha') == source_head and run.get('event') == 'pull_request'
                and run.get('repository', {}).get('full_name') == REPOSITORY
                and run.get('head_repository', {}).get('full_name') == REPOSITORY
                and run.get('path') == '.github/workflows/ci.yml' and recent(run.get('created_at'))
                and any(pr.get('number') == PR_NUMBER for pr in run.get('pull_requests', [])), 'SCOPE_CHAIN_RUN_ORIGIN')
        require(job.get('id') == job_id and job.get('run_id') == run_id and job.get('head_sha') == source_head
                and job.get('name') == 'classify changed content' and job.get('status') == 'completed'
                and job.get('conclusion') == 'success' and recent(job.get('completed_at')), 'SCOPE_CHAIN_JOB_ORIGIN')
        selected = [step for step in job.get('steps', []) if step.get('name') == 'frozen Survey scope and fail-closed merge contracts']
        require(len(selected) == 1 and selected[0].get('conclusion') == 'success', 'SCOPE_CHAIN_SELECTED_STEP')
        with official_request(f'/actions/jobs/{job_id}/logs') as response:
            raw = response.read(MAX_JSON_BYTES + 1)
        require(len(raw) <= MAX_JSON_BYTES, 'SCOPE_CHAIN_LOG_SIZE')
        logs[label] = {'sha256': sha256(raw), 'text': raw.decode('utf8')}
    old = logs['original']['text']
    require('ℹ tests 36' in old and 'ℹ pass 36' in old and 'ℹ fail 0' in old and 'ℹ skipped 0' in old, 'SCOPE_ORIGINAL_COUNTS')
    previous_text = re.sub(r'^\d{4}-\d{2}-\d{2}T[^ ]+ ', '', logs['previous']['text'], flags=re.M)
    json_lines = []
    for line in previous_text.splitlines():
        if line.startswith('{'):
            try:
                value = json.loads(line)
                if isinstance(value, dict):
                    json_lines.append(value)
            except json.JSONDecodeError:
                pass
    receipts = [value for value in json_lines if 'retainedNodeTests' in value]
    complete = [value for value in json_lines if value.get('status') == 'SCOPE_QUALIFIED']
    require(len(receipts) == 1 and len(complete) == 1, 'SCOPE_PREVIOUS_RECEIPT_REQUIRED')
    previous = receipts[0]
    require(previous.get('sourceRun') == SCOPE_RUN and previous.get('sourceJob') == SCOPE_JOB
            and previous.get('sourceHead') == SCOPE_HEAD and previous.get('sourceTree') == SCOPE_TREE
            and previous.get('currentHead') == ORIGIN_B['merge'] and previous.get('currentSourceHead') == ORIGIN_B['head']
            and previous.get('sourceLogSha256') == logs['original']['sha256']
            and previous.get('inputBinding') == previous_binding, 'SCOPE_PREVIOUS_ORIGIN_BINDING')
    require(complete[0] == {'status': 'SCOPE_QUALIFIED', 'executedPassed': 17, 'retainedPassed': 19, 'sourceRun': SCOPE_RUN}, 'SCOPE_PREVIOUS_COMPLETION')
    old_retained, old_executed, all_names = [], [], []
    for file in SCOPE_TEST_FILES:
        content = Path('.github/scripts', file).read_text()
        matches = list(re.finditer(r"^test\('([^']+)'", content, re.M))
        for index, match in enumerate(matches):
            block = content[match.start():matches[index + 1].start() if index + 1 < len(matches) else len(content)]
            all_names.append(match[1])
            (old_executed if 'ci.yml' in block or "source('ci')" in block or 'all versioned jobs' in match[1] else old_retained).append(match[1])
    require(len(all_names) == 36 and len(set(all_names)) == 36
            and previous.get('retainedNodeTests') == old_retained
            and previous.get('executedNodeTests') == old_executed, 'SCOPE_PREVIOUS_SELECTION')
    for name in all_names:
        require(re.search(r'✔ ' + re.escape(name) + r' \([^\n]+\)', old), 'SCOPE_ORIGINAL_NAMED_PASS')
    validate_scope_tap(previous_text, old_executed)
    retained = [name for name in all_names if name not in SCOPE_REPAIR_TESTS]
    require(len(retained) == 33 and all(name in all_names for name in SCOPE_REPAIR_TESTS), 'SCOPE_REPAIR_SELECTION_CHANGED')
    receipt = {'schema': 1, 'currentHead': current, 'currentSourceHead': source,
               'sourceRun': ORIGIN_B['run'], 'sourceJob': SCOPE_B_JOB,
               'originalSourceRun': SCOPE_RUN, 'originalSourceJob': SCOPE_JOB,
               'sourceLogsSha256': {label: value['sha256'] for label, value in logs.items()},
               'inputBinding': binding, 'retainedNodeTests': retained,
               'retainedNodeSources': {name: ORIGIN_B['run'] if name in old_executed else SCOPE_RUN for name in retained},
               'executedNodeTests': list(SCOPE_REPAIR_TESTS), 'wholeCandidateQualified': False}
    print(json.dumps(receipt), flush=True)
    pattern = '^(' + '|'.join(re.escape(name) for name in SCOPE_REPAIR_TESTS) + ')$'
    result = subprocess.run(['node', '--test', '--test-reporter=tap', '--test-name-pattern', pattern,
                             *['.github/scripts/' + name for name in SCOPE_TEST_FILES]],
                            capture_output=True, text=True, timeout=120)
    print(result.stdout, end='', flush=True)
    print(result.stderr, end='', file=sys.stderr, flush=True)
    require(result.returncode == 0, 'SCOPE_REPAIR_EXECUTED_FAILURE')
    validate_scope_repair_tap(result.stdout, SCOPE_REPAIR_TESTS)
    print(json.dumps({'status': 'SCOPE_QUALIFIED', 'executedPassed': 3, 'retainedPassed': 33,
                      'sourceRun': ORIGIN_B['run'], 'originalSourceRun': SCOPE_RUN}), flush=True)


if __name__ == '__main__':
    scope_repair_receipt() if sys.argv[1:] == ['--scope-receipt'] else browser_repair_main()
