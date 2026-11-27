import { resolve } from 'node:path'
import { checkDeclaredScaleReleases } from '../modules/scale/declarative/check'

try {
  const toolKeys = process.argv.slice(2)
  if (toolKeys.some(key => !/^[a-z][a-z0-9_]*$/.test(key))) {
    throw new Error('Usage: npm run scale:check -- [toolKey ...]')
  }
  const repoRoot = resolve(__dirname, '../../../..')
  const releases = checkDeclaredScaleReleases(
    resolve(repoRoot, 'server-version/backend/src/modules/scale/instruments'),
    { repoRoot, ...(toolKeys.length ? { toolKeys } : {}) },
  )
  console.log(JSON.stringify(releases.map(({ toolKey, releaseKey, state, triplet }) => ({
    toolKey, releaseKey, state, combinationHash: triplet.combinationHash,
    contentHash: triplet.parts.CONTENT.hash,
  }))))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
