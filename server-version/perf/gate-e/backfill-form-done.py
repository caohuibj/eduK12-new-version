#!/usr/bin/env python3
"""Backfill completion-delta accounting for the standalone form curve records.
The runner's db_form_done previously pointed at a nonexistent table, so the
normal sweep recorded db_assessment_completions_delta=0. Recompute here from
questionnaire_form_section_attempts per band assessment ids via a temp-table
join (avoids CLI arg-length limits).
Usage: backfill-form-done.py <class> <sums_dir> <band_dir>
"""
import json, sys, os, glob, subprocess, re, tempfile

cls, sums, bands = sys.argv[1], sys.argv[2], sys.argv[3]
group = 'formLarge' if cls == 'large' else 'formNormal'

envf = "/data/user/work/eduK12-new-version/server-version/backend/.env"
pgurl = re.search(r'^DATABASE_URL=(.*)$', open(envf).read(), re.M).group(1).strip()
ph = re.match(r'postgresql://[^@]+@([^:/]+)', pgurl).group(1)
pp = re.search(r':([0-9]+)/', pgurl).group(1)
pu = re.search(r'postgresql://([^:]+):', pgurl).group(1)
pw = re.search(r'postgresql://[^:]+:([^@]+)@', pgurl).group(1)
pd = re.search(r'/([^/?]+)(\?.*)?$', pgurl).group(1)
PG = ["psql","-h",ph,"-p",pp,"-U",pu,"-d",pd,"-q", "-t","-A"]
import os as _os; _os.environ.setdefault("PGPASSWORD", pw)

for recf in sorted(glob.glob(os.path.join(sums, f"e4s-{cls}-*s-r1.json"))):
    tag = os.path.basename(recf).replace(".json","")
    rate = tag.split("-")[2].replace("s","")
    band = os.path.join(bands, f"e4s-form-{group}-{rate}s-r1.json")
    if not os.path.exists(band):
        print(f"SKIP {tag}: no band"); continue
    ids = [fi["parentId"] for fi in json.load(open(band))[group]]

    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as fh:
        for i in ids: fh.write(i + "\n")
        tmp = fh.name

    script = (
        "CREATE TEMP TABLE tmp_ids(pid text);\n"
        f"\\copy tmp_ids(pid) FROM '{tmp}' WITH (FORMAT csv);\n"
        "SELECT count(*) FROM questionnaire_form_section_attempts a "
        "JOIN tmp_ids t ON a.questionnaire_assessment_id=t.pid "
        "WHERE a.status='COMPLETED';\n"
        "SELECT count(*) FROM questionnaire_form_section_attempts a "
        "JOIN tmp_ids t ON a.questionnaire_assessment_id=t.pid "
        "WHERE a.status!='COMPLETED';\n"
    )
    r = subprocess.run(PG, input=script, text=True, capture_output=True)
    if r.returncode != 0:
        print(f"{tag}: psql error: {r.stderr[:300]}"); continue
    vals = [ln for ln in r.stdout.splitlines() if ln.strip()]
    done = int(vals[0].strip()) if vals else 0
    ip = int(vals[1].strip()) if len(vals) > 1 else 0
    os.unlink(tmp)

    rec = json.load(open(recf))
    rec["db_assessment_completions_delta"] = done
    rec["db_completed_before"] = 0
    rec["db_completed_after"] = done
    rec["db_inprogress_after"] = ip
    open(recf,"w").write(json.dumps(rec, indent=1))
    print(f"{tag}: rate={rate} completed_delta={done} inprogress_after={ip}")
print("BACKFILL_DONE")