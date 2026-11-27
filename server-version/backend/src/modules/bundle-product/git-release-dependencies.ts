import type { Prisma } from '@prisma/client'
import type { DeclarativePackage } from '../assessment-bundle/onboarding/contract'
import { assertAssessmentOperationallyActive } from '../assessment-governance/operational-hold'
import { canonicalHash } from '../assessment-runtime/canonical'
import { getContentRelease } from '../measurement-content/repository'
import { cognitiveMeasurementRelease } from '../measurement-content/cognitive'
import { prepareRelease } from '../measurement-content/release'
import { getScaleInstrumentSource } from '../scale/onboarding/instrument-registry'
import { scaleSourceAxisPayloads } from '../scale/onboarding/source-snapshot'
import { readStaticSjtMeasurementForStart } from '../situational/static-measurement-release'

/** Git publication requires actual released dependencies as well as the package
 * compiler's exact selectors. Form slots are immutable inline context in Bundle. */
export async function assertGitBundleDependencies(tx: Prisma.TransactionClient, pack: DeclarativePackage) {
  const slots = [...pack.manifest.definition.slots].sort((a, b) =>
    a.unitType.localeCompare(b.unitType) || a.instrumentKey.localeCompare(b.instrumentKey) ||
    a.instrumentVersion.localeCompare(b.instrumentVersion))
  for (const slot of slots) {
    const { instrumentKey: key, instrumentVersion: version } = slot
    if (slot.unitType === 'SCALE') {
      assertAssessmentOperationallyActive({ family: 'SCALE', key, version })
      const source = getScaleInstrumentSource(key, version)
      if (!source?.executable || source.executable.releaseStatus !== 'PUBLISHED') {
        throw new Error('BUNDLE_GIT_SCALE_NOT_ONLINE:' + slot.slotKey)
      }
      const contentHash = canonicalHash(scaleSourceAxisPayloads(source).content)
      const rows = await tx.$queryRaw<Array<{ releaseId: string | null; contentHash: string | null }>>`
        SELECT measurement_release->>'releaseId' AS "releaseId", measurement_release->>'contentHash' AS "contentHash"
        FROM survey_standard_releases WHERE tool_key = ${key} AND state = 'ONLINE'
          AND snapshot->>'instrumentVersion' = ${version}
          AND snapshot #>> '{parts,CONTENT,hash}' = ${contentHash}
        ORDER BY id FOR SHARE
      `
      let online = false
      for (const row of rows) {
        const release = row.releaseId && await getContentRelease(tx, row.releaseId, true)
        if (release && release.layer === 'MEASUREMENT' && release.family === 'SCALE' &&
          release.status === 'PUBLISHED' && release.contentHash === row.contentHash && release.content.instrumentVersion === version) {
          online = true
          break
        }
      }
      if (!online) throw new Error('BUNDLE_GIT_SCALE_NOT_ONLINE:' + slot.slotKey)
    }
    if (slot.unitType === 'COGNITIVE') {
      const dependency = pack.manifest.cognitiveDependencies.find(value => value.slotKey === slot.slotKey)
      if (!dependency || dependency.configVersion !== version) throw new Error('BUNDLE_GIT_COGNITIVE_NOT_ONLINE:' + slot.slotKey)
      assertAssessmentOperationallyActive({ family: 'COGNITIVE', key, version: dependency.engineVersion, scoringVersion: dependency.scoringVersion })
      const [row] = await tx.$queryRaw<Array<{ measurementReleaseId: string | null; config: unknown }>>`
        SELECT measurement_release_id AS "measurementReleaseId", config FROM cognitive_test_configs
        WHERE test_type = ${key} AND config_version = ${dependency.configVersion}
          AND engine_version = ${dependency.engineVersion} AND scoring_version = ${dependency.scoringVersion}
          AND status = 'PUBLISHED'
        FOR SHARE
      `
      if (!row?.measurementReleaseId) throw new Error('BUNDLE_GIT_COGNITIVE_NOT_ONLINE:' + slot.slotKey)
      const release = await getContentRelease(tx, row.measurementReleaseId, true)
      const expected = prepareRelease(cognitiveMeasurementRelease({
        localId: key, version, testType: key, configVersion: version, engineVersion: dependency.engineVersion,
        scoringVersion: dependency.scoringVersion, config: row.config, scope: { kind: 'PLATFORM' },
      }))
      if (!release || release.layer !== 'MEASUREMENT' || release.family !== 'COGNITIVE' ||
        release.status !== 'PUBLISHED' || release.key !== expected.key || release.version !== expected.version ||
        release.contentHash !== expected.contentHash) {
        throw new Error('BUNDLE_GIT_COGNITIVE_NOT_ONLINE:' + slot.slotKey)
      }
    }
    if (slot.unitType === 'SITUATIONAL') {
      await readStaticSjtMeasurementForStart(tx, { instrumentKey: key, instrumentVersion: version }, 'PUBLISH')
    }
  }
}
