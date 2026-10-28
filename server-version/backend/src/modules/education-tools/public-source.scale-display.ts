import type {ScaleDefinitionV2} from '../scale/scale-definition'
import {Prisma} from '@prisma/client'

const fields=['itemCode','content','type','required','sortOrder','responseSetKey','images','materials','video'] as const

/** Same display-only shape as the selected public Scale preview. Explicit
 * allowlists protect the alternate whole-questionnaire serializer as well;
 * scorer, references, report and option scores remain internal. */
export function educationPublicScaleDisplay(definition:ScaleDefinitionV2){
 return {items:definition.items.map(item=>Object.fromEntries(fields.filter(field=>Object.prototype.hasOwnProperty.call(item,field))
  .map(field=>[field,(item as Record<string,unknown>)[field]]))),
  responseSets:definition.responseSets.map(set=>({key:set.key,options:set.options.map(option=>({value:option.value,label:option.label}))}))}
}

/** Database projection of the same allowlist; selected previews do not fetch
 * scorer/reference/report bodies just to discard them in the HTTP serializer. */
export const educationPublicScaleDisplaySql=(definition:Prisma.Sql)=>Prisma.sql`jsonb_build_object(
 'items',(SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(${Prisma.join(fields.flatMap(field=>[Prisma.sql`${field}::text`,Prisma.sql`q->${field}::text`]))})) ORDER BY ordinal)
  FROM jsonb_array_elements((${definition})->'items') WITH ORDINALITY questions(q,ordinal)),
 'responseSets',(SELECT jsonb_agg(jsonb_build_object('key',rs->>'key','options',
  (SELECT jsonb_agg(jsonb_build_object('value',opt->'value','label',opt->>'label') ORDER BY ordinal)
   FROM jsonb_array_elements(rs->'options') WITH ORDINALITY options(opt,ordinal)))) FROM jsonb_array_elements((${definition})->'responseSets') rs))`
