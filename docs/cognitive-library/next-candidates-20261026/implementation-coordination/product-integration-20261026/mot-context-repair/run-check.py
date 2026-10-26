import hashlib,json,subprocess,sys,time
from pathlib import Path
root=Path('/workspace/eduK12-new-version');out=Path(__file__).resolve().parent
label,args=sys.argv[1:];argv=json.loads(args)
paths=list((root/'server-version/frontend/src/modules/cognitive/tasks/mot').rglob('*.ts'))+list((root/'server-version/frontend/src/modules/cognitive/tasks/mot').glob('*.tsx'))+[root/'server-version/frontend/vitest.config.ts',root/'server-version/frontend/src/test/setup.ts',root/'server-version/frontend/tsconfig.app.json',root/'server-version/frontend/package-lock.json',root/'server-version/scripts/cognitive/mot-browser-review.cjs']
def hashes():return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before=hashes();started=time.monotonic();r=subprocess.run(argv,cwd=root/'server-version/frontend',capture_output=True,text=True);elapsed=time.monotonic()-started;after=hashes()
(out/(label+'.stdout.txt')).write_text(r.stdout);(out/(label+'.stderr.txt')).write_text(r.stderr)
(out/(label+'.check.json')).write_text(json.dumps(dict(command=argv,cwd=str(root/'server-version/frontend'),exitCode=r.returncode,elapsedSeconds=elapsed,inputBefore=before,inputAfter=after,inputStable=before==after,scope='MOT C-02 context ownership only; synthetic local host, no old tests/full motion/CI/browser or production validation'),indent=2)+'\n')
print(json.dumps(dict(exitCode=r.returncode,elapsedSeconds=elapsed,inputStable=before==after)));print(r.stdout[-2200:]);print(r.stderr[-5000:]);sys.exit(r.returncode)
