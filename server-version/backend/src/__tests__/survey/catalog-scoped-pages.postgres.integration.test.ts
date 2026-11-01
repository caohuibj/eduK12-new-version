import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {Prisma,PrismaClient,UserRole} from '@prisma/client'

vi.mock('../../config/database',()=>({prisma:{materialGrant:{findMany:async()=>[{resourceId:'granted'}]}}}))
vi.mock('../../config',()=>({config:{materialGrantsEnabled:true}}))
vi.mock('../../modules/scale-library-governance/readers',()=>({libraryReadableScaleIds:async()=>({systemAdmin:false,ids:['library-visible']})}))
vi.mock('../../modules/scale-library-governance/usage',()=>({assertLibraryUseGrantCurrent:vi.fn()}))
import {scaleWhereForViewer} from '../../services/materialGrant'
import {discoveryJoin,discoveryPageSql,importedStandardDiscoveryRecords,standardDiscoveryMetadataJoin} from '../../modules/survey/catalog-discovery'
import {catalogTagFacets,type CatalogClassificationTag} from '../../modules/scale/library/catalog-discovery'

let db:PrismaClient
beforeAll(async()=>{
 const url=process.env.LIBRARY_DISCOVERY_TEST_DATABASE_URL
 if(!url||!/^postgres(?:ql)?:\/\/postgres@127\.0\.0\.1:\d+\/postgres(?:\?|$)/.test(url))throw Error('Task-owned PostgreSQL fixture required')
 db=new PrismaClient({datasources:{db:{url}}});await db.$connect()
})
afterAll(async()=>{await db?.$disconnect()})
const none={kind:Prisma.sql`NULL`,key:Prisma.sql`NULL`,version:Prisma.sql`NULL`,engine:Prisma.sql`NULL`,scoring:Prisma.sql`NULL`}

