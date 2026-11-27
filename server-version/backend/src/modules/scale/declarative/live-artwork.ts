import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import type {DeclaredScaleRelease} from './load'
import {activeScaleDeclarations} from './replacement'

const inventorySchema = z.object({
  schemaVersion: z.literal(1),
  files: z.record(z.string(), z.string().regex(/^[a-f0-9]{40}$/)),
}).strict()

export function assertLiveScaleReportArtwork(inputRoot: string, releases: readonly DeclaredScaleRelease[]) {
  const byTool = new Map<string, DeclaredScaleRelease[]>()
  for (const release of releases) {
    const toolReleases = byTool.get(release.toolKey) ?? []
    toolReleases.push(release)
    byTool.set(release.toolKey, toolReleases)
  }
  const artwork = new Set([...byTool.values()].flatMap(toolReleases =>
    activeScaleDeclarations(toolReleases).flatMap(({triplet}) =>
      [triplet.definition.report.artworkKey, triplet.template?.artworkKey].filter((key): key is string => Boolean(key)),
    ),
  ))
  if (!artwork.size) return

  const directory = join(inputRoot, '.artwork')
  const read = (filename: string) => inventorySchema.parse(JSON.parse(readFileSync(join(directory, filename), 'utf8'))).files
  let approved: ReturnType<typeof read>
  let live: Array<ReturnType<typeof read>>
  try {
    approved = read('approved.json')
    live = readdirSync(directory).filter(name => /^live-[0-9a-f]+\.json$/.test(name)).map(read)
  } catch {
    throw new Error('Approved and running frontend Scale artwork inventories are required')
  }
  if (!live.length) throw new Error('Running frontend has no Scale artwork inventory')
  for (const key of artwork) {
    const manifest = key + '/report-artwork.json'
    const expected = Object.entries(approved).filter(([path]) => path.startsWith(key + '/'))
    if (!approved[manifest] || !expected.some(([path]) => path.endsWith('.webp'))) {
      throw new Error('Scale artwork is missing from the approved Git commit: ' + key)
    }
    if (live.some(files => expected.some(([path, identity]) => files[path] !== identity))) {
      throw new Error('Running frontend has missing or stale Scale artwork: ' + key)
    }
  }
}
