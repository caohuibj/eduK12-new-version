import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({query:vi.fn(),authorize:vi.fn(),publicUse:vi.fn(),libraryUse:vi.fn(),authority:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:any)=>fn({$queryRaw:m.query})}}))
vi.mock('../../modules/education-tools/private-tool.access',()=>({authorizePrivateTool:m.authorize}))
vi.mock('../../modules/scale-library-governance/authority',()=>({assertLibraryResourcesAuthority:m.authority}))
vi.mock('../../modules/education-tools/public-source.catalog',async original=>({...await original<object>(),readEducationPublicUse:m.publicUse}))
vi.mock('../../modules/education-tools/library-source.catalog',async original=>({...await original<object>(),readEducationLibrarySourceUses:m.libraryUse}))
import {listEducationPublicSources} from '../../modules/education-tools/public-source.catalog'
import {listEducationLibrarySources} from '../../modules/education-tools/library-source.catalog'
import {readEducationPublicFormPreview,readEducationPublicStandardPreview} from '../../modules/education-tools/public-source.preview'
import {readEducationLibraryScalePreview} from '../../modules/education-tools/library-source.preview'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64)
const c={entry:'SCHOOL' as const,organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL' as const}}
const applicability=(responseMode:string)=>({schemaVersion:1,administrations:[{population:'STUDENT',responseMode}]})
const header=(n:number,mode:string)=>({key:`education-source:FORM:${id(n)}:${hash}`,id:id(n),kind:'FORM',hash,title:mode,language:'zh-CN',versions:{content:'1',parameters:null,report:null},applicability:applicability(mode),referenceContextKeys:[]})
beforeEach(()=>{
 vi.clearAllMocks();m.authorize.mockResolvedValue(undefined);m.authority.mockResolvedValue(undefined)
 m.publicUse.mockImplementation(async(_tx,_c,keys:string[])=>new Map(keys.map(key=>[key,{}])))
 m.libraryUse.mockResolvedValue(new Map([[id(3),{}]]))
})
describe('observer source catalog and one-leaf preview filters',()=>{
 it.each(['PARENT_REPORT','TEACHER_REPORT'] as const)('public catalog distinguishes %s from SELF and other observers while retaining current use scopes',async responseMode=>{
  m.query.mockResolvedValue([header(3,'SELF'),header(4,'PARENT_REPORT'),header(5,'TEACHER_REPORT'),{
   ...header(6,'standard'),kind:'STANDARD_SCALE',nativeAvailable:true,applicability:{respondentTypes:['PARENT']},requiredContextKeys:[],
  }])
  const result=await listEducationPublicSources(c,{responseMode})
  expect(result.list.filter(row=>row.allowedActions.length).map(row=>row.title)).toEqual(responseMode==='PARENT_REPORT'?['PARENT_REPORT','standard']:['TEACHER_REPORT'])
  expect(JSON.stringify(result)).not.toMatch(/"definition"|"snapshot"|"applicability"/)
  const sql=m.query.mock.calls[0][0]
  expect(sql.sql).toContain("g.capabilities=ARRAY['material.use']")
  expect(sql.values).toEqual(expect.arrayContaining([c.principal.userId,c.entry,c.organizationId]))
 })
 it.each(['PARENT_REPORT','TEACHER_REPORT'] as const)('library catalog binds the requested %s to the approved administration header',async responseMode=>{
  m.query.mockResolvedValueOnce([{entryId:id(3),releaseId:id(8),snapshotHash:hash,contentHash:hash,title:'approved',sourceProduct:'TRAINING',version:'1',language:'zh-CN',nativeReportVersion:'1',compatible:true,dependencies:[]}])
   .mockResolvedValueOnce([{id:id(7),entryId:id(3),releaseId:id(8),issuerId:id(9),authorityGrantId:null,version:1,scopeKind:'USER'}])
  const result=await listEducationLibrarySources(c,{responseMode})
  expect(result.list[0]).toMatchObject({sourceProvider:'LIBRARY_SCALE',allowedActions:['REFERENCE_FIXED_VERSION']})
  const sql=m.query.mock.calls[0][0]
  expect(sql.values).toContain(responseMode);expect(sql.values).toContain('STUDENT')
  expect(sql.sql).toContain("cardinality(s.dependency_release_ids)=0")
  expect(sql.sql).toContain("g.status='ACTIVE'");expect(m.authority).toHaveBeenCalledOnce()
 })
 it.each(['PARENT_REPORT','TEACHER_REPORT'] as const)('previews one %s form only when the immutable declaration matches, and keeps original use mandatory',async responseMode=>{
  const display={schemaVersion:2,pages:[]}
  m.query.mockResolvedValue([{title:'original form',definition:display,instruction:'original',applicability:applicability(responseMode)}])
  expect(await readEducationPublicFormPreview(c,id(3),hash,responseMode)).toMatchObject({id:id(3),contentHash:hash,definition:display,previewOnly:true,canEditOriginal:false})
  expect(m.query).toHaveBeenCalledOnce()
  m.query.mockResolvedValue([{title:'wrong mode',definition:display,applicability:applicability('SELF')}])
  await expect(readEducationPublicFormPreview(c,id(3),hash,responseMode)).rejects.toMatchObject({code:'PUBLIC_FORM_VARIANT_UNSUPPORTED'})
  m.query.mockClear();m.publicUse.mockResolvedValue(new Map())
  await expect(readEducationPublicFormPreview(c,id(3),hash,responseMode)).rejects.toMatchObject({code:'PUBLIC_SOURCE_USE_REQUIRED'})
  expect(m.query).not.toHaveBeenCalled()
 })
 it.each([['PARENT_REPORT','PARENT'],['TEACHER_REPORT','TEACHER']] as const)('one-leaf Scale previews use exact %s eligibility, without broadening original source access',async(responseMode,respondent)=>{
  m.query.mockResolvedValue([{title:'original scale',definition:{items:[]}}])
  await readEducationPublicStandardPreview(c,id(3),hash,responseMode)
  const standard=m.query.mock.calls[0][0]
  expect(standard.values).toEqual(expect.arrayContaining([id(3),hash,respondent]))
  expect(standard.sql).toContain("applicability,respondentTypes}' ?")
  m.query.mockClear();await readEducationLibraryScalePreview(c,id(3),hash,responseMode)
  expect(m.query.mock.calls[0][0].values).toEqual(expect.arrayContaining([id(3),hash,'STUDENT',responseMode]))
  m.query.mockClear();m.libraryUse.mockResolvedValue(new Map())
  await expect(readEducationLibraryScalePreview(c,id(3),hash,responseMode)).rejects.toMatchObject({code:'LIBRARY_SOURCE_USE_REQUIRED'})
  expect(m.query).not.toHaveBeenCalled()
 })
 it('defaults unchanged consumers to SELF and rejects observer filters for the Teacher entry before any source read',async()=>{
  m.query.mockResolvedValue([header(3,'SELF'),header(4,'PARENT_REPORT')])
  expect((await listEducationPublicSources(c,{})).list.filter(row=>row.allowedActions.length).map(row=>row.title)).toEqual(['SELF'])
  m.query.mockClear();m.authorize.mockClear()
  const teacher={...c,entry:'TEACHER' as const}
  for(const read of [()=>listEducationPublicSources(teacher,{responseMode:'PARENT_REPORT'}),()=>listEducationLibrarySources(teacher,{responseMode:'TEACHER_REPORT'}),
   ()=>readEducationPublicFormPreview(teacher,id(3),hash,'PARENT_REPORT'),()=>readEducationLibraryScalePreview(teacher,id(3),hash,'TEACHER_REPORT'),()=>readEducationPublicStandardPreview(teacher,id(3),hash,'PARENT_REPORT')])
   await expect(read()).rejects.toThrow()
  expect(m.query).not.toHaveBeenCalled();expect(m.authorize).not.toHaveBeenCalled()
 })
 it('does not read source bodies when author authority is lost or turn infrastructure errors into an empty catalog',async()=>{
  m.authorize.mockRejectedValue(Error('author revoked'))
  await expect(readEducationPublicFormPreview(c,id(3),hash,'PARENT_REPORT')).rejects.toThrow('author revoked')
  await expect(readEducationLibraryScalePreview(c,id(3),hash,'PARENT_REPORT')).rejects.toThrow('author revoked')
  expect(m.query).not.toHaveBeenCalled()
  m.authorize.mockResolvedValue(undefined);m.query.mockRejectedValue(Error('database unavailable'))
  await expect(listEducationPublicSources(c,{responseMode:'PARENT_REPORT'})).rejects.toThrow('database unavailable')
 })
})
