import { readFileSync } from 'node:fs'
import { prisma } from '../config/database'
import { planStandardScalePublication, publishStandardScale, standardScalePublishInputSchema } from '../modules/scale/onboarding/publish'

const main = async () => {
  const args = process.argv.slice(2)
  if (args.some(arg => arg.startsWith('--') && !['--input', '--apply'].includes(arg))) throw new Error('Unknown flag')
  const index = args.indexOf('--input')
  if (index < 0 || !args[index + 1]) throw new Error('Required: --input <publication.json> [--apply]')
  const input = standardScalePublishInputSchema.parse(JSON.parse(readFileSync(args[index + 1], 'utf8')))
  if (args.includes('--apply')) {
    if (!input.expectedProofHash) throw new Error('Apply requires expectedProofHash from reviewed dry-run')
    console.log(JSON.stringify(await publishStandardScale(prisma, { ...input, expectedProofHash: input.expectedProofHash }), null, 2))
  } else {
    const plan = await planStandardScalePublication(prisma, input)
    console.log(JSON.stringify(plan, null, 2))
    if (!plan.allowPublish) process.exitCode = 2
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
