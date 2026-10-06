#!/usr/bin/env python3
"""Root-owned launcher. Credentials go to an isolated task on stdin."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import uuid

CONFIG = Path("/etc/eduk12-attachments/config.json")
STATE = Path("/var/lib/eduk12-attachments")
DATA = STATE / "data"
CODE = Path("/opt/eduk12-attachments/current")
KEY_FILE = Path("/opt/eduk12-new/deploy/release-234/backup.env")
SOURCE_CONTAINER = "eduk12-prod-backend"
ROLE = "eduk12.attachment-task"

def private_file(file):
    s = file.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o077:
        raise RuntimeError("PRIVATE_ROOT_FILE_REQUIRED")
    return file.read_text()

def docker_json(args):
    return json.loads(subprocess.run(["docker"] + args, capture_output=True, text=True, check=True, timeout=30).stdout)

def cleanup_task(name, run_id):
    if not re.fullmatch(r"eduk12-attachments-[a-f0-9]{32}", name):
        raise RuntimeError("UNSAFE_TASK_CONTAINER")
    found = subprocess.run(["docker", "inspect", name], capture_output=True, text=True, timeout=30)
    if found.returncode != 0:
        return
    item = json.loads(found.stdout)[0]
    labels = item["Config"].get("Labels") or {}
    if labels.get(ROLE) != run_id:
        raise RuntimeError("TASK_OWNERSHIP_MISMATCH")
    subprocess.run(["docker", "rm", "--force", name], capture_output=True, check=True, timeout=30)

def cleanup_workspace(data, run_id):
    if not re.fullmatch(r"[a-f0-9]{32}", run_id):
        raise RuntimeError("UNSAFE_WORKSPACE_OWNER")
    for entry in data.glob(".work-" + run_id + "-*"):
        if entry.is_symlink() or not entry.is_dir() or entry.resolve().parent != data.resolve():
            raise RuntimeError("UNSAFE_WORKSPACE")
        shutil.rmtree(entry)

def interrupted(_signal, _frame):
    raise RuntimeError("TASK_INTERRUPTED")

def parse_key(text):
    values = {}
    for line in text.splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    key = values.get("BACKUP_ENCRYPTION_KEY", "")
    if len(key) < 32:
        raise RuntimeError("BACKUP_KEY_REQUIRED")
    return key

def run(command):
    if os.geteuid() != 0 or command not in {"backup", "verify", "plan"}:
        raise RuntimeError("ROOT_AND_SUPPORTED_COMMAND_REQUIRED")
    config = json.loads(private_file(CONFIG))
    if config.get("stateDir") != "/state" or config.get("localRoot") != "/app/uploads" or config.get("cleanupMode") != "plan_only":
        raise RuntimeError("UNSAFE_TASK_CONFIG")
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    if STATE.resolve() != STATE or STATE.stat().st_uid != 0 or STATE.stat().st_mode & 0o077:
        raise RuntimeError("PRIVATE_ROOT_STATE_REQUIRED")
    # Python 3.9+ compatibility without relying on is_relative_to in earlier hosts.
    if Path("/opt/eduk12-attachments/releases") not in CODE.resolve().parents:
        raise RuntimeError("UNREVIEWED_CODE_LOCATION")
    with (STATE / "host.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({"command": command, "skipped": "another_attachment_task_running"}))
            return 0
        source = docker_json(["inspect", SOURCE_CONTAINER])[0]
        env = dict(s.split("=", 1) for s in source["Config"].get("Env", []) if "=" in s)
        if config["sourceBucket"] != env.get("COS_BUCKET") or config["region"] != env.get("COS_REGION"):
            raise RuntimeError("SOURCE_BUCKET_CONFIG_MISMATCH")
        if source["Config"].get("User") not in {"node", "1000", "1000:1000"}:
            raise RuntimeError("SOURCE_NON_ROOT_USER_REQUIRED")
        DATA.mkdir(mode=0o700, exist_ok=True)
        if DATA.is_symlink():
            raise RuntimeError("STATE_SYMLINK_REFUSED")
        os.chown(DATA, 1000, 1000)
        runtime_config = DATA / "runtime-config.json"
        if runtime_config.is_symlink():
            raise RuntimeError("CONFIG_SYMLINK_REFUSED")
        runtime_config.write_text(json.dumps(config))
        os.chmod(runtime_config, 0o600)
        os.chown(runtime_config, 1000, 1000)
        uploads = [m for m in source.get("Mounts", []) if m.get("Destination") == "/app/uploads" and m.get("Type") == "volume" and m.get("Name")]
        if len(uploads) != 1:
            raise RuntimeError("NAMED_UPLOAD_VOLUME_REQUIRED")
        upload_volume = uploads[0]["Name"]
        image = source["Image"]
        if docker_json(["image", "inspect", image])[0]["Config"].get("Volumes"):
            raise RuntimeError("TASK_IMAGE_ANONYMOUS_VOLUMES_REFUSED")
        secrets = {k: env[k] for k in ["COS_SECRET_ID", "COS_SECRET_KEY", "COS_SECURITY_TOKEN"] if env.get(k)}
        secrets["BACKUP_ENCRYPTION_KEY"] = parse_key(private_file(KEY_FILE))
        run_id = uuid.uuid4().hex
        secrets["RUN_ID"] = run_id
        name = "eduk12-attachments-" + run_id
        args = ["docker", "run", "--rm", "-i", "--name", name, "--label", ROLE + "=" + run_id,
                "--user", "1000:1000", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                "--cpus", "0.3", "--memory", "256m", "--pids-limit", "64",
                "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m", "--network", "bridge",
                "--mount", "type=volume,src=" + upload_volume + ",dst=/app/uploads,readonly",
                "--mount", "type=bind,src=" + str(CODE.resolve()) + ",dst=/ops,readonly",
                "--mount", "type=bind,src=" + str(runtime_config) + ",dst=/config/config.json,readonly",
                "--mount", "type=bind,src=" + str(DATA) + ",dst=/state",
                "--entrypoint", "node", image, "/ops/cli.mjs", command, "/config/config.json"]
        try:
            result = subprocess.run(args, input=json.dumps(secrets), capture_output=True, text=True, timeout=2400)
            if result.returncode != 0:
                raise RuntimeError("ATTACHMENT_TASK_FAILED")
            output = json.loads(result.stdout)
            if not isinstance(output, dict) or output.get("command") != command:
                raise RuntimeError("TASK_RESULT_INVALID")
            failure = DATA / "launcher-failure.json"
            if output.get("complete") is True and failure.exists():
                previous = json.loads(failure.read_text())
                if previous.get("command") == command or (command == "backup" and previous.get("command") == "plan"):
                    failure.unlink()
            print(json.dumps(output))
            return 0
        finally:
            cleanup_task(name, run_id)
            cleanup_workspace(DATA, run_id)
            node_lock = DATA / "task.lock"
            if node_lock.exists() and not node_lock.is_symlink():
                try:
                    owner = json.loads(node_lock.read_text()).get("id")
                except (ValueError, OSError):
                    owner = None
                if owner == run_id:
                    node_lock.unlink()

def main():
    os.umask(0o077)
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        return run(sys.argv[1] if len(sys.argv) == 2 else "")
    except Exception as e:
        code = str(e) if re.fullmatch(r"[A-Z][A-Z0-9_]{2,80}", str(e)) else "ATTACHMENT_LAUNCH_FAILED"
        if STATE.exists() and not STATE.is_symlink():
            temp = STATE / (".launcher-" + uuid.uuid4().hex)
            try:
                temp.write_text(json.dumps({"at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "failed": True, "error": code}) + "\n")
                temp.replace(STATE / "launcher-status.json")
            except OSError:
                pass
        if DATA.exists() and not DATA.is_symlink():
            try:
                marker = DATA / (".failure-" + uuid.uuid4().hex)
                marker.write_text(json.dumps({"command": sys.argv[1] if len(sys.argv) > 1 else "unknown", "error": code}))
                os.chmod(marker, 0o600)
                os.chown(marker, 1000, 1000)
                marker.replace(DATA / "launcher-failure.json")
            except OSError:
                pass
        print(json.dumps({"failed": True, "error": code}), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
