import { canonicalHash } from '../assessment-runtime/canonical'
import { compileBundleRuntime } from '../assessment-runtime/compiler'
import { compileBundleRuntimeFromSnapshot } from '../assessment-runtime/unified-aggregate'
import type { CompiledInstrumentRuntimeV1 } from '../assessment-runtime/types'
import type { FrozenRuntimeSnapshotRead } from './compatibility'
import { validateFrozenAssessmentBundleSnapshot } from './snapshot'

/**
 * One V3.2 compile entry. Legacy package/protocol snapshots and Bundle v3
 * all become CompiledInstrumentRuntimeV1; they do not grow a second runtime.
 */
export const compileBundleRuntimeFromFrozenRead = (
  read: FrozenRuntimeSnapshotRead,
): CompiledInstrumentRuntimeV1 => {
  if (read.family === 'ASSESSMENT_BUNDLE') {
    const snapshot = validateFrozenAssessmentBundleSnapshot(read.snapshot)
    return compileBundleRuntime({
      instrumentKey: `assessment-bundle:${snapshot.bundleKey}`,
      instrumentVersion: snapshot.bundleVersion,
      sourceDefinitionHash: snapshot.snapshotHash,
      reportDefinition: {
        bundleKey: snapshot.bundleKey,
        bundleVersion: snapshot.bundleVersion,
        engineKey: snapshot.engine.key,
        engineVersion: snapshot.engine.version,
        reportDefinitionKey: snapshot.reportDefinitionKey,
        reportDefinitionVersion: snapshot.reportDefinitionVersion,
      },
    })
  }
  if (read.family === 'LEGACY_REPORT_PACKAGE') {
    return compileBundleRuntimeFromSnapshot(read.snapshot)
  }
  const snapshot = read.snapshot
  return compileBundleRuntime({
    instrumentKey: `analysis-protocol:${snapshot.protocolKey}`,
    instrumentVersion: snapshot.protocolVersion,
    sourceDefinitionHash: canonicalHash({
      snapshotVersion: snapshot.snapshotVersion,
      protocolKey: snapshot.protocolKey,
      protocolVersion: snapshot.protocolVersion,
      profile: snapshot.profile,
      protocolDefinition: snapshot.protocolDefinition,
      cognitiveMeasurements: snapshot.cognitiveMeasurements,
      scaleMeasurements: snapshot.scaleMeasurements ?? null,
    }),
    reportDefinition: {
      protocolKey: snapshot.protocolKey,
      protocolVersion: snapshot.protocolVersion,
      profile: snapshot.profile,
    },
  })
}
