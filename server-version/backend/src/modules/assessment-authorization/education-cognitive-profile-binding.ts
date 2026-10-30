import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {selectedConfigurationPointerSchema} from './standard-configuration-binding'
import {loadCognitiveProfileArtifact} from './cognitive-profile-artifact'
import {assertCognitiveAssignmentFreeze} from './cognitive-profile-assignment'
const pin=z.object({schemaVersion:z.literal(1),product:z.enum(['SCHOOL','TEACHER']),organizationId:z.string().guid(),configId:z.string().guid(),
 artifactHash:z.string().regex(/^[a-f0-9]{64}$/),selectedBinding:selectedConfigurationPointerSchema}).strict()
export function readEducationCognitiveProfilePin(courseSnapshot:unknown){
 const raw=courseSnapshot&&typeof courseSnapshot==='object'&&!Array.isArray(courseSnapshot)?(courseSnapshot as Record<string,unknown>).selectedEducationCognitiveProfile:undefined
 return raw===undefined?null:pin.parse(raw)
}
/** Frozen identity reader only. The formal parent/source admission separately
 * checks author, organization, current original use, delegation and entry. */
export async function readEducationCognitiveAssignmentArtifact(assignment:{configId:string;courseSnapshot?:unknown;profile:string|null;profileDefinitionVersion:string|null;resolvedConfigHash:string|null;resolvedConfigSnapshotEncrypted:string|null;resolvedReportSnapshotEncrypted:string|null}){
 const selected=readEducationCognitiveProfilePin(assignment.courseSnapshot);if(!selected)return null
 const artifact=await loadCognitiveProfileArtifact(selected.artifactHash,undefined)
 if(artifact.schemaVersion!==2||artifact.identity.configId!==assignment.configId||selected.configId!==assignment.configId||canonicalHash(artifact.identity)!==selected.selectedBinding.configurationHash)throw Error('EDUCATION_COGNITIVE_PROFILE_IDENTITY')
 assertCognitiveAssignmentFreeze(assignment,artifact)
 return {artifact}
}
