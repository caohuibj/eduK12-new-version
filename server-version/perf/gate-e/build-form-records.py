#!/usr/bin/env python3
"""Rebuild a Stage-4 form curve record from deterministic, valid sources.
The runner's legacy k6_error injection wrote unescaped quotes (k6rc==99), which
broke JSON for several records. Rebuild each record from:
  - valid JSON prefix of the original raw file (drain_*, full_runtime_s, k6_exit,
    cgroup_before) via field regex,
  - the separate <tag>-k6.json summary,
  - DB per-band durable accounting via temp-table joins,
so the stored record is always valid, self-consistent JSON.
Usage: build-form-records.py <sums_dir> <band_dir> <class> <run>
"""
import json, sys, os, glob, subprocess, re, tempfile

sums, bands, cls, run = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
group = 'formLarge' if cls == 'large' else 'formNormal'
RATES = [25, 40, 55, 70, 85, 100, 115]

# DB env
envf = "/data/user/work/eduK12-new-version/server-version/backend/.env"
pgurl = re.search(r'^DATABASE_URL=(.*)$', open(envf).read(), re.M).group(1).strip()
ph = re.match(r'postgresql://[^@]+@([^:/]+)', pgurl).group(1)
pp = re.search(r':([0-9]+)/', pgurl).group(1)
pu = re.search(r'postgresql://([^:]+):', pgurl).group(1)
pw = re.search(r'postgresql://[^:]+:([^@]+)@', pgurl).group(1)
pd = re.search(r'/([^/?]+)(\?.*)?$', pgurl).group(1)
import os as _os; _os.environ["PGPASSWORD"] = pw
PG = ["psql","-h",ph,"-p",pp,"-U",pu,"-d",pd,"-q","-t","-A"]

def pg_q(script):
    r = subprocess.run(PG, input=script, text=True, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[:300])
    return [ln.strip() for ln in r.stdout.splitlines() if ln.strip()]

def field(raw, key):
    m = re.search(r'"'+re.escape(key)+r'"\s*:\s*("[^"]*"|[0-9]+|true|false|null)', raw)
    return m.group(1) if m else None

def db_deltas(ids):
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as fh:
        for i in ids: fh.write(i + "\n")
        tmp = fh.name
    script = (
        "CREATE TEMP TABLE t(pid text);\n"
        f"\\copy t(pid) FROM '{tmp}' WITH (FORMAT csv);\n"
        # completed section attempts
        "SELECT count(*) FROM questionnaire_form_section_attempts a JOIN t ON a.questionnaire_assessment_id=t.pid WHERE a.status='COMPLETED';\n"
        "SELECT count(*) FROM questionnaire_form_section_attempts a JOIN t ON a.questionnaire_assessment_id=t.pid WHERE a.status!='COMPLETED';\n"
        # durable answers: form_answers -> form_items -> questionnaire -> assessment
        "SELECT count(*) FROM questionnaire_form_answers fa "
        "JOIN questionnaire_form_items fi ON fa.form_item_id=fi.id "
        "JOIN questionnaire_assessments qa ON qa.questionnaire_id=fi.questionnaire_id "
        "JOIN t ON qa.id=t.pid;\n"
    )
    vals = pg_q(script)
    os.unlink(tmp)
    return int(vals[0]), int(vals[1]), int(vals[2])

out = []
for rate in RATES:
    tag = f"e4s-{cls}-{rate}s-{run}"
    recf = os.path.join(sums, f"{tag}.json")
    k6jf = os.path.join(sums, f"{tag}-k6.json")
    raw = open(recf).read() if os.path.exists(recf) else ""
    band = os.path.join(bands, f"e4s-form-{group}-{rate}s-{run}.json")
    if not (os.path.exists(band) and os.path.exists(k6jf)):
        print(f"skip {tag}: missing band/k6"); continue
    ids = [fi["parentId"] for fi in json.load(open(band))[group]]
    done, ip, ans = db_deltas(ids)
    k6 = json.load(open(k6jf))
    k6err = json.dumps(re.sub(r'\s+', ' ', open(os.path.join(sums, f"{tag}-k6.log")).read())[:400]) if os.path.exists(os.path.join(sums, f"{tag}-k6.log")) else '""'
    rec = {
        "tag": tag, "stage": "4", "class": cls, "group": group,
        "rate": rate, "run": run,
        "configured_duration_s": 30, "warmup_s": 10, "band": band,
        "pre_run_drain": field(raw, "pre_run_drain") or '"clean"',
        "drain_clean": field(raw, "drain_clean") or 'true',
        "drain_tail_s": int(field(raw, "drain_tail_s") or 0) if field(raw, "drain_tail_s") not in (None,"") else 0,
        "full_runtime_s": int(field(raw, "full_runtime_s") or 0) if field(raw, "full_runtime_s") not in (None,"") else 0,
        "k6_exit": int(field(raw, "k6_exit") or 99),
        "k6_error": json.loads(k6err) if k6err != '""' else "",
        "db_form_answers_delta": ans,
        "db_assessment_completions_delta": done,
        "db_inprogress_after": ip,
        "cgroup_before": json.loads(field(raw, "cgroup_before") or 'null') if field(raw, "cgroup_before") not in (None,"") else None,
        "cgroup_after": json.loads(field(raw, "cgroup_after") or 'null') if field(raw, "cgroup_after") not in (None,"") else None,
        "k6": k6,
    }
    open(recf, "w").write(json.dumps(rec, indent=1))
    out.append(rate)
    print(f"rebuilt {tag}: exit={rec['k6_exit']} ans={ans} done={done} ip={ip}")
print("REBUILD_DONE rates=" + ",".join(map(str, out)))