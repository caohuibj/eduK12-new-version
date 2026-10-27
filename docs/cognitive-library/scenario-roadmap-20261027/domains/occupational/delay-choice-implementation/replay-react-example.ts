// Run from repository root with the already installed backend tsx; synthetic retained UI records only.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { score, envelope } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/delay-choice/scorer'
import { projectReport, download, takeHomeSvg, narrative } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/delay-choice/report'
import type { Raw } from '../../../../../../server-version/backend/src/modules/cognitive/content-candidates/delay-choice/protocol'
const d = resolve(process.cwd(), 'docs/cognitive-library/scenario-roadmap-20261027/domains/occupational/delay-choice-implementation'), original = JSON.parse(readFileSync(resolve(d, 'react-synthetic-originals.json'), 'utf8'))
const trials: Raw[] = original.records.filter((r: { phase: string }) => r.phase === 'test').map((r: { raw: Raw }) => r.raw), scored = score({ session: original.context.snapshot, config: original.context.snapshot.config, randomSeed: original.context.randomSeed, trials: trials.map(envelope) }), report = projectReport(scored)
writeFileSync(resolve(d, 'react-replayed-report.json'), JSON.stringify({ kind: 'REPLAY_OF_RETAINED_ACTUAL_REACT_SYNTHETIC_RECORDS_NOT_API', formalCount: trials.length, score: scored, report, chinese: narrative(report, 'zh'), english: narrative(report, 'en'), publicDownload: download(report) }, null, 2) + '\n')
writeFileSync(resolve(d, 'limited-public-summary.svg'), takeHomeSvg(report)!)
const invalid = projectReport(score({ session: original.context.snapshot, config: original.context.snapshot.config, randomSeed: original.context.randomSeed, trials: [] }))
writeFileSync(resolve(d, 'invalid-public-projection.json'), JSON.stringify({ kind: 'EMPTY_SYNTHETIC_RECORDS_NOT_PARTICIPANT_DATA', report: invalid, chinese: narrative(invalid, 'zh'), image: takeHomeSvg(invalid), publicDownload: download(invalid) }, null, 2) + '\n')
console.log(JSON.stringify({ formalCount: trials.length, limitedState: report.state, invalidState: invalid.state }))
