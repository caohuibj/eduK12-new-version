#!/usr/bin/env python3
"""Stage 4R clean band carver.

Re-carve r1/r2/r3 boundary bands from the FIXED fixture pools (e4s2 already
fixed; /tmp/eduk12-gate47-fresh defhash+slotset just repaired). Unions both,
keeps only parents with NO section attempt in DB (unconsumed), then carves
disjoint per-rate per-run bands of size warmupCap + rate*30 for the 4R boundary
points, written as { cls: [ ... ] } so run-e4r-form.sh consumes them.

Writes r1/r2/r3 so all three runs use the same constant-arrival methodology.
"""
import json, subprocess, os, sys, argparse

def q_psql(script):
    env = {**os.environ, 'PGPASSWORD': os.environ.get('PGPASSWORD', 'ptool_pass')}
    r = subprocess.run(
        ['/usr/bin/psql', '-h', '127.0.0.1', '-p', '5432', '-U', 'ptool', '-d', 'ptool', '-t', '-A'],
        input=script, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise RuntimeError(f'psql failed: {r.stderr[-2000:]}')
    return r.stdout

def load(p, cls):
    d = json.load(open(p))
    v = d.get(cls)
    if not isinstance(v, list):
        v = list(v.values())[0] if isinstance(v, dict) else []
    return v

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pool1', default='/workspace/eduk12-pr49-cloud-results/e4s2/final-submit-fixtures.json')
    ap.add_argument('--pool2', default='/tmp/eduk12-gate47-fresh/final-submit-fixtures.json')
    ap.add_argument('--pool3', default='/workspace/eduk12-pr49-cloud-results/e4s4/final-submit-fixtures.json')
    ap.add_argument('--pool4', default='/workspace/eduk12-pr49-cloud-results/e4s4-large/final-submit-fixtures.json')
    ap.add_argument('--outdir', default='/workspace/eduk12-pr49-cloud-results/e4s3/bands')
    ap.add_argument('--warmup-cap', type=int, default=75)
    ap.add_argument('--nrun', type=int, default=3)   # r1..r{nrun}
    args = ap.parse_args()
    rates = {
        'formNormal': [85, 100, 115],
        'formLarge': [55, 70, 85, 100],
    }
    os.makedirs(args.outdir, exist_ok=True)
    all_ok = True
    for cls in ('formNormal', 'formLarge'):
        entries = load(args.pool1, cls) + load(args.pool2, cls)
        if os.path.exists(args.pool3):
            try: entries += load(args.pool3, cls)
            except Exception: pass
        if os.path.exists(args.pool4):
            try: entries += load(args.pool4, cls)
            except Exception: pass
        # dedupe by parentId (keep first)
        seen = set(); dedup = []
        for e in entries:
            p = e.get('parentId')
            if p not in seen:
                seen.add(p); dedup.append(e)
        ids = [e['parentId'] for e in dedup]
        open('/tmp/4r_ids.txt', 'w').write('\n'.join(ids))
        tmp = 't4rf'
        script = f"""
DROP TABLE IF EXISTS {tmp};
CREATE TABLE {tmp}(id text);
\\copy {tmp}(id) FROM '/tmp/4r_ids.txt';
SELECT DISTINCT t.id FROM {tmp} t
WHERE NOT EXISTS (SELECT 1 FROM questionnaire_form_section_attempts sa WHERE sa.questionnaire_assessment_id=t.id);
"""
        fresh = set(q_psql(script).split())
        fresh_entries = [e for e in dedup if e['parentId'] in fresh]
        print(f'{cls}: dedup_total={len(dedup)} fresh={len(fresh_entries)}')
        off = 0
        total_need = 0
        order = []
        for run in range(1, 1 + args.nrun):
            for rate in rates[cls]:
                take = args.warmup_cap + rate * 30
                total_need += take
                order.append((run, rate, take))
        if len(fresh_entries) < total_need:
            print(f'WARN {cls}: fresh={len(fresh_entries)} need={total_need}')
        for (run, rate, take) in order:
            slice_ = fresh_entries[off: off + take]
            off += take
            if len(slice_) != take:
                print(f'ERROR {cls} {rate}s-r{run}: need={take} got={len(slice_)}')
                all_ok = False; continue
            out = os.path.join(args.outdir, f'e4s-form-{cls}-{rate}s-r{run}.json')
            json.dump({cls: slice_}, open(out, 'w'))
            print(f'  wrote {cls} {rate}s-r{run} n={len(slice_)} -> {out}')
    print('CARVE_DONE' if all_ok else 'CARVE_HAD_ERRORS')

if __name__ == '__main__':
    main()