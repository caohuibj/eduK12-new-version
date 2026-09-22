import { readFileSync } from 'node:fs'
import { prisma } from '../config/database'
import {
  applyCognitiveConfigBatchPublication,
  cognitiveBatchPublicationInputSchema,
  planCognitiveConfigBatchPublication,
} from '../modules/cognitive/release-batch'
import { publishCognitiveConfig } from '../modules/cognitive/release.service'

const main = async () => {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg.startsWith('--') && !['--input', '--apply'].includes(arg))) {
    throw new Error('Unknown flag')
  }
  const inputIndex = args.indexOf('--input')
  if (inputIndex < 0 || !args[inputIndex + 1]) {
    throw new Error('Required: --input <release.json> [--apply]')
  }

  const input = cognitiveBatchPublicationInputSchema.parse(
    JSON.parse(readFileSync(args[inputIndex + 1], 'utf8')),
  )

  if (args.includes('--apply')) {
    console.log(JSON.stringify(await applyCognitiveConfigBatchPublication(
      prisma,
      input,
      publishCognitiveConfig,
    ), null, 2))
    return
  }

  const plan = await planCognitiveConfigBatchPublication(prisma, input)
  console.log(JSON.stringify(plan, null, 2))
  if (!plan.allowPublish) process.exitCode = 2
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
