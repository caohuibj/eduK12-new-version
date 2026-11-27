import {randomUUID} from 'node:crypto'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {PrismaClient,type Prisma} from '@prisma/client'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import type {RunResourcePolicy} from '../../modules/assessment-run/resourceAuthority'
const shared=vi.hoisted(()=>({
 enabled:vi.fn(),expanded:vi.fn(),authorize:vi.fn(),
 AccessError:class extends Error{readonly statusCode=409},
}))
vi.mock('../../modules/tool-licensing/runtime',()=>({
 isToolLicensingEnabled:shared.enabled,isExpandedToolLicensingEnabled:shared.expanded,authorizeToolPublication:shared.authorize,ToolLicenseAccessError:shared.AccessError,
}))
import {authorizeEducationStandardPublication,resolveEducationPublicationTools} from '../../modules/assessment-run/tool-licensing'

const ids={org:'10000000-0000-4000-8000-000000000001',owner:'10000000-0000-4000-8000-000000000002',
 run:'10000000-0000-4000-8000-000000000003',composite:'10000000-0000-4000-8000-000000000004',
 version:'10000000-0000-4000-8000-000000000005',tool:'10000000-0000-4000-8000-000000000006',standard:'10000000-0000-4000-8000-000000000007'}
const hash='a'.repeat(64),manifestHash='b'.repeat(64)
function fixture(product:'SCHOOL'|'TEACHER'='SCHOOL',suffix=''){
 const origin={schemaVersion:1,adapterVersion:'1.0.0',mode:'COMPOSITION',entry:product,organizationId:ids.org,
  ownerUserId:ids.owner,toolId:ids.tool,versionId:ids.version,contentHash:hash,variantKey:product==='SCHOOL'?'STUDENT:SELF':'TEACHER:SELF'}
 const key=`education-composition:${product}:${ids.version}:${product==='SCHOOL'?'STUDENT':'TEACHER'}:SELF:1.0.0`+suffix
 const track={id:ids.composite+suffix,resourceKey:key,resourcePolicy:{family:'BUNDLE',key,version:'1.0.0',runtimeLaunchTarget:{kind:'COMPOSITE',ref:ids.composite+suffix},
  educationComposition:{origin,manifestHash,unitReports:[]}} as unknown as RunResourcePolicy}
 const row={id:ids.composite+suffix,resourceKey:key,manifestHash,origin,leafCount:1,sourceProvider:'STANDARD_SCALE',kind:'SCALE',
  versionId:ids.standard,contentHash:hash,position:1,toolKey:'synthetic_standard'}
 const query=vi.fn().mockResolvedValue([row]),tx={$queryRaw:query} as unknown as Prisma.TransactionClient
 const input={product,organizationId:ids.org,runId:ids.run,tracks:[track],closesAt:new Date('2027-01-01T00:00:00Z'),maxResponses:3,frozenResponses:3}
 return {tx,query,input,row,track}
}
beforeEach(()=>{shared.enabled.mockReset().mockReturnValue(true);shared.expanded.mockReset().mockReturnValue(false);shared.authorize.mockReset().mockResolvedValue(undefined)})

