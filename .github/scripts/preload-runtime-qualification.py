"""One-off frozen C runtime qualification; reuses official compiled files, never recompiles."""
import datetime as dt,hashlib,json,os,pathlib,re,subprocess,sys,time,urllib.request,urllib.error,zipfile,shutil
REPO="caohuibj/eduK12-new-version"
HEAD="659f1f30664584d2f11f07bf181fe4abe86c19ac"
CI_RUN=38519050234
CI_HEAD="5801e2eb11d79db4695ce0517476f75906390320"
COMPILED="ffc5125f4616978222766581ad54b58ce22ee051"
BASE_SHA="61dad222759f11daf2ad0f93c7edd17df91417c7f9966565e6bee50cd84e1e19"
BASE_IMAGES={"backend":"sha256:d492c9b70a3cfcfc18275853a52e8ef0e9d0ec76ff6ae586dd7097e4ed9ccbee","frontend":"sha256:350cc95a91aedf4f7c7adf4a59d786624971aa625784214913ce9ef2e79f2ce1"}
OLD={"backend":"a202d59f1993e0b1a982a4f9b12d38d193c2242a","frontend":"9323654dbdb99f38777ef3fdf81b53ebb47ca5b6"}
ARTIFACTS={"backend":11872828590,"frontend":11872668602}
ROOT=pathlib.Path(os.environ["GITHUB_WORKSPACE"])
SRC=ROOT/"source"
E=ROOT/"preload-evidence"
E.mkdir(exist_ok=True)
P=E/"checks.json"
def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def digest(p):
 h=hashlib.sha256()
 with pathlib.Path(p).open("rb") as f:
  for b in iter(lambda:f.read(1048576),b""):h.update(b)
 return h.hexdigest()
def run(args,**kw):
 print("EXEC "+str(args[0]),flush=True)
 return subprocess.check_output(args,cwd=SRC,text=True,**kw).strip()
def git(*args):return run(["git",*args])
def api(path):
 req=urllib.request.Request("https://api.github.com/repos/"+REPO+"/"+path,headers={"Authorization":"Bearer "+os.environ["GH_TOKEN"],"Accept":"application/vnd.github+json"})
 with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
def download(url,p,expected=None,github=False):
 if github:
  req=urllib.request.Request(url,headers={"Authorization":"Bearer "+os.environ["GH_TOKEN"],"Accept":"application/vnd.github+json"})
  try:urllib.request.build_opener(NoRedirect()).open(req,timeout=30)
  except urllib.error.HTTPError as e:
   assert e.code==302,"OFFICIAL_ARTIFACT_REDIRECT_REQUIRED"
   url=e.headers["Location"]
  assert url.startswith("https://"),"HTTPS_REQUIRED"
 # Deliberately no API authorization header on redirected blob or COS reads.
 with urllib.request.urlopen(url,timeout=45) as r,p.open("wb") as f:shutil.copyfileobj(r,f,1048576)
 if expected:assert digest(p)==expected,"ARCHIVE_DIGEST_MISMATCH"
def tree_digest(p):
 code="import {treeDigest} from './.github/scripts/ci-artifact.mjs'; console.log(treeDigest(process.argv[1]));"
 return run(["node","--input-type=module","-e",code,str(p)])
