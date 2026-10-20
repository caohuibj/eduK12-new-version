import { prisma } from '../../config/database'
import { parseCatalogFilters, sqlLike } from './filters'

export async function courseCatalogPage(courseId: string, actor: {userId:string;role:string}, raw: unknown) {
  const f=parseCatalogFilters(raw)
  if(f.dateField!=='created') throw Object.assign(new Error('测评仅支持创建时间'),{statusCode:400})
  // Each source is course-bound before unioning. Count/rows never read responses.
  const union=`
    SELECT q.id,q.name,left(q.description,240) AS description,q.tags,q.created_at AS created,'LEGACY_QUESTIONNAIRE' AS kind,q.creator_id AS owner,q.status::text
    FROM questionnaires q WHERE q.type='COURSE' AND q.status='PUBLISHED' AND q.visibility IN ('PUBLIC','COURSE') AND EXISTS(SELECT 1 FROM course_questionnaires d WHERE d.questionnaire_id=q.id AND d.course_id=$1)
    UNION ALL
    SELECT c.id,c.name,left(c.description,240),c.tags,c.created_at,c.product_kind,c.created_by,c.status::text FROM composite_assessments c
    WHERE (c.status='PUBLISHED' AND ((c.product_kind='QUESTIONNAIRE' AND c.questionnaire_type='COURSE' AND EXISTS(SELECT 1 FROM questionnaire_course_deliveries d WHERE d.composite_id=c.id AND d.course_id=$1)) OR (c.product_kind IN ('LEGACY_COMPOSITE','ASSESSMENT_BUNDLE') AND c.course_id=$1)))
      OR ($4::boolean AND c.product_kind='QUESTIONNAIRE' AND c.questionnaire_type='COURSE' AND c.status IN ('DRAFT','ARCHIVED') AND ($3::boolean OR c.created_by=$2) AND EXISTS(SELECT 1 FROM questionnaire_course_deliveries d WHERE d.composite_id=c.id AND d.course_id=$1))
    UNION ALL
    SELECT s.id,s.name,left(s.description,240),s.tags,s.created_at,'SCALE',s.creator_id,s.status::text FROM scales s
    WHERE s.status='PUBLISHED' AND s.visibility IN ('PUBLIC','COURSE') AND EXISTS(SELECT 1 FROM course_scales d WHERE d.scale_id=s.id AND d.course_id=$1)
    UNION ALL
    SELECT a.id,a.title,left(a.instruction,240),a.tags,a.created_at,'COGNITIVE',a.created_by,a.status::text FROM cognitive_assignments a WHERE a.course_id=$1 AND a.status='PUBLISHED' AND a.listed_standalone=true`
  const filter='LOWER(name) LIKE $5 AND ($6::timestamp IS NULL OR created >= $6::timestamp) AND ($7::timestamp IS NULL OR created < $7::timestamp) AND tags @> $8::text[]'
  const values=[courseId,actor.userId,actor.role==='ADMIN',(raw as any)?.includeManaged==='true',sqlLike(f.search),f.from??null,f.to??null,f.tags]
  const [rows,counts]=await prisma.$transaction([
    prisma.$queryRawUnsafe<any[]>(`SELECT * FROM (${union}) q WHERE ${filter} ORDER BY created DESC,id DESC,kind LIMIT $9 OFFSET $10`,...values,f.pageSize,(f.page-1)*f.pageSize),
    prisma.$queryRawUnsafe<{total:bigint}[]>(`SELECT COUNT(*) AS total FROM (${union}) q WHERE ${filter}`,...values),
  ])
  const labels:Record<string,string>={LEGACY_QUESTIONNAIRE:'课程问卷',QUESTIONNAIRE:'课程问卷',LEGACY_COMPOSITE:'组合测评',ASSESSMENT_BUNDLE:'固定测评包',SCALE:'课程量表',COGNITIVE:'认知测评'}
  const paths:Record<string,string>={LEGACY_QUESTIONNAIRE:'/questionnaires/',QUESTIONNAIRE:'/questionnaire-products/',LEGACY_COMPOSITE:'/composite-assessments/',ASSESSMENT_BUNDLE:'/bundle-products/',SCALE:'/scales/',COGNITIVE:'/cognitive-assignments/'}
  return {list:rows.map(row=>({id:row.id,key:row.kind+':'+row.id,kind:row.kind,name:row.name,description:row.description,status:row.status,tags:row.tags,created:row.created,typeLabel:labels[row.kind],unitCount:null,unitLabel:null,
    manageHref:actor.role==='ADMIN'||row.owner===actor.userId?paths[row.kind]+encodeURIComponent(row.id):null})),total:Number(counts[0].total),page:f.page,pageSize:f.pageSize}
}
