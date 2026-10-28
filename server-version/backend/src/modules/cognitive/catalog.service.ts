import { isCognitiveProductEligible } from './product-eligibility'
import { BAD_REQUEST, NOT_FOUND } from './cognitive.errors'
import { getCognitiveTaskResource, listCognitiveTaskResources, type CognitiveTaskResource } from './task-resource'

const toCatalogRow = (entry: CognitiveTaskResource) => ({
  testType: entry.testType,
  name: entry.name,
  category: entry.category,
  engineVersion: entry.engineVersion,
  scoringVersion: entry.scoringVersion,
  profileDefinitionVersion: entry.profileDefinitionVersion,
  metricDefinitionVersion: entry.metricDefinitionVersion,
  qualityDefinitionVersion: entry.qualityDefinitionVersion,
  reportDefinitionVersion: entry.reportDefinitionVersion,
  recommendedForCreate: entry.recommendedForCreate === true,
  profiles: Object.values(entry.profiles).map((profile) => ({
    profile: profile.profile,
    estimatedMinutes: profile.estimatedMinutes,
    reportCaveats: profile.reportCaveats,
  })),
  metricDefinitions: entry.metricDefinitions,
  qualityDefinitions: entry.qualityDefinitions,
  reportDefinition: entry.reportDefinition,
})

export const listCognitiveTestsCatalog = (testType?: string) => {
  const entries = testType
    ? listCognitiveTaskResources().filter(entry => entry.testType === testType)
    : listCognitiveTaskResources()
  return { list: entries.filter(entry => isCognitiveProductEligible(entry.testType)).map((entry) => toCatalogRow(entry as CognitiveTaskResource)) }
}

export const getCognitiveTestCatalog = (
  testType: string,
  engineVersion?: string,
  scoringVersion?: string,
) => {
  if (!isCognitiveProductEligible(testType)) throw NOT_FOUND('Cognitive task is not available as a product')
  if (Boolean(engineVersion) !== Boolean(scoringVersion)) {
    throw BAD_REQUEST('engineVersion 与 scoringVersion 必须同时提供')
  }
  if (engineVersion && scoringVersion) {
    const entry = getCognitiveTaskResource(testType, engineVersion, scoringVersion)
    if (!entry) {
      throw NOT_FOUND(`No cognitive registry entry for ${testType}/${engineVersion}/${scoringVersion}`)
    }
    return toCatalogRow(entry as CognitiveTaskResource)
  }
  const list = listCognitiveTaskResources().filter(entry => entry.testType === testType).map((entry) =>
    toCatalogRow(entry as CognitiveTaskResource),
  )
  if (list.length === 0) throw NOT_FOUND(`No cognitive registry entries for ${testType}`)
  return { list }
}
