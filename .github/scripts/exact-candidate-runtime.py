"""Missing exact-candidate gates only. Never compiles or replays application tests.

Official archived dist/node_modules are verified before consumption. The runtime
Dockerfiles retain the repository runtime recipe but replace its compile stage
with COPY of those bytes. Private dumps/logs are never evidence artifacts.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
INPUTS = ROOT / '.github/scripts/exact-candidate-runtime-inputs.json'
PHASES = ('dependency-audit', 'changed-lint', 'frontend-app-types', 'runtime-packaging', 'runtime-scans', 'schema-upgrade-restore')
COMPONENTS = ('backend', 'frontend')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_error_details(error):
    """Expose only fixed source location, never exception text or command args."""
    result = {'errorType': type(error).__name__}
    trace = error.__traceback__
    while trace:
        code = trace.tb_frame.f_code
        if Path(code.co_filename).resolve() == Path(__file__).resolve() and code.co_name != 'require':
            result['errorLocation'] = {'helper': code.co_name, 'line': trace.tb_lineno}
        trace = trace.tb_next
    return result


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sha(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def input_inventory(component, excluded):
    rows = subprocess.check_output(['git', 'ls-tree', '-r', '-z', 'HEAD', '--', 'server-version/' + component], cwd=ROOT).split(b'\0')
    return digest(b'\0'.join(row for row in rows if row and row.split(b'\t', 1)[1].decode() not in excluded))


def validate_plan(plan, inputs):
    require(plan.get('schema') == 1 and plan.get('route') == 'exact-candidate' and plan.get('candidate') == 'measurement', 'Wrong frozen plan')
    for key in ('head', 'sourceHead', 'tree', 'base'):
        require(bool(re.fullmatch('[0-9a-f]{40}', plan.get(key, ''))), 'Missing plan ' + key)
    require(plan['head'] == git('rev-parse', 'HEAD') and plan['tree'] == git('rev-parse', 'HEAD^{tree}'), 'Checkout differs from plan')
    require(plan['components'] == inputs['components'] and plan['runtime'] == inputs['runtime'], 'Runtime inputs differ from frozen pins')
    require(plan['base'] == inputs['runtime']['base'], 'Wrong upgrade baseline')
    require(set(PHASES).issubset(plan['required']), 'Missing mandatory runtime gate')
    subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    for component in COMPONENTS:
        pin = inputs['components'][component]
        require(pin['sourceTree'] == git('rev-parse', 'HEAD:server-version/' + component), 'Changed component source')
        require(input_inventory(component, pin['excludedNonProductionPaths']) == pin['productionInputSha256'], 'Changed production inputs')
        require(sha(ROOT / 'server-version' / component / 'package-lock.json') == pin['lockfileSha256'], 'Changed lockfile')
    added, unchanged = migration_inputs(plan['base'])
    require(added == inputs['runtime']['newMigrations'] and unchanged, 'Unfrozen migration selection')
    changed = subprocess.check_output(['git', 'diff', '--name-only', '--diff-filter=AM', plan['base'], 'HEAD', '--', 'server-version/frontend'], cwd=ROOT, text=True).splitlines()
    selected = sorted(p.removeprefix('server-version/frontend/') for p in changed if p.endswith(('.ts', '.tsx')))
    require(selected and selected == inputs['runtime']['changedFrontendFiles'], 'Changed lint selection')


def migration_inputs(base):
    prefix = 'server-version/backend/prisma/migrations/'
    def rows(ref):
        lines = subprocess.check_output(['git', 'ls-tree', '-r', ref, '--', prefix], cwd=ROOT, text=True).splitlines()
        result = {}
        for line in lines:
            mode, kind, rest = line.split(' ', 2)
            blob, path = rest.split('\t')
            require(mode == '100644' and kind == 'blob', 'Nonregular migration input')
            result[path] = blob
        return result
    old, current = rows(base), rows('HEAD')
    require(old and all(current.get(p) == h for p, h in old.items()), 'Existing migration was changed or deleted')
    additions = sorted(set(current) - set(old))
    require(additions and all(re.fullmatch(prefix + r'[0-9]{14}_[a-z0-9_]+/migration.sql', p) for p in additions), 'Unexpected migration addition')
    return sorted(p.split('/')[-2] for p in additions), old


def validate_producer(pin, run, job, artifact):
    require(str(run['id']) == pin['runId'] and str(run['run_attempt']) == pin['attempt'], 'Wrong producer run/attempt')
    require(run['head_sha'] == pin['head'] and run['head_branch'] == pin['branch'], 'Wrong producer source')
    require(run['event'] == 'push' and run['path'] == pin['workflowPath'] and run['status'] == 'completed', 'Wrong or pending producer workflow')
    require(str(job['id']) == str(pin['jobId']) and str(job['run_id']) == pin['runId'] and str(job['run_attempt']) == pin['attempt'], 'Wrong producer job identity')
    require(job['head_sha'] == pin['head'] and job['name'] == pin['jobName'] and job['conclusion'] == 'success', 'Producer job did not succeed')
    require(artifact['id'] == pin['artifactId'] and artifact['name'] == pin['artifactName'] and not artifact['expired'], 'Wrong or expired artifact')
    require(artifact['size_in_bytes'] == pin['zipBytes'] and artifact['digest'] == 'sha256:' + pin['zipSha256'], 'Changed official artifact')
    require(str(artifact['workflow_run']['id']) == pin['runId'] and artifact['workflow_run']['head_sha'] == pin['head'], 'Wrong artifact producer')


def validate_receipt(component, pin, raw):
    require(digest(raw) == pin['receiptSha256'], 'Changed original receipt')
    receipt = json.loads(raw)
    require(receipt['status'] == 'success' and receipt['component'] == component, 'Failed/wrong compiled producer')
    for key in ('head', 'runId', 'attempt', 'componentTree', 'archiveSha256', 'lockfileSha256', 'buildFlags', 'requiredFiles'):
        require(receipt[key] == pin[key], 'Producer receipt mismatch: ' + key)
    expected = ['locked official dependencies', 'Prisma generated client', 'production backend build and catalog prerequisites'] if component == 'backend' else ['locked official dependencies', 'production Vite assets']
    require([p['name'] for p in receipt['phases']] == expected and all(p['status'] == 'success' for p in receipt['phases']), 'Missing/failed compile phases')
    return receipt


def safe_extract(archive, destination, allowed_roots=None):
    """Reject traversal/devices; allow only prior regular-file internal hardlinks."""
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, 'r:*') as tar:
        members, names, links, regular = tar.getmembers(), set(), set(), set()
        require(len(members) <= 150000, 'Oversized archive inventory')
        require(sum(m.size for m in members) <= 4 * 1024**3, 'Oversized expanded archive')
        for member in members:
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and '..' not in path.parts and path.parts and str(path) not in names, 'Unsafe/duplicate archive path')
            names.add(str(path))
            if allowed_roots:
                require(path.parts[0] in allowed_roots, 'Unexpected compiled archive root')
            require(member.isfile() or member.isdir() or member.issym() or member.islnk(), 'Unexpected archive entry type')
            require(not (member.mode & 0o6000), 'Privileged archive mode')
            if member.islnk():
                target = PurePosixPath(member.linkname)
                require(not target.is_absolute() and '..' not in target.parts and target.parts and target.parts[0] == path.parts[0], 'Unsafe archive hardlink target')
                require(str(target) in regular, 'Hardlink target must be a prior regular archive file')
                require((destination / str(target)).resolve().is_relative_to(destination), 'Escaping archive hardlink')
                links.add(str(path))
            elif member.isfile():
                regular.add(str(path))
            if member.issym():
                require(not os.path.isabs(member.linkname), 'Absolute archive symlink')
                target = (destination / str(path.parent) / member.linkname).resolve()
                require(target.is_relative_to(destination), 'Escaping archive symlink')
                links.add(str(path))
        for member in members:
            require(not any(str(p) in links for p in PurePosixPath(member.name).parents), 'Archive write through symlink')
        tar.extractall(destination, members=members, filter='data')


def runtime_recipe(component, original, node_digest, nginx_digest):
    require(bool(re.fullmatch(r'node@sha256:[0-9a-f]{64}', node_digest)), 'Unpinned official Node base')
    if component == 'backend':
        start = 'FROM node:24.21.0-bookworm-slim AS runtime'
        require(original.count(start) == 1 and '# ---------- Stage 4:' in original, 'Unknown backend runtime recipe')
        body = original.split(start, 1)[1].split('# ---------- Stage 4:', 1)[0]
        require('npm run build' not in body and 'npm ci' not in body, 'Compile in runtime recipe')
        prefix = f'FROM {node_digest} AS build\nWORKDIR /app\nCOPY . .\nFROM build AS prod-deps\nRUN npm prune --omit=dev --ignore-scripts --offline --audit=false --fund=false\n'
        return prefix + 'FROM ' + node_digest + ' AS runtime' + body
    require(component == 'frontend' and re.fullmatch(r'nginx@sha256:[0-9a-f]{64}', nginx_digest), 'Unpinned official nginx base')
    start = 'FROM nginx:1.31.6-alpine3.24-slim AS runtime'
    require(original.count(start) == 1, 'Unknown frontend runtime recipe')
    body = original.split(start, 1)[1]
    require('npm run build' not in body and 'npm ci' not in body, 'Compile in runtime recipe')
    return f'FROM {node_digest} AS build\nWORKDIR /app\nCOPY dist ./dist\nFROM {nginx_digest} AS runtime' + body


def remove_isolated_resources(command, container, network, attempted_container, attempted_network):
    failures = []
    resources = (
        (attempted_container, container, ['docker', 'container', 'ls', '--all', '--format', '{{.Names}}'], ['docker', 'rm', '-f', '-v', container]),
        (attempted_network, network, ['docker', 'network', 'ls', '--format', '{{.Name}}'], ['docker', 'network', 'rm', network]),
    )
    for attempted, name, inspect, remove in resources:
        if attempted:
            try:
                # A timed-out create/remove can still have executed. Reconcile
                # exact owned names, and never treat an unavailable daemon as absence.
                if name in command(inspect, timeout=60).stdout.splitlines():
                    try:
                        command(remove, timeout=60)
                    except Exception:
                        pass
                    require(name not in command(inspect, timeout=60).stdout.splitlines(), 'Owned resource still exists')
            except Exception:
                failures.append(name)
    require(not failures, 'Isolated resource cleanup failed')


# Synthetic old records exercise persistence, not a repeated application suite.
LEGACY_SQL = """
INSERT INTO users(id,username,password_hash,role,account_domain,platform_role,updated_at)
 VALUES ('exact-admin','exact_admin','synthetic-only','ADMIN','LEGACY','SYSTEM_ADMIN',now()),
 ('exact-owner','exact_owner','synthetic-only','STUDENT','SURVEY','STANDARD',now());
