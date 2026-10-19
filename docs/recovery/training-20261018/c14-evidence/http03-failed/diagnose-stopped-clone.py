import pathlib,json,shutil,hashlib,socket,subprocess,os,time
from urllib.parse import urlsplit,urlunsplit
base=pathlib.Path('/workspace/scratch/5a77e8bdc1ae');src=base/'eduk12_c14_http_03';dst=base/'eduk12_c14_diagnostic_01';tools=base/'eduk12_tools_20261018';backend=base/'eduk12_c14_variants_20261018/server-version/backend'
assert json.loads((src/'status.json').read_text())['cleanupVerified'] and not (src/'pgdata/postmaster.pid').exists();assert not dst.exists()
def manifest(p):return [(str(f.relative_to(p)),f.stat().st_size,hashlib.sha256(f.read_bytes()).hexdigest()) for f in sorted(p.rglob('*')) if f.is_file()]
before=manifest(src/'pgdata');dst.mkdir();shutil.copytree(src/'pgdata',dst/'pgdata');assert before==manifest(dst/'pgdata')
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
runtime=json.loads((src/'runtime-private.json').read_text());url=urlsplit(runtime['DATABASE_URL']);runtime['DATABASE_URL']=urlunsplit(url._replace(netloc=url.netloc.rsplit(':',1)[0]+':'+str(port)))
env={**os.environ,**runtime,'NODE_ENV':'test'};log=(dst/'postgres.log').open('w');pg=subprocess.Popen([str(tools/'postgresql/bin/postgres'),'-D',str(dst/'pgdata'),'-h','127.0.0.1','-p',str(port),'-k','','-c','timezone=UTC'],stdout=log,stderr=log)
try:
 for _ in range(100):
  if subprocess.run([str(tools/'postgresql/bin/pg_isready'),'-h','127.0.0.1','-p',str(port)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(.1)
 js="""const {prisma}=require('./dist/config/database'); const {finalizeCompositeAttemptUnifiedIfReady}=require('./dist/modules/assessment-runtime/unified-aggregate-finalizer.service');(async()=>{for(const a of await prisma.compositeAssessmentAttempt.findMany({select:{id:true,status:true}})){try{console.log(JSON.stringify({attemptId:a.id,result:await finalizeCompositeAttemptUnifiedIfReady(a.id)}))}catch(e){console.log(JSON.stringify({attemptId:a.id,error:e.message,code:e.code,stack:e.stack}))}}await prisma.$disconnect()})().catch(e=>{console.error(e.message);process.exitCode=1})"""
 run=subprocess.run([str(tools/'node_modules/node/bin/node'),'-e',js],cwd=backend,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
 (dst/'diagnostic.log').write_text(run.stdout);print(run.stdout)
finally:
 pg.terminate();pg.wait(timeout=30);log.close();assert before==manifest(src/'pgdata');(dst/'result.json').write_text(json.dumps({'sourceUnchanged':True,'cleanupVerified':not(dst/'pgdata/postmaster.pid').exists()}))
