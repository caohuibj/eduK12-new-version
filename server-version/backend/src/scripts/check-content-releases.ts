import { resolve } from 'node:path'
import { checkContentRelease } from '../modules/measurement-content/git-release-plane'

async function main() {
  const selectors = process.argv.slice(2)
  if (!selectors.length || new Set(selectors).size !== selectors.length) {
    throw new Error('Usage: npm run content:check -- <family:toolKey> [family:toolKey ...]')
  }
  const repoRoot = resolve(__dirname, '../../../..')
  const results = []
  for (const selector of selectors) results.push(await checkContentRelease(repoRoot, selector))
  console.log(JSON.stringify(results))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