INSERT INTO survey_accounts(user_id,login_name,normalized_login) VALUES ('exact-owner','exact_owner','exact_owner');
INSERT INTO survey_researcher_grants(user_id,status,granted_by) VALUES ('exact-owner','ACTIVE','exact-admin');
INSERT INTO survey_projects(id,owner_user_id,title,collection_mode,status,public_id,first_published_at)
 VALUES ('exact-project','exact-owner','Synthetic retained history','SINGLE_UNLINKED','ACTIVE','exact-public',now());
INSERT INTO survey_publications(id,project_id,definition_digest,compiled_snapshot,consent_version,version)
 VALUES ('exact-publication','exact-project',repeat('1',64),'{"schemaVersion":1,"synthetic":true}',1,1);
INSERT INTO survey_waves(id,project_id,publication_id,ordinal,title,status,consent_text,opens_at,closes_at,finish_until)
 VALUES ('exact-wave','exact-project','exact-publication',1,'Synthetic wave','OPEN','Synthetic consent',now()-interval '1 day',now()+interval '1 day',now()+interval '2 days');
INSERT INTO survey_wave_attempts(id,project_id,wave_id,session_hash,status,completed_at)
 VALUES ('exact-attempt','exact-project','exact-wave',repeat('2',64),'COMPLETED',now());