describe('education single-standard publication licence pilot',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('charges the frozen roster once for the server-resolved %s product',async product=>{
  const f=fixture(product)
  expect(await authorizeEducationStandardPublication(f.tx,f.input)).toBe(true)
  expect(shared.enabled).toHaveBeenCalledWith(product)
  expect(shared.authorize).toHaveBeenCalledExactlyOnceWith(f.tx,{
   product,subjectId:ids.org,publicationId:ids.run,toolKeys:['SCALE:synthetic_standard'],
   education:{closesAt:f.input.closesAt,maxResponses:3,frozenResponses:3},
  })
  expect(f.query).toHaveBeenCalledTimes(1)
  const sql=f.query.mock.calls[0][0]
  expect(sql.text).toContain('c.id=ANY(')
  expect(sql.text).toContain('s.combination_hash=')
  expect(sql.text).not.toContain('SELECT *')
  expect(sql.values).toContainEqual([ids.composite])
 })
 it('leaves both disabled entry flags on the old publication path without any extra query',async()=>{
  shared.enabled.mockReturnValue(false)
  const f=fixture()
  expect(await authorizeEducationStandardPublication(f.tx,f.input)).toBe(false)
  expect(f.query).not.toHaveBeenCalled();expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('does not infer an education product from a title, role or unlinked run',async()=>{
  const f=fixture()
  expect(await authorizeEducationStandardPublication(f.tx,{...f.input,product:null})).toBe(false)
  expect(f.query).not.toHaveBeenCalled();expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('keeps the separately published student feedback workflow outside this pilot',async()=>{
  const f=fixture('TEACHER')
  f.track.resourcePolicy.educationComposition!.origin.variantKey='TEACHER:STUDENT_REPORT'
  expect(await authorizeEducationStandardPublication(f.tx,f.input)).toBe(false)
  expect(f.query).not.toHaveBeenCalled();expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('passes missing caps/deadlines through so the shared helper can preserve an unlicensed legacy subject',async()=>{
  const f=fixture()
  expect(await authorizeEducationStandardPublication(f.tx,{...f.input,closesAt:null,maxResponses:undefined})).toBe(true)
  expect(shared.authorize.mock.calls[0][1].education).toEqual({closesAt:null,maxResponses:undefined,frozenResponses:3})
 })
 it('does not rewrite a user-selected cap or the frozen response count before shared validation',async()=>{
  const f=fixture()
  await authorizeEducationStandardPublication(f.tx,{...f.input,maxResponses:2,frozenResponses:3})
  expect(shared.authorize.mock.calls[0][1].education).toEqual({closesAt:f.input.closesAt,maxResponses:2,frozenResponses:3})
 })
 it.each(['private-scale:SCHOOL:synthetic','library-scale:synthetic','education-assessment:SCHOOL:synthetic'])('does not meter an unimplemented source adapter: %s',async key=>{
  const f=fixture();f.track.resourceKey=key
  expect(await authorizeEducationStandardPublication(f.tx,f.input)).toBe(false)
  expect(f.query).not.toHaveBeenCalled();expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('preserves the old single-leaf flag boundary for a multi-leaf composition',async()=>{
  const f=fixture();f.row.leafCount=2
  expect(await authorizeEducationStandardPublication(f.tx,f.input)).toBe(false)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('does not treat a private leaf UUID as a commercial standard tool key',async()=>{
  const f=fixture();f.row.sourceProvider='PRIVATE_VERSION'
  expect(await authorizeEducationStandardPublication(f.tx,f.input)).toBe(false)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('preserves the old same-tool flag boundary for distinct standards',async()=>{
  const f=fixture(),other=fixture('SCHOOL','-other');other.row.toolKey='another_standard'
  f.query.mockResolvedValue([f.row,other.row])
  expect(await authorizeEducationStandardPublication(f.tx,{...f.input,tracks:[f.track,other.track]})).toBe(false)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('uses the exact total frozen response count when multiple tracks share one standard tool',async()=>{
  const f=fixture(),other=fixture('SCHOOL','-other')
  f.query.mockResolvedValue([f.row,other.row])
  expect(await authorizeEducationStandardPublication(f.tx,{...f.input,tracks:[f.track,other.track],maxResponses:5,frozenResponses:5})).toBe(true)
  expect(shared.authorize.mock.calls[0][1].education.frozenResponses).toBe(5)
  expect(shared.authorize.mock.calls[0][1].toolKeys).toEqual(['SCALE:synthetic_standard'])
 })
 it.each(['origin','manifestHash','resourceKey','toolKey'] as const)('fails a missing or changed exact binding instead of selecting a new source: %s',async field=>{
  const f=fixture()
  if(field==='origin')f.row.origin={...f.row.origin,organizationId:'another-school'}
  else f.row[field]=''
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).rejects.toBeInstanceOf(shared.AccessError)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('fails when the frozen runtime composite disappeared',async()=>{
  const f=fixture();f.query.mockResolvedValue([])
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).rejects.toBeInstanceOf(shared.AccessError)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('does not substitute the other education product even for the same school',async()=>{
  const f=fixture('SCHOOL')
  await expect(authorizeEducationStandardPublication(f.tx,{...f.input,product:'TEACHER'})).rejects.toBeInstanceOf(shared.AccessError)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('propagates a shared expiry/quota rejection so the surrounding publication transaction rolls back',async()=>{
  const f=fixture(),failure=new shared.AccessError('quota denied')
  shared.authorize.mockRejectedValue(failure)
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).rejects.toBe(failure)
 })
 it('bounds its source batch before querying',async()=>{
  const f=fixture()
  expect(await authorizeEducationStandardPublication(f.tx,{...f.input,tracks:Array.from({length:129},()=>f.track)})).toBe(false)
  expect(f.query).not.toHaveBeenCalled();expect(shared.authorize).not.toHaveBeenCalled()
 })
})

describe('expanded education publication source and allocation contract',()=>{
 it.each([
  ['PUBLIC_FORM','FORM','form-one','FORM:form-one'],
  ['PUBLIC_FORM','FORM','FORM:form-one','FORM:form-one'],
  ['COGNITIVE_CONFIG','COGNITIVE','gonogo','COGNITIVE:gonogo'],
  ['SJT_RELEASE','SJT','conflict','SJT:conflict'],
  ['LIBRARY_SCALE','SCALE','scoped:library','SCALE:scoped:library'],
 ] as const)('resolves exact %s leaf without a release UUID as the commercial key',async(provider,kind,key,expected)=>{
  shared.expanded.mockReturnValue(true)
  const f=fixture()
  Object.assign(f.row,{sourceProvider:provider,kind,toolKey:key,profileArtifactHash:hash})
  expect(await resolveEducationPublicationTools(f.tx,f.input)).toEqual([{trackId:f.track.id,key:expected}])
  const sql=f.query.mock.calls[0][0]
  expect(sql.text).toContain("f.snapshot_hash=leaf.value->>'contentHash'")
  expect(sql.text).toContain("p.fingerprint=leaf.value->>'profileArtifactHash'")
  expect(sql.text).toContain("sm.content_hash=leaf.value->>'contentHash'")
  expect(sql.text).toContain("submission.snapshot_hash=leaf.value->>'contentHash'")
  expect(sql.text).not.toContain('SELECT *')
 })
 it.each(['PUBLIC_FORM','COGNITIVE_CONFIG','SJT_RELEASE','LIBRARY_SCALE'])('the old standard flag does not meter %s',async provider=>{
  const f=fixture(),kind=provider==='PUBLIC_FORM'?'FORM':provider==='COGNITIVE_CONFIG'?'COGNITIVE':provider==='SJT_RELEASE'?'SJT':'SCALE'
  Object.assign(f.row,{sourceProvider:provider,kind})
  expect(await authorizeEducationStandardPublication(f.tx,f.input)).toBe(false)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it.each(['SCHOOL','TEACHER'] as const)('meters only the pinned profile among same-type %s cognitive leaves',async product=>{
  shared.expanded.mockReturnValue(true)
  const f=fixture(product)
  const pinned={...f.row,leafCount:2,sourceProvider:'COGNITIVE_CONFIG',kind:'COGNITIVE',profileArtifactHash:hash,toolKey:'gonogo'}
  const legacy={...pinned,position:2,profileArtifactHash:null,toolKey:null}
  f.query.mockResolvedValue([{...legacy,position:1,leafCount:1}])
  expect(await resolveEducationPublicationTools(f.tx,f.input)).toEqual([])
  f.query.mockResolvedValue([pinned,legacy])
  expect(await resolveEducationPublicationTools(f.tx,f.input)).toEqual([{trackId:f.track.id,key:'COGNITIVE:gonogo'}])
 })
 it('deduplicates repeated commercial leaves but keeps each distinct key in one composition',async()=>{
  shared.expanded.mockReturnValue(true)
  const f=fixture()
  f.row.leafCount=4
  const form={...f.row,position:2,sourceProvider:'PUBLIC_FORM',kind:'FORM',toolKey:'FORM:form-one'}
  f.query.mockResolvedValue([f.row,{...f.row,position:3},form,{...f.row,position:4,sourceProvider:'PRIVATE_VERSION',toolKey:null}])
  expect(await resolveEducationPublicationTools(f.tx,f.input)).toEqual([
   {trackId:f.track.id,key:'SCALE:synthetic_standard'},{trackId:f.track.id,key:'FORM:form-one'},
  ])
 })
 it('meters only recognized leaves in a mixed private/public composition',async()=>{
  shared.expanded.mockReturnValue(true)
  const f=fixture();f.row.leafCount=2
  f.query.mockResolvedValue([f.row,{...f.row,position:2,sourceProvider:'PRIVATE_VERSION',kind:'FORM',toolKey:null}])
  await authorizeEducationStandardPublication(f.tx,{...f.input,trackResponseCounts:new Map([[f.track.id,3]])})
  expect(shared.authorize.mock.calls[0][1].education.allocations).toEqual([
   {key:'SCALE:synthetic_standard',quantity:3,trackIds:[f.track.id]},
  ])
 })
 it('sums each tool only over its matching frozen tracks, not the entire run',async()=>{
  shared.expanded.mockReturnValue(true)
  const f=fixture(),other=fixture('SCHOOL','-second'),privateTrack=fixture('SCHOOL','-private')
  Object.assign(other.row,{sourceProvider:'PUBLIC_FORM',kind:'FORM',toolKey:'FORM:form-one',leafCount:2})
  f.query.mockResolvedValue([f.row,other.row,{...other.row,position:2}])
  privateTrack.track.resourceKey='private-form:SCHOOL:independent'
  await authorizeEducationStandardPublication(f.tx,{...f.input,tracks:[f.track,other.track,privateTrack.track],maxResponses:12,frozenResponses:12,
   trackResponseCounts:new Map([[f.track.id,3],[other.track.id,4],[privateTrack.track.id,5]])})
  expect(shared.authorize.mock.calls[0][1]).toEqual({
   product:'SCHOOL',subjectId:ids.org,publicationId:ids.run,toolKeys:['FORM:form-one','SCALE:synthetic_standard'],
   education:{closesAt:f.input.closesAt,maxResponses:12,frozenResponses:12,allocations:[
    {key:'FORM:form-one',quantity:4,trackIds:[other.track.id]},
    {key:'SCALE:synthetic_standard',quantity:3,trackIds:[f.track.id]},
   ]},
  })
 })
 it('requires exact counts before billing distinct tools under the expanded flag',async()=>{
  shared.expanded.mockReturnValue(true)
  const f=fixture(),other=fixture('SCHOOL','-second');other.row.toolKey='another_standard'
  f.query.mockResolvedValue([f.row,other.row])
  await expect(authorizeEducationStandardPublication(f.tx,{...f.input,tracks:[f.track,other.track]})).rejects.toBeInstanceOf(shared.AccessError)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('sums the same tool across tracks once per track, including distinct frozen versions',async()=>{
  const f=fixture(),other=fixture('SCHOOL','-second')
  other.row.versionId=ids.version;other.row.contentHash='c'.repeat(64)
  f.query.mockResolvedValue([f.row,other.row])
  await authorizeEducationStandardPublication(f.tx,{...f.input,tracks:[f.track,other.track],maxResponses:7,frozenResponses:7,
   trackResponseCounts:new Map([[f.track.id,3],[other.track.id,4]])})
  expect(shared.authorize.mock.calls[0][1].education.allocations).toEqual([
   {key:'SCALE:synthetic_standard',quantity:7,trackIds:[f.track.id,other.track.id].sort()},
  ])
 })
 it('does not bill a wholly private run even if public licensing is enabled',async()=>{
  shared.expanded.mockReturnValue(true)
  const f=fixture();f.row.sourceProvider='PRIVATE_VERSION';f.row.toolKey=''
  expect(await authorizeEducationStandardPublication(f.tx,f.input)).toBe(false)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it.each(['PUBLIC_FORM','COGNITIVE_CONFIG','SJT_RELEASE','LIBRARY_SCALE'])('fails a broken exact %s binding rather than silently skipping a known tool',async provider=>{
  shared.expanded.mockReturnValue(true)
  const f=fixture(),kind=provider==='PUBLIC_FORM'?'FORM':provider==='COGNITIVE_CONFIG'?'COGNITIVE':provider==='SJT_RELEASE'?'SJT':'SCALE'
  Object.assign(f.row,{sourceProvider:provider,kind,toolKey:null,profileArtifactHash:hash})
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).rejects.toBeInstanceOf(shared.AccessError)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it.each([undefined,-1,0.5,Number.NaN])('rejects missing or invalid frozen track counts: %s',async count=>{
  const f=fixture()
  await expect(authorizeEducationStandardPublication(f.tx,{...f.input,trackResponseCounts:new Map([[f.track.id,count as number]])})).rejects.toBeInstanceOf(shared.AccessError)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('retains a zero frozen track count for shared validation instead of replacing it with run total',async()=>{
  const f=fixture()
  await authorizeEducationStandardPublication(f.tx,{...f.input,trackResponseCounts:new Map([[f.track.id,0]])})
  expect(shared.authorize.mock.calls[0][1].education.allocations[0].quantity).toBe(0)
 })
 it('rejects duplicate or missing manifest positions before a partial charge',async()=>{
  shared.expanded.mockReturnValue(true)
  const f=fixture();f.row.leafCount=2;f.query.mockResolvedValue([f.row,f.row])
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).rejects.toBeInstanceOf(shared.AccessError)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
})

function packageFixture(product:'SCHOOL'|'TEACHER'='SCHOOL'){
 const f=fixture(product)
 f.track.resourceKey='education-assessment:'+product+':'+ids.org+':'+ids.tool
 f.track.resourcePolicy.key=f.track.resourceKey
 delete f.track.resourcePolicy.educationComposition
 const row={id:ids.tool,product,organizationId:ids.org,originProduct:product,originOrganizationId:ids.org,originId:ids.tool,
  runtimeId:ids.composite,originRuntimeId:ids.composite,runtimeHash:manifestHash,originRuntimeHash:manifestHash,
  family:'BUNDLE',provider:'NATIVE_RELEASE',nativeBundle:{definitionHash:hash,sourceBindingsHash:hash,bindingsHash:manifestHash},
  versionId:ids.standard,contentHash:hash,toolKey:'native_package' as string|null,
  standaloneMatches:null as boolean|null,sourceKind:null as string|null}
 f.query.mockResolvedValue([row])
 return {...f,row}
}
describe('native whole-package publication licensing',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('meters a frozen native package once in %s, without billing its leaf units',async product=>{
  shared.expanded.mockReturnValue(true)
  const f=packageFixture(product)
  await authorizeEducationStandardPublication(f.tx,{...f.input,trackResponseCounts:new Map([[f.track.id,3]])})
  expect(shared.authorize.mock.calls[0][1].toolKeys).toEqual(['BUNDLE:native_package'])
  expect(shared.authorize.mock.calls[0][1].education.allocations).toEqual([{key:'BUNDLE:native_package',quantity:3,trackIds:[f.track.id]}])
  const sql=f.query.mock.calls[0][0]
  expect(sql.text).toContain('p."contentHash"=')
  expect(sql.values).toContainEqual([ids.tool])
 })
 it('does not add a second BUNDLE prefix',async()=>{
  shared.expanded.mockReturnValue(true)
  const f=packageFixture();f.row.toolKey='BUNDLE:native_package'
  expect(await resolveEducationPublicationTools(f.tx,f.input)).toEqual([{trackId:f.track.id,key:'BUNDLE:native_package'}])
 })
 it('does not query native deliveries under only the old standard flag',async()=>{
  const f=packageFixture()
  expect(await authorizeEducationStandardPublication(f.tx,f.input)).toBe(false)
  expect(f.query).not.toHaveBeenCalled()
 })
 it.each(['CODE_BUNDLE','GOVERNED_PACKAGE',null])('preserves a package with separate unsupported source contract: %s',async provider=>{
  shared.expanded.mockReturnValue(true)
  const f=packageFixture();f.row.provider=provider as string
  expect(await authorizeEducationStandardPublication(f.tx,f.input)).toBe(false)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it.each(['runtimeHash','originRuntimeId','originProduct','originOrganizationId','originId','toolKey'] as const)('fails a mismatched frozen package: %s',async field=>{
  shared.expanded.mockReturnValue(true)
  const f=packageFixture();f.row[field]=''
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).rejects.toBeInstanceOf(shared.AccessError)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('rejects a bundle without the native whole-package seal',async()=>{
  shared.expanded.mockReturnValue(true)
  const f=packageFixture();f.row.nativeBundle={} as typeof f.row.nativeBundle
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).rejects.toBeInstanceOf(shared.AccessError)
 })
})

function standaloneFixture(product:'SCHOOL'|'TEACHER',family:'SITUATIONAL'|'COGNITIVE',sourceKind:string|null){
 const f=packageFixture(product)
 f.track.resourcePolicy.family=family
 Object.assign(f.row,{
  family,provider:null,nativeBundle:null,versionId:null,contentHash:null,standaloneMatches:true,sourceKind,
  toolKey:family==='COGNITIVE'?'reaction':'synthetic_sjt'
 })
 return f
}

describe('registered standalone education publication licensing',()=>{
 it.each([
  ['SCHOOL','SITUATIONAL','SJT_AUTHOR_RELEASE','SJT:synthetic_sjt'],
  ['TEACHER','SITUATIONAL','STATIC_SJT_REGISTRY','SJT:synthetic_sjt'],
  ['SCHOOL','COGNITIVE','COGNITIVE_CONFIG','COGNITIVE:reaction'],
  ['TEACHER','COGNITIVE','COGNITIVE_CONFIG','COGNITIVE:reaction'],
 ] as const)('uses the pinned commercial source for %s %s (%s)',async(product,family,sourceKind,key)=>{
  shared.expanded.mockReturnValue(true)
  const f=standaloneFixture(product,family,sourceKind)
  await expect(authorizeEducationStandardPublication(f.tx,{...f.input,trackResponseCounts:new Map([[f.track.id,3]])})).resolves.toBe(true)
  expect(shared.authorize.mock.calls[0][1].toolKeys).toEqual([key])
  expect(shared.authorize.mock.calls[0][1].education.allocations).toEqual([{key,quantity:3,trackIds:[f.track.id]}])
  expect(f.query).toHaveBeenCalledTimes(1)
  const sql=f.query.mock.calls[0][0]
  expect(sql.text).toContain('actual.content_hash=frozen.unit')
  expect(sql.text).toContain('frozen.unit->\'measurement\'=frozen.origin_unit->\'measurement\'')
  expect(sql.text).toContain('p.fingerprint=frozen.unit#>>\'{source,cognitiveProfile,artifactHash}\'')
  expect(sql.text).toContain('actual.provenance->>\'profileArtifactHash\'=p.fingerprint')
  expect(sql.text).toContain('m.id=actual.source_release_id')
  expect(sql.text).toContain('author.instrument_version=frozen.unit')
  expect(sql.text).toContain('mapping.instrument_version=frozen.unit')
  expect(sql.values).toContain(product)
 })
 it.each(['SCHOOL','TEACHER'] as const)('keeps a legacy cognitive assignment without an exact approved destination profile on its original %s path',async product=>{
  shared.expanded.mockReturnValue(true)
  const f=standaloneFixture(product,'COGNITIVE','COGNITIVE_CONFIG');f.row.toolKey=null
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).resolves.toBe(false)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it('does not substitute a runtime ID or another published SJT version for a mismatched source',async()=>{
  shared.expanded.mockReturnValue(true)
  const f=standaloneFixture('TEACHER','SITUATIONAL','STATIC_SJT_REGISTRY');f.row.toolKey=null
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).rejects.toBeInstanceOf(shared.AccessError)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it.each(['SITUATIONAL','COGNITIVE'] as const)('denies %s with a mismatched frozen runtime measurement',async family=>{
  shared.expanded.mockReturnValue(true)
  const f=standaloneFixture('SCHOOL',family,family==='COGNITIVE'?'COGNITIVE_CONFIG':'SJT_AUTHOR_RELEASE')
  f.row.standaloneMatches=false
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).rejects.toBeInstanceOf(shared.AccessError)
  expect(shared.authorize).not.toHaveBeenCalled()
 })
 it.each([false,true])('meters a public student-evaluation Form only with the expanded flag (%s)',async expanded=>{
  shared.expanded.mockReturnValue(expanded)
  const f=fixture('TEACHER')
  f.row.origin.variantKey='TEACHER:STUDENT_REPORT'
  Object.assign(f.row,{sourceProvider:'PUBLIC_FORM',kind:'FORM',toolKey:'evaluation-form'})
  await expect(authorizeEducationStandardPublication(f.tx,{...f.input,trackResponseCounts:new Map([[f.track.id,3]])})).resolves.toBe(expanded)
  if(expanded){
   expect(shared.authorize.mock.calls[0][1].toolKeys).toEqual(['FORM:evaluation-form'])
   expect(shared.authorize.mock.calls[0][1].education.allocations).toEqual([{key:'FORM:evaluation-form',quantity:3,trackIds:[f.track.id]}])
  }else{
   expect(f.query).not.toHaveBeenCalled()
   expect(shared.authorize).not.toHaveBeenCalled()
  }
 })
 it('leaves the private standalone student-evaluation Form on its original path',async()=>{
  shared.expanded.mockReturnValue(true)
  const f=fixture('TEACHER');f.track.resourceKey='huiteacher-student-form:'+ids.tool
  await expect(authorizeEducationStandardPublication(f.tx,f.input)).resolves.toBe(false)
  expect(f.query).not.toHaveBeenCalled()
  expect(shared.authorize).not.toHaveBeenCalled()
 })
})

describe('real PostgreSQL metadata SQL',()=>{
 it.skipIf(!process.env.TOOL_LICENSING_SQL_DATABASE_URL).each(['composition','package'] as const)(
  'validates the bounded %s projection against the real schema without writing data',async kind=>{
   shared.expanded.mockReturnValue(true)
   const f=kind==='composition'?fixture():packageFixture()
   const db=new PrismaClient({datasourceUrl:process.env.TOOL_LICENSING_SQL_DATABASE_URL})
   try{
    await db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
     await expect(resolveEducationPublicationTools(tx,f.input)).rejects.toBeInstanceOf(shared.AccessError)
    })
   }finally{await db.$disconnect()}
  })
 const isolatedFixtureUrl=/^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\/tool_licensing_test$/
 it.skipIf(!isolatedFixtureUrl.test(process.env.TOOL_LICENSING_SQL_DATABASE_URL??''))(
  'resolves real-schema frozen approved cognition and static SJT identities in a rolled-back fixture',async()=>{
   shared.expanded.mockReturnValue(true)
   const db=new PrismaClient({datasourceUrl:process.env.TOOL_LICENSING_SQL_DATABASE_URL})
   const rollback=new Error('discard isolated synthetic projection fixtures')
   try{
    await expect(db.$transaction(async tx=>{
     const owner=await tx.user.create({data:{username:'synthetic-license-owner-'+randomUUID(),passwordHash:'synthetic',role:'ADMIN'}})
     const reviewer=await tx.user.create({data:{username:'synthetic-license-review-'+randomUUID(),passwordHash:'synthetic',role:'ADMIN'}})
     const school=await tx.organization.create({data:{id:randomUUID(),name:'Synthetic license school',createdByUserId:owner.id,productDomain:'SCHOOL'}})
     const source=await tx.compositeAssessment.create({data:{code:randomUUID(),name:'Synthetic license source',createdBy:owner.id}})
     const authority=JSON.stringify({kind:'SYSTEM_ADMIN',actorId:owner.id})
     const review=JSON.stringify({kind:'SYSTEM_ADMIN',actorId:reviewer.id})
     const seedMeasurement=(input:Pick<Prisma.MeasurementContentReleaseCreateInput,'family'|'content'|'scope'|'provenance'|'source'>)=>
      tx.measurementContentRelease.create({data:{id:randomUUID(),layer:'MEASUREMENT',version:'1.0.0',key:randomUUID(),
        hashScheme:'SHA256',contentHash:canonicalHash(input.content),assetRefs:[],publishedBy:owner.id,...input}})
     async function seedDelivery(product:'SCHOOL'|'TEACHER',family:'COGNITIVE'|'SITUATIONAL',
      unit:{itemId:string;family:'COGNITIVE'|'SJT';source:Prisma.InputJsonObject;measurement:{releaseId:string;contentHash:string;measurementHash:string}}){
      const id=randomUUID(),runtimeId=randomUUID()
      const snapshot={schemaVersion:1,compositeId:runtimeId,units:[unit]},runtimeHash=canonicalHash(snapshot)
      await tx.compositeAssessment.create({data:{id:runtimeId,code:randomUUID(),name:'Synthetic frozen runtime',createdBy:owner.id,
       status:'PUBLISHED',productKind:'ORGANIZATION_RESOURCE',trainingContentSnapshot:snapshot,trainingContentSnapshotHash:runtimeHash}})
      const {source:_,...originUnit}=unit
      const draft={releaseStatus:'DRAFT',launchTarget:{compositeAssessmentId:runtimeId},educationOrigin:{
       resourceId:id,product,organizationId:school.id,family,sourceCompositeId:source.id,runtimeCompositeId:runtimeId,
       runtimeSnapshotHash:runtimeHash,units:[originUnit],
      }}
      await tx.$executeRaw`INSERT INTO education_assessment_deliveries(id,product,organization_id,family,source_composite_id,runtime_composite_id,entry,entry_hash,created_by_user_id,created_authority)
       VALUES(${id},${product},${school.id},${family},${source.id},${runtimeId},${JSON.stringify(draft)}::jsonb,${canonicalHash(draft)},${owner.id},${authority}::jsonb)`
      await tx.$executeRaw`UPDATE education_assessment_deliveries SET status='REVIEWED',reviewed_by_user_id=${reviewer.id},
       reviewed_at=clock_timestamp(),reviewed_authority=${review}::jsonb WHERE id=${id}`
      const published={...draft,releaseStatus:'PUBLISHED'}
      await tx.$executeRaw`UPDATE education_assessment_deliveries SET status='PUBLISHED',published_by_user_id=${owner.id},
       published_at=clock_timestamp(),published_authority=${authority}::jsonb,entry=${JSON.stringify(published)}::jsonb,entry_hash=${canonicalHash(published)} WHERE id=${id}`
      const f=standaloneFixture(product,family,unit.source.kind as string)
      const resourceKey=`education-assessment:${product}:${school.id}:${id}`
      const track={...f.track,resourceKey,resourcePolicy:{...f.track.resourcePolicy,key:resourceKey,
       runtimeLaunchTarget:{kind:'COMPOSITE' as const,ref:runtimeId}}}
      return {...f.input,organizationId:school.id,tracks:[track]}
     }
     const base=await seedMeasurement({family:'COGNITIVE',scope:{kind:'PLATFORM'},content:{measurementHash:hash}})
     const config=await tx.cognitiveTestConfig.create({data:{testType:'reaction',configVersion:randomUUID(),name:'Synthetic approved configuration',
      engineVersion:'1',scoringVersion:'1',status:'PUBLISHED',measurementReleaseId:base.id}})
     const artifactHash=canonicalHash(randomUUID()),assignmentId=randomUUID(),resolvedConfigHash=manifestHash
     await tx.assessmentPublicTemplate.create({data:{templateHash:artifactHash,templateKind:'COGNITIVE_PROFILE_CONFIGURATION',
      payloadEncrypted:'synthetic-metadata-only',plaintextBytes:1}})
     const configuration={profile:'standard',measurement:{releaseId:base.id,contentHash:base.contentHash},resolvedConfigHash}
     await tx.assessmentManagementEvent.create({data:{actorId:owner.id,resourceId:config.id,action:'COGNITIVE_PROFILE_APPROVED',
      metadata:{artifactHash,artifactFormatVersion:2,configuration}}})
     await tx.surveyToolPolicy.create({data:{product:'SCHOOL',resourceKey:`cognitive-profile:${config.id}:standard`,fingerprint:artifactHash,
      decision:'APPROVED',reason:'Synthetic projection fixture',reviewedBy:owner.id}})
     const derived=await seedMeasurement({family:'COGNITIVE',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:owner.id,resourceId:assignmentId},
      content:{measurementHash:manifestHash},source:{connect:{id:base.id}},
      provenance:{configId:config.id,assignmentId,profile:'standard',profileArtifactHash:artifactHash,resolvedConfigHash}})
     const cognitive={itemId:randomUUID(),family:'COGNITIVE' as const,
      source:{kind:'COGNITIVE_CONFIG',id:config.id,ownerId:owner.id,assignmentId,cognitiveProfile:{artifactHash}},
      measurement:{releaseId:derived.id,contentHash:derived.contentHash,measurementHash:manifestHash}}
     const licensed=await seedDelivery('SCHOOL','COGNITIVE',cognitive)
     expect(await resolveEducationPublicationTools(tx,licensed)).toEqual([{trackId:licensed.tracks[0].id,key:'COGNITIVE:reaction'}])
     const old=await seedDelivery('TEACHER','COGNITIVE',cognitive)
     expect(await resolveEducationPublicationTools(tx,old)).toEqual([])
     const mappingId=randomUUID(),instrumentKey='synthetic_sjt_'+randomUUID(),instrumentVersion='1.0.0'
     const sjt=await seedMeasurement({family:'SJT',scope:{kind:'PLATFORM'},content:{measurementHash:hash,instrumentVersion,
      executable:{respondentType:'teacher_self_report'}},provenance:{sourceKind:'STATIC_SJT_REGISTRY',mappingId,contentDigest:hash,instrumentKey,instrumentVersion}})
     await tx.staticSjtMeasurementMapping.create({data:{id:mappingId,instrumentKey,instrumentVersion,contentDigest:hash,
      deployment:{},deploymentHash:hash,measurementReleaseId:sjt.id}})
     const situational=await seedDelivery('TEACHER','SITUATIONAL',{itemId:randomUUID(),family:'SJT',
      source:{kind:'STATIC_SJT_REGISTRY',id:mappingId,instrumentKey,instrumentVersion},
      measurement:{releaseId:sjt.id,contentHash:sjt.contentHash,measurementHash:hash}})
     expect(await resolveEducationPublicationTools(tx,situational)).toEqual([{trackId:situational.tracks[0].id,key:'SJT:'+instrumentKey}])
     throw rollback
    })).rejects.toBe(rollback)
   }finally{await db.$disconnect()}
  })
})