def persist(c):P.write_text(json.dumps(c,indent=2)+"\n")
def prepare():
 assert git("rev-parse","HEAD")==HEAD
 c={"kind":"frozen-C-runtime-qualification","head":HEAD,"compiledSha":COMPILED,"runId":os.environ["GITHUB_RUN_ID"],"workflowSha":os.environ["GITHUB_SHA"],"status":"PREPARING","baseImages":BASE_IMAGES,"inputs":{},"runtime":{},"phases":[],"startedAt":now(),"reusedTestsFrom":CI_RUN}
 persist(c)
 ci=api("actions/runs/"+str(CI_RUN))
 assert ci["conclusion"]=="success" and ci["head_sha"]==CI_HEAD and ci["event"]=="pull_request"
 assert ci["path"]==".github/workflows/ci.yml"
 assert ci["head_repository"]["full_name"]==REPO
 assert api("git/commits/"+COMPILED)["tree"]["sha"]==git("rev-parse","HEAD^{tree}"),"COMPILED_SOURCE_TREE_CHANGED"
 jobs=api("actions/runs/"+str(CI_RUN)+"/jobs?per_page=100")["jobs"]
 required=["merge gate / ready PR","backend regression (isolated job database) / backend regression (isolated job database)","codeql (javascript/typescript SAST)","docker (compose config + production builds) / production image build and scan","frontend artifacts / release consumers early / build"]
 for name in required:
  matches=[j for j in jobs if j["name"]==name]
  assert len(matches)==1 and matches[0]["conclusion"]=="success","MISSING_OFFICIAL_CHECK_"+name
 c["reusedChecks"]=[{"name":j["name"],"id":j["id"],"conclusion":j["conclusion"]} for j in jobs if j["name"] in required]
 for kind,aid in ARTIFACTS.items():
  meta=api("actions/artifacts/"+str(aid))
  assert not meta["expired"] and meta["workflow_run"]["id"]==CI_RUN and meta["workflow_run"]["head_sha"]==CI_HEAD
  assert meta["name"]==kind+"-dist-"+COMPILED
  assert (dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(meta["created_at"].replace("Z","+00:00"))).total_seconds()<86400
  expected=meta["digest"].removeprefix("sha256:");assert re.fullmatch("[a-f0-9]{64}",expected)
  z=E/(kind+".zip");download(meta["archive_download_url"],z,expected,True)
  dest=E/(kind+"-dist");dest.mkdir()
  with zipfile.ZipFile(z) as f:
   infos=f.infolist();assert len(infos)<20000 and sum(x.file_size for x in infos)<700*1024**2
   for x in infos:
    p=pathlib.PurePosixPath(x.filename)
    assert not p.is_absolute() and ".." not in p.parts and "\\" not in x.filename and "\0" not in x.filename
    assert (x.external_attr>>16)&0o170000 != 0o120000
   f.extractall(dest)
  m=json.loads((dest/"ci-build-manifest.json").read_text())
  assert m["schemaVersion"]==1 and m["sha"]==COMPILED and m["runId"]==str(CI_RUN) and m["kind"]==kind
  assert m["lockDigest"]==digest(SRC/"server-version"/kind/"package-lock.json")
  assert m["contentDigest"]==tree_digest(dest),"COMPILED_CONTENT_CHANGED"
  changed=git("diff","--no-renames","--name-only",OLD[kind],HEAD,"--","server-version/"+kind).splitlines()
  assert all(p.startswith("server-version/"+kind+"/src/") for p in changed),"BASE_DEPENDENCY_OR_RUNTIME_CHANGED"
  c["inputs"][kind]={"artifactId":aid,"artifactDigest":meta["digest"],"manifest":m,"sourceTree":git("rev-parse",HEAD+":server-version/"+kind),"baseSource":OLD[kind]}
  z.unlink()
 url=os.environ["HUI_PRELOAD_BASE_URL"]
 assert url.startswith("https://eduk12-backups-1393949445.cos.ap-beijing.myqcloud.com/deployment-artifacts/preload-659f1f30/")
 assert "versionId=" in url and "q-signature=" in url
 base=E/"base-images.tar.zst";download(url,base,BASE_SHA)
 a=subprocess.Popen(["zstd","-dc",str(base)],stdout=subprocess.PIPE)
 b=subprocess.run(["docker","load"],stdin=a.stdout,check=True)
 a.stdout.close();assert a.wait()==0
 for kind,ident in BASE_IMAGES.items():
  d=json.loads(run(["docker","image","inspect",ident]))[0]
  assert d["Id"]==ident and d["Config"]["Labels"]["org.opencontainers.image.revision"]==OLD[kind]
  run(["docker","tag",ident,"eduk12-preload-base-"+kind+":frozen"])
 base.unlink()
 c["status"]="INPUTS_VERIFIED";c["phases"].append({"name":"official-input-admission","status":"success","at":now()});persist(c)
