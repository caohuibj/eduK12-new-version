// Run from repository root. Replay only retained synthetic UI records; no participant or API data.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { score, envelope } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/perceptual-confidence/scorer'
import { projectReport, download, takeHomeSvg, narrative } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/perceptual-confidence/report'
import type { Raw } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/perceptual-confidence/protocol'
const d = resolve(process.cwd(), 'docs/cognitive-library/scenario-roadmap-20261027/domains/occupational/perceptual-confidence-implementation'), original = JSON.parse(readFileSync(resolve(d, 'react-synthetic-originals.json'), 'utf8')), trials: Raw[] = original.records.filter((r: { phase: string }) => r.phase === 'test').map((r: { raw: Raw }) => r.raw)
const scored = score({ session: original.context.snapshot, config: original.context.snapshot.config, randomSeed: original.context.randomSeed, trials: trials.map(envelope) }), report = projectReport(scored)
writeFileSync(resolve(d, 'react-replayed-report.json'), JSON.stringify({ kind: 'NATIVE_REPLAY_OF_RETAINED_REACT_JSDOM_SYNTHETIC_RECORDS', formalCount: trials.length, score: scored, report, chinese: narrative(report, 'zh'), english: narrative(report, 'en'), publicDownload: download(report) }, null, 2) + '\n')
writeFileSync(resolve(d, 'limited-public-summary.svg'), takeHomeSvg(report)!)
const invalid = projectReport(score({ session: original.context.snapshot, config: original.context.snapshot.config, randomSeed: original.context.randomSeed, trials: [] }))
writeFileSync(resolve(d, 'invalid-public-projection.json'), JSON.stringify({ report: invalid, narrative: narrative(invalid, 'zh'), image: takeHomeSvg(invalid), publicDownload: download(invalid) }, null, 2) + '\n')
console.log(JSON.stringify({ formalCount: trials.length, state: report.state, judged: report.summary!.judged, paired: report.summary!.paired, invalidState: invalid.state }))
