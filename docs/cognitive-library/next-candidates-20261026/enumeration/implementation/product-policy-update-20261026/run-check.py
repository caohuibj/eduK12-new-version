"""Scoped check recorder. Pass a label, relative cwd and JSON argv; no installation, browser or CI."""
import hashlib, json, subprocess, sys, time
from pathlib import Path
root=Path('/workspace/eduK12-new-version')
out=Path(__file__).resolve().parent
label,cwd,args=sys.argv[1:]
paths=list((root/'server-version/backend/src/modules/cognitive/content-candidates/enumeration').glob('*.ts'))+list((root/'server-version/frontend/src/modules/cognitive/tasks/enumeration').rglob('*.ts'))+list((root/'server-version/frontend/src/modules/cognitive/tasks/enumeration').glob('*.tsx'))+[root/'server-version/backend/src/__tests__/cognitive/enumeration-candidate.test.ts', root/'server-version/scripts/cognitive/enumeration-content.cjs',root/'server-version/backend/package-lock.json',root/'server-version/frontend/package-lock.json',root/'server-version/backend/vitest.config.ts',root/'server-version/frontend/vitest.config.ts',root/'server-version/frontend/src/test/setup.ts',root/'server-version/frontend/tsconfig.app.json']
def hashes(): return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before=hashes();started=time.time();argv=json.loads(args)
r=subprocess.run(argv,cwd=root/cwd,text=True,capture_output=True)
(out/(label+'.stdout.txt')).write_text(r.stdout);(out/(label+'.stderr.txt')).write_text(r.stderr)
after=hashes();record=dict(command=argv,cwd=str(root/cwd),exitCode=r.returncode,elapsedSeconds=time.time()-started,sourceBefore=before,sourceAfter=after,inputStable=before==after,scope='enumeration affected product-policy checks only; synthetic fixtures; no browser/device/CI/registration/API/DB/COS validation')
(out/(label+'.check.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:record[k] for k in ['exitCode','elapsedSeconds','inputStable']}));print(r.stdout[-1200:]);print(r.stderr[-2000:]);sys.exit(r.returncode)
