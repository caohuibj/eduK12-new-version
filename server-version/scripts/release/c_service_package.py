"""Export and verify the scanned images for a C service deployment."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

from qualify import api, filehash
from evidence import require


WORKFLOW = ".github/workflows/ci-images.yml"
SERVICES = ("backend", "frontend")
SCAN_STEPS = {f"scan {service} image (high and critical)" for service in SERVICES}


def git_object(value):
    require(re.fullmatch(r"[0-9a-f]{40}", value) is not None, "Expected a full commit SHA")
    return value


def succeeded(items, names):
    for name in names:
        matches = [item for item in items if item["name"] == name]
        require(len(matches) == 1 and matches[0]["conclusion"] == "success",
                f"Missing successful step or job: {name}")


def pr_tree(source, run_id, checkout):
    run = api(f"actions/runs/{run_id}")
    require(run["path"] == ".github/workflows/ci.yml" and run["event"] == "pull_request"
            and run["head_repository"]["full_name"] == run["repository"]["full_name"]
            and run["status"] == "completed" and run["conclusion"] == "success",
            "PR CI source or result is invalid")
    attempt = run["run_attempt"]
    jobs = api(f"actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100")
    succeeded(jobs["jobs"], {"merge gate / ready PR"})
    tree = api(f"commits/{git_object(source)}")["commit"]["tree"]["sha"]
    merge = api(f"commits/{git_object(checkout)}")
    require(merge["commit"]["tree"]["sha"] == tree and len(merge["parents"]) == 2
            and merge["parents"][1]["sha"] == run["head_sha"],
            "The PR checkout did not test this source tree")
    artifacts = api(f"actions/runs/{run_id}/artifacts?per_page=100")["artifacts"]
    names = {artifact["name"] for artifact in artifacts if not artifact["expired"]}
    require({f"{service}-dist-{checkout}" for service in SERVICES} <= names,
            "PR CI did not publish evidence for this checkout")
    return tree


def export(out, ci_run, ci_checkout):
    source = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip()
    out.mkdir()
    images = {}
    for service in SERVICES:
        image = os.environ[f"{service.upper()}_IMAGE"]
        require(re.fullmatch(r"sha256:[0-9a-f]{64}", image) is not None, "Invalid image ID")
        archive = out / f"{service}.tar"
        subprocess.run(["docker", "save", "-o", str(archive), image], check=True, timeout=600)
        images[service] = {"id": image, "sha256": filehash(archive)}
    manifest = {"source": source, "tree": tree, "ciRun": ci_run, "ciCheckout": ci_checkout,
                "imageRun": int(os.environ["GITHUB_RUN_ID"]),
                "attempt": int(os.environ["GITHUB_RUN_ATTEMPT"]),
                "toolSha": os.environ["GITHUB_WORKFLOW_SHA"], "images": images}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def verify(archive, artifact_id, image_run, tool_sha, source):
    run = api(f"actions/runs/{image_run}")
    require(run["path"] == WORKFLOW and run["event"] == "workflow_dispatch"
            and run["head_sha"] == git_object(tool_sha)
            and run["head_repository"]["full_name"] == run["repository"]["full_name"]
            and run["status"] == "completed" and run["conclusion"] == "success",
            "Image run must use the independently reviewed workflow SHA and succeed")
    attempt = run["run_attempt"]
    jobs = api(f"actions/runs/{image_run}/attempts/{attempt}/jobs?per_page=100")["jobs"]
    job_name = "production image build and scan"
    succeeded(jobs, {job_name})
    job = next(job for job in jobs if job["name"] == job_name)
    succeeded(job["steps"], SCAN_STEPS | {
        "Verify release CI and check out the exact source",
        "Pin the images that will be scanned and exported",
        "Upload scanned release images",
    })
    artifact = api(f"actions/artifacts/{artifact_id}")
    require(artifact["workflow_run"]["id"] == image_run and not artifact["expired"]
            and artifact["name"] == f"c-service-release-{git_object(source)}-{attempt}"
            and artifact["digest"] == f"sha256:{filehash(archive)}",
            "Official image artifact source or digest mismatch")
    with zipfile.ZipFile(archive) as zipped:
        expected = {"manifest.json", *(f"{service}.tar" for service in SERVICES)}
        require(set(zipped.namelist()) == expected and len(zipped.namelist()) == len(expected),
                "Unexpected artifact files")
        manifest = json.loads(zipped.read("manifest.json"))
        require((manifest["source"], manifest["imageRun"], manifest["attempt"], manifest["toolSha"])
                == (source, image_run, attempt, tool_sha), "Artifact manifest does not match run")
        require(set(manifest["images"]) == set(SERVICES), "Unexpected image components")
        for service, image in manifest["images"].items():
            require(re.fullmatch(r"sha256:[0-9a-f]{64}", image["id"]) is not None,
                    "Invalid scanned image ID")
            digest = hashlib.sha256()
            with zipped.open(f"{service}.tar") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            require(digest.hexdigest() == image["sha256"], f"Image archive digest mismatch: {service}")
    require(pr_tree(source, manifest["ciRun"], manifest["ciCheckout"]) == manifest["tree"],
            "Artifact tree differs from qualified source")
    require(api("commits/main")["sha"] == source, "main moved after the release was frozen")
    return manifest


def main():
    cli = argparse.ArgumentParser()
    commands = cli.add_subparsers(dest="command", required=True)
    source = commands.add_parser("source")
    source.add_argument("source")
    pack = commands.add_parser("export")
    pack.add_argument("out", type=Path)
    for command in (source, pack):
        command.add_argument("ci_run", type=int)
        command.add_argument("ci_checkout")
    check = commands.add_parser("verify")
    check.add_argument("archive", type=Path)
    check.add_argument("artifact_id", type=int)
    check.add_argument("image_run", type=int)
    check.add_argument("tool_sha")
    check.add_argument("source")
    args = cli.parse_args()
    if args.command == "source":
        require(api("commits/main")["sha"] == git_object(args.source), "Source is not current main")
        print(pr_tree(args.source, args.ci_run, args.ci_checkout))
    elif args.command == "export":
        export(args.out, args.ci_run, args.ci_checkout)
    else:
        print(json.dumps(verify(args.archive, args.artifact_id, args.image_run,
                                args.tool_sha, args.source), indent=2))


if __name__ == "__main__":
    main()
