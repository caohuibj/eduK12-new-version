import {Prisma} from '@prisma/client'
export const ownedScope=(userId:string)=>Prisma.sql`a.owner_id=${userId} AND a.access_scope='PRIVATE' AND (
  EXISTS(SELECT 1 FROM asset_references r WHERE r.asset_id=a.id AND r.entity_type='SurveyResearcherMedia' AND r.entity_id=${userId} AND r.field='library')
  OR EXISTS(SELECT 1 FROM survey_projects p WHERE p.owner_user_id=${userId} AND p.status IN ('DRAFT','ACTIVE') AND
    (a.scope_id=p.id OR EXISTS(SELECT 1 FROM asset_references r WHERE r.asset_id=a.id AND r.entity_type='SurveyProject' AND r.entity_id=p.id)))
  OR EXISTS(SELECT 1 FROM survey_tool_templates t WHERE t.owner_user_id=${userId} AND t.status='DRAFT' AND
    (a.scope_id=t.id OR EXISTS(SELECT 1 FROM asset_references r WHERE r.asset_id=a.id AND r.entity_type='SurveyToolTemplate' AND r.entity_id=t.id))))`
