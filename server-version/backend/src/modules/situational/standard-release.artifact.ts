import { canonicalHash } from '../assessment-runtime/canonical'
import { artifactReference, governedMeasurementInput, snapshotUnit, type GovernedArtifact } from '../survey/governed-tool.model'
import { NATIVE_SJT_ADAPTER_VERSION, type CatalogSourceSnapshot } from '../survey/catalog.sources'
import { SURVEY_NATIVE_SJT_PROTOCOL } from '../survey/situational-native.contract'
import { compileSurveyNativeSituationalHeader } from '../survey/situational-native.definition'
import { assertSjtSurveyPublicationSupported, type SjtGitDeclaration } from './git-release'
import { scientificEvidenceDigest } from './onboarding/scientific-governance'

export function prepareSjtSurveyPublication(item: SjtGitDeclaration, source: 'SYSTEM_GIT_RELEASE' | 'ADMIN_WORKBOOK' = 'SYSTEM_GIT_RELEASE') {
  const { parameters, pkg, release } = item
  const template = assertSjtSurveyPublicationSupported(item)
  const title = pkg.definition.source.title?.trim() || pkg.key
  const nativeSituational = compileSurveyNativeSituationalHeader({ ...pkg, releaseStatus: 'PUBLISHED' }, {
    schemaVersion: 1,
    scientificMaturity: 'PILOT',
    governanceRevision: parameters.scientific.governanceRevision,
    scope: parameters.scientific.claimScope,
    executionRef: item.science.executionRef,
    evidenceDigest: scientificEvidenceDigest(parameters.scientific),
  })
  const unit = {
    ref: { kind: 'SJT' as const, sourceId: 'sjt-git:' + pkg.key, sourceVersion: release.contentVersion },
    title,
    compiledDefinition: pkg.definition,
    displayDefinition: { schemaVersion: 1, executionProtocol: SURVEY_NATIVE_SJT_PROTOCOL, title },
    definitionDigest: canonicalHash(pkg.definition),
    scoringDigest: canonicalHash(pkg.definition.scoring),
    adapterVersion: NATIVE_SJT_ADAPTER_VERSION,
    nativeSituational,
    provenance: { instrumentKey: pkg.key, source: pkg.definition.source, license: pkg.definition.license },
  }
  const artifact: GovernedArtifact = {
    schemaVersion: 1, family: 'SJT', toolKey: (source === 'ADMIN_WORKBOOK' ? 'SJT:workbook:' : 'SJT:git:') + pkg.key, version: release.releaseKey, title, unit,
    parameters: null, report: { version: release.reportVersion, template, audience: 'researcher' },
    components: [], packageReport: null,
    reference: artifactReference('SJT', pkg.key, {
      source, axes: item.axes, license: pkg.definition.license,
      scientificMaturity: parameters.scientific.scientificMaturity,
      knownLimitations: parameters.scientific.knownLimitations,
    }),
  }
  return { artifact, unit }
}


/** Freeze the runner projection of C and P. The existing SJT measurement
 * projection excludes report data so a report revision reuses this receipt. */
export function sjtStandardMeasurementInput(unit: CatalogSourceSnapshot, input: {
  localId:string; version:string; contentHash:string; parameterHash:string; dataCeiling:unknown
}) {
  const projection = governedMeasurementInput(snapshotUnit(unit), { kind: 'PLATFORM' }, input.localId, input.version)
  if (projection.layer !== 'MEASUREMENT' || projection.family !== 'SJT') throw new Error('SJT_STANDARD_MEASUREMENT_REQUIRED')
  return {
    ...projection,
    provenance: { ...projection.provenance, contentHash: input.contentHash,
      parameterHash: input.parameterHash, dataCeiling: input.dataCeiling },
  }
}
