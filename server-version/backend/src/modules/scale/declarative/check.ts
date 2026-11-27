import {lstatSync, readFileSync, readdirSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {z} from 'zod'
import {reportArtworkKeySchema} from '../../measurement-content/report-artwork'
import type {Triplet} from '../../survey/standard-triplet.model'
import {computeDeclaredStandardTrial} from '../../survey/standard-triplet.trial'
import {loadDeclaredScaleAssets, type DeclaredScaleRelease} from './load'

const imageSchema = z.object({
  file: z.string().regex(/^[a-z][a-z0-9_-]*\.webp$/),
  alt: z.string().trim().min(1).max(400), width: z.number().int().min(64).max(4096), height: z.number().int().min(64).max(4096),
}).strict()
const artworkSchema = z.object({
  schemaVersion: z.literal(1), artworkKey: z.string(), hero: imageSchema.optional(),
  bands: z.array(imageSchema.extend({scoreKey: z.string().min(1), bandKey: z.string().min(1)})).max(100),
}).strict().refine(value => Boolean(value.hero || value.bands.length), 'Artwork requires a hero or a band image')
const illustrationKeyPattern = /^[a-z][a-z0-9_-]{0,119}$/

function requireWebp(path: string) {
  if (!lstatSync(path).isFile()) throw new Error(`${path}: expected a regular WebP file`)
  const file = readFileSync(path)
  if (file.length < 30 || file.toString('ascii', 0, 4) !== 'RIFF' || file.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`${path}: invalid WebP file`)
  }
}

/** Declarative images must already be available to the installed renderer.
 * Managed ASSET references are checked against the asset store on publication. */
export function assertDeclaredScaleArtwork(triplet: Triplet, repoRoot: string) {
  const report = triplet.definition.report as Triplet['definition']['report'] & {artworkKey?: string; illustrationKey?: string}
  const template = triplet.template as (NonNullable<Triplet['template']> & {artworkKey?: string; illustrationKey?: string}) | null
  const frontend = join(repoRoot, 'server-version/frontend/src')
  for (const key of new Set([report.artworkKey, template?.artworkKey])) {
    if (key === undefined) continue
    const prefix = `${triplet.toolKey}/${triplet.instrumentVersion}/`
    if (!reportArtworkKeySchema.safeParse(key).success || !key.startsWith(prefix)) {
      throw new Error(`Artwork ${key} does not match the report's tool and content version ${prefix}`)
    }
    const directory = join(frontend, 'scale-report-artwork', key)
    const manifestPath = join(directory, 'report-artwork.json')
    if (!lstatSync(manifestPath).isFile()) throw new Error(`${manifestPath}: expected a regular artwork manifest`)
    const manifest = artworkSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
    if (manifest.artworkKey !== key) throw new Error(`${manifestPath}: artworkKey does not match the declared report`)
    const bands = new Set(report.interpretations.flatMap(entry => entry.bands.map(band => `${entry.scoreKey}/${band.key}`)))
    for (const block of template?.blocks ?? []) if (block.type === 'REFERENCE_BAND') bands.add(`${block.metricKey}/${block.bandKey}`)
    const seen = new Set<string>()
    for (const band of manifest.bands) {
      const bandKey = `${band.scoreKey}/${band.bandKey}`
      if (!bands.has(bandKey) || seen.has(bandKey)) throw new Error(`${manifestPath}: unknown or duplicate artwork band ${bandKey}`)
      seen.add(bandKey)
    }
    for (const file of new Set([...(manifest.hero ? [manifest.hero.file] : []), ...manifest.bands.map(band => band.file)])) {
      requireWebp(join(directory, file))
    }
  }
  for (const key of new Set([report.illustrationKey, template?.illustrationKey])) {
    if (key === undefined) continue
    if (!illustrationKeyPattern.test(key)) throw new Error(`Invalid illustration key ${key}`)
    const assets = join(frontend, 'assets')
    if (readdirSync(assets).includes(key + '.webp')) {
      requireWebp(join(assets, key + '.webp'))
    } else {
      const directory = join(assets, key)
      if (!lstatSync(directory).isDirectory()) throw new Error(`No illustration assets for ${key}`)
      const files = readdirSync(directory).filter(name => name.endsWith('.webp'))
      if (!files.length) throw new Error(`No illustration assets for ${key}`)
      files.forEach(file => requireWebp(join(directory, file)))
    }
  }
}

export function checkDeclaredScaleReleases(
  root: string,
  options: {toolKeys?: readonly string[]; repoRoot?: string} = {},
): DeclaredScaleRelease[] {
  const {releases, candidates} = loadDeclaredScaleAssets(root, options.toolKeys)
  const repoRoot = options.repoRoot ?? resolve(root, '../../../../../..')
  for (const triplet of candidates) {
    assertDeclaredScaleArtwork(triplet, repoRoot)
    computeDeclaredStandardTrial(triplet)
  }
  return releases
}
