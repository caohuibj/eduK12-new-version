import {z} from 'zod'
import {canonicalHash,retainImmutableCanonicalValue} from '../assessment-runtime/canonical'
import {publicTemplates,type PublicTemplateStore} from '../assessment-runtime/public-templates'
import {freezeAssignmentProfile,hashResolvedConfig,readFrozenReport,type FrozenReportSnapshot} from '../cognitive/profile-freeze'
import type {CognitiveProfile,RegistryEntry} from '../cognitive/cognitive.types'
import {buildCognitiveV2TaskDefinition} from '../cognitive/v2/registry'
import {assertTaskContractValid} from '../cognitive/v2/publication-gate'
import {computeProtocolSignature} from '../cognitive/v2/canonical'
import {protocolDefinitionSchema} from '../cognitive/v2/session-snapshot'
import type {ProtocolDefinition} from '../cognitive/v2/types'
import {selectedConfigurationSchema,type SelectedConfiguration} from './selected-configuration'

export const COGNITIVE_PROFILE_TEMPLATE_KIND='COGNITIVE_PROFILE_CONFIGURATION' as const
export type CognitiveProfileIdentity=Extract<SelectedConfiguration,{kind:'COGNITIVE_PROFILE'}>
const identitySchema=selectedConfigurationSchema.options[1]
const version=z.string().min(1).max(200),record=z.record(z.string(),z.unknown())
const reportSchema=z.object({
 profile:z.enum(['experience','standard','research']),randomizationAlgorithmVersion:version,
 profileDefinitionVersion:version,metricDefinitionVersion:version,qualityDefinitionVersion:version,reportDefinitionVersion:version,
 presentationVersion:version,participantPresentation:record,
 metricDefinitions:record,qualityDefinitions:record,
 reportDefinition:z.object({primaryMetrics:z.array(version),secondaryMetrics:z.array(version)}).passthrough(),
 v2ReportDefinition:record,v2MetricDefinitions:record,v2QualityDefinitions:record,
}).passthrough()
const artifactSchema=z.object({schemaVersion:z.literal(1),identity:identitySchema,
 resolvedConfig:record,protocol:protocolDefinitionSchema,resolvedReport:reportSchema,
}).strict()
export interface CognitiveProfileArtifact {
 schemaVersion:1
 identity:CognitiveProfileIdentity
 resolvedConfig:Record<string,unknown>
 protocol:ProtocolDefinition
 resolvedReport:FrozenReportSnapshot
}
function fail(part:string):never{throw new Error('COGNITIVE_PROFILE_ARTIFACT_'+part)}

/** Integrity only, never approval or recipient authority. Historical parsing
 * uses the saved definitions, not the current registry or same-named profile. */
export function readCognitiveProfileArtifact(raw:unknown,expected?:CognitiveProfileIdentity):CognitiveProfileArtifact{
 const parsed=artifactSchema.parse(raw),{identity,protocol,resolvedReport:report}=parsed
 if(hashResolvedConfig(parsed.resolvedConfig)!==identity.resolvedConfigHash)fail('CONFIG_HASH_MISMATCH')
 if(canonicalHash(report)!==identity.reportHash)fail('REPORT_HASH_MISMATCH')
 if(computeProtocolSignature(protocol)!==identity.protocolSignature)fail('PROTOCOL_HASH_MISMATCH')
 for(const key of ['profile','profileDefinitionVersion','metricDefinitionVersion','qualityDefinitionVersion','reportDefinitionVersion','presentationVersion'] as const)
  if(report[key]!==identity[key])fail('REPORT_IDENTITY_MISMATCH')
 if(report.randomizationAlgorithmVersion!==protocol.randomizationAlgorithmVersion
  ||report.participantPresentation.presentationVersion!==identity.presentationVersion)fail('PRESENTATION_PROTOCOL_MISMATCH')
 for(const key of [...report.reportDefinition.primaryMetrics,...report.reportDefinition.secondaryMetrics])
  if(!Object.prototype.hasOwnProperty.call(report.metricDefinitions,key))fail('REPORT_METRIC_MISSING')
 if(expected&&canonicalHash(identity)!==canonicalHash(identitySchema.parse(expected)))fail('EXPECTED_IDENTITY_MISMATCH')
 // Canonical validation also rejects non-JSON nested values hidden in records.
 canonicalHash(parsed)
 return retainImmutableCanonicalValue(parsed) as unknown as CognitiveProfileArtifact
}

