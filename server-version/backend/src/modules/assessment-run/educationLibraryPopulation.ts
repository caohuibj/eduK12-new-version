import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {fail} from '../scale-library-governance/contracts'

type Scope={organizationId:string;runId:string}
type Pair={subject:{membershipId:string|null};respondent:{membershipId:string|null};relationshipKind:string;facts:Record<string,string|boolean|null>}
const admissionSelection=(scope:Scope)=>Prisma.sql`SELECT ca.class_unit_id AS id FROM campus_class_admissions ca
 WHERE ca.organization_id=${scope.organizationId} AND EXISTS(
 SELECT 1 FROM campus_activity_runs ar JOIN campus_activity_participants p
   ON p.organization_id=ar.organization_id AND p.course_id=ar.course_id AND p.status='ACTIVE'
 JOIN organization_memberships m ON m.id=p.membership_id AND m.organization_id=p.organization_id
 JOIN campus_student_enrollments e ON e.user_id=m.user_id AND e.organization_id=m.organization_id
 WHERE ar.organization_id=${scope.organizationId} AND ar.run_id=${scope.runId} AND e.class_unit_id=ca.class_unit_id)
 ORDER BY ca.class_unit_id`
/** Admission writers take admission before creating membership / touching user.
 * Lock only the activity's selected classes, BEFORE issuer and org locks.
 */
export async function prelockEducationLibraryAdmissions(tx:Prisma.TransactionClient,scope:Scope){
 const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`${admissionSelection(scope)} FOR SHARE OF ca`)
 return rows.map(row=>row.id)
}
export async function assertEducationLibraryAdmissionsUnchanged(tx:Prisma.TransactionClient,scope:Scope,expected:string[]){
 const rows=await tx.$queryRaw<Array<{id:string}>>(admissionSelection(scope))
 if(canonicalHash(rows.map(row=>row.id))!==canonicalHash(expected))fail('RUN_POPULATION_CHANGED_RETRY',409)
}
/** Only actual supported relationships are admitted; an approved tool may retain
 * broader content applicability without pretending every workflow is wired.
 */
export function assertEducationLibraryPopulationSupport(tracks:Array<{requestedPolicy:{relationshipKinds:readonly string[];subjectRoles?:readonly string[];targetPolicy?:{mode:string}|null}}>) {
 if(tracks.some(track=>track.requestedPolicy.relationshipKinds.some(kind=>!['SELF','CLASS_TEACHER_STUDENT','PARENT_CHILD'].includes(kind))
  ||track.requestedPolicy.targetPolicy?.mode==='COURSE_TEACHER'
  ||track.requestedPolicy.relationshipKinds.includes('SELF')&&track.requestedPolicy.subjectRoles?.includes('PARENT'))) 
   fail('EDUCATION_LIBRARY_RELATIONSHIP_RUNTIME_NOT_READY',409)
}
/** After org/workflow locks, lock the selected structural facts in stable table
 * and ID order. No user locks, no whole-school relation locks. The caller MUST
 * resolve the full track set again and compare before freezing any execution.
 */
export async function lockEducationLibraryPopulationFacts(tx:Prisma.TransactionClient,input:{organizationId:string;pairs:Pair[];labelIds:string[];additionalMemberIds?:string[]}){
 const members=[...new Set([...input.pairs.flatMap(pair=>[pair.subject.membershipId,pair.respondent.membershipId]),...(input.additionalMemberIds??[])].filter((id):id is string=>!!id))].sort()
 const parents=[...new Set(input.pairs.map(pair=>pair.facts.parentStudentRelationshipId).filter((id):id is string=>typeof id==='string'))].sort()
 const labels=[...new Set(input.labelIds)].sort()
 if(labels.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM organization_labels WHERE organization_id=${input.organizationId} AND id IN (${Prisma.join(labels)}) ORDER BY id FOR SHARE`)
 for(const table of ['organization_label_assignments','organization_staff_class_assignments','organization_student_class_assignments']){
  if(!members.length||table==='organization_label_assignments'&&!labels.length)continue
  await tx.$queryRaw(Prisma.sql`SELECT id FROM ${Prisma.raw(table)} WHERE organization_id=${input.organizationId}
    AND membership_id IN (${Prisma.join(members)}) AND valid_from<=statement_timestamp()
    AND (valid_until IS NULL OR valid_until>statement_timestamp())
    ${table==='organization_label_assignments'?Prisma.sql`AND label_id IN (${Prisma.join(labels)})`:Prisma.empty}
    ORDER BY id FOR SHARE`)
 }
 if(parents.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM parent_student_relationships WHERE id IN (${Prisma.join(parents)}) ORDER BY id FOR SHARE`)
}
