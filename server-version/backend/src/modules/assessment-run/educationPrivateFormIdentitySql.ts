import {Prisma} from '@prisma/client'
/** Structural current-tenant source fence, not actor authority. Full canonical
 * version/section/policy identity is checked by the dedicated execution loader. */
export function privateFormTrackIdentitySql(input:{track:Prisma.Sql;organizationId:Prisma.Sql;product:'SCHOOL'|'TEACHER'}){
 const t=input.track
 return Prisma.sql`(${t}.resource_family='FORM' AND ${t}.resource_version='1.0.0'
  AND EXISTS(SELECT 1 FROM education_private_tool_versions v JOIN composite_assessments c
   ON c.creation_key=${t}.resource_key
   WHERE v.entry=${input.product} AND v.kind='FORM' AND v.organization_id=${input.organizationId}
    AND ${t}.resource_key IN (${Prisma.join((input.product==='SCHOOL'?['STUDENT:SELF','STUDENT:PARENT_REPORT','STUDENT:TEACHER_REPORT']:['TEACHER:SELF'])
     .map(variant=>Prisma.sql`'private-form:'||${input.product}||':'||v.id||':'||${variant}`))})
    AND c.code='education-'||${t}.resource_key AND c.created_by=v.owner_user_id
    AND c.product_kind='ORGANIZATION_RESOURCE' AND c.status='PUBLISHED' AND c.creation_hash IS NOT NULL
    AND NOT c.public_enabled AND NOT c.copyable
    AND ${t}.frozen_resource_policy->'runtimeLaunchTarget'->>'kind'='COMPOSITE'
    AND ${t}.frozen_resource_policy->'runtimeLaunchTarget'->>'ref'=c.id))`
}
