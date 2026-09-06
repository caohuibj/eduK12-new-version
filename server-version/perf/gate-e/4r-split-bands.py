#!/usr/bin/env python3
"""4R Form boundary band builder.

Unions the partial e4s2 pool + a freshly seeded block, keeps only parentIds that
have NO section attempt in the DB (unconsumed), and carves disjoint per-rate
r2/r3 band files of size warmupCap + rate*30 for the boundary confirmation rates.

Writes  { cls: [ ... ] } band files (same shape as run-e4s-form-curve.sh expects).
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
    ap.add_argument('--outdir', default='/workspace/eduk12-pr49-cloud-results/e4s3/bands')
    ap.add_argument('--warmup-cap', type=int, default=75)
    ap.add_argument('--runs', type=int, default=2)  # r2..r{runs+1}
    args = ap.parse_args()
    rates = {
        'formNormal': [85, 100, 115],
        'formLarge': [55, 70, 85, 100],
    }
    os.makedirs(args.outdir, exist_ok=True)
    for cls in ('formNormal', 'formLarge'):
        entries = load(args.pool1, cls) + load(args.pool2, cls)
        ids = [e['parentId'] for e in entries]
        # find unconsumed (no section attempt) in a single psql session
        tmp = 't4r'
        script = f"""
DROP TABLE IF EXISTS {tmp};
CREATE TABLE {tmp}(id text);
\\copy {tmp}(id) FROM '/tmp/4r_ids.txt';
SELECT DISTINCT t.id FROM {tmp} t
WHERE NOT EXISTS (SELECT 1 FROM questionnaire_form_section_attempts sa WHERE sa.questionnaire_assessment_id=t.id);
"""
        open('/tmp/4r_ids.txt', 'w').write('\n'.join(ids))
        fresh = set(q_psql(script).split())
        fresh_entries = [e for e in entries if e['parentId'] in fresh]
        print(f'{cls}: total={len(entries)} fresh={len(fresh_entries)}')
        used = {}
        for e in fresh_entries:
            used.setdefault(e['parentId'], []).append(0)  # dedupe not needed; entry is the submit req
        # dedupe by parentId (keep first)
        seen = set()
        dedup = []
        for e in fresh_entries:
            if e['parentId'] not in seen:
                seen.add(e['parentId'])
                dedup.append(e)
        fresh_entries = dedup
        off = 0
        total_need = sum((args.warmup_cap + r * 30) * args.runs for r in rates[cls])
        if len(fresh_entries) < total_need:
            print(f'WARN {cls}: fresh={len(fresh_entries)} need={total_need}')
        for run in range(2, 2 + args.runs):
            for rate in rates[cls]:
                take = args.warmup_cap + rate * 30
                slice_ = fresh_entries[off: off + take]
                off += take
                if len(slice_) != take:
                    print(f'ERROR {cls} {rate}s-r{run}: need={take} got={len(slice_)}')
                    sys.exit(1)
                out = os.path.join(args.outdir, f'e4s-form-{cls}-{rate}s-r{run}.json')
                json.dump({cls: slice_}, open(out, 'w'))
                print(f'  wrote {cls} {rate}s-r{run} n={len(slice_)} -> {out}')
    print('SPLIT_DONE')

if __name__ == '__main__':
    main()