"""Synthetic launcher integration on an isolated hosted CI runner; no COS calls."""
import concurrent.futures
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import uuid
import runner

def docker(*args, check=True):
    return subprocess.run(["docker", *args], check=check, capture_output=True, text=True, timeout=60)

def main():
    if os.geteuid() != 0 or any(os.environ.get(k) != v for k,v in
        {"CI":"true","GITHUB_ACTIONS":"true","NODE_ENV":"test"}.items()):
        raise RuntimeError("ISOLATED_HOSTED_CI_ONLY")
    ident=uuid.uuid4().hex
    source="eduk12-ci-attachment-source-"+ident
    volume="eduk12-ci-attachment-data-"+ident
    code=Path("/opt/eduk12-attachments/releases")/("ci-"+ident)
    image="node:24.21.0-bookworm-slim"
    before_containers=set(docker("ps","-aq").stdout.split())
    before_volumes=set(docker("volume","ls","-q").stdout.split())
    with tempfile.TemporaryDirectory(prefix="eduk12-ci-attachment-") as temp:
        state=Path(temp)/"state";state.mkdir(mode=0o700)
        config=Path(temp)/"config.json";config.write_text(json.dumps({
            "sourceBucket":"synthetic-source","region":"synthetic-region",
            "stateDir":"/state","localRoot":"/app/uploads","cleanupMode":"plan_only"}))
        config.chmod(0o600)
        key=Path(temp)/"key.env"
        key.write_text("BACKUP_ENCRYPTION_KEY=synthetic-ci-backup-key-0123456789")
        key.chmod(0o600)
        runner.CONFIG=config;runner.STATE=state;runner.DATA=state/"data"
        runner.CODE=code;runner.KEY_FILE=key;runner.SOURCE_CONTAINER=source
        code.mkdir(parents=True,mode=0o755)
        # This fixture tests the real root launcher, mounts, stdin and cleanup.
        # The actual backup core is covered independently by core.test.mjs.
        (code/"cli.mjs").write_text("""
import fs from 'node:fs';
import assert from 'node:assert/strict';
let text='';for await(const chunk of process.stdin)text+=chunk;
const secrets=JSON.parse(text);
assert.equal(process.getuid(),1000);
assert.ok(secrets.COS_SECRET_KEY==='synthetic-secret');
assert.ok(secrets.BACKUP_ENCRYPTION_KEY.startsWith('synthetic-ci-'));
assert.equal(process.env.COS_SECRET_KEY,undefined);
assert.ok(!process.argv.join(' ').includes('synthetic-secret'));
assert.equal(fs.readFileSync('/app/uploads/probe','utf8'),'synthetic');
assert.throws(()=>fs.writeFileSync('/app/uploads/no-write','x'),/EROFS/);
assert.throws(()=>fs.writeFileSync('/root-write','x'),/EROFS|EACCES/);
fs.writeFileSync('/state/fixture-started',secrets.RUN_ID);
if(process.argv[2]==='plan'){
 fs.mkdirSync('/state/.work-'+secrets.RUN_ID+'-fixture');
 fs.writeFileSync('/state/task.lock',JSON.stringify({id:secrets.RUN_ID}));
 process.exit(7);
}
await new Promise(r=>setTimeout(r,2500));
console.log(JSON.stringify({command:process.argv[2],complete:false,coverage:'attachment_inventory_only'}));
""")
        (code/"cli.mjs").chmod(0o644)
        try:
            docker("volume","create",volume)
            docker("run","--rm","--mount","type=volume,src="+volume+",dst=/fixture",
                image,"sh","-c","printf synthetic >/fixture/probe && chown -R 1000:1000 /fixture")
            docker("create","--name",source,"--label","eduk12.ci.fixture="+ident,
                "--user","1000:1000","--env","COS_BUCKET=synthetic-source",
                "--env","COS_REGION=synthetic-region","--env","COS_SECRET_ID=synthetic-id",
                "--env","COS_SECRET_KEY=synthetic-secret","--mount",
                "type=volume,src="+volume+",dst=/app/uploads",image,"node","-e","setTimeout(()=>{},60000)")
            output=io.StringIO()
            def run():
                with contextlib.redirect_stdout(output):
                    return runner.run("backup")
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future=pool.submit(run)
                marker=runner.DATA/"fixture-started"
                deadline=time.monotonic()+30
                while not marker.exists():
                    if future.done():future.result();raise AssertionError("fixture did not start")
                    if time.monotonic()>deadline:raise AssertionError("fixture start timeout")
                    time.sleep(0.05)
                run_id=marker.read_text()
                helper="eduk12-attachments-"+run_id
                info=json.loads(docker("inspect",helper).stdout)[0]
                host=info["HostConfig"]
                assert info["Config"]["User"]=="1000:1000"
                assert host["ReadonlyRootfs"] is True
                assert host["Memory"]==256*1024**2 and host["NanoCpus"]==300000000
                assert host["PidsLimit"]==64 and "ALL" in host["CapDrop"]
                assert any("no-new-privileges" in s for s in host["SecurityOpt"])
                mounts=info["Mounts"]
                assert [m["Name"] for m in mounts if m["Type"]=="volume"]==[volume]
                assert next(m for m in mounts if m["Destination"]=="/app/uploads")["RW"] is False
                assert not any(m["Destination"]=="/var/run/docker.sock" for m in mounts)
                assert future.result(timeout=30)==0
                assert docker("inspect",helper,check=False).returncode!=0
            assert json.loads(output.getvalue())["complete"] is False
            # A nonzero helper exit must release only its own lock/workspace.
            foreign=runner.DATA/(".work-"+"f"*32+"-foreign");foreign.mkdir()
            try:
                runner.run("plan")
                raise AssertionError("failed task was accepted")
            except RuntimeError as e:
                assert str(e)=="ATTACHMENT_TASK_FAILED"
            assert not (runner.DATA/"task.lock").exists()
            assert list(runner.DATA.glob(".work-*"))==[foreign]
            assert docker("inspect",source).returncode==0
        finally:
            # Only fixture containers and labels unique to this invocation.
            for cid in docker("ps","-aq","--filter","label=eduk12.attachment-task").stdout.split():
                info=json.loads(docker("inspect",cid).stdout)[0]
                if any(m.get("Source")==str(runner.DATA) for m in info.get("Mounts",[])):
                    runner.cleanup_task(info["Name"].lstrip("/"),info["Config"]["Labels"][runner.ROLE])
            found=docker("inspect",source,check=False)
            if found.returncode==0:
                info=json.loads(found.stdout)[0]
                assert info["Config"]["Labels"]["eduk12.ci.fixture"]==ident
                docker("rm","--force",source)
            docker("volume","rm",volume,check=False)
            shutil.rmtree(code)
    assert set(docker("ps","-aq").stdout.split())==before_containers
    assert set(docker("volume","ls","-q").stdout.split())==before_volumes
    print(json.dumps({"realLauncher":"PASS","nonRootReadOnly":"PASS","stdinSecrets":"PASS",
        "failureCleanup":"PASS","containersAndVolumesPreserved":True}))
if __name__=="__main__":
    main()
