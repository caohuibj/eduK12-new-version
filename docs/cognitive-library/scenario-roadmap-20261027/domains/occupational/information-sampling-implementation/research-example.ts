/** New research-profile capture/scorer example; all responses are synthetic, not participant evidence. */
import { writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createIstSnapshot } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/information-sampling/package'
import { istPlan } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/information-sampling/protocol'
import { scoreIst, istEnvelope } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/information-sampling/scorer'
import { projectIstReport, istDownload } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/information-sampling/report'
import { IstCapture } from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/information-sampling/capture'
const snapshot = createIstSnapshot('research'), randomSeed = 'ist-original-synthetic-research-example', plan = istPlan(snapshot.config, randomSeed), ordinal = { fixed: 0, decreasing: 0 }
const raw = plan.map(p => {
  const capture = new IstCapture(snapshot.config, p, 100 + p.index * 10_000), i = ordinal[p.rule]++, n = (p.rule === 'fixed' ? 7 : 5) + i % 5
  let clock = capture.raw.startedAtPerfMs
  const correct = p.rule === 'fixed' ? i % 5 !== 4 : i % 5 !== 2
  const choice = correct ? p.majority : p.majority === 'blue-circle' ? 'orange-triangle' : 'blue-circle'
  for (const target of [...Array.from({ length: n }, (_, cell) => 'cell:' + cell), 'choice:' + choice]) {
    capture.input({ kind: 'down', atMs: ++clock, target, input: 'touch', token: 'pointer:1', key: null, repeat: false })
    capture.input({ kind: 'up', atMs: ++clock, target, input: 'touch', token: 'pointer:1', key: null, repeat: false })
  }
  capture.tick(clock + 2000)
  return capture.raw
})
const score = scoreIst({ session: snapshot, config: snapshot.config, randomSeed, trials: raw.map(istEnvelope) }), report = projectIstReport(score)
if (report.state !== 'interpretable' || report.completed !== 20 || report.decreasingMinusFixedReveals !== -2 || report.groups!.fixed.points !== 600 || report.groups!.decreasing.points !== 1240) throw Error('Research example did not match its explicitly constructed choices')
const root = 'docs/cognitive-library/scenario-roadmap-20261027/domains/occupational/information-sampling-implementation/'
const sourcePaths = ['server-version/frontend/src/modules/cognitive/tasks/information-sampling/capture.ts', 'server-version/frontend/src/modules/cognitive/tasks/information-sampling/generated/protocol.ts', ...['protocol.ts', 'schema.ts', 'scorer.ts', 'report.ts', 'package.ts'].map(f => 'server-version/backend/src/modules/cognitive/content-candidates/information-sampling/' + f)]
const evidence = { kind: 'new-synthetic-research-example-not-a-replay-of-earlier-tests', nodeVersion: process.version, generatedAtUTC: new Date().toISOString(), actualPointerHardware: false, actualBrowser: false, actualApiDbCos: false, sourceHashes: sourcePaths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })), snapshot, randomSeed, raw, score, publicReport: report }
writeFileSync(root + 'research-example.json', JSON.stringify(evidence, null, 2) + '\n')
writeFileSync(root + 'research-public-report.json', istDownload(report)! + '\n')
console.log(JSON.stringify({ profile: report.profile, presented: report.presented, completed: report.completed, state: report.state, signedDifference: report.decreasingMinusFixedReveals, fixed: report.groups!.fixed, decreasing: report.groups!.decreasing }))