def package():
 c=json.loads(P.read_text());assert c["status"]=="INPUTS_VERIFIED"
 for kind in ("backend","frontend"):
  dest="/app/dist" if kind=="backend" else "/usr/share/nginx/html"
  user="node" if kind=="backend" else "root"
  owner="node:node" if kind=="backend" else "root:root"
  f=E/(kind+".Dockerfile")
  f.write_text("FROM eduk12-preload-base-"+kind+":frozen\nUSER root\nRUN rm -rf "+dest+"\nCOPY --chown="+owner+" "+kind+"-dist "+dest+"\nUSER "+user+"\n")
  tag="eduk12-"+kind+":"+HEAD[:8]
  run(["docker","buildx","build","--builder","default","--load","--network=none","--pull=false","--label","org.opencontainers.image.revision="+HEAD,"--label","org.opencontainers.image.source=https://github.com/"+REPO,"--label","eduk12.compiled.source="+COMPILED,"--label","eduk12.component.tree="+c["inputs"][kind]["sourceTree"],"-f",str(f),"-t",tag,str(E)])
  ident=run(["docker","image","inspect","--format","{{.Id}}",tag])
  old=json.loads(run(["docker","image","inspect",BASE_IMAGES[kind]]))[0]["Config"]
  cfg=json.loads(run(["docker","image","inspect",ident]))[0]["Config"]
  for key in ("Cmd","Entrypoint","Env","WorkingDir","ExposedPorts"):
   assert cfg.get(key)==old.get(key),"RUNTIME_CONFIGURATION_CHANGED_"+key
  temp=E/("extracted-"+kind);temp.mkdir()
  container=run(["docker","create",ident])
  try:run(["docker","cp",container+":"+dest+"/.",str(temp)])
  finally:run(["docker","rm",container])
  assert tree_digest(temp)==c["inputs"][kind]["manifest"]["contentDigest"]
  shutil.rmtree(temp)
  c["runtime"][kind]={"id":ident,"tag":tag,"status":"packaged","compiledContentDigest":c["inputs"][kind]["manifest"]["contentDigest"]}
  c["phases"].append({"name":kind+"-package-without-compile","status":"success","at":now()});persist(c)
