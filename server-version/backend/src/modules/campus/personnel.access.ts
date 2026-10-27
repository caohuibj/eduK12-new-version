import {Prisma} from '@prisma/client'
import {loadCurrentPrincipal} from '../organization/principal'
import {resolveOrganizationAccessContext} from '../organization/access'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {resolveEducationToolAuthoringContext} from '../education-tools/access'
import {inactiveAccountMessage} from '../../utils/accountStatus'
import {assertPersonnelGovernor} from './personnel.binding'
import {CampusAdmissionError} from './admission.error'

type Tx=Prisma.TransactionClient
type Period={from:Date;until:Date|null}
type Grant=Period&{kind:'PERSONA'|'CAPABILITY'|'PRODUCT_ADMIN';code:string;product:string|null;revokedAt:Date|null;membershipCurrent:boolean}
type Assignment=Period&{kind:'STAFF'|'STUDENT';role:string;grade:string|null;className:string;current:boolean}

/** Called only after directory visibility and the exact subject have been resolved
 * in the same repeatable-read transaction. An expected account is never a subject.
 * Grants below are provenance, not permits. Only canonical resolvers decide access.
 */
export async function readPersonnelAccess(tx:Tx,input:{organizationId:string;userId:string|null}){
 const org=input.organizationId,id=input.userId
 if(!id)return {state:'PENDING_ACTIVATION' as const,products:[],functions:[],memberships:[],grants:[],assignments:[],denies:[],professionalScope:{current:0,ended:0},truncated:false}
 const principal=await loadCurrentPrincipal(id,tx)
 if(!principal||principal.accountDomain!=='SCHOOL')return {state:'ACCOUNT_UNAVAILABLE' as const,products:[],functions:[],memberships:[],grants:[],assignments:[],denies:[],professionalScope:{current:0,ended:0},truncated:false}
 const usable=!inactiveAccountMessage(principal)&&!principal.mustChangePassword
 const [context,school,teacher,schoolAuthor,teacherAuthor,grants,memberships,assignments,denies,professional]=await Promise.all([
  resolveOrganizationAccessContext({principal,organizationId:org},tx),
  resolveEducationProductMemberScope({actorUserId:id,organizationId:org,product:'HUISCHOOL'},tx),
  resolveEducationProductMemberScope({actorUserId:id,organizationId:org,product:'HUITEACHER'},tx),
  resolveEducationToolAuthoringContext({principal,organizationId:org,entry:'SCHOOL'},tx),
  resolveEducationToolAuthoringContext({principal,organizationId:org,entry:'TEACHER'},tx),
  tx.$queryRaw<Grant[]>`
   SELECT g.kind,g.code,g.product,g.started AS "from",m.valid_until AS until,g.revoked_at AS "revokedAt",
     (m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())) AS "membershipCurrent"
   FROM (
    SELECT membership_id,organization_id,'PERSONA' AS kind,persona AS code,NULL::text AS product,granted_at AS started,revoked_at FROM organization_persona_grants
    UNION ALL SELECT membership_id,organization_id,'CAPABILITY',capability,NULL::text,granted_at,revoked_at FROM organization_capability_grants
    UNION ALL SELECT membership_id,organization_id,'PRODUCT_ADMIN',role,product,granted_at,revoked_at FROM education_product_role_grants
   ) g JOIN organization_memberships m ON m.id=g.membership_id AND m.organization_id=g.organization_id
   WHERE g.organization_id=${org} AND m.user_id=${id}
   ORDER BY g.started DESC,g.kind,g.code,g.product LIMIT 31`,
  tx.$queryRaw<Array<Period&{orgRole:string;current:boolean}>>`
   SELECT org_role AS "orgRole",valid_from AS "from",valid_until AS until,
    (valid_from<=statement_timestamp() AND (valid_until IS NULL OR valid_until>statement_timestamp())) AS current
   FROM organization_memberships WHERE organization_id=${org} AND user_id=${id}
   ORDER BY valid_from DESC,id LIMIT 11`,
  tx.$queryRaw<Assignment[]>`
   SELECT a.kind,a.role,grade.name AS grade,unit.name AS "className",a.valid_from AS "from",a.valid_until AS until,
    (a.valid_from<=statement_timestamp() AND (a.valid_until IS NULL OR a.valid_until>statement_timestamp())
     AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())) AS current
   FROM (
    SELECT organization_id,membership_id,class_unit_id,staff_role AS role,'STAFF' AS kind,valid_from,valid_until FROM organization_staff_class_assignments
    UNION ALL SELECT organization_id,membership_id,class_unit_id,'STUDENT','STUDENT',valid_from,valid_until FROM organization_student_class_assignments
   ) a JOIN organization_memberships m ON m.id=a.membership_id AND m.organization_id=a.organization_id
   JOIN organization_units unit ON unit.id=a.class_unit_id AND unit.organization_id=a.organization_id
   LEFT JOIN organization_units grade ON grade.id=unit.parent_unit_id AND grade.organization_id=unit.organization_id
   WHERE a.organization_id=${org} AND m.user_id=${id}
   ORDER BY a.valid_from DESC,a.kind,a.role,unit.name LIMIT 31`,
  tx.$queryRaw<Array<{permission:string;from:Date;liftedAt:Date|null}>>`
   SELECT permission,denied_at AS "from",lifted_at AS "liftedAt" FROM organization_access_denies
   WHERE organization_id=${org} AND user_id=${id} ORDER BY denied_at DESC,id LIMIT 21`,
  tx.$queryRaw<Array<{current:number;ended:number}>>`
   SELECT count(*) FILTER(WHERE r.valid_from<=statement_timestamp()
    AND (r.valid_until IS NULL OR r.valid_until>statement_timestamp()))::int AS current,
    count(*) FILTER(WHERE r.valid_until<=statement_timestamp())::int AS ended
   FROM organization_counselor_client_relationships r
   JOIN organization_memberships counselor ON counselor.id=r.counselor_membership_id AND counselor.organization_id=r.organization_id
   JOIN organization_memberships client ON client.id=r.client_membership_id AND client.organization_id=r.organization_id
   WHERE r.organization_id=${org} AND (counselor.user_id=${id} OR client.user_id=${id})`,
 ])
 let governor=false
 if(usable)try{await assertPersonnelGovernor(tx,principal,org);governor=true}
 catch(error){if(!(error instanceof CampusAdmissionError))throw error}
 const schoolAvailable=usable&&!!school&&!!context&&context.organizationStatus==='ACTIVE'
 return {
  state:usable?'READY' as const:'ACCOUNT_UNAVAILABLE' as const,
  products:[{product:'HUISCHOOL',member:schoolAvailable},
   {product:'HUITEACHER',member:usable&&!!teacher}],
  functions:[{key:'SCHOOL_GOVERNANCE',available:governor},{key:'SCHOOL_AUTHOR',available:usable&&!!schoolAuthor},
   {key:'TEACHER_ADMIN',available:usable&&!!teacher?.productAdmin},{key:'TEACHER_AUTHOR',available:usable&&!!teacherAuthor}],
  memberships:memberships.slice(0,10),grants:grants.slice(0,30),assignments:assignments.slice(0,30),denies:denies.slice(0,20),
  professionalScope:professional[0]??{current:0,ended:0},
  truncated:memberships.length>10||grants.length>30||assignments.length>30||denies.length>20,
 }
}
