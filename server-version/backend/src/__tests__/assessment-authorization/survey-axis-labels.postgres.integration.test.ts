import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_AXIS_LABELS==='1'?describe:describe.skip
suite('Survey axis discovery labels outside immutable source/grant identity',()=>{
 let db:any,manager:any,service:any;const result:any={productionAccessed:false,scope:'Existing authenticated manager sourceCatalog, display labels only; no grant/task write, no old content/participant replay'}
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit retained Survey fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='55439'||new URL(url).pathname!=='/precise_survey_standard_use_test_20261029')throw Error('Named local Survey database required')
  db=(await import('../../config/database')).prisma
  const [counts]=await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`
  if(await db.user.count()!==11||counts.n!==5||await db.surveyPublication.count()!==3)throw Error('Inspect retained outcomes before running')
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-survey-manager-'}}})
  service=await import('../../modules/survey/catalog.service')
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_SURVEY_AXIS_LABELS_EVIDENCE??'/tmp/survey-axis-labels.json',JSON.stringify(result,null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('labels only the original exact combination in one batched header query and preserves every source/grant/publication field',async()=>{
  const original=await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`
  const rows=await db.$queryRaw`SELECT * FROM survey_tool_grants ORDER BY id`,publications=await db.surveyPublication.findMany({orderBy:{id:'asc'}})
  const queries:string[]=[];db.$on('query',(event:{query:string})=>{queries.push(event.query)})
  const page=await service.sourceCatalog(manager.id,{kind:'SCALE',page:1})
  const catalogQueryCount=queries.length
  const headers=queries.filter(query=>query.includes('AS "CONTENT"')&&query.includes('FROM survey_standard_releases'))
  expect(headers).toHaveLength(1)
  const precise=page.list.filter((row:any)=>row.configuration)
  expect(precise.length).toBeGreaterThan(0)
  for(const row of precise){
   const source=original.find((r:any)=>row.ref.sourceId==='survey-standard:'+r.id&&row.ref.sourceVersion===r.combination_hash)
   expect(source).toBeTruthy();expect(row.configuration.axisVersions).toEqual(Object.fromEntries(Object.entries(source.snapshot.parts).map(([axis,part]:[string,any])=>[axis,part.version])))
   expect(row.configuration.axes).toEqual(Object.fromEntries(Object.entries(source.snapshot.parts).map(([axis,part]:[string,any])=>[axis,part.hash])))
   expect(row.configuration.compiledDefinition).toBeUndefined()
  }
  expect(await db.$queryRaw`SELECT * FROM survey_tool_grants ORDER BY id`).toEqual(rows)
  expect(await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`).toEqual(original)
  expect(await db.surveyPublication.findMany({orderBy:{id:'asc'}})).toEqual(publications)
  Object.assign(result,{additionalLabelHeaderQueries:headers.length,totalCatalogQueriesObserved:catalogQueryCount,preciseChoices:precise.length,sourceGrantPublicationUnchanged:true,
   labels:precise.map((row:any)=>({sourceId:row.ref.sourceId,sourceVersion:row.ref.sourceVersion,axisVersions:row.configuration.axisVersions})),configurationBodyTransmitted:false})
 },20000)
})
