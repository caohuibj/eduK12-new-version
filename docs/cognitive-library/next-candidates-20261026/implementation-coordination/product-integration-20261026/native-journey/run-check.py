from pathlib import Path
import os,json,hashlib,subprocess,sys,time
root=Path('/workspace/eduK12-new-version');out=Path(__file__).resolve().parent
label,argv=sys.argv[1:];env=os.environ.copy()
# Explicit disposable loopback schema, exactly as authorized by the parent task.
url='postgresql://postgres@127.0.0.1:15433/cognitive_native_test?schema=cognitive_native_20261026'
env.update(NODE_ENV='test',DATABASE_URL=url,COGNITIVE_INTEGRATION_DB_URL=url,
 COGNITIVE_MODULE_ENABLED='true',DATA_ENCRYPTION_KEY='a'*64,DATA_PSEUDONYM_KEY='b'*64)
paths=[root/'server-version/backend/src/modules/cognitive'/p for p in ['task-resource.ts','catalog.service.ts','library/product-readiness.ts','assignment.service.ts','assignment-measurement-release.ts','profile-freeze.ts','session.service.ts','public.service.ts','release.service.ts','final-submit.service.ts','unified-final-submit.service.ts','v2/registry.ts','v2/publication-gate.ts']]+[root/'server-version/backend/src/__tests__/cognitive/native-mot-journey.postgres.integration.test.ts',root/'server-version/backend/prisma/schema.prisma',root/'server-version/backend/vitest.config.ts',root/'server-version/backend/package-lock.json',root/'server-version/backend/prisma/seeds/native-cognitive.ts',root/'server-version/backend/prisma/seeds/cognitive.ts',root/'server-version/backend/src/__tests__/cognitive/native-task-resource.test.ts']
def hashes():return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before=hashes();start=time.monotonic();args=json.loads(argv)
r=subprocess.run(args,cwd=root/'server-version/backend',env=env,text=True,capture_output=True);after=hashes()
(out/(label+'.stdout.txt')).write_text(r.stdout);(out/(label+'.stderr.txt')).write_text(r.stderr)
rec={'command':args,'cwd':str(root/'server-version/backend'),'exitCode':r.returncode,'elapsedSeconds':time.monotonic()-start,'inputBefore':before,'inputAfter':after,'inputStable':before==after,'database':'explicit disposable loopback cognitive_native_test / cognitive_native_20261026','sourceEnvFilesRead':False,'dotenvMockOnly':True,'businessFunctionsMocked':False,'productionAccess':False,'ci':False}
(out/(label+'.check.json')).write_text(json.dumps(rec,indent=2)+'\n')
print(json.dumps({k:rec[k] for k in ['exitCode','elapsedSeconds','inputStable']}));print(r.stdout[-4000:]);print(r.stderr[-2500:]);sys.exit(r.returncode)
