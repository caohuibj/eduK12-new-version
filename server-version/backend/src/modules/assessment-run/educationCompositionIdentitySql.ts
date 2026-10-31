import {Prisma} from '@prisma/client'
/** Actual frozen track -> immutable sealed source, never a namespace-only
 * exemption or a client receipt. Actor/task authority remains with the caller. */
export function educationCompositionTrackIdentitySql(input:{track:Prisma.Sql;organizationId:Prisma.Sql;product:'TEACHER'|'SCHOOL'}){
 const t=input.track
 return Prisma.sql`(${t}.resource_family='BUNDLE' AND ${t}.resource_version='1.0.0' AND EXISTS(
  SELECT 1 FROM composite_assessments c JOIN education_private_tool_versions v
   ON c.creation_key='education-composition:'||v.entry||':'||v.id||':'||(v.definition#>>'{administration,population}')||':'||(v.definition#>>'{administration,responseMode}')||':1.0.0'
  WHERE c.creation_key=${t}.resource_key AND v.kind='COMPOSITION' AND v.entry=${input.product}
   AND v.organization_id=${input.organizationId} AND c.created_by=v.owner_user_id
   AND c.product_kind='ORGANIZATION_RESOURCE' AND c.status='PUBLISHED' AND c.published_at IS NOT NULL
   AND NOT c.public_enabled AND NOT c.copyable
   AND ${t}.frozen_resource_policy#>>'{runtimeLaunchTarget,kind}'='COMPOSITE'
   AND ${t}.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'=c.id
   AND ${t}.frozen_resource_policy#>>'{educationComposition,manifestHash}'=c.training_content_snapshot_hash
   AND ${t}.frozen_resource_policy#>'{educationComposition,origin}'=c.training_content_snapshot#>'{educationBinding,origin}'))`
}
