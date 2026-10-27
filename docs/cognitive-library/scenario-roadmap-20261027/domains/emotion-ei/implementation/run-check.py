import sys,subprocess,json,hashlib,datetime
from pathlib import Path
root=Path(__file__).resolve().parents[6]
label,cwd,*command=sys.argv[1:]
evidence=Path(__file__).parent
paths=list((root/'server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues').glob('*.ts'))+list((root/'server-version/frontend/src/modules/cognitive/tasks/voice-emotion-cues').glob('*.ts*'))+list((root/'server-version/frontend/src/modules/cognitive/tasks/voice-emotion-cues/generated').glob('*.ts'))
paths += [root/'server-version/backend/src/__tests__/cognitive/voice-emotion-content.test.ts', root/'server-version/backend/package-lock.json',root/'server-version/frontend/package-lock.json', root/'server-version/backend/vitest.config.ts',root/'server-version/frontend/vitest.config.ts']
manifest=[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths if p.is_file()]
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
p=subprocess.run(command,cwd=root/cwd,text=True,capture_output=True)
(evidence/(label+'.stdout.txt')).write_text(p.stdout);(evidence/(label+'.stderr.txt')).write_text(p.stderr)
d={'kind':'UNSIGNED_LOCAL_CANDIDATE_CHECK_NOT_CI','command':command,'cwd':cwd,'startedUtc':start,'endedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':p.returncode,'sourceInputs':manifest,'stdout':label+'.stdout.txt','stderr':label+'.stderr.txt'}
(evidence/(label+'.receipt.json')).write_text(json.dumps(d,indent=2)+'\n')
print(json.dumps({'label':label,'exitCode':p.returncode,'stdoutTail':p.stdout[-2500:],'stderrTail':p.stderr[-2500:]}))
sys.exit(p.returncode)
