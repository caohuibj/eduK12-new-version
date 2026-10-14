"""Admit only the already-successful immutable runtime phases; preserve the late transport cancellation."""
import datetime,hashlib,json,os,pathlib,re,subprocess,urllib.request,urllib.error
REPO="caohuibj/eduK12-new-version";RUN=38526239836;ARTIFACT=11875623526
SOURCE="659f1f30664584d2f11f07bf181fe4abe86c19ac";PRODUCER="d990b91312ae6b92bdb43edb32fa0bd5f83b71f1"
EXPECTED="sha256:e77feb4e3ce87d955d9a871db0952b6ade1304ce7539668760eecd72b4b36868"
def api(path):
 r=urllib.request.Request("https://api.github.com/repos/"+REPO+"/"+path,headers={"Authorization":"Bearer "+os.environ["GH_TOKEN"],"Accept":"application/vnd.github+json"})
 with urllib.request.urlopen(r,timeout=30) as f:return json.load(f)
old=api("actions/runs/"+str(RUN))
assert old["status"]=="completed" and old["conclusion"]=="cancelled" and old["head_sha"]==PRODUCER and old["path"]==".github/workflows/preload-runtime-qualification.yml"
assert old["head_repository"]["full_name"]==REPO and old["event"]=="push"
jobs=api("actions/runs/"+str(RUN)+"/jobs")["jobs"];assert len(jobs)==1
required=[
 "admit exact successful official compiled artifacts and frozen dependency layers",
 "package two runtime images without dependency installation or recompilation",
 "scan the actual backend and frontend runtime images",
 "validate static asset MIME and headers on the actual frontend runtime",
 "prove isolated boot, basic workspace activation and return to unchanged old images",
 "seal immutable runtime archive with exact source and phase evidence"]
steps=jobs[0]["steps"]
for name in required:
 selected=[s for s in steps if s["name"]==name]
 assert len(selected)==1 and selected[0]["status"]=="completed" and selected[0]["conclusion"]=="success",name
cancelled=[s for s in steps if s["conclusion"] in ("failure","cancelled","timed_out")]
assert len(cancelled)==1 and cancelled[0]["name"]=="stage the original official ZIP in private Beijing COS","CANCELLATION_MUST_BE_TRANSPORT_ONLY"
a=api("actions/artifacts/"+str(ARTIFACT))
assert a["workflow_run"]["id"]==RUN and a["workflow_run"]["head_sha"]==PRODUCER and a["name"]=="preload-runtime-659f1f30" and a["digest"]==EXPECTED and not a["expired"]
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(a["created_at"].replace("Z","+00:00"))).total_seconds()<86400
ci=api("actions/runs/38519050234");assert ci["conclusion"]=="success" and ci["head_sha"]=="5801e2eb11d79db4695ce0517476f75906390320" and ci["path"]==".github/workflows/ci.yml"
assert api("git/commits/ffc5125f4616978222766581ad54b58ce22ee051")["tree"]["sha"]==api("git/commits/"+SOURCE)["tree"]["sha"]
# GitHub's finalized job log binds the successful seal's exact image/scan/archive identities.
log=subprocess.check_output(["gh","run","view",str(RUN),"--repo",REPO,"--job",str(jobs[0]["id"]),"--log"],text=True)
seals=[]
for line in log.splitlines():
 pos=line.find('{"status": "QUALIFIED"')
 if pos>=0:seals.append(json.loads(line[pos:]))
assert len(seals)==1
seal=seals[0];assert set(seal["runtime"])=={"backend","frontend"}
for name,image in seal["runtime"].items():
 assert image["status"]=="success" and re.fullmatch("sha256:[a-f0-9]{64}",image["id"])
 assert re.fullmatch("[a-f0-9]{64}",image["scanSha256"]) and re.fullmatch("[a-f0-9]{64}",image["compiledContentDigest"])
assert seal["archive"]["file"]=="runtime-images.tar.zst" and re.fullmatch("[a-f0-9]{64}",seal["archive"]["sha256"])
receipt={"kind":"official-passed-phase-runtime-admission","status":"QUALIFIED","source":SOURCE,"applicationCI":38519050234,"producerRun":RUN,"producerHead":PRODUCER,"producerOverallConclusion":"cancelled","cancelledStep":cancelled[0]["name"],"originalArtifact":{"id":ARTIFACT,"digest":EXPECTED,"bytes":a["size_in_bytes"]},"selectedOfficialPhases":[{"name":s["name"],"conclusion":s["conclusion"]} for s in steps if s["name"] in required],"seal":seal,"admissionRun":int(os.environ["GITHUB_RUN_ID"]),"admissionHead":os.environ["GITHUB_SHA"],"archiveMustStillBeVerifiedBeforeImport":True}
pathlib.Path("preload-runtime-admission.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps({"status":"QUALIFIED","originalArtifact":ARTIFACT,"preservedProducerConclusion":"cancelled","newRuntimeImagesBuilt":0,"applicationTestsRerun":0}))
