"""Authorized read-only public ladder: N VUs x known portal SPA entries, <=60s, no auth/writes.
VU-parameterized sibling of public_read_baseline.py for the 1/5/10 VU read stages.
Default is offline inspection; HTTP only with --execute. PAUSED.json guard inherited.
"""
import argparse, asyncio, datetime, json, pathlib, time
import httpx
from bounded_load import proc_snapshot, quantiles
from transport_timing import TransportTiming

PORTALS = ['survey', 'training', 'school', 'teacher']
MAX_VUS = 10
MAX_SECONDS = 60
THINK_MIN = 1.0


async def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--vus', type=int, required=True)
    ap.add_argument('--seconds', type=int, default=60)
    ap.add_argument('--think', type=float, default=2.0)
    ap.add_argument('--execute', action='store_true')
    args = ap.parse_args()
    root = pathlib.Path(__file__).resolve().parent
    pause = root / 'PAUSED.json'
    if pause.is_file() and json.loads(pause.read_text()).get('paused'):
        print(json.dumps({'stageStarted': False, 'reason': 'USER_PAUSED', 'httpRequestsSent': 0}), flush=True)
        return
    assert 1 <= args.vus <= MAX_VUS, 'VU_BOUND'
    assert 1 <= args.seconds <= MAX_SECONDS, 'SECONDS_BOUND'
    assert args.think >= THINK_MIN, 'THINK_BOUND'
    if not args.execute:
        print(json.dumps({'offlineInspected': True, 'vus': args.vus, 'seconds': args.seconds,
                          'thinkSeconds': args.think, 'httpRequests': 0,
                          'targets': [p + '.eduk12.top/' for p in PORTALS],
                          'highConcurrencyRemainsPaused': True}), flush=True)
        return
    utc = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    run_id = 'public-read-vu%d-%s' % (args.vus, datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    out = root / 'results' / run_id
    out.mkdir(parents=True, mode=0o700, exist_ok=False)
    events, samples = [], []
    state = {'stop': None}
    start = time.monotonic()
    start_utc = utc()
    clients = [httpx.AsyncClient(http2=True, verify=True, trust_env=False, follow_redirects=False,
                                 timeout=10, headers={'Accept-Encoding': 'gzip',
                                                      'User-Agent': 'eduK12-authorized-read-ladder/20261101'})
               for _ in range(args.vus)]

    async def monitor():
        while True:
            samples.append({'utc': utc(), **proc_snapshot()})
            (out / 'live.json').write_text(json.dumps({'runId': run_id, 'startedUtc': start_utc,
                                                       'elapsedSeconds': time.monotonic() - start,
                                                       'requests': len(events),
                                                       'source': samples[-1] if samples else {}}))
            await asyncio.sleep(5)

    observer = asyncio.create_task(monitor())
    lock = asyncio.Lock()

    async def vu(v):
        await asyncio.sleep(0.15 * v)
        i = 0
        while time.monotonic() - start < args.seconds and not state['stop']:
            if (out / 'STOP').exists():
                return
            portal = PORTALS[(v + i) % len(PORTALS)]
            timing = TransportTiming()
            t = time.monotonic()
            row = {'vu': v, 'portal': portal, 'atUtc': utc(), 'status': 0, 'ok': False}
            try:
                r = await clients[v].get('https://' + portal + '.eduk12.top/', extensions={'trace': timing.trace})
                row.update(status=r.status_code, httpVersion=r.http_version,
                           bodyBytes=r.num_bytes_downloaded,
                           ok=r.status_code == 200 and 'text/html' in r.headers.get('content-type', ''))
            except Exception as e:
                row['error'] = type(e).__name__
            row.update(ms=(time.monotonic() - t) * 1000, transportTiming=timing.summary())
            async with lock:
                events.append(row)
                with (out / 'requests.jsonl').open('a') as f:
                    f.write(json.dumps(row) + '\n')
                if row['status'] >= 500:
                    state['stop'] = 'PUBLIC_5XX'
                elif len(events) >= 3 and all(not x['ok'] for x in events[-3:]):
                    state['stop'] = 'PUBLIC_ENTRY_FAILURE'
            i += 1
            await asyncio.sleep(max(0.05, args.think - (time.monotonic() - t)))

    try:
        await asyncio.gather(*(vu(v) for v in range(args.vus)))
    finally:
        observer.cancel()
        await asyncio.gather(observer, return_exceptions=True)
        await asyncio.gather(*(c.aclose() for c in clients))
    elapsed = time.monotonic() - start
    result = {'runId': run_id, 'startUtc': start_utc, 'endUtc': utc(), 'vus': args.vus,
              'thinkSeconds': args.think, 'elapsedSeconds': elapsed, 'requests': len(events),
              'successful': sum(e['ok'] for e in events), 'failures': sum(not e['ok'] for e in events),
              'actualHttpRps': round(len(events) / elapsed, 4) if elapsed else 0,
              'peakActiveVus': args.vus, 'businessWrites': 0,
              'authenticatedBusinessCoverage': False, 'capacityConclusion': False,
              'stopReason': state['stop'],
              'portals': {p: {'requests': sum(e['portal'] == p for e in events),
                              'failures': sum(e['portal'] == p and not e['ok'] for e in events),
                              'latency': quantiles([e['ms'] for e in events if e['portal'] == p])} for p in PORTALS},
              'perVu': {str(v): {'requests': sum(e['vu'] == v for e in events),
                                 'latency': quantiles([e['ms'] for e in events if e['vu'] == v])} for v in range(args.vus)},
              'limits': ['public SPA HTML only; no JS/assets/login/authenticated/business workflow',
                         'percentiles descriptive at this sample size',
                         'no max concurrency or capacity inference'],
              'output': str(out)}
    (out / 'source.json').write_text(json.dumps(samples, indent=2))
    (out / 'summary.json').write_text(json.dumps(result, indent=2))
    for p in out.iterdir():
        p.chmod(0o600)
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    asyncio.run(main())