describe('source-scoped metadata pages',()=>{
 it('keeps later-page Form/SJT/Bundle options before cursor and filters, without another organization tags',async()=>{
  await db.$transaction(async tx=>{
   await tx.$executeRaw`CREATE TEMP TABLE scoped_tags(id text,organization text,tags jsonb) ON COMMIT DROP`
   await tx.$executeRaw`INSERT INTO scoped_tags SELECT lpad(i::text,2,'0'),'ours',CASE i WHEN 31 THEN '["domain:new_form"]'::jsonb WHEN 32 THEN '["sjt-construct:协作决策"]'::jsonb WHEN 33 THEN '["age:18-","respondent:SELF"]'::jsonb ELSE '[]'::jsonb END FROM generate_series(1,40) i`
   await tx.$executeRaw`INSERT INTO scoped_tags VALUES('00','other','["domain:hidden"]'::jsonb)`
   const read=async(tags:string[]=[],cursor='')=>{
    const [page]=await tx.$queryRaw<Array<{list:Array<{id:string;classificationTags:CatalogClassificationTag[]}>;facetTags:CatalogClassificationTag[]}>>(discoveryPageSql({
     source:Prisma.sql`SELECT s.id,discovery.tags AS "classificationTags",discovery.ids,discovery.terms FROM scoped_tags s ${discoveryJoin([],none,Prisma.sql`s.tags`)} WHERE organization='ours'`,
     filters:{tags},text:[Prisma.sql`v.id`],condition:Prisma.sql`v.id>${cursor}`,order:Prisma.sql`v.id`,limit:20,
    }))
    return page
   }
   const first=await read(),later=await read([],'35')
   expect(first.list).toHaveLength(20);expect(later.list).toHaveLength(5)
   expect(first.list.some(row=>row.id==='31')).toBe(false)
   expect(catalogTagFacets([later.facetTags])).toEqual(catalogTagFacets([first.facetTags]))
   expect(catalogTagFacets([first.facetTags])).toMatchObject({domain:[{id:'domain:new_form'}],construct:[{id:'sjt-construct:协作决策'}],population:expect.arrayContaining([{id:'age:18-',label:'18岁及以上'},{id:'respondent:SELF',label:'本人自评'}])})
   expect(first.facetTags.some(tag=>tag.id==='domain:hidden')).toBe(false)
   expect((await read(['sjt-construct:协作决策'])).list.map(row=>row.id)).toEqual(['32'])
   expect((await read(['unknown'])).list).toEqual([])
  })
 })
 it('reads imported C only for exact requested identities and keeps absent/future versions unclassified',async()=>{
  await db.$transaction(async tx=>{
   await tx.$executeRaw`CREATE TEMP TABLE survey_standard_releases(id text,tool_key text,snapshot jsonb,created_at timestamptz) ON COMMIT DROP`
   const snapshot={title:'Source-owned imported C',instrumentVersion:'1.0.0',definition:{versionAxes:{locale:'zh-CN'}},parts:{CONTENT:{reference:{metadata:{databaseSource:{kind:'DB_IMPORTED'},catalog:{construct:{primaryDomain:'UNREGISTERED_PRIMARY',constructOverlapTags:['domain:new_import']},population:{respondentTypes:['SELF'],minAge:18,gradeRange:{minGrade:1,maxGrade:12}}}}}}}}
   await tx.$executeRaw`INSERT INTO survey_standard_releases VALUES('selected','selected',${JSON.stringify(snapshot)}::jsonb,now()),('unrelated','private',${JSON.stringify({...snapshot,title:'Unrelated'})}::jsonb,now())`
   const empty={$queryRaw:vi.fn()};expect(await importedStandardDiscoveryRecords(empty,[])).toEqual([]);expect(empty.$queryRaw).not.toHaveBeenCalled()
   expect((await importedStandardDiscoveryRecords(tx,[{key:'selected',version:'1.0.0'}])).map(row=>row.key)).toEqual(['selected'])
   const rows=await tx.$queryRaw<Array<{version:string;tags:CatalogClassificationTag[]}>>(Prisma.sql`
    SELECT candidate.version,discovery.tags FROM (VALUES('selected','1.0.0'),('selected','99.0.0')) candidate(key,version)
    ${standardDiscoveryMetadataJoin(Prisma.sql`candidate.key`,Prisma.sql`candidate.version`)}
    ${discoveryJoin([],{...none,kind:Prisma.sql`'SCALE'`,key:Prisma.sql`candidate.key`,version:Prisma.sql`candidate.version`,metadata:Prisma.sql`imported_discovery_source.metadata`,locale:Prisma.sql`imported_discovery_source.locale`})} ORDER BY candidate.version`)
   expect(rows[0].tags).toEqual(expect.arrayContaining([{id:'UNREGISTERED_PRIMARY',label:'UNREGISTERED_PRIMARY',facet:'domain'},{id:'language:zh-CN',label:'简体中文',facet:'language'},{id:'grades:1-12',label:'1–12年级',facet:'population'},{id:'age:18-',label:'18岁及以上',facet:'population'}]))
   expect(rows[1].tags).toEqual([])
  })
 })
 it('preserves the original teacher/admin Scale visibility while matching before paging',async()=>{
  await db.$transaction(async tx=>{
   await tx.$executeRaw`CREATE TEMP TABLE viewer_scales(id text,creator_id text,status text,library_entry_id text,tags jsonb) ON COMMIT DROP`
   await tx.$executeRaw`INSERT INTO viewer_scales VALUES('own','actor','DRAFT',NULL,'[]'),('granted','other','PUBLISHED',NULL,'["domain:new_form"]'),('library-visible','other','PUBLISHED','entry-a','[]'),('library-hidden','actor','PUBLISHED','entry-b','["domain:hidden"]'),('ungranted','other','PUBLISHED',NULL,'[]')`
   const read=async(role:UserRole)=>tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT s.id FROM viewer_scales s WHERE ${await scaleWhereForViewer('actor',role,{},'sql')} ORDER BY s.id`)
   expect((await read(UserRole.TEACHER)).map(row=>row.id)).toEqual(['granted','library-visible','own'])
   expect((await read(UserRole.ADMIN)).map(row=>row.id)).toEqual(['granted','library-visible','own','ungranted'])
   expect(await scaleWhereForViewer('actor',UserRole.TEACHER)).toMatchObject({OR:[{creatorId:'actor',libraryEntryId:null},{id:{in:['granted']},status:'PUBLISHED',libraryEntryId:null},{id:{in:['library-visible']},status:'PUBLISHED'}]})
  })
 })
})