INSERT INTO survey_wave_finals(id,attempt_id,project_id,wave_id,publication_id,submission_id,payload_hash,definition_digest,results_cipher,results_hash)
 VALUES ('exact-final','exact-attempt','exact-project','exact-wave','exact-publication','exact-synthetic-submission',repeat('3',64),repeat('1',64),'synthetic-retained-ciphertext',repeat('4',64));
INSERT INTO composite_assessments(id,code,name,created_by,updated_at)
 VALUES ('exact-training','exact-training','Synthetic retained Training','exact-admin',now());
INSERT INTO composite_assessment_attempts(id,composite_assessment_id,user_id,participant_key,status,completed_at)
 VALUES ('exact-training-attempt','exact-training','exact-owner','exact-synthetic','COMPLETED',now());
"""
NEW_SQL = """
INSERT INTO measurement_content_releases(id,layer,family,content_key,version,hash_scheme,content_hash,content,scope,asset_refs,published_by)
 VALUES ('exact-release','MEASUREMENT','SCALE','exact-synthetic','1','sha256',repeat('6',64),'{"synthetic":true}','{"kind":"PRIVATE"}','[]','exact-admin');
INSERT INTO measurement_reference_candidates(id,candidate_hash,measurement_release_id,analyzer_id,payload)
 VALUES ('exact-candidate',repeat('7',64),'exact-release','exact-owner',
 jsonb_build_object('candidateHash',repeat('7',64),'analyzerId','exact-owner','measurement',jsonb_build_object('releaseId','exact-release'),
 'scope',jsonb_build_object('kind','PRIVATE'),'definition',jsonb_build_object('entries','[]'::jsonb)));
INSERT INTO measurement_reference_reviews(id,candidate_id,candidate_hash,reviewer_id,decision,statement)
 VALUES ('exact-review','exact-candidate',repeat('7',64),'exact-admin','APPROVED','Synthetic persistence only');
