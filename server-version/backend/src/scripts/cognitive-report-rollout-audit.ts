import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { parseArgs } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { auditPublishedCognitiveReports } from '../modules/cognitive/report-rollout-audit'

async function main() {
  const { values } = parseArgs({ options: { 'scope-label': { type: 'string' }, output: { type: 'string' }, 'fail-on-pending': { type: 'boolean', default: false } } })
  if (!values['scope-label']?.trim()) throw new Error('Usage: cognitive:reports:audit -- --scope-label <database-scope> [--output <json-file>] [--fail-on-pending]')
  const db = new PrismaClient({ log: [] })
  try {
    const report = await auditPublishedCognitiveReports(db, values['scope-label'])
    const json = JSON.stringify(report, null, 2) + '\n'
    if (values.output) await writeFile(values.output, json, { mode: 0o600 })
    else process.stdout.write(json)
    if (values['fail-on-pending'] && report.status !== 'FROZEN_POLICY_COVERED') process.exitCode = 1
  } finally { await db.$disconnect() }
}
main().catch(() => { console.error('发布报告只读盘点未完成。请核查参数、数据库与加密密钥；没有修改发布任务或历史结果。'); process.exitCode = 1 })
