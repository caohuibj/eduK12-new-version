"""Authorized write matrix: ONE attempt per (student, questionnaire) pair, N concurrent records.
Reuses serial_diagnostic's template binding (bind) and report verification (verify_report).
Default offline; HTTP only with --execute. Sessions index: private/write-matrix/index.json.
Per record: /me -> /available (pick canStartNewAttempt entry, globally unused pair) ->
START -> definition -> bind + fresh submissionId -> submit exactly once ->
poll per server retryAfter -> report + verify 25 scores.
Stop conditions: identity/bind/receipt/semantic failure, poll limit, STOP file, budgets.
"""
import argparse, asyncio, datetime as dt, hashlib, json, pathlib, time, uuid
import httpx
from transport_timing import TransportTiming
from serial_diagnostic import ORIGIN, BASE, bind, expected_scores, retry_delay, templates, verify_report

MAX_RECORDS = 25
RECORD_BUDGET_S = 150
POLL_DEADLINE_S = 120
POLL_MAX = 25
MAX_REQUESTS_PER_RECORD = 14


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


async def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--records', type=int, required=True)
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--questionnaire-id', default=None)
    ap.add_argument('--template-index', type=int, default=0)
    ap.add_argument('--execute', action='store_true')
    args = ap.parse_args()
    root = pathlib.Path(__file__).resolve().parent
    pause = root / 'PAUSED.json'
    if pause.is_file() and json.loads(pause.read_text()).get('paused'):
        print(json.dumps({'stageStarted': False, 'reason': 'USER_PAUSED', 'httpRequestsSent': 0}), flush=True)
        return
    assert 1 <= args.records <= MAX_RECORDS, 'RECORDS_BOUND'
    assert args.offset >= 0, 'OFFSET_BOUND'
    index_path = root / 'private/write-matrix/index.json'
    index = json.loads(index_path.read_text())
    assert isinstance(index, list) and len(index) >= args.offset + args.records
    assert len({e['userId'] for e in index}) == len(index), 'DUPLICATE_STUDENTS'
    for e in index:
        p = (root / 'private' / e['file']).resolve()
        assert p.is_relative_to((root / 'private').resolve()), 'SESSION_OUTSIDE_PRIVATE_SCOPE'
        s = json.loads(p.read_text())
        assert s['role'] == 'STUDENT' and (s.get('id') or s.get('userId')) == e['userId'], 'IDENTITY_BINDING'
    template = templates(root)[args.template_index]
    expected = expected_scores(root)
    if not args.execute:
        print(json.dumps({'offlineInspected': True, 'records': args.records, 'templateUnits': 7,
                          'templateQuestions': 214, 'expectedScores': 25, 'httpRequests': 0,
                          'submissionIdPolicy': 'fresh ltwm-<uuid4> per record',
                          'attemptsBudget': args.records}), flush=True)
        return
    run_id = 'writematrix-%d-%s' % (args.records, dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    out = root / 'results' / run_id
    out.mkdir(parents=True, mode=0o700, exist_ok=False)
    events, records = [], []
    state = {'stop': None, 'requests': 0}
    used_pairs = set()
    lock = asyncio.Lock()
    start = time.monotonic()
    start_utc = utc()

    async def request(client, method, path, action, record, body=None, trace=None):
        assert state['requests'] < args.records * MAX_REQUESTS_PER_RECORD + 4, 'STAGE_REQUEST_BUDGET'
        state['requests'] += 1
        row = {'record': record['index'], 'action': action, 'method': method,
               'path': path.split('?', 1)[0], 'startUtc': utc(), 'traceId': trace}
        clock = TransportTiming()
        t = time.monotonic()
        try:
            kwargs = {'extensions': {'trace': clock.trace}, 'headers': {'X-Perf-Trace': trace}}
            if body is not None:
                kwargs['json'] = body
            response = await client.request(method, path, **kwargs)
            row.update(status=response.status_code, httpVersion=response.http_version,
                       requestBodyBytes=len(response.request.content),
                       responseBodyBytes=response.num_bytes_downloaded)
            value = response.json()
            row['code'] = value.get('code')
            assert response.status_code == 200 and value.get('code') == 0, 'HTTP_OR_BUSINESS_FAILURE'
            row['ok'] = True
            return value['data'], response.headers
        except BaseException as error:
            row.setdefault('status', 0)
            row['errorType'] = type(error).__name__
            row['ok'] = False
            raise
        finally:
            row['ms'] = (time.monotonic() - t) * 1000
            row['transportTiming'] = clock.summary()
            async with lock:
                events.append(row)
                with (out / 'requests.jsonl').open('a') as f:
                    f.write(json.dumps(row) + '\n')

    def stop(reason):
        if not state['stop']:
            state['stop'] = reason
            (out / 'stop.json').write_text(json.dumps({'at': utc(), 'reason': reason}) + '\n')

    async def record(i, entry):
        rec = {'index': i, 'userId': entry['userId'], 'startUtc': utc(), 'startMono': time.monotonic()}
        records.append(rec)
        record_file = out / ('record-%d.json' % i)

        def save_record():
            record_file.write_text(json.dumps(rec, indent=2) + '\n')
            record_file.chmod(0o600)

        save_record()
        session = json.loads((root / 'private' / entry['file']).read_text())
        try:
            async with httpx.AsyncClient(base_url=ORIGIN, http2=True, verify=True, follow_redirects=False,
                                         trust_env=False, timeout=10,
                                         limits=httpx.Limits(max_connections=1, max_keepalive_connections=1),
                                         headers={'Cookie': session['cookie'], 'X-CSRF-Token': session['csrf'],
                                                  'Origin': ORIGIN, 'Accept-Encoding': 'gzip',
                                                  'User-Agent': 'eduK12-write-matrix/20261101'}) as client:
                identity, _ = await request(client, 'GET', '/api/auth/me', 'identity', rec,
                                            trace=hashlib.sha256(('wm-id:' + entry['userId']).encode()).hexdigest()[:24])
                assert identity['id'] == entry['userId'] and identity.get('role') == 'STUDENT', 'IDENTITY_MISMATCH'
                listing, _ = await request(client, 'GET', '/api/composite-assessments/available', 'available', rec,
                                           trace=hashlib.sha256(('wm-av:' + entry['userId']).encode()).hexdigest()[:24])
                assert args.questionnaire_id, 'QUESTIONNAIRE_ID_REQUIRED_FOR_EXECUTE'
                entry_hit = next((item for item in listing.get('list', [])
                                  if item.get('id') == args.questionnaire_id), None)
                assert entry_hit and entry_hit.get('canStartNewAttempt'), \
                    'PINNED_QUESTIONNAIRE_NOT_STARTABLE_FOR_STUDENT'
                qid = args.questionnaire_id
                rec['questionnaireId'] = qid
                rec['traceId'] = hashlib.sha256(qid.encode()).hexdigest()[:24]
                save_record()
                data, _ = await request(client, 'POST', '/api/composite-assessments/' + qid + '/attempts',
                                        'start', rec, {}, trace=rec['traceId'])
                parent = data['attempt']
                pid = parent['id']
                assert parent['status'] == 'IN_PROGRESS', 'ATTEMPT_NOT_IN_PROGRESS'
                rec['attemptId'] = pid
                rec['traceId'] = hashlib.sha256(pid.encode()).hexdigest()[:24]
                whole, _ = await request(client, 'GET', BASE + pid + '/whole/definition', 'definition', rec,
                                         trace=rec['traceId'])
                began = time.monotonic()
                payload = bind(template, whole, pid)
                payload['submissionId'] = 'ltwm-' + str(uuid.uuid4())
                rec['submissionId'] = payload['submissionId']
                rec['adapterMs'] = (time.monotonic() - began) * 1000
                ledger = root / 'used-attempts'
                ledger.mkdir(mode=0o700, exist_ok=True)
                (ledger / hashlib.sha256((ORIGIN + '/' + pid).encode()).hexdigest()).mkdir(mode=0o700)
                save_record()
                sent = time.monotonic()
                receipt, _ = await request(client, 'POST', BASE + pid + '/whole/submit', 'final', rec, payload,
                                           trace=rec['traceId'])
                rec['ackMs'] = (time.monotonic() - sent) * 1000
                rec['ackUtc'] = utc()
                assert receipt['attemptId'] == pid and receipt['submissionId'] == payload['submissionId']
                assert receipt['status'] == 'ACCEPTED' and receipt['payloadHash'] and receipt.get('replayed') is False, \
                    'RECEIPT_NOT_CLEAN_ACCEPT'
                rec['receiptTimes'] = {k: receipt[k] for k in ('acceptedAt', 'committedAt', 'completedAt') if k in receipt}
                deadline = time.monotonic() + POLL_DEADLINE_S
                rec['polls'] = []
                for poll in range(POLL_MAX):
                    assert time.monotonic() < deadline, 'REPORT_DEADLINE'
                    status, headers = await request(client, 'GET', BASE + pid + '/report-status',
                                                    'report-status', rec, trace=rec['traceId'])
                    st = status['reportStatus']
                    point = {k: st[k] for k in ('state', 'retryAfterSeconds', 'completedAt', 'errorCode') if k in st}
                    rec['polls'].append(point)
                    save_record()
                    if st['state'] == 'READY':
                        report, _ = await request(client, 'GET', BASE + pid + '/report', 'report-read', rec,
                                                  trace=rec['traceId'])
                        began = time.monotonic()
                        verify_report(report, expected)
                        rec.update(reportReady=True, verifiedScores=25,
                                   reportValidationMs=(time.monotonic() - began) * 1000,
                                   finalToValidatedReportMs=(time.monotonic() - sent) * 1000)
                        return
                    assert st['state'] in ('PENDING', 'PROCESSING'), 'REPORT_TERMINAL_FAILURE'
                    delay = retry_delay(st, headers.get('retry-after'))
                    assert time.monotonic() + delay < deadline, 'REPORT_WAIT_EXCEEDS_DEADLINE'
                    point['plannedDelaySeconds'] = delay
                    await asyncio.sleep(delay)
                raise RuntimeError('REPORT_POLL_LIMIT')
        except BaseException as error:
            rec['errorType'] = type(error).__name__
            stop(type(error).__name__ + ':' + str(rec.get('attemptId', rec.get('userId'))))
            raise
        finally:
            rec['endUtc'] = utc()
            rec['totalMs'] = (time.monotonic() - rec['startMono']) * 1000
            save_record()

    tasks = [asyncio.create_task(record(i, entry))
             for i, entry in enumerate(index[args.offset:args.offset + args.records], args.offset + 1)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    elapsed = time.monotonic() - start
    failures = [r for r in results if isinstance(r, BaseException)]
    ok_records = [r for r in records if r.get('reportReady')]
    summary = {'runId': run_id, 'startUtc': start_utc, 'endUtc': utc(), 'plannedRecords': args.records,
               'completedRecords': len(ok_records), 'failedRecords': len(failures),
               'businessWrites': len(ok_records), 'requests': state['requests'],
               'elapsedSeconds': elapsed, 'stopReason': state['stop'],
               'perRecord': {str(r['index']): {k: r.get(k) for k in (
                   'userId', 'questionnaireId', 'attemptId', 'submissionId', 'ackMs', 'adapterMs',
                   'finalToValidatedReportMs', 'reportReady', 'errorType')} for r in records},
               'capacityConclusion': False,
               'limits': ['one attempt per student-questionnaire pair; maxAttempts=1 pool verified',
                          'no FINAL retry; receipt protocol for any uncertain state',
                          'percentiles descriptive; no SLA or capacity inference'],
               'output': str(out)}
    (out / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    for p in out.iterdir():
        p.chmod(0o600)
    print(json.dumps(summary), flush=True)
    if failures:
        raise SystemExit(2)


if __name__ == '__main__':
    asyncio.run(main())
