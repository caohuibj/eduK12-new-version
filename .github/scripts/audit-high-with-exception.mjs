// Temporary, advisory-specific DEV-only exception. All other High/Critical remain blocked.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIGH = new Set(['high', 'critical']);
export const PICOMATCH_ADVISORY = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';

export function unexpectedHigh(report, allowDevPicomatch = false) {
  if (!report || report.error || !report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    throw new Error('Invalid npm audit report; failing closed');
  }
  const vulnerabilities = report.vulnerabilities;
  const high = Object.entries(vulnerabilities).filter(([, v]) => HIGH.has(v.severity));
  if (!allowDevPicomatch) return high.map(([name]) => name);

  function knownPicomatchChain(name, path = new Set()) {
    if (path.has(name)) return false;
    const v = vulnerabilities[name];
    if (!v || !HIGH.has(v.severity) || !Array.isArray(v.via)) return false;
    const causes = v.via.filter(via =>
      typeof via === 'string' ? HIGH.has(vulnerabilities[via]?.severity) : HIGH.has(via?.severity));
    if (!causes.length) return false;
    const next = new Set([...path, name]);
    return causes.every(via => typeof via === 'string'
      ? knownPicomatchChain(via, next)
      : name === 'picomatch' && via.name === 'picomatch' && via.url === PICOMATCH_ADVISORY);
  }
  return high.map(([name]) => name).filter(name => !knownPicomatchChain(name));
}

async function audit(args) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const run = spawnSync('npm', ['audit', '--json', '--audit-level=high', ...args], {
      encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    let report;
    try { report = JSON.parse(run.stdout); } catch { /* No valid audit report: retry. */ }
    if (!run.error && (run.status === 0 || run.status === 1) &&
        report && !report.error && report.vulnerabilities && typeof report.vulnerabilities === 'object') return report;
    if (attempt === 3) throw new Error(`npm audit produced no valid report: ${run.error?.message || run.stderr?.slice(-1500) || run.stdout?.slice(-1500) || run.status}`);
    console.warn(`npm audit registry error, retry ${attempt}/3`);
    await new Promise(done => setTimeout(done, attempt * 10000));
  }
  throw new Error('Unexpected npm audit state');
}

async function main() {
  const prodHigh = unexpectedHigh(await audit(['--omit=dev']));
  if (prodHigh.length) throw new Error(`Production High/Critical: ${prodHigh.join(', ')}`);
  console.log('Production: zero High/Critical vulnerabilities');
  const full = await audit([]);
  const unapproved = unexpectedHigh(full, true);
  if (unapproved.length) throw new Error(`Unapproved High/Critical: ${unapproved.join(', ')}`);
  const high = Object.entries(full.vulnerabilities).filter(([, v]) => HIGH.has(v.severity));
  if (high.length) console.warn(`Temporary DEV-only exception GHSA-fc5q-39xc-vjpf: ${high.length} derived High entries (see docs/dependency-audit-exceptions-2026-08-29.md)`);
  else console.log('Full audit: zero High/Critical vulnerabilities');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
