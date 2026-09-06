// Probe: submit ONE ready-parent last section via the same cookie/CSRF path k6
// uses, then report the parent DB status. Confirms aggregate finalization fires.
import fs from 'fs';
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const group = process.env.GROUP || 'parentN2';
const idx = Number(process.env.IDX || 0);
const authEnv = process.env.AUTH_ENV || '/workspace/eduk12-pr49-cloud-results/e4s2/auth.env';
const env = {};
for (const line of fs.readFileSync(authEnv, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const fixtures = JSON.parse(fs.readFileSync(process.env.FIXTURE_FILE, 'utf8'));
const req = fixtures[group][idx];
const authToken = env.PERF_AUTH_TOKEN || process.env.AUTH_TOKEN;
const csrf = env.PERF_CSRF_TOKEN || process.env.CSRF_TOKEN;
(async () => {
  const url = base + req.path;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf,
      Cookie: `ptool_session=${encodeURIComponent(authToken)}; ptool_csrf=${encodeURIComponent(csrf)}`,
    },
    body: JSON.stringify(req.body),
  });
  const elapsed = Date.now() - t0;
  let body = '';
  try { body = (await res.text()).slice(0, 400); } catch {}
  console.log(JSON.stringify({ group, idx, parentId: req.parentId, status: res.status, elapsed_ms: elapsed, body }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });