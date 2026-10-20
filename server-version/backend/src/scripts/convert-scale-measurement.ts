import { readFileSync } from 'node:fs'
import { prisma } from '../config/database'
import { convertLegacyScaleMeasurement, planLegacyScaleMeasurementConversion } from '../modules/scale/onboarding/measurement-conversion'

async function main() {
  const args = process.argv.slice(2)
  if ((args.length !== 2 && args.length !== 3) || args[0] !== '--input' || !args[1] || args[1].startsWith('--')
    || args.length === 3 && args[2] !== '--apply') throw new Error('Required: --input <reviewed-scale-conversion.json> [--apply]')
  const input: unknown = JSON.parse(readFileSync(args[1], 'utf8'))
  const result = args[2] === '--apply' ? await convertLegacyScaleMeasurement(prisma, input)
    : await planLegacyScaleMeasurementConversion(prisma, input)
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
