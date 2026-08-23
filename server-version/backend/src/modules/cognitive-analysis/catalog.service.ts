import { listAnalysisProtocolDefinitions } from './analysis-protocol.registry'
import {
  COGNITIVE_DOMAIN_DEFINITION_VERSION,
  listCognitiveDomainDefinitions,
} from './domain.registry'
import { COGNITIVE_EVIDENCE_MAPPING_VERSION } from './evidence-mapping.registry'

export const listAnalysisProtocolCatalog = (includeNonPublished = false) => ({
  domainDefinitionVersion: COGNITIVE_DOMAIN_DEFINITION_VERSION,
  evidenceMappingVersion: COGNITIVE_EVIDENCE_MAPPING_VERSION,
  domains: listCognitiveDomainDefinitions(),
  list: listAnalysisProtocolDefinitions()
    .filter((protocol) => includeNonPublished || protocol.status === 'PUBLISHED')
    .map((protocol) => ({
      key: protocol.key,
      version: protocol.version,
      status: protocol.status,
      name: protocol.name,
      description: protocol.description,
      recommendedForCreate: protocol.recommendedForCreate,
      profiles: protocol.profiles,
      estimatedMinutes: protocol.estimatedMinutes,
      outputDomains: protocol.outputDomains,
      cognitiveSlots: protocol.cognitiveSlots.map((slot) => ({
        key: slot.key,
        label: slot.label,
        position: slot.position,
        testType: slot.testType,
      })),
      ...(includeNonPublished ? { disabledReason: protocol.disabledReason } : {}),
    })),
})