/** T1 after entry services validate actual published/approved M/config source.
 * Uses the existing profile resolver and protocol, without generating a trial,
 * attempt, random seed, issuer, recipient or grant. */
export function buildCognitiveProfileArtifact<TConfig,TTrial>(input:{
 config:{id:string;configVersion:string;testType:string;engineVersion:string;scoringVersion:string;config:unknown}
 measurement:CognitiveProfileIdentity['measurement'];profile:CognitiveProfile;entry:RegistryEntry<TConfig,TTrial>
}):CognitiveProfileArtifact{
 const {config,entry}=input
 if(config.testType!==entry.testType||config.engineVersion!==entry.engineVersion||config.scoringVersion!==entry.scoringVersion)
  fail('REGISTRY_IDENTITY_MISMATCH')
 const definition=buildCognitiveV2TaskDefinition(entry as unknown as RegistryEntry<unknown,unknown>)
 assertTaskContractValid(definition)
 const freeze=freezeAssignmentProfile({entry,baseConfig:config.config,profile:input.profile})
 const resolvedReport=readFrozenReport(freeze.resolvedReportSnapshotEncrypted)
 if(!resolvedReport)fail('REPORT_MISSING')
 const identity=identitySchema.parse({kind:'COGNITIVE_PROFILE',testType:config.testType,configId:config.id,configVersion:config.configVersion,
  engineVersion:config.engineVersion,scoringVersion:config.scoringVersion,measurement:input.measurement,profile:freeze.profile,
  profileDefinitionVersion:freeze.profileDefinitionVersion,resolvedConfigHash:freeze.resolvedConfigHash,
  protocolSignature:computeProtocolSignature(definition.protocol),metricDefinitionVersion:resolvedReport.metricDefinitionVersion,
  qualityDefinitionVersion:resolvedReport.qualityDefinitionVersion,reportDefinitionVersion:resolvedReport.reportDefinitionVersion,
  reportHash:canonicalHash(resolvedReport),presentationVersion:resolvedReport.presentationVersion??null})
 return readCognitiveProfileArtifact(JSON.parse(JSON.stringify({schemaVersion:1,identity,
  resolvedConfig:freeze.resolvedConfig,protocol:definition.protocol,resolvedReport})))
}

/** The content-address includes the explicit storage kind. Different recipients
 * share this definition, while their T1 authorization/binding stays outside it. */
export function cognitiveProfileArtifactHash(raw:unknown){
 const value=readCognitiveProfileArtifact(raw)
 return canonicalHash({storageVersion:1,kind:COGNITIVE_PROFILE_TEMPLATE_KIND,value})
}
export async function saveCognitiveProfileArtifact(raw:unknown,store:PublicTemplateStore=publicTemplates){
 const value=readCognitiveProfileArtifact(raw),expected=cognitiveProfileArtifactHash(value)
 const [hash]=await store.saveMany([{kind:COGNITIVE_PROFILE_TEMPLATE_KIND,value}])
 if(hash!==expected)fail('STORAGE_IDENTITY_MISMATCH')
 return {artifactHash:hash,identity:value.identity}
}
export async function loadCognitiveProfileArtifact(hash:string,expected:CognitiveProfileIdentity,store:PublicTemplateStore=publicTemplates){
 const [raw]=await store.loadMany([{kind:COGNITIVE_PROFILE_TEMPLATE_KIND,hash}])
 const value=readCognitiveProfileArtifact(raw,expected)
 if(cognitiveProfileArtifactHash(value)!==hash)fail('STORAGE_IDENTITY_MISMATCH')
 return value
}
