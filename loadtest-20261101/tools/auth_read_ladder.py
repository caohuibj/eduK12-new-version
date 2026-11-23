"""Authorized authenticated-read ladder: N VUs (<= fixture readers), semantic checks, zero writes.
Sibling of public_read_ladder.py; guard/record style follows bounded_load.py.
Default offline; HTTP only with --execute. PAUSED.json guard inherited.
Stop conditions: 401/403/409, semantic mismatch, 5xx, three consecutive failures, STOP file, duration cap.
"""
import argparse, asyncio, datetime, hashlib, json, pathlib, time
import httpx
from bounded_load import check, proc_snapshot, quantiles
from transport_timing import TransportTiming

MAX_SECONDS = 120
THINK_MIN = 0.2
MAX_VUS = 200


async def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--fixture', type=pathlib.Path, required=True)
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
    fixture = json.loads(args.fixture.read_text())
    readers = fixture['readers']
    assert fixture.get('syntheticOnly') is True and fixture.get('records') == [], 'FIXTURE_NOT_READ_ONLY'
    assert 1 <= args.vus <= min(MAX_VUS, len(readers)), 'VU_BOUND'
    assert 1 <= args.seconds <= MAX_SECONDS, 'SECONDS_BOUND'
    assert args.think >= THINK_MIN, 'THINK_BOUND'
    if not args.execute:
        print(json.dumps({'offlineInspected': True, 'vus': args.vus, 'seconds': args.seconds,
                          'thinkSeconds': args.think, 'httpRequests': 0, 'runId': fixture['runId'],
                          'actions': sorted({r['action'] for rd in readers[:args.vus] for r in rd['requests']})}),
              flush=True)
        return
    utc = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    run_id = 'authread-vu%d-%s' % (args.vus, datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    out = root / 'results' / run_id
    out.mkdir(parents=True, mode=0o700, exist_ok=False)
    events, samples = [], []
    state = {'stop': None}
    start = time.monotonic()
    start_utc = utc()
    clients = []
    for v in range(args.vus):
        s = readers[v]['session']
        clients.append(httpx.AsyncClient(base_url=fixture['origin'], http2=True, verify=True, trust_env=False,
                                         follow_redirects=False,
                                         timeout=10, limits=httpx.Limits(max_connections=1, max_keepalive_connections=1),
                                         headers={'Cookie': s['cookie'], 'X-CSRF-Token': s['csrf'],
                                                  'Origin': fixture['origin'], 'Accept-Encoding': 'gzip',
                                                  'User-Agent': 'eduK12-authread-ladder/20261101'}))

    async def monitor():
        while True:
            samples.append({'utc': utc(), **proc_snapshot()})
            (out / 'live.json').write_text(json.dumps({'runId': run_id, 'startedUtc': start_utc,
                                                       'elapsedSeconds': time.monotonic() - start,
                                                       'requests': len(events), 'stopReason': state['stop'],
                                                       'source': samples[-1] if samples else {}}))
            await asyncio.sleep(5)

    observer = asyncio.create_task(monitor())
    lock = asyncio.Lock()

    async def vu(v):
        await asyncio.sleep(0.1 * v)
        rd = readers[v]
        i = 0
        while time.monotonic() - start < args.seconds and not state['stop']:
            if (out / 'STOP').exists():
                return
            r = rd['requests'][i % len(rd['requests'])]
            timing = TransportTiming()
            t = time.monotonic()
            trace_id = hashlib.sha256((fixture['runId'] + ':' + str(v)).encode()).hexdigest()[:24]
            row = {'vu': v, 'action': r['action'], 'path': r['path'], 'atUtc': utc(),
                   'status': 0, 'ok': False, 'semanticError': False, 'traceId': trace_id}
            try:
                resp = await clients[v].get(r['path'], extensions={'trace': timing.trace},
                                            headers={'X-Perf-Trace': trace_id})
                row.update(status=resp.status_code, httpVersion=resp.http_version,
                           bodyBytes=resp.num_bytes_downloaded)
                value = resp.json()
                row['code'] = value.get('code')
                row['ok'] = resp.status_code == 200 and value.get('code') == 0
                if row['ok'] and r.get('checks'):
                    try:
                        check(value.get('data'), r['checks'])
                    except (KeyError, IndexError, TypeError, ValueError):
                        row.update(ok=False, semanticError=True)
            except Exception as e:
                row['error'] = type(e).__name__
            row['ms'] = (time.monotonic() - t) * 1000
            row['transportTiming'] = timing.summary()
            async with lock:
                events.append(row)
                with (out / 'requests.jsonl').open('a') as f:
                    f.write(json.dumps(row) + '\n')
                if row['status'] in (401, 403, 409) or row.get('semanticError'):
                    state['stop'] = 'IDENTITY_FIXTURE_OR_SEMANTIC_FAILURE'
                elif row['status'] >= 500:
                    state['stop'] = 'SERVER_5XX'
                elif len(events) >= 3 and all(not x['ok'] for x in events[-3:]):
                    state['stop'] = 'THREE_CONSECUTIVE_REQUEST_FAILURES'
            i += 1
            await asyncio.sleep(max(0.05, args.think - (time.monotonic() - t)))

    try:
        await asyncio.gather(*(vu(v) for v in range(args.vus)))
    finally:
        observer.cancel()
        await asyncio.gather(observer, return_exceptions=True)
        await asyncio.gather(*(c.aclose() for c in clients))
    if state['stop']:
        (out / 'stop.json').write_text(json.dumps({'at': time.time(), 'reason': state['stop']}))
    elapsed = time.monotonic() - start
    actions = {}
    for action in sorted({e['action'] for e in events}):
        ev = [e for e in events if e['action'] == action]
        actions[action] = {'requests': len(ev), 'failures': sum(not e['ok'] for e in ev),
                           'semanticErrors': sum(e.get('semanticError', False) for e in ev),
                           'statuses': {str(s): sum(e['status'] == s for e in ev) for s in sorted({e['status'] for e in ev})},
                           'successLatency': quantiles([e['ms'] for e in ev if e['ok']]),
                           'allLatency': quantiles([e['ms'] for e in ev])}
    result = {'runId': run_id, 'startUtc': start_utc, 'endUtc': utc(), 'vus': args.vus,
              'thinkSeconds': args.think, 'elapsedSeconds': elapsed, 'requests': len(events),
              'successful': sum(e['ok'] for e in events), 'failures': sum(not e['ok'] for e in events),
              'actualHttpRps': round(len(events) / elapsed, 4) if elapsed else 0,
              'peakActiveVus': args.vus, 'businessWrites': 0, 'capacityConclusion': False,
              'stopReason': state['stop'], 'actions': actions,
              'limits': ['authenticated API reads only; no writes, no report generation',
                         'latency percentiles descriptive; no SLA or capacity inference',
                         'source egress cap 3Mbps; utilization in source.json'],
              'output': str(out)}
    (out / 'source.json').write_text(json.dumps(samples, indent=2))
    (out / 'summary.json').write_text(json.dumps(result, indent=2))
    for p in out.iterdir():
        p.chmod(0o600)
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    asyncio.run(main())
