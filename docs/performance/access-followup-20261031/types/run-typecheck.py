import datetime
import hashlib
import json
import pathlib
import subprocess
import sys
import time

repo = pathlib.Path('/workspace/eduK12-new-version')
out = pathlib.Path('/tmp/perf-followup-20261031/types')
component = sys.argv[1]
assert component in ['backend', 'frontend']
cwd = repo / 'server-version' / component
node = '/workspace/eduk12-cloud/tools/node_modules/.bin/node'
argv = [node, 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.json' if component == 'backend' else 'tsconfig.app.json', '--noEmit']
git = lambda *args: subprocess.check_output(['git', *args], cwd=repo, text=True).strip()
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
paths = [cwd / 'package.json', cwd / 'package-lock.json', cwd / argv[3],
         cwd / 'node_modules/typescript/package.json', cwd / 'node_modules/typescript/lib/tsc.js',
         repo / 'server-version/backend/package-lock.json', repo / 'server-version/backend/prisma/schema.prisma',
         repo / 'server-version/backend/node_modules/.prisma/client/schema.prisma',
         repo / 'server-version/backend/node_modules/.prisma/client/index.d.ts']
before = {str(path.relative_to(repo)): digest(path) for path in paths}
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.monotonic()
with (out / (component + '.log')).open('wb') as log:
    result = subprocess.run(argv, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
after = {str(path.relative_to(repo)): digest(path) for path in paths}
record = {'kind': 'RECORDED_LOCAL_EXECUTION_UNSIGNED', 'component': component,
          'head': git('rev-parse', 'HEAD'), 'tree': git('rev-parse', 'HEAD^{tree}'),
          'componentTree': git('rev-parse', 'HEAD:server-version/' + component),
          'components': {name: git('rev-parse', 'HEAD:server-version/' + name) for name in ['backend', 'frontend']},
          'argv': argv, 'workingDirectory': str(cwd), 'startedAt': started,
          'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'elapsedSeconds': time.monotonic() - clock, 'exitCode': result.returncode,
          'node': subprocess.check_output([node, '--version'], text=True).strip(),
          'before': before, 'after': after, 'logSHA256': digest(out / (component + '.log')),
          'limits': ['No CI/build/DB/business test execution.', 'Backend tsconfig excludes test sources; frontend scope is app tsconfig, not separate cognitive project.', 'Installed dependency versions and selected compiler/generated inputs recorded; no complete node_modules byte attestation.']}
(out / (component + '.json')).write_text(json.dumps(record, indent=2) + '\n')
assert before == after
print(json.dumps({'component': component, 'exitCode': result.returncode, 'elapsedSeconds': record['elapsedSeconds'], 'logSHA256': record['logSHA256']}))
sys.exit(result.returncode)
