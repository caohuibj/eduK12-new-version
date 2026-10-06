#!/usr/bin/env python3
"""Observe the host and Compose services. No remediation commands or credentials."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import socket
import ssl
import subprocess
import time


def command(args, timeout=12):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                            check=True, env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C"})
    return result.stdout


def finding(key, level, details):
    return {"key": key, "level": level, "details": details}


def disk(path):
    v = os.statvfs(path)
    used = v.f_blocks - v.f_bfree
    denominator = used + v.f_bavail
    return {"used_percent": round(100 * used / max(denominator, 1), 2),
            "available_bytes": v.f_bavail * v.f_frsize,
            "inode_percent": round(100 * (v.f_files - v.f_ffree) / max(v.f_files, 1), 2)}


def resource_findings(data, config):
    result = []
    for path, values in data["disks"].items():
        for field, warning, critical in [("used_percent", config["disk_warning_percent"], config["disk_critical_percent"]),
                                         ("inode_percent", 80, 90)]:
            value = values[field]
            level = "critical" if value >= critical else "warning" if value >= warning else "ok"
            result.append(finding("disk:" + path + ":" + field, level, {"percent": value}))
        free = values["available_bytes"]
        result.append(finding("disk:" + path + ":free", "critical" if free < config["minimum_free_bytes"] else "ok", {"bytes": free}))
    result.append(finding("memory", "warning" if data["memory_available_percent"] < 10 else "ok",
                          {"available_percent": data["memory_available_percent"]}))
    result.append(finding("load", "warning" if data["load_per_cpu"] > 2 else "ok", {"load_per_cpu": data["load_per_cpu"]}))
    return result


def collect(config):
    data, checks = {}, []
    def probe(key, callback):
        try:
            result = callback()
            if key.startswith("collector:"):
                checks.append(finding(key, "ok", {}))
            return result
        except Exception as exc:
            # Exceptions/stderr can contain paths or credentials; retain only the type.
            checks.append(finding(key, "critical", {"error_type": type(exc).__name__}))
            return None

    def resources():
        data["disks"] = {p: disk(p) for p in config["disk_paths"]}
        memory = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            name, value = line.split(":", 1)
            memory[name] = int(value.strip().split()[0]) * 1024
        data["memory_available_percent"] = round(100 * memory["MemAvailable"] / memory["MemTotal"], 2)
        data["load_per_cpu"] = round(os.getloadavg()[1] / (os.cpu_count() or 1), 2)
        checks.extend(resource_findings(data, config))
    probe("collector:resources", resources)

    def containers():
        # Use inspect's restricted template: never collect Config.Env, logs or health bodies.
        template = '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}|{{.Image}}'
        template += '|{{json .NetworkSettings.Ports}}|{{json .HostConfig.Privileged}}|{{.HostConfig.NetworkMode}}'
        items = {}
        for name in config["containers"]:
            raw = command(["/usr/bin/docker", "inspect", "--format", template, name]).strip().split("|")
            if len(raw) != 8:
                raise ValueError("container metadata")
            _, status, health, restarts, image, ports, privileged, network = raw
            items[name] = {"status": status, "health": health, "restarts": int(restarts), "image": image}
            bindings = json.loads(ports) or {}
            exposed = any(b["HostIp"] not in ("127.0.0.1", "::1") for values in bindings.values() for b in (values or []))
            unsafe = json.loads(privileged) or network == "host" or (name.endswith(("postgres", "redis")) and exposed)
            checks.append(finding("isolation:" + name, "critical" if unsafe else "ok", {"unsafe": unsafe}))
            checks.append(finding("container:" + name, "ok" if status == "running" and health in ("healthy", "none") else "critical",
                                  {"status": status, "health": health}))
        data["containers"] = items
        matches = items["eduk12-prod-backend"]["image"] == items["eduk12-prod-worker"]["image"]
        checks.append(finding("runtime_image_match", "ok" if matches else "critical", {"matches": matches}))
    probe("collector:containers", containers)

    data["http"] = {}
    for url in config["ready_urls"]:
        def http_probe(url=url):
            # No redirects, response body, cookies or authentication.
            raw = command(["/usr/bin/curl", "--silent", "--show-error", "--proto", "=https", "--connect-timeout", "4",
                           "--max-time", "8", "--output", "/dev/null", "--write-out", "%{http_code}|%{time_total}", url])
            code, duration = raw.strip().split("|")
            data["http"][url] = {"status": int(code), "seconds": float(duration)}
            checks.append(finding("http:" + url, "ok" if code == "200" else "critical", {"status": int(code)}))
        probe("http:" + url, http_probe)

    data["certificates"] = {}
    for host in config["tls_hosts"]:
        def tls_probe(host=host):
            with socket.create_connection((host, 443), timeout=5) as tcp:
                with ssl.create_default_context().wrap_socket(tcp, server_hostname=host) as tls:
                    expires = ssl.cert_time_to_seconds(tls.getpeercert()["notAfter"])
            days = int((expires - time.time()) / 86400)
            data["certificates"][host] = {"remaining_days": days}
            checks.append(finding("tls:" + host, "critical" if days < 7 else "warning" if days < 21 else "ok", {"remaining_days": days}))
        probe("tls:" + host, tls_probe)

    def backups():
        # An artifact's freshness is NOT a restoration or COS verification.
        roots = config["backup_roots"]
        latest, visited = None, 0
        for root in roots:
            for directory, dirs, files in os.walk(root, followlinks=False):
                dirs[:] = [d for d in dirs if not Path(directory, d).is_symlink()]
                if len(Path(directory).relative_to(root).parts) >= 4:
                    dirs[:] = []
                for name in files:
                    visited += 1
                    if visited > 10000:
                        raise ValueError("backup inventory exceeds bound")
                    p = Path(directory, name)
                    if name.endswith(".edubackup.enc") and not p.is_symlink() and p.stat().st_size > 0:
                        if Path(str(p) + ".sha256").is_file():
                            modified = p.stat().st_mtime
                            latest = max(latest or 0, modified)
        age = None if latest is None else max(0, int(time.time() - latest))
        data["local_backup"] = {"age_seconds": age, "scope": "artifact_and_sidecar_only", "restore_verified": False,
                                "cos_verified": False, "cloud_image_verified": False}
        receipt_age = None
        receipt_path = config.get("cos_backup_receipt")
        receipt_verified = False
        if receipt_path and Path(receipt_path).exists():
            receipt = json.loads(Path(receipt_path).read_text())
            objects = receipt.get("objects", [])
            receipt_verified = bool(objects) and all(o.get("downloadVerified") is True and o.get("authenticatedDecryptionVerified") is True for o in objects)
            if receipt_verified:
                timestamp = dt.datetime.fromisoformat(receipt["at"].replace("Z", "+00:00"))
                if timestamp.tzinfo is None or timestamp.timestamp() > time.time() + 300:
                    raise ValueError("invalid backup receipt timestamp")
                receipt_age = max(0, int(time.time() - timestamp.timestamp()))
        ages = [a for a in (age, receipt_age) if a is not None]
        best_age = min(ages) if ages else None
        data["backup_evidence"] = {"age_seconds": best_age, "cos_receipt_verified": receipt_verified,
                                   "scope": "local_artifact_or_historical_cos_receipt", "live_cos_check": False}
        checks.append(finding("backup_evidence_freshness", "warning" if best_age is None or best_age > config["backup_max_age_hours"] * 3600 else "ok", {"age_seconds": best_age}))
    probe("collector:backups", backups)

    if config.get("periodic_backup_status"):
        def periodic_backup():
            status = json.loads(Path(config["periodic_backup_status"]).read_text())
            receipt = json.loads(Path(config["cos_backup_receipt"]).read_text())
            verified = (receipt.get("status") == "VERIFIED" and receipt.get("restore", {}).get("status") == "PASS"
                        and bool(receipt.get("objects")) and all(o.get("downloadVerified") is True
                        and o.get("authenticatedDecryptionVerified") is True for o in receipt["objects"]))
            timestamp = dt.datetime.fromisoformat(receipt["at"].replace("Z", "+00:00"))
            if timestamp.tzinfo is None or timestamp.timestamp() > time.time() + 300:
                raise ValueError("periodic receipt timestamp invalid")
            age = max(0, int(time.time() - timestamp.timestamp()))
            healthy = status.get("status") == "VERIFIED" and verified and age <= config["backup_max_age_hours"] * 3600
            data["periodic_backup"] = {"status": status.get("status"), "age_seconds": age,
                                       "last_recorded_cloud_and_restore_verified": verified, "live_cos_check": False}
            checks.append(finding("periodic_backup_success", "ok" if healthy else "critical",
                                  {"status": status.get("status"), "age_seconds": age, "verified": verified}))
        probe("collector:periodic_backup", periodic_backup)

    def retention():
        names = command(["/usr/bin/docker", "volume", "ls", "--filter", "dangling=true", "--format", "{{.Name}}"])
        data["unreferenced_volume_count"] = len(names.splitlines())
        count = data["unreferenced_volume_count"]
        checks.append(finding("unreferenced_volumes", "warning" if count > config["unreferenced_volume_warning"] else "ok", {"count": count, "delete_allowed": False}))
    probe("collector:volume_inventory", retention)
    return data, checks


def transitions(previous, checks, now, config):
    """Debounce outage/recovery; severity changes count as a new stable condition."""
    state, events = {}, []
    for check in checks:
        key, level = check["key"], check["level"]
        old = previous.get(key, {})
        consecutive = old.get("consecutive", 0) + 1 if old.get("observed") == level else 1
        confirmed = old.get("confirmed", "ok")
        last_event = old.get("last_event", 0)
        count = config["failure_samples"] if level != "ok" else config["recovery_samples"]
        if (key.startswith("disk:") and level == "critical") or key.startswith("restarts:"):
            count = 1
        if consecutive >= count and level != confirmed:
            events.append({**check, "event": "recovered" if level == "ok" else "opened", "time": now})
            confirmed, last_event = level, now
        elif consecutive >= count and level != "ok" and now - last_event >= config["repeat_seconds"]:
            events.append({**check, "event": "reminder", "time": now})
            last_event = now
        state[key] = {"observed": level, "consecutive": consecutive, "confirmed": confirmed, "last_event": last_event}
    # Keep unresolved collectors absent from the current sample: don't silently recover them.
    for key, old in previous.items():
        if key not in state and old.get("confirmed", "ok") != "ok":
            state[key] = old
    return state, events


def atomic_json(path, value):
    temporary = path.with_suffix(".tmp")
    with temporary.open("w") as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="/etc/eduk12-ops/config.json")
    parser.add_argument("--state-dir", default="/var/lib/eduk12-ops")
    parser.add_argument("--log-dir", default="/var/log/eduk12-ops")
    args = parser.parse_args()
    os.umask(0o077)
    config = json.loads(Path(args.config).read_text())
    state_dir, log_dir = Path(args.state_dir), Path(args.log_dir)
    state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    log_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (state_dir / "monitor.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        logger = logging.getLogger("eduk12-ops")
        logger.setLevel(logging.INFO)
        logger.addHandler(RotatingFileHandler(log_dir / "events.jsonl", maxBytes=1024*1024, backupCount=4))
        started = time.time()
        data, checks = collect(config)
        previous_file = state_dir / "state.json"
        previous = json.loads(previous_file.read_text()) if previous_file.exists() else {}
        # Restart deltas refer to the same immutable container image, avoiding release resets.
        for name, current in data.get("containers", {}).items():
            old = previous.get("containers", {}).get(name)
            delta = max(0, current["restarts"] - old["restarts"]) if old and old["image"] == current["image"] else 0
            checks.append(finding("restarts:" + name, "warning" if delta >= 2 else "ok", {"delta": delta}))
        baseline = previous.get("integrity", {})
        integrity = {}
        for name in config["integrity_files"]:
            try:
                p = Path(name)
                integrity[name] = hashlib.sha256(p.read_bytes()).hexdigest()
                changed = name in baseline and baseline[name] != integrity[name]
                checks.append(finding("integrity:" + name, "warning" if changed else "ok", {"changed": changed}))
            except OSError as exc:
                checks.append(finding("integrity:" + name, "warning", {"error_type": type(exc).__name__}))
        # Baseline remains fixed after initialization, until the operator explicitly resets it.
        baseline = {**integrity, **baseline}
        now = int(time.time())
        alerts, events = transitions(previous.get("alerts", {}), checks, now, config)
        for event in events:
            message = json.dumps(event, ensure_ascii=False)
            logger.info(message)
            print(message, flush=True)
        snapshot = {"timestamp": dt.datetime.now(dt.timezone.utc).isoformat(), "duration_seconds": round(time.time()-started, 2),
                    "mode": "observe_only", "external_notifications": "disabled", "metrics": data, "checks": checks,
                    "confirmed_alerts": {k: v for k, v in alerts.items() if v["confirmed"] != "ok"}}
        atomic_json(state_dir / "latest.json", snapshot)
        atomic_json(previous_file, {"alerts": alerts, "containers": data.get("containers", {}), "integrity": baseline})


if __name__ == "__main__":
    main()