def rehearsal():
 c=json.loads(P.read_text())
 env={"NODE_ENV":"production","JWT_SECRET":"ci-preload-only-jwt-secret-12345678901234567890","DATA_ENCRYPTION_KEY":"a"*64,"DATA_PSEUDONYM_KEY":"b"*64,"ASSET_SIGNING_SECRET":"ci-preload-asset-only-12345678901234567890123456","CAMPUS_MFA_ENCRYPTION_KEY":"c"*64,"SURVEY_MFA_ENCRYPTION_KEY":"d"*64,"DATABASE_URL":"postgresql://ci-ptool:ci-ptool-password@postgres:5432/ptool?schema=public","REDIS_URL":"redis://redis:6379","SOCKET_REDIS_REQUIRED":"true","ASSET_MIGRATION_COMPLETE":"true","COOKIE_SECURE":"true","CORS_ORIGIN":"https://localhost","SURVEY_WORKSPACE_ENABLED":"true","HUITEACHER_WORKSPACE_ENABLED":"true","NODE_OPTIONS":"--max-old-space-size=512"}
 compose={"services":{"postgres":{"image":"postgres:16.15-bookworm","environment":{"POSTGRES_USER":"ci-ptool","POSTGRES_PASSWORD":"ci-ptool-password","POSTGRES_DB":"ptool"},"tmpfs":["/var/lib/postgresql/data:size=384m"]},"redis":{"image":"redis:7.4.11-bookworm"},"backend":{"image":c["runtime"]["backend"]["id"],"environment":env,"depends_on":["postgres","redis"]},"frontend":{"image":c["runtime"]["frontend"]["id"],"ports":["127.0.0.1:18081:80"],"depends_on":["backend"]}}}
 f=E/"rehearsal-compose.json";f.write_text(json.dumps(compose))
 command=["docker","compose","-p","eduk12-preload-qualification","-f",str(f)]
 try:
  run(command+["up","-d","postgres","redis"])
  for _ in range(30):
   if subprocess.run(command+["exec","-T","postgres","pg_isready","-U","ci-ptool"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
   time.sleep(1)
  else:raise RuntimeError("ISOLATED_DATABASE_NOT_READY")
  for sql in sorted((SRC/"server-version/backend/prisma/migrations").glob("*/migration.sql")):
   subprocess.run(command+["exec","-T","postgres","psql","-U","ci-ptool","-d","ptool","-v","ON_ERROR_STOP=1"],input=sql.read_bytes(),stdout=subprocess.DEVNULL,check=True)
  def observe(label):
   deadline=time.monotonic()+60
   while time.monotonic()<deadline:
    try:
     with urllib.request.urlopen("http://127.0.0.1:18081/ready",timeout=5) as r:
      if json.load(r).get("status")=="ok":break
    except Exception:pass
    time.sleep(2)
   else:raise RuntimeError(label+"_READY_TIMEOUT")
   results={}
   for path in ("/","/api/survey/auth/csrf","/api/huiteacher/auth/csrf"):
    with urllib.request.urlopen("http://127.0.0.1:18081"+path,timeout=5) as r:
     assert r.status==200;results[path]=r.status
   return results
  run(command+["up","-d","--no-build","backend","frontend"])
  proof={"candidate":observe("CANDIDATE")}
  compose["services"]["backend"]["image"]=BASE_IMAGES["backend"];compose["services"]["frontend"]["image"]=BASE_IMAGES["frontend"];f.write_text(json.dumps(compose))
  run(command+["up","-d","--no-build","--no-deps","backend","frontend"])
  proof["rollback"]=observe("ROLLBACK")
  (E/"rehearsal.json").write_text(json.dumps(proof,indent=2))
  c["phases"].append({"name":"isolated-ready-workspaces-and-rollback","status":"success","at":now()});persist(c)
 finally:subprocess.run(command+["down","--volumes","--remove-orphans"],check=True)
def seal():
 c=json.loads(P.read_text())
 assert any(x["name"]=="isolated-ready-workspaces-and-rollback" and x["status"]=="success" for x in c["phases"])
 for kind,value in c["runtime"].items():
  report=E/(kind+"-scan.json");data=json.loads(report.read_text())
  assert data["ArtifactName"] in (value["id"],value["tag"])
  assert not any(v.get("Severity") in ("HIGH","CRITICAL") and v.get("FixedVersion") for r in data.get("Results",[]) for v in r.get("Vulnerabilities",[]))
  value.update({"status":"success","scan":report.name,"scanSha256":digest(report)})
 archive=E/"runtime-images.tar.zst"
 a=subprocess.Popen(["docker","image","save",*[x["tag"] for x in c["runtime"].values()]],stdout=subprocess.PIPE)
 with archive.open("wb") as f:b=subprocess.run(["zstd","-q","-T2","-6"],stdin=a.stdout,stdout=f,check=True)
 a.stdout.close();assert a.wait()==0
 c["archive"]={"file":archive.name,"sha256":digest(archive),"bytes":archive.stat().st_size}
 c["status"]="QUALIFIED";c["completedAt"]=now();persist(c)
 shutil.rmtree(E/"backend-dist");shutil.rmtree(E/"frontend-dist")
 print(json.dumps({"status":c["status"],"runtime":c["runtime"],"archive":c["archive"]}),flush=True)
if __name__=="__main__":
 {"prepare":prepare,"package":package,"rehearsal":rehearsal,"seal":seal}[sys.argv[1]]()
