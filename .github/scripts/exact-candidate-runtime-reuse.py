"""One exact official failed invocation's three successful unchanged checks, not whole-run success."""
import ast
import hashlib
import json
from pathlib import Path
import zipfile

PHASES = ('dependency-audit', 'changed-lint', 'frontend-app-types')
PIN = {'repository': 'caohuibj/eduK12-new-version', 'runId': '39442752356', 'attempt': 1, 'sourceHead': 'b6191604330ad7676ab5910760dc5e6bcd7d3b60', 'head': '16625dbd4cfd938e16f7c0adb5e14a01c0ebd22c', 'tree': 'ba9f16ee3a67078990f0fa2a5ae29e082c8fe1f3', 'jobId': 118696950306, 'jobName': 'exact-candidate / missing runtime packaging security and schema recovery', 'artifactId': 12274733369, 'artifactName': 'exact-runtime-16625dbd4cfd938e16f7c0adb5e14a01c0ebd22c-1', 'zipBytes': 17016, 'zipSha256': '78193ff61aaca9d1007af58c718fb6671dbebfcb365203c631781a53be1d9e43', 'resultSha256': '89c11f1adbaad236a7d8d31b77ca7d087526cc5c89a0be5d41b57104ea06ecdc', 'inputsSha256': 'def2bc9471356c81380ad0519c8988d920e3f88d151d71380413503e9430a32e', 'methods': {'command': '805ca017f9d28ed3fed3f65495407d51a94474762531c0b1a84ae5b8e45700c8', 'producer': '0c9f15cadce7925e1747749403e5881b2d65dde6e36fbe72d1946a26ec401c48', 'prepare': '2bf169a88cefb15e33d8d6cb2658a49c5588b34eeba017617314e6864163fcc8', 'audit': '5455570d5fdf29796a818a81b019dd44a264a7cb41f4d85e0616a448ef75ea17', 'lint': '86442028090ddd53ab58969c9ba66a835553b88b81c26e3870eea097434a4014', 'app_types': '532a45eaaae9593a7b92d060811b6391d3e728693b49a52ad30e491acba3b01d'}}

CONSUMED_IMPLEMENTATION_SHA256 = '45a5b4a9a86556d4bfa869979049bc497d28393e0a169bbe51a186b5c5eb92b3'


def consumed_implementation_hash(source):
    segments = [(n.name, ast.get_source_segment(source, n))
                for c in ast.parse(source).body if isinstance(c, ast.ClassDef) and c.name == 'Qualification'
                for n in c.body if isinstance(n, ast.FunctionDef) and n.name in ('schema', 'execute')]
    require(len(segments) == 2, 'Missing reviewed schema/orchestration boundary')
    for name, segment in segments:
        source = source.replace(segment, 'REVIEWED_SCHEMA_OR_ORCHESTRATION_DELTA:' + name)
    return hashlib.sha256(source.encode()).hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def validate_records(run, job, artifact, raw, current_inputs, source):
    p = PIN
    require(str(run['id']) == p['runId'] and run['run_attempt'] == p['attempt'], 'Prior run identity mismatch')
    require(run['head_sha'] == p['sourceHead'] and run['head_branch'] == 'work/measurement-version-final-20261020', 'Prior source mismatch')
    require(run['event'] == 'pull_request' and run['path'] == '.github/workflows/ci.yml', 'Prior workflow mismatch')
    require(run['repository']['full_name'] == p['repository'] and run['head_repository']['full_name'] == p['repository'], 'Prior repository mismatch')
    require(job['id'] == p['jobId'] and str(job['run_id']) == p['runId'] and job['run_attempt'] == p['attempt'] and job['head_sha'] == p['sourceHead'], 'Prior job identity mismatch')
    require(job['name'] == p['jobName'] and job['status'] == 'completed' and job['conclusion'] == 'failure', 'Original failed job status changed')
    require(artifact['id'] == p['artifactId'] and artifact['name'] == p['artifactName'] and artifact['expired'] is False, 'Prior artifact mismatch')
    require(artifact['size_in_bytes'] == p['zipBytes'] and artifact['digest'] == 'sha256:' + p['zipSha256'], 'Prior artifact bytes mismatch')
    require(str(artifact['workflow_run']['id']) == p['runId'] and artifact['workflow_run']['head_sha'] == p['sourceHead'], 'Prior artifact producer mismatch')
    require(hashlib.sha256(raw).hexdigest() == p['resultSha256'], 'Prior raw result changed')
    require(hashlib.sha256(current_inputs).hexdigest() == p['inputsSha256'], 'Prior consumed runtime inputs changed')
    require(consumed_implementation_hash(source) == CONSUMED_IMPLEMENTATION_SHA256, 'Consumed helper/module implementation changed')
    methods = {n.name: hashlib.sha256(ast.get_source_segment(source, n).encode()).hexdigest()
               for c in ast.parse(source).body if isinstance(c, ast.ClassDef) and c.name == 'Qualification'
               for n in c.body if isinstance(n, ast.FunctionDef) and n.name in p['methods']}
    require(methods == p['methods'], 'Successful phase implementation changed')
    result = json.loads(raw)
    for key in ('head', 'sourceHead', 'tree', 'inputsSha256'):
        require(result[key] == p[key], 'Prior receipt identity mismatch')
    require(result['consumerRunId'] == p['runId'] and result['consumerAttempt'] == str(p['attempt']) and result['status'] == 'failure', 'Original failure must remain recorded')
    rows = {row['name']: row for row in result['phases']}
    require(len(rows) == len(result['phases']) and rows['schema-upgrade-restore']['status'] == 'failure', 'Original schema failure missing')
    for name in PHASES:
        row = rows[name]
        require(row['status'] == 'success', 'Prior selected phase not successful')
        for key in ('head', 'sourceHead', 'tree', 'inputsSha256', 'consumerRunId', 'consumerAttempt'):
            require(row[key] == result[key], 'Selected phase identity mismatch')
    return {name: rows[name] for name in PHASES}


def admit_reusable_phases(q):
    # prepare has independently validated current source trees, locks, fixtures,
    # migration selection, compiler archives and the exact current frozen plan.
    q.ready('prepare')
    p = PIN
    run = q.api('/actions/runs/' + p['runId'] + '/attempts/' + str(p['attempt']))
    job = q.api('/actions/jobs/' + str(p['jobId']))
    artifact = q.api('/actions/artifacts/' + str(p['artifactId']))
    target = q.private / 'prior-runtime-receipts.zip'
    q.download(p, target)
    with zipfile.ZipFile(target) as zipped:
        require(zipped.namelist().count('runtime-result.json') == 1, 'Missing or duplicate original result')
        require(zipped.getinfo('runtime-result.json').file_size < 1024 * 1024, 'Oversized original result')
        raw = zipped.read('runtime-result.json')
    root = Path(__file__).parent
    return validate_records(run, job, artifact, raw,
        (root / 'exact-candidate-runtime-inputs.json').read_bytes(),
        (root / 'exact-candidate-runtime.py').read_text())