"""


class Qualification:
    def __init__(self, plan_path, output):
        self.plan_path = Path(plan_path)
        self.plan = json.loads(self.plan_path.read_text())
        self.inputs = json.loads(INPUTS.read_text())
        self.out = Path(output).resolve()
        self.out.mkdir(parents=True, exist_ok=True)
        self.identity = {'schema': 1, 'head': self.plan['head'], 'sourceHead': self.plan['sourceHead'], 'tree': self.plan['tree'],
                         'planSha256': sha(self.plan_path), 'inputsSha256': sha(INPUTS),
                         'consumerRunId': os.environ.get('GITHUB_RUN_ID'), 'consumerAttempt': os.environ.get('GITHUB_RUN_ATTEMPT')}
        suffix = digest(canonical(self.identity))[:16]
        self.private = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / ('exact-runtime-' + suffix)
        require(not self.out.is_relative_to(self.private) and not self.private.is_relative_to(self.out), 'Private and public paths overlap')
        self.private.mkdir(mode=0o700, exist_ok=True)
        self.prefix = 'exact-' + suffix
        self.state_path = self.private / 'state.json'
        self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else {**self.identity, 'status': 'running', 'phases': [], 'components': {}}
        require(all(self.state[k] == v for k, v in self.identity.items()), 'Prior private state belongs to different input')
        self.command_index = 0

    def save(self):
        images = {c: v['runtimeImageId'] for c, v in self.state['components'].items() if 'runtimeImageId' in v}
        for row in self.state['phases']:
            row['runtimeImages'] = images
            if row['status'] != 'running':
                (self.out / (row['name'] + '.json')).write_text(json.dumps(row, indent=2) + '\n')
        content = json.dumps(self.state, indent=2) + '\n'
        self.state_path.write_text(content)
        (self.out / 'runtime-result.json').write_text(content)

    def command(self, args, timeout=300, input=None, binary=False, accepted=(0,), cwd=None):
        self.command_index += 1
        completed = subprocess.run(args, cwd=cwd or ROOT, input=input, capture_output=True, text=not binary, timeout=timeout)
        # Logs may include connection strings and fixture SQL; keep private only.
        log = completed.stdout + completed.stderr
        (self.private / ('command-' + str(self.command_index) + '.log')).write_bytes(log if binary else log.encode())
        require(completed.returncode in accepted, Path(args[0]).name + ' command failed (private diagnostics retained on runner)')
        return completed

    def phase(self, name, action):
        require(not any(p['name'] == name for p in self.state['phases']), 'Phase already attempted; no silent replay')
        row = {'name': name, 'status': 'running', **self.identity, 'producers': {c: self.producer(c) for c in COMPONENTS}}
        self.state['phases'].append(row)
        self.save()
        started = time.monotonic()
        try:
            row['details'] = action()
            row['status'] = 'success'
        except BaseException as error:
            row.update(status='failure', **safe_error_details(error))
            self.state['status'] = 'failure'
            raise
        finally:
            row['seconds'] = round(time.monotonic() - started, 3)
            row['runtimeImages'] = {c: v['runtimeImageId'] for c, v in self.state['components'].items() if 'runtimeImageId' in v}
            self.save()
            (self.out / (name + '.json')).write_text(json.dumps(row, indent=2) + '\n')

    def producer(self, component):
        pin = self.inputs['components'][component]
        return {key: pin[key] for key in ('repository', 'runId', 'attempt', 'head', 'jobId', 'artifactId', 'zipSha256', 'receiptSha256', 'archiveSha256', 'componentTree', 'sourceTree', 'productionInputSha256', 'lockfileSha256')}

    def api(self, path):
        repository = self.inputs['components']['backend']['repository']
        require(repository == 'caohuibj/eduK12-new-version', 'Wrong official repository')
        request = urllib.request.Request('https://api.github.com/repos/' + repository + path,
            headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)

    def download(self, pin, target):
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        request = urllib.request.Request(f"https://api.github.com/repos/{pin['repository']}/actions/artifacts/{pin['artifactId']}/zip",
            headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
        try:
            urllib.request.build_opener(NoRedirect).open(request, timeout=60)
            raise ValueError('Expected official signed artifact redirect')
        except urllib.error.HTTPError as error:
            require(error.code == 302, 'Official artifact download failed')
            location = error.headers['Location']
            parsed = urllib.parse.urlparse(location)
            require(parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password, 'Unsafe artifact redirect')
        total = 0
        # New request deliberately has no GitHub token.
        with urllib.request.urlopen(location, timeout=120) as response, target.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                require(total <= pin['zipBytes'], 'Oversized official artifact')
                output.write(chunk)
        require(total == pin['zipBytes'] and sha(target) == pin['zipSha256'], 'Official ZIP bytes differ')

    def prepare(self):
        validate_plan(self.plan, self.inputs)
        require(os.environ.get('CI') == 'true' and os.environ.get('GITHUB_ACTIONS') == 'true', 'Official isolated Actions only')
        require(os.environ.get('GITHUB_SHA') == self.plan['head'], 'Actions checkout identity mismatch')
        require(os.environ.get('GITHUB_REPOSITORY') == 'caohuibj/eduK12-new-version', 'Wrong consumer repository')
        require(self.command(['node', '--version']).stdout.strip() == 'v24.21.0', 'Wrong Node runtime')
        for component in COMPONENTS:
            pin = self.inputs['components'][component]
            validate_producer(pin, self.api('/actions/runs/' + pin['runId']), self.api('/actions/jobs/' + str(pin['jobId'])), self.api('/actions/artifacts/' + str(pin['artifactId'])))
            archive = self.private / (component + '-official.zip')
            self.download(pin, archive)
            with zipfile.ZipFile(archive) as zipped:
                expected = {component + '-build.json', component + '-build.tar.gz'}
                require(set(zipped.namelist()) == expected and len(zipped.namelist()) == 2, 'Unexpected ZIP members')
                receipt = validate_receipt(component, pin, zipped.read(component + '-build.json'))
                compiled = self.private / (component + '-build.tar.gz')
                with zipped.open(component + '-build.tar.gz') as source, compiled.open('wb') as target:
                    shutil.copyfileobj(source, target)
            require(sha(compiled) == pin['archiveSha256'], 'Changed compiled archive')
            context = self.private / component
            require(not context.exists(), 'Existing context cannot replace official inputs')
            source_tar = self.private / (component + '-source.tar')
            self.command(['git', 'archive', '--format=tar', '--output=' + str(source_tar), 'HEAD:server-version/' + component])
            safe_extract(source_tar, context)
            safe_extract(compiled, context, {'dist', 'node_modules'})
            for path, expected in receipt['requiredFiles'].items():
                require(sha(context / path) == expected, 'Required compiled/source asset differs')
            self.state['components'][component] = {'producer': self.producer(component), 'requiredFiles': receipt['requiredFiles']}
            self.save()
        for path, expected in self.inputs['runtime']['frontendExternalInputs'].items():
            require(path == 'server-version/cognitive-randomization-golden-v1.json', 'Unknown external frontend input')
            require(git('rev-parse', 'HEAD:' + path) == expected['gitBlob'], 'Changed external frontend input')
            raw = subprocess.check_output(['git', 'show', 'HEAD:' + path], cwd=ROOT)
            require(digest(raw) == expected['sha256'], 'Changed external frontend fixture bytes')
            (self.private / Path(path).name).write_bytes(raw)
        return {'officialArchivesVerified': True, 'compilationExecuted': False, 'privateSourceOverlay': 'exact checkout'}

    def ready(self, *names):
        passed = {p['name'] for p in self.state['phases'] if p['status'] == 'success'}
        require(set(names).issubset(passed), 'Missing prerequisite phases: ' + ','.join(names))

    def audit(self):
        self.ready('prepare')
        result = {}
        for component in COMPONENTS:
            command = ['npm', '--prefix', str(self.private / component), '--registry=https://registry.npmjs.org', '--replace-registry-host=always', 'audit', '--audit-level=high', '--json']
            audit = self.command(command, accepted=(0, 1))
            data = json.loads(audit.stdout)
            require('error' not in data and isinstance(data.get('metadata', {}).get('vulnerabilities'), dict), 'No valid dependency audit')
            counts = data['metadata']['vulnerabilities']
            require(all(type(counts.get(k)) is int for k in ('high', 'critical')), 'Incomplete dependency audit')
            result[component] = {'vulnerabilities': counts, 'auditLevel': 'high', 'exitCode': audit.returncode, 'lockfileSha256': self.inputs['components'][component]['lockfileSha256']}
            (self.out / (component + '-audit.json')).write_text(json.dumps(result[component], indent=2) + '\n')
            require(audit.returncode == 0 and counts['high'] == counts['critical'] == 0, 'High/critical dependency vulnerabilities')
        return result

    def lint(self):
        self.ready('prepare')
        files = self.inputs['runtime']['changedFrontendFiles']
        context = self.private / 'frontend'
        require(files and all((context / f).is_file() and not PurePosixPath(f).is_absolute() and '..' not in PurePosixPath(f).parts for f in files), 'Missing changed lint source')
        completed = self.command(['node', 'node_modules/eslint/bin/eslint.js', '--format', 'json', *files], timeout=300, cwd=context)
        report = json.loads(completed.stdout)
        require({str(Path(row['filePath']).relative_to(context)) for row in report} == set(files), 'Lint did not inspect every selected file')
        require(all(row['errorCount'] == 0 and row.get('fatalErrorCount', 0) == 0 and not any('ignored' in msg['message'].lower() for msg in row['messages']) for row in report), 'Lint ignored or rejected a selected file')
        return {'files': files, 'exitCode': completed.returncode, 'tool': 'archived frontend eslint', 'sourceTree': self.inputs['components']['frontend']['sourceTree']}

    def app_types(self):
        self.ready('prepare')
        context = self.private / 'frontend'
        self.command(['node', 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.app.json', '--noEmit'], timeout=600, cwd=context)
        return {'command': 'tsc -p tsconfig.app.json --noEmit', 'scope': 'affected application typecheck only', 'compilationExecuted': False,
                'sourceTree': self.inputs['components']['frontend']['sourceTree'], 'externalInputs': self.inputs['runtime']['frontendExternalInputs']}

    def base_image(self, name):
        self.command(['docker', 'pull', name], timeout=600)
        data = json.loads(self.command(['docker', 'image', 'inspect', name]).stdout)[0]
        repository = name.split(':')[0]
        digests = [d for d in data['RepoDigests'] if d.startswith(repository + '@sha256:')]
        require(len(digests) == 1 and data['Architecture'] == 'amd64', 'No unique official amd64 base digest')
        return digests[0]

    def package(self):
        self.ready('prepare')
        node = self.base_image(self.inputs['runtime']['nodeImage'])
        nginx = self.base_image(self.inputs['runtime']['nginxImage'])
        self.state['baseImages'] = {'node': node, 'nginx': nginx}
        for component in COMPONENTS:
            context = self.private / component
            recipe = runtime_recipe(component, (context / 'Dockerfile').read_text(), node, nginx)
            (context / 'Dockerfile.runtime-only').write_text(recipe)
            # Original .dockerignore intentionally excludes dist/node_modules.
            (context / 'Dockerfile.runtime-only.dockerignore').write_text('Dockerfile\n')
            tag = self.prefix + '-' + component + ':runtime'
            self.command(['docker', 'build', '--network=default', '--file', str(context / 'Dockerfile.runtime-only'), '--label', 'org.opencontainers.image.revision=' + self.plan['sourceHead'], '--tag', tag, str(context)], timeout=900)
            details = json.loads(self.command(['docker', 'image', 'inspect', tag]).stdout)[0]
            require(re.fullmatch('sha256:[0-9a-f]{64}', details['Id']) and details['Architecture'] == 'amd64', 'Invalid runtime identity')
            self.state['components'][component].update(runtimeImageId=details['Id'], runtimeRecipeSha256=digest(recipe.encode()), runtimeRootFs=details['RootFS']['Layers'])
            if component == 'backend':
                probe = "const assert=require('node:assert/strict');assert.equal(process.version,'v24.21.0');require('canvas').createCanvas(1,1);require('sharp');require('@node-rs/jieba');require('@prisma/client');console.log('native-ABI-ok')"
                self.command(['docker', 'run', '--rm', '--network', 'none', '--read-only', details['Id'], 'node', '-e', probe], timeout=60)
                hashes = {p: h for p, h in self.inputs['components'][component]['requiredFiles'].items() if p.startswith(('dist/', 'assets/'))}
                verify = "const fs=require('fs'),c=require('crypto'),a=require('assert/strict');for(const [p,h] of Object.entries(" + json.dumps(hashes) + "))a.equal(c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),h)"
                self.command(['docker', 'run', '--rm', '--network', 'none', '--read-only', details['Id'], 'node', '-e', verify])
                require(details['Config']['User'] == 'node', 'Backend runtime must remain nonroot')
            else:
                self.command(['docker', 'run', '--rm', '--network', 'none', '--add-host', 'backend:127.0.0.1', details['Id'], 'nginx', '-t'])
                actual = self.command(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'sha256sum', details['Id'], '/usr/share/nginx/html/index.html']).stdout.split()[0]
                require(actual == self.inputs['components'][component]['requiredFiles']['dist/index.html'], 'Runtime frontend differs from compiled source')
            archive = self.out / (component + '-runtime.tar.gz')
            raw = self.private / (component + '-runtime.tar')
            self.command(['docker', 'save', '--output', str(raw), details['Id']], timeout=180)
            self.command(['gzip', '-n', '-1', str(raw)], timeout=180)
            shutil.move(str(raw) + '.gz', archive)
            self.state['components'][component]['runtimeArchiveSha256'] = sha(archive)
            self.save()
        return {'compilationExecuted': False, 'nativeAbiVerified': True, 'runtimeRecipesRetained': True, 'baseImages': self.state['baseImages']}

    def scan(self):
        self.ready('runtime-packaging')
        result = {}
        version = self.command(['trivy', '--version']).stdout.splitlines()[0]
        for component in COMPONENTS:
            image = self.state['components'][component]['runtimeImageId']
            raw = self.private / (component + '-scan.json')
            completed = self.command(['trivy', 'image', '--exit-code', '1', '--ignore-unfixed', '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL', '--format', 'json', '--output', str(raw), image], timeout=600, accepted=(0, 1))
            report = json.loads(raw.read_text())
            require(report.get('Metadata', {}).get('ImageID') == image, 'Scanner inspected a different runtime')
            findings = [{k: item.get(k) for k in ('VulnerabilityID', 'PkgName', 'InstalledVersion', 'FixedVersion', 'Severity')} for group in report.get('Results', []) for item in group.get('Vulnerabilities', [])]
            require('Results' in report and report.get('SchemaVersion'), 'Invalid image scan report')
            result[component] = {'imageId': image, 'scanner': version, 'exitCode': completed.returncode, 'severity': ['HIGH', 'CRITICAL'], 'ignoreUnfixed': True, 'findings': findings}
            (self.out / (component + '-scan.json')).write_text(json.dumps(result[component], indent=2) + '\n')
            require(completed.returncode == 0 and not findings, 'Runtime vulnerability gate failed')
        return result

    def schema(self):
        self.ready('prepare', 'runtime-packaging')
        name, network = self.prefix + '-postgres', self.prefix + '-network'
        image = self.state['components']['backend']['runtimeImageId']
        postgres = self.base_image(self.inputs['runtime']['postgresImage'])
        context = self.private / 'backend'
        legacy = self.private / 'legacy-prisma'
        shutil.copytree(context / 'prisma', legacy)
        for migration in self.inputs['runtime']['newMigrations']:
            shutil.rmtree(legacy / 'migrations' / migration)
        owner = 'exact_owner'
        databases = ('exact_upgrade_test', 'exact_restore_test')
        def sql(database, query):
            require(database in databases, 'Non-disposable database')
            return self.command(['docker', 'exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', owner, '-d', database], input="SET statement_timeout='20s'; SET lock_timeout='5s';\n" + query).stdout.strip()
        def migrate(directory):
            url = f'postgresql://{owner}:synthetic-only@{name}:5432/{databases[0]}?schema=public'
            self.command(['docker', 'run', '--rm', '--network', network, '--mount', f'type=bind,src={context},dst=/app,readonly', '--mount', f'type=bind,src={directory},dst=/schema,readonly', '-w', '/app', '-e', 'DATABASE_URL=' + url, image, 'node', '/app/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', '/schema/schema.prisma'], timeout=240)
        def columns(database):
            return json.loads(sql(database, "SELECT json_object_agg(table_name,cols) FROM (SELECT table_name,json_agg(column_name ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) s"))
        def fingerprints(database, selected):
            result = {}
            for table, cols in sorted(selected.items()):
                require(re.fullmatch('[A-Za-z_][A-Za-z_0-9]*', table) and all(re.fullmatch('[A-Za-z_][A-Za-z_0-9]*', col) for col in cols), 'Unsafe database identifier')
                projection = ','.join('"' + col + '"' for col in cols)
                value = sql(database, f'SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data::text),\'[]\'::jsonb)::text FROM (SELECT to_jsonb(t) row_data FROM (SELECT {projection} FROM "{table}") t) rows')
                result[table] = {'rows': len(json.loads(value)), 'sha256': digest(value.encode())}
            return result
        def ledger(database):
            return sql(database, 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name').splitlines()
        attempted_network = attempted_container = False
        details = {'postgresImage': postgres, 'newMigrations': self.inputs['runtime']['newMigrations'], 'syntheticOnly': True, 'isolatedResourcesRemoved': False}
        self.state['phases'][-1]['details'] = details
        try:
            require(network not in self.command(['docker', 'network', 'ls', '--format', '{{.Name}}']).stdout.splitlines(), 'Network name already exists')
            require(name not in self.command(['docker', 'container', 'ls', '--all', '--format', '{{.Names}}']).stdout.splitlines(), 'Container name already exists')
            attempted_network = True
            self.command(['docker', 'network', 'create', '--internal', network])
            attempted_container = True
            self.command(['docker', 'run', '-d', '--name', name, '--network', network, '--tmpfs', '/var/lib/postgresql/data:rw', '-e', 'POSTGRES_USER=' + owner, '-e', 'POSTGRES_PASSWORD=synthetic-only', '-e', 'POSTGRES_DB=' + databases[0], postgres])
            for _ in range(60):
                ready = self.command(['docker', 'exec', name, 'pg_isready', '-U', owner, '-d', databases[0]], accepted=(0, 1, 2))
                if ready.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise ValueError('Isolated PostgreSQL readiness timed out')
            migrate(legacy)
            baseline = sorted(p.name for p in (legacy / 'migrations').iterdir() if p.is_dir())
            require(ledger(databases[0]) == baseline, 'Baseline migration ledger mismatch')
            sql(databases[0], LEGACY_SQL)
            old_columns = {k: v for k, v in columns(databases[0]).items() if k != '_prisma_migrations'}
            before = fingerprints(databases[0], old_columns)
            require(before['survey_wave_finals']['rows'] == 1 and before['composite_assessment_attempts']['rows'] == 1, 'Missing historical Survey/Training fixture')
            migrate(context / 'prisma')
            require(fingerprints(databases[0], old_columns) == before, 'Upgrade changed historical rows')
            expected = sorted(baseline + self.inputs['runtime']['newMigrations'])
            require(ledger(databases[0]) == expected, 'Candidate migration ledger mismatch')
            sql(databases[0], NEW_SQL)
            # Explicit bounded synthetic ACL. No credentials or persistent grant
            # leave this disposable PostgreSQL cluster.
            sql(databases[0], "CREATE ROLE exact_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO exact_runtime; GRANT SELECT ON measurement_content_releases,measurement_reference_candidates,measurement_reference_reviews TO exact_runtime;")
            acl_query = """SELECT jsonb_build_object(
              'schemas',(SELECT jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname='public'),
              'relations',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,pg_get_userbyid(c.relowner),c.relacl::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
              'functions',(SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_userbyid(p.proowner),p.proacl::text) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
              'defaults',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(defaclrole),defaclobjtype,defaclacl::text) ORDER BY defaclobjtype,defaclrole) FROM pg_default_acl),
              'database',(SELECT jsonb_build_array(pg_get_userbyid(datdba),datacl::text) FROM pg_database WHERE datname=current_database()))::text"""
            before_acl = sql(databases[0], acl_query)
            all_columns = columns(databases[0])
            before_restore = fingerprints(databases[0], all_columns)
            require(all(before_restore[t]['rows'] == 1 for t in ('measurement_content_releases', 'measurement_reference_candidates', 'measurement_reference_reviews')), 'Missing new-schema fixture')
            dump = self.private / 'synthetic.dump'
            with dump.open('wb') as output:
                subprocess.run(['docker', 'exec', name, 'pg_dump', '-U', owner, '-d', databases[0], '-Fc', '--no-owner'], cwd=ROOT, check=True, stdout=output, stderr=subprocess.PIPE, timeout=180)
            self.command(['docker', 'exec', name, 'createdb', '-U', owner, databases[1]])
            self.command(['docker', 'exec', '-i', name, 'pg_restore', '--exit-on-error', '--no-owner', '-U', owner, '-d', databases[1]], input=dump.read_bytes(), binary=True, timeout=180)
            require(columns(databases[1]) == all_columns and fingerprints(databases[1], all_columns) == before_restore, 'Restored schema/data differs')
            require(ledger(databases[1]) == expected, 'Restored ledger differs')
            require(sql(databases[1], acl_query) == before_acl, 'Restored ownership or ACLs differ')
            privileges = "SELECT has_table_privilege('exact_runtime','measurement_content_releases','SELECT') AND NOT has_table_privilege('exact_runtime','measurement_content_releases','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('exact_runtime','users','SELECT') AND NOT has_schema_privilege('exact_runtime','public','CREATE') AND (SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname='exact_runtime')"
            require(sql(databases[1], privileges) == 't', 'Restored role privileges widened')
            require(sql(databases[1], 'SET ROLE exact_runtime; SELECT count(*) FROM measurement_content_releases') == '1', 'Restored restricted read failed')
            details.update(ownershipAndAclPreserved=True, restrictedRoleReadVerified=True, forbiddenPrivilegesAbsent=True, ownershipAclSha256=digest(before_acl.encode()))
            # Compare catalog definitions too: columns/data alone miss lost indexes,
            # constraints, functions and triggers. Use the same pg_dump binary.
            schemas = []
            for database in databases:
                raw = self.command(['docker', 'exec', name, 'pg_dump', '-U', owner, '-d', database, '--schema-only', '--no-owner']).stdout
                normalized = '\n'.join(line for line in raw.splitlines() if not line.startswith(('\\restrict ', '\\unrestrict ')))
                schemas.append(digest(normalized.encode()))
            require(schemas[0] == schemas[1], 'Restored schema definitions differ')
            details.update(historicalRowsPreserved=True, surveyFinalPreserved=True, trainingAttemptPreserved=True, newSchemaRowsRestored=True, allTableFingerprints=before_restore, schemaSha256=schemas[0], syntheticDumpSha256=sha(dump), migrationLedger=expected)
            dump.unlink()
        finally:
            remove_isolated_resources(self.command, name, network, attempted_container, attempted_network)
            details['isolatedResourcesRemoved'] = True
        return details

    def execute(self, requested):
        require(os.environ.get('CI') == 'true' and os.environ.get('GITHUB_ACTIONS') == 'true', 'Official isolated Actions only')
        validate_plan(self.plan, self.inputs)
        require(os.environ.get('GITHUB_SHA') == self.plan['head'] and os.environ.get('GITHUB_REPOSITORY') == 'caohuibj/eduK12-new-version', 'Wrong consumer source/repository')
        actions = {'prepare': self.prepare, 'dependency-audit': self.audit, 'changed-lint': self.lint, 'frontend-app-types': self.app_types, 'runtime-packaging': self.package, 'runtime-scans': self.scan, 'schema-upgrade-restore': self.schema}
        chosen = ('prepare', *PHASES) if requested == 'all' else (requested,)
        try:
            for name in chosen:
                self.phase(name, actions[name])
            if requested == 'all':
                require({p['name'] for p in self.state['phases'] if p['status'] == 'success'} == {'prepare', *PHASES}, 'Incomplete runtime gates')
                self.state['status'] = 'success'
            self.save()
        finally:
            if requested == 'all':
                shutil.rmtree(self.private)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True)
    parser.add_argument('--phase', required=True, choices=('all', 'prepare', *PHASES))
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        Qualification(args.plan, args.output).execute(args.phase)
    except Exception as error:
        # TimeoutExpired/CalledProcessError include command arguments. Never let
        # their raw traceback reveal even disposable connection strings.
        print('Exact runtime qualification failed: ' + json.dumps(safe_error_details(error), sort_keys=True), file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
