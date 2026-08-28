import { auditCognitiveV2Registry } from '../modules/cognitive/v2/audit'

const report = auditCognitiveV2Registry()
console.log(JSON.stringify(report, null, 2))
if (report.status === 'FAIL') process.exitCode = 1
