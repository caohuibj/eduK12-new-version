"""Exact same-PR partial resume from one failed official Survey candidate.

Only the seven named successful build/archive/audit phases can be inherited.
The sole permitted failure is the unchanged external-fixture omission in frontend
changed-types/lint. Missing/failed phases remain unqualified and must run under the
reviewed resume executor. Never emits reused=true or rewrites original evidence.
Importing this module does no I/O. Downloads and Docker loads are Actions-only.
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


def validate_official_source(run, job, artifact, now=None):
    """Validate origin only. A failed job is returned as failed, never qualified."""
    require(run.get('id') == SOURCE_RUN, 'WRONG_SOURCE_RUN')
    require(run.get('repository', {}).get('full_name') == REPOSITORY, 'SOURCE_REPOSITORY')
    require(run.get('head_repository', {}).get('full_name') == REPOSITORY, 'SOURCE_FORK')
    require(run.get('event') == 'pull_request' and run.get('path') == '.github/workflows/ci.yml', 'SOURCE_WORKFLOW_EVENT')
    require(run.get('head_sha') == SOURCE_HEAD, 'SOURCE_RUN_HEAD')
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
    require(job.get('id') == SOURCE_JOB and job.get('run_id') == SOURCE_RUN, 'SOURCE_JOB_ID')
    require(job.get('name') == 'survey-candidate / candidate', 'SOURCE_JOB_NAME')
    require(job.get('head_sha') == SOURCE_HEAD, 'SOURCE_JOB_HEAD')
    require(job.get('status') == 'completed' and job.get('conclusion') in ('success', 'failure'), 'SOURCE_JOB_NOT_TERMINAL')
    require(recent(job.get('completed_at'), now), 'SOURCE_JOB_STALE')
    require(artifact.get('workflow_run', {}).get('id') == SOURCE_RUN, 'ARTIFACT_RUN')
    require(artifact.get('workflow_run', {}).get('head_sha') == SOURCE_HEAD, 'ARTIFACT_SOURCE_HEAD')
    require(artifact.get('name') == 'survey-candidate-' + SOURCE_MERGE, 'ARTIFACT_NAME')
    require(artifact.get('id') == SOURCE_ARTIFACT, 'ARTIFACT_ID')
    require(not artifact.get('expired') and recent(artifact.get('created_at'), now), 'ARTIFACT_EXPIRED_OR_STALE')
    require(type(artifact.get('size_in_bytes')) is int and 0 < artifact['size_in_bytes'] <= MAX_DOWNLOAD_BYTES, 'ARTIFACT_SIZE')
    require(artifact.get('digest') == SOURCE_ARTIFACT_DIGEST, 'OFFICIAL_DIGEST_REQUIRED')
    require(artifact.get('size_in_bytes') == SOURCE_ARTIFACT_SIZE, 'SOURCE_ARTIFACT_SIZE')
    return {'runId': SOURCE_RUN, 'jobId': SOURCE_JOB, 'jobConclusion': job['conclusion'],
            'artifactId': artifact['id'], 'artifactDigest': artifact['digest'],
            'sourceHead': SOURCE_HEAD, 'mergeHead': SOURCE_MERGE,
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


def source_metadata():
    run = official_json(f'/actions/runs/{SOURCE_RUN}')
    job = official_json(f'/actions/jobs/{SOURCE_JOB}')
    candidates = []
    for page in range(1, 101):
        body = official_json(f'/actions/runs/{SOURCE_RUN}/artifacts?per_page=100&page={page}')
        rows = body.get('artifacts')
        require(isinstance(rows, list), 'ARTIFACT_API_RESPONSE')
        candidates.extend(a for a in rows if a.get('name') == 'survey-candidate-' + SOURCE_MERGE)
        if len(rows) < 100:
            break
    else:
        raise ReuseRejected('ARTIFACT_PAGINATION_LIMIT')
    require(len(candidates) == 1, 'MISSING_OR_AMBIGUOUS_OFFICIAL_ARTIFACT')
    artifact = candidates[0]
    validate_official_source(run, job, artifact)
    return run, job, artifact


def verify_official_digest(path, expected):
    require(bool(re.fullmatch('sha256:[0-9a-f]{64}', expected or '')), 'OFFICIAL_DIGEST_REQUIRED')
    actual = 'sha256:' + file_sha256(path)
    require(actual == expected, 'OFFICIAL_ARTIFACT_DIGEST_MISMATCH')
    return actual


def safe_zip_entries(infos):
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
    require('survey-candidate-evidence/reuse.json' not in seen
            and 'survey-candidate-evidence/resume-proof.json' not in seen
            and 'survey-candidate-evidence/qualified-original-plan.json' not in seen, 'CHAINED_REUSE_FORBIDDEN')
    return True


def safe_extract(archive, destination):
    destination = Path(destination)
    require(not destination.exists(), 'EXTRACTION_DESTINATION_EXISTS')
    infos = archive.infolist()
    safe_zip_entries(infos)
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


def download_verified_artifact(artifact, destination):
    """Actions-only intake. Retains original bytes; grants no reuse eligibility."""
    require_official_ci()
    destination = Path(destination)
    require(not destination.exists(), 'ARTIFACT_DESTINATION_EXISTS')
    require(artifact.get('workflow_run', {}).get('id') == SOURCE_RUN, 'WRONG_DOWNLOAD_RUN')
    require(artifact.get('id') == SOURCE_ARTIFACT and artifact.get('digest') == SOURCE_ARTIFACT_DIGEST, 'WRONG_PINNED_DOWNLOAD')
    require(type(artifact.get('id')) is int and artifact['id'] > 0, 'INVALID_DOWNLOAD_ID')
    require(artifact.get('name') == 'survey-candidate-' + SOURCE_MERGE, 'WRONG_DOWNLOAD_NAME')
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
            unpacked = safe_extract(archive, Path(temporary) / 'original')
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


def main():
    require_official_ci()
    require(PARTIAL_TRANSITIONS_FINALIZED, 'REVIEWED_PARTIAL_TRANSITION_HASHES_NOT_FINALIZED')
    current = read_json('survey-candidate-plan.json')
    current_source = os.environ.get('SURVEY_SOURCE_HEAD', '')
    validate_current_event(read_json(os.environ['GITHUB_EVENT_PATH']), current, current_source)
    input_binding = validate_git_inputs(current, current_source)
    run, job, artifact = source_metadata()
    provenance = validate_official_source(run, job, artifact)
    # Check the known terminal job before any 1 GiB transfer. Its exact ledger
    # and every individual image archive are checked after the official digest.
    require(job.get('conclusion') == 'failure', 'UNEXPECTED_ORIGINAL_JOB_CONCLUSION')
    evidence = Path('survey-candidate-evidence')
    require(not evidence.exists(), 'CURRENT_EVIDENCE_ALREADY_EXISTS')
    evidence.mkdir(mode=0o700)
    original_root = download_verified_artifact(artifact, evidence / 'original-evidence')
    original_plan_path = original_root / 'survey-candidate-plan.json'
    original = original_root / 'survey-candidate-evidence'
    original_checks_path = original / 'checks.json'
    old_plan, checks = read_json(original_plan_path), read_json(original_checks_path)
    validate_plan_binding(old_plan, checks, current)
    reused = validate_partial_candidate(job, checks)
    executed_inputs = validate_execution_inputs(checks)
    archive_specs = (
        ('backendBuilder', 'backend', True, checks['builders']['backend']),
        ('backendRuntime', 'backend', False, checks['images']['backend']),
        ('frontendBuilder', 'frontend', True, checks['builders']['frontend']),
    )
    archives, aliases = {}, {}
    for key, component, builder, image_id in archive_specs:
        filename = component + ('-builder' if builder else '') + '-image.tar.zst'
        old_tag = 'eduk12-survey-candidate-' + component + ':' + SOURCE_MERGE + ('-build' if builder else '')
        archives[key] = verify_image_archive(original / filename, image_id, old_tag)
    # No Docker mutation occurs until provenance, unchanged inputs, the phase
    # ledger, all three compressed hashes and all three config IDs are verified.
    for key, component, builder, image_id in archive_specs:
        filename = archives[key]['file']
        for suffix in ('', '.sha256'):
            os.replace(original / (filename + suffix), evidence / (filename + suffix))
        alias = 'eduk12-survey-candidate-' + component + ':' + current['head'] + ('-build' if builder else '')
        aliases[key] = load_and_alias(evidence / filename, image_id, alias)
    shutil.copy2(original_plan_path, evidence / 'qualified-original-plan.json')
    shutil.copy2(original_checks_path, evidence / 'qualified-original-checks.json')
    receipt = {
        'schema': 1, 'status': 'QUALIFIED_PARTIAL_RESUME',
        'currentHead': current['head'], 'currentSourceHead': current_source,
        'sourceHead': SOURCE_HEAD, 'sourceMergeHead': SOURCE_MERGE,
        'sourceRun': SOURCE_RUN, 'sourceJob': SOURCE_JOB,
        'artifactId': artifact['id'], 'artifactDigest': artifact['digest'],
        'artifact': {key: artifact[key] for key in ('id', 'digest', 'size_in_bytes')},
        'originalPlan': old_plan, 'originalChecks': checks, 'reusedPhases': reused,
        'originalEvidencePath': str(original), 'originalJobConclusion': 'failure',
        'originalFailedPhase': FAILED_PHASE, 'wholeCandidateQualified': False,
        'archives': archives, 'currentAliases': aliases,
        'originalArchiveRelocation': 'Unchanged archive bytes and checksums moved to evidence root; original JSON retained.',
        'inputBinding': input_binding, 'originalExecutionInputs': executed_inputs,
        'provenance': provenance,
        'qualifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'rebuilt': False, 'retested': False, 'rescanned': False,
    }
    (evidence / 'resume-proof.json').write_text(json.dumps(receipt, indent=2) + '\n')
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write('restored=true\n')
    print(json.dumps({'status': receipt['status'], 'sourceRun': SOURCE_RUN,
                      'artifactId': SOURCE_ARTIFACT, 'reusedPhases': reused,
                      'wholeCandidateQualified': False}))



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

def scope_receipt():
    # Only the CI-workflow readers have changed inputs. Retain the other 19
    # already-successful contracts from their official job; no generic cache.
    require_official_ci()
    require(os.environ.get('RUNNER_OS') == 'Linux' and subprocess.check_output(['node', '--version'], text=True).strip() == 'v24.21.0', 'SCOPE_ENVIRONMENT')
    current = git('rev-parse', 'HEAD').decode().strip()
    require(current == os.environ.get('GITHUB_SHA'), 'SCOPE_CHECKOUT')
    source = os.environ.get('SURVEY_SOURCE_HEAD', '')
    require(bool(re.fullmatch('[0-9a-f]{40}', source)), 'SCOPE_SOURCE_SHA')
    for ref in (SCOPE_HEAD, source):
        if subprocess.run(['git', 'cat-file', '-e', ref + '^{commit}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            subprocess.run(['git', 'fetch', '--no-tags', '--depth=1', 'origin', ref], check=True, timeout=120)
    require(git('rev-parse', SCOPE_HEAD + '^{tree}').decode().strip() == SCOPE_TREE, 'SCOPE_ORIGINAL_TREE')
    require(git('rev-parse', source + '^{tree}').decode().strip() == git('rev-parse', current + '^{tree}').decode().strip(), 'SCOPE_CURRENT_TREE')
    binding = validate_scope_transition(git_objects(SCOPE_HEAD), git_objects(source), git('hash-object', str(Path(__file__).resolve())).decode().strip())
    run = official_json(f'/actions/runs/{SCOPE_RUN}')
    job = official_json(f'/actions/jobs/{SCOPE_JOB}')
    require(run.get('id') == SCOPE_RUN and run.get('head_sha') == SCOPE_HEAD and run.get('event') == 'pull_request'
            and run.get('repository', {}).get('full_name') == REPOSITORY and run.get('head_repository', {}).get('full_name') == REPOSITORY
            and run.get('path') == '.github/workflows/ci.yml' and recent(run.get('created_at'))
            and any(pr.get('number') == PR_NUMBER for pr in run.get('pull_requests', [])), 'SCOPE_RUN_ORIGIN')
    require(job.get('id') == SCOPE_JOB and job.get('run_id') == SCOPE_RUN and job.get('head_sha') == SCOPE_HEAD
            and job.get('name') == 'classify changed content' and job.get('status') == 'completed'
            and job.get('conclusion') == 'success' and recent(job.get('completed_at')), 'SCOPE_JOB_ORIGIN')
    steps = [step for step in job.get('steps', []) if step.get('name') == 'frozen Survey scope and fail-closed merge contracts']
    require(len(steps) == 1 and steps[0].get('conclusion') == 'success', 'SCOPE_ORIGINAL_SELECTED_STEP')
    with official_request(f'/actions/jobs/{SCOPE_JOB}/logs') as response:
        raw = response.read(MAX_JSON_BYTES + 1)
    require(len(raw) <= MAX_JSON_BYTES, 'SCOPE_LOG_SIZE')
    log = raw.decode('utf8')
    require('ℹ tests 36' in log and 'ℹ pass 36' in log and 'ℹ fail 0' in log and 'ℹ skipped 0' in log, 'SCOPE_ORIGINAL_NODE_COUNTS')
    affected, retained = [], []
    for file in SCOPE_TEST_FILES:
        text = Path('.github/scripts', file).read_text()
        matches = list(re.finditer(r"^test\('([^']+)'", text, re.M))
        for index, match in enumerate(matches):
            block = text[match.start():matches[index + 1].start() if index + 1 < len(matches) else len(text)]
            (affected if 'ci.yml' in block or "source('ci')" in block or 'all versioned jobs' in match[1] else retained).append(match[1])
    require(len(affected) == 17 and len(retained) == 19, 'SCOPE_CONSUMER_SELECTION_CHANGED')
    for name in affected + retained:
        require(re.search(r'✔ ' + re.escape(name) + r' \([^\n]+\)', log), 'SCOPE_ORIGINAL_NAMED_PASS')
    receipt = {'schema': 1, 'currentHead': current, 'currentSourceHead': source, 'sourceRun': SCOPE_RUN, 'sourceJob': SCOPE_JOB,
               'sourceHead': SCOPE_HEAD, 'sourceTree': SCOPE_TREE, 'sourceLogSha256': sha256(raw), 'inputBinding': binding,
               'retainedNodeTests': retained, 'executedNodeTests': affected, 'wholeCandidateQualified': False}
    print(json.dumps(receipt), flush=True)
    pattern = '^(' + '|'.join(re.escape(name) for name in affected) + ')$'
    result = subprocess.run(['node', '--test', '--test-reporter=tap', '--test-name-pattern', pattern, *['.github/scripts/' + name for name in SCOPE_TEST_FILES]], capture_output=True, text=True, timeout=120)
    print(result.stdout, end='', flush=True)
    print(result.stderr, end='', file=sys.stderr, flush=True)
    require(result.returncode == 0, 'SCOPE_EXECUTED_FAILURE')
    validate_scope_tap(result.stdout, affected)
    print(json.dumps({'status': 'SCOPE_QUALIFIED', 'executedPassed': 17, 'retainedPassed': 19, 'sourceRun': SCOPE_RUN}), flush=True)

if __name__ == '__main__':
    scope_receipt() if sys.argv[1:] == ['--scope-receipt'] else main()
