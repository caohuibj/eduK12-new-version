import { writeFileSync } from 'node:fs'
import { createVoiceSnapshot } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/package'
import { plan, type Raw } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/protocol'
import { scoreVoice, envelope } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/scorer'
import { projectReport, reportText } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/report'
const session = createVoiceSnapshot('experience'), randomSeed = 'new-synthetic-review-artifact-not-a-person', counts = { normal: 0, strong: 0 }
const rows: Raw[] = plan(session.config, randomSeed).map(p => {
  const number = counts[p.intensity]++, choice = number < (p.intensity === 'normal' ? 8 : 10) ? p.emotion : 'none', at = p.index * 10000
  return { plan: p, startedAtPerfMs: at, endedAtPerfMs: at + 5100, events: [{ kind: 'play', at }, { kind: 'ended', at: at + 5000 }, { kind: 'activate', at: at + 5100, choice, input: 'assistive' }] }
})
const limited = structuredClone(rows), index = limited.findIndex(r => r.plan.intensity === 'normal')
limited[index].events = [{ kind: 'skip', at: limited[index].endedAtPerfMs }]
const zero = structuredClone(rows); zero.forEach(r => { const e = r.events.at(-1)!; if (e.kind === 'activate') e.choice = 'none' })
const results = Object.entries({ interpretable: rows, limited, invalid: [], trueZero: zero }).map(([name, raw]) => {
  const report = projectReport(scoreVoice({ session, config: session.config, randomSeed, trials: raw.map(envelope) }))
  return { name, report, zh: reportText(report), en: reportText(report, 'en') }
})
writeFileSync(new URL('./report-examples.json', import.meta.url), JSON.stringify({ kind: 'NEW_SYNTHETIC_REVIEW_EXAMPLES_NOT_HUMAN_DATA_OR_HISTORICAL_TEST_RAW', session, randomSeed, originalExampleRaw: rows, results }, null, 2) + '\n')
console.log(JSON.stringify(results.map(r => ({ name: r.name, state: r.report.state, overall: r.report.overall }))))
