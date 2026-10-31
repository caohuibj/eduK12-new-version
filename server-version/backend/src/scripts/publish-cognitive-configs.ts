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
  if (args.some((arg) => arg.startsWith('--') && !['--input', '--apply', '--actor'].includes(arg))) {
    throw new Error('Unknown flag')
  }
  const inputIndex = args.indexOf('--input')
  if (inputIndex < 0 || !args[inputIndex + 1]) {
    throw new Error('Required: --input <release.json> [--apply]')
  }

  const input = cognitiveBatchPublicationInputSchema.parse(
    JSON.parse(readFileSync(args[inputIndex + 1], 'utf8')),
  )

  // The batch planner and publishCognitiveConfig enforce the same bank gate.
  if (args.includes('--apply')) {
        console.error('Research-restricted banks block public release:')
        for (const blocker of bankBlockers) {
          console.error(` - ${blocker.testType}: ${blocker.stimulusSetVersion} license=${blocker.license} (${blocker.source})`)
        }
        console.error(`Pass ${allowFlag} only for internal pilot rounds that never reach public deployment.`)
        process.exitCode = 3
        return
      }
      console.warn('Note: release contains research-restricted banks; --apply would be blocked without' + allowFlag)
    }
  }

  if (args.includes('--apply')) {
    const actorIndex = args.indexOf('--actor')
    const actorId = actorIndex >= 0 ? args[actorIndex + 1] : undefined
    if (!actorId || actorId.startsWith('--')) throw new Error('Apply requires --actor <existing-system-admin-user-id>')
    console.log(JSON.stringify(await applyCognitiveConfigBatchPublication(
      prisma,
      input,
      configId => publishCognitiveConfig(configId, actorId),
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
