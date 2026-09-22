import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Dispatch-to-start includes dependency waits; it is not pure runner queue time.
export function seconds(start, end) {
  const value = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}
export function summarize(run) {
  return (run.jobs ?? []).map(job => ({
    name: job.name,
    conclusion: job.conclusion || job.status,
    dispatchToStartSeconds: seconds(run.created_at, job.started_at),
    executionSeconds: job.status === 'completed' && job.conclusion !== 'skipped'
      ? seconds(job.started_at, job.completed_at) : null,
    slowestSteps: (job.steps ?? [])
      .filter(step => step.status === 'completed' && step.conclusion !== 'skipped')
      .map(step => ({ name: step.name, seconds: seconds(step.started_at, step.completed_at) }))
      .filter(step => step.seconds !== null)
      .sort((a, b) => b.seconds - a.seconds).slice(0, 5),
  }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify({ run: run.html_url, jobs: summarize(run) }, null, 2));
}
