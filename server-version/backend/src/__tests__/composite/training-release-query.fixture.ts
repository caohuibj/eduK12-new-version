import { scaleMeasurementRelease } from '../../modules/measurement-content/scale'
import { cognitiveMeasurementRelease } from '../../modules/measurement-content/cognitive'
import { prepareRelease } from '../../modules/measurement-content/release'
import { frozenDatabaseScaleDefinition } from '../../modules/scale/scale-workflow.service'
import { decryptCognitivePayload } from '../../modules/cognitive/cognitive.security'

/** Synthetic persisted source/release rows for the older composite unit tests.
 * The production selector, hash verifier, scope check and executable comparison
 * remain real. This fixture is not evidence of PostgreSQL locking/concurrency. */
export function trainingReleaseQueryFixture(currentComposite: () => Promise<any>) {
  let releases: any[] = []
  return async (query: any, ...args: unknown[]) => {
    const sql = Array.from(query.strings ?? query).join(' ')
    if (sql.includes('WITH scale_sources AS')) {
      const composite = await currentComposite()
      releases = []
      return composite.items.filter((item: any) => item.type !== 'FORM').map((item: any, index: number) => {
        const isScale = item.type === 'SCALE'
        if (!isScale && item.type !== 'COGNITIVE') throw new Error('Unsupported test source')
        const source = isScale ? item.scale : item.cognitiveAssignment.config
        const ownerId = isScale ? source.creatorId : item.cognitiveAssignment.createdBy
        const assignmentId = isScale ? null : item.cognitiveAssignment.id
        const id = `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
        const scope = { kind: 'PRIVATE' as const, product: 'TRAINING' as const, ownerId, resourceId: assignmentId ?? source.id }
        const input = isScale
          ? scaleMeasurementRelease({localId:source.code,version:'fixture-v1',instrumentVersion:source.instrumentVersion,
            definition:frozenDatabaseScaleDefinition(source),instrumentClass:source.instrumentClass,scope})
          : cognitiveMeasurementRelease({localId:source.testType,version:'fixture-v1',testType:source.testType,
            configVersion:source.configVersion,engineVersion:source.engineVersion,scoringVersion:source.scoringVersion,
            config:item.cognitiveAssignment.resolvedConfigSnapshotEncrypted
              ? decryptCognitivePayload(item.cognitiveAssignment.resolvedConfigSnapshotEncrypted) : source.config,scope})
        const release = prepareRelease(input)
        releases.push({id,layer:release.layer,family:release.family,content_key:release.key,version:release.version,
          hash_scheme:release.hashScheme,content_hash:release.contentHash,content:release.content,scope:release.scope,
          provenance:release.provenance,asset_refs:release.assetRefs,source_release_id:release.sourceReleaseId,
          status:'PUBLISHED',published_by:ownerId,published_at:new Date('2026-10-21T00:00:00Z')})
        return {kind:isScale?'SCALE':'COGNITIVE_CONFIG',id:source.id,owner_id:ownerId,assignment_id:assignmentId,
          measurement_release_id:id,instrument_key:null,instrument_version:null}
      })
    }
    if (sql.includes('SELECT * FROM measurement_content_releases')) {
      const values = query.values ?? args
      return releases.filter(row => values.includes(row.id))
    }
    return [] // Existing unit doubles: no library entries/stops; not a lock proof.
  }
}
