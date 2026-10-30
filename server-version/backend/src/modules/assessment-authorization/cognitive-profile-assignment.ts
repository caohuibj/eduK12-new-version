import {canonicalHash} from '../assessment-runtime/canonical'
import {compactAssessmentStorageEnabled} from '../assessment-runtime/compact-field-codec'
import {encryptCognitivePayload,encryptCompactCognitivePayload,decryptCognitivePayload} from '../cognitive/cognitive.security'
import {readFrozenReport} from '../cognitive/profile-freeze'
import {AdminPermissionError} from '../admin-permissions/service'
import type {CognitiveProfileArtifact} from './cognitive-profile-artifact'

/** Copy the already approved closure into existing assignment freeze fields.
 * It does not merge a live profile or create an attempt/random seed. */
export function cognitiveProfileAssignmentFreeze(artifact:CognitiveProfileArtifact){
 if(artifact.schemaVersion!==2||!artifact.execution)throw new AdminPermissionError(409,'该精确配置缺少冻结执行定义')
 return {profile:artifact.identity.profile,profileDefinitionVersion:artifact.identity.profileDefinitionVersion,
  resolvedConfigHash:artifact.identity.resolvedConfigHash,resolvedConfigSnapshotEncrypted:encryptCognitivePayload(artifact.resolvedConfig),
  resolvedReportSnapshotEncrypted:compactAssessmentStorageEnabled()?encryptCompactCognitivePayload(artifact.resolvedReport):encryptCognitivePayload(artifact.resolvedReport)}
}
export function assertCognitiveAssignmentFreeze(assignment:{profile:string|null;profileDefinitionVersion:string|null;resolvedConfigHash:string|null;
 resolvedConfigSnapshotEncrypted:string|null;resolvedReportSnapshotEncrypted:string|null},artifact:CognitiveProfileArtifact){
 if(assignment.profile!==artifact.identity.profile||assignment.profileDefinitionVersion!==artifact.identity.profileDefinitionVersion
  ||assignment.resolvedConfigHash!==artifact.identity.resolvedConfigHash||!assignment.resolvedConfigSnapshotEncrypted||!assignment.resolvedReportSnapshotEncrypted
  ||canonicalHash(decryptCognitivePayload(assignment.resolvedConfigSnapshotEncrypted))!==canonicalHash(artifact.resolvedConfig)
  ||canonicalHash(readFrozenReport(assignment.resolvedReportSnapshotEncrypted))!==artifact.identity.reportHash)
  throw new AdminPermissionError(409,'任务的原精确 profile 冻结内容不一致')
}
