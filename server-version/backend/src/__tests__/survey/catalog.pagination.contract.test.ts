import {beforeEach,describe,expect,it,vi} from 'vitest'

const db=vi.hoisted(()=>({$queryRaw:vi.fn(),scale:{findMany:vi.fn(),findFirst:vi.fn()}}))
vi.mock('../../config/database',()=>({prisma:db}))
import {sourceCatalog} from '../../modules/survey/catalog.service'
import {listCatalogSources} from '../../modules/survey/catalog.sources'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'

const definition=compileResearchScale('Source',{schemaVersion:1,respondentType:'participant_self_report',
  responseOptions:[{optionKey:'no',label:'No',score:0},{optionKey:'yes',label:'Yes',score:1}],
  dimensions:[{dimensionKey:'score',label:'Score',direction:'descriptive'}],aggregation:'sum',
  items:[{itemKey:'item',prompt:'Question',required:true,reverse:false,dimensionKeys:['score']}]})
const definitionHash=hashScaleDefinition(definition)
function catalog(total:number){
  const rows=Array.from({length:total},(_,i)=>({id:'source-'+String(i+1).padStart(4,'0'),instrumentVersion:'1',
    status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',code:'custom-'+i,name:'Source '+(i+1),definition,definitionHash}))
  db.scale.findMany.mockImplementation(async({skip,take}:{skip:number;take:number})=>rows.slice(skip,skip+take))
}
beforeEach(()=>{
  vi.resetAllMocks()
  db.$queryRaw.mockImplementation(async(query:unknown)=>{const sql=Array.isArray(query)?query.join(''):(query as {sql?:string}).sql??'';return sql.includes('admin_entry_grants')?[{id:'admin'}]:[]})
})

describe('bounded source catalog pagination',()=>{
  it.each([
    {page:39,total:1001,count:25,hasMore:true,terminalReason:null},
    {page:39,total:975,count:25,hasMore:false,terminalReason:'END_OF_CATALOG'},
    {page:39,total:962,count:12,hasMore:false,terminalReason:'END_OF_CATALOG'},
    {page:39,total:950,count:0,hasMore:false,terminalReason:'END_OF_CATALOG'},
    {page:40,total:1001,count:25,hasMore:false,terminalReason:'PAGE_LIMIT_REACHED'},
    {page:40,total:1000,count:25,hasMore:false,terminalReason:'END_OF_CATALOG'},
    {page:40,total:987,count:12,hasMore:false,terminalReason:'END_OF_CATALOG'},
    {page:40,total:975,count:0,hasMore:false,terminalReason:'END_OF_CATALOG'},
  ])('returns truthful page $page for $total sources',async({page,total,count,hasMore,terminalReason})=>{
    catalog(total)
    const result=await sourceCatalog('admin',{kind:'SCALE',page})
    expect(result).toMatchObject({page,pageSize:25,hasMore,terminalReason})
    expect(result.list).toHaveLength(count)
    expect(result.list.every(row=>!row.available&&row.unsupportedReason==='SOURCE_SCALE_EXPLICIT_CONVERSION_REQUIRED')).toBe(true)
    expect(result.list.map(row=>row.ref.sourceId)).toEqual(Array.from({length:count},(_,i)=>'source-'+String((page-1)*25+i+1).padStart(4,'0')))
    expect(db.$queryRaw).toHaveBeenCalledTimes(2) // Current entry authority plus the bounded standard-version index.
    expect(db.scale.findMany).toHaveBeenCalledExactlyOnceWith({where:{status:'PUBLISHED',instrumentClass:'STANDARD'},orderBy:{id:'asc'},skip:(page-1)*25,take:26})
    expect(db.scale.findFirst).not.toHaveBeenCalled()
  })
  it.each([1001,987,975])('rejects page 41 before a source query instead of repeating page 40 ($0 sources)',async(total)=>{
    catalog(total)
    await expect(sourceCatalog('admin',{kind:'SCALE',page:41})).rejects.toMatchObject({code:'SOURCE_CATALOG_PAGE_LIMIT_EXCEEDED',statusCode:400})
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    expect(db.scale.findMany).not.toHaveBeenCalled()
  })
  it('preserves the effective helper page rather than echoing an unnormalized request',async()=>{
    catalog(100)
    const result=await sourceCatalog('admin',{kind:'SCALE',page:2.9})
    expect(result).toMatchObject({page:2,hasMore:true,terminalReason:null})
    expect(db.scale.findMany).toHaveBeenCalledWith(expect.objectContaining({skip:25,take:26}))
  })
  it('never returns the same source IDs across pages 39 and 40 or loads a page beyond the bound',async()=>{
    catalog(1001)
    const first=await listCatalogSources({actorUserId:'admin',kind:'SCALE',page:39},db as never)
    const last=await listCatalogSources({actorUserId:'admin',kind:'SCALE',page:40},db as never)
    expect(new Set([...first.list,...last.list].map(row=>row.ref.sourceId)).size).toBe(50)
    await expect(listCatalogSources({actorUserId:'admin',kind:'SCALE',page:41},db as never)).rejects.toMatchObject({statusCode:400})
    expect(db.scale.findMany).toHaveBeenCalledTimes(2)
  })
  it('still refuses unauthorized source catalog reads before pagination',async()=>{
    db.$queryRaw.mockResolvedValue([])
    await expect(sourceCatalog('not-admin',{kind:'SCALE',page:40})).rejects.toMatchObject({message:'缺少当前入口管理授权',statusCode:403})
    expect(db.scale.findMany).not.toHaveBeenCalled()
  })
})
