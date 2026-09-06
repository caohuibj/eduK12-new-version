// Probe: submit last section THEN POST /complete for a ready-parent, report both
// statuses + finalizer trigger. Confirms the UNIFIED aggregate finalize path.
import fs from 'fs';
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const group = process.env.GROUP || 'parentN2';
const idx = Number(process.env.IDX || 1);
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
const H = (extra) => Object.assign(
  { 'Content-Type': 'application/json', 'x-csrf-token': csrf,
    Cookie: `ptool_session=${encodeURIComponent(authToken)}; ptool_csrf=${encodeURIComponent(csrf)}` },
  extra || {});
(async () => {
  // Step 1: submit last section
  let t0 = Date.now();
  const s1 = await fetch(base + req.path, { method: 'POST', headers: H(), body: JSON.stringify(req.body) });
  const d1 = Date.now() - t0;
  let b1 = ''; try { b1 = (await s1.text()).slice(0, 180); } catch {}
  // Step 2: complete (finalize)
  t0 = Date.now();
  const s2 = await fetch(`${base}/api/questionnaires/assessments/${req.parentId}/complete`, { method: 'POST', headers: H() });
  const d2 = Date.now() - t0;
  let b2 = ''; try { b2 = (await s2.text()).slice(0, 180); } catch {}
  console.log(JSON.stringify({
    group, idx, parentId: req.parentId,
    submit: { status: s1.status, ms: d1, body: b1 },
    complete: { status: s2.status, ms: d2, body: b2 },
  }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });