import {beforeEach,describe,expect,it,vi} from 'vitest'
import {readPackageReleaseAdmission} from '../../modules/bundle-product/package-release'
import {scaffoldPackage} from '../../modules/assessment-bundle/onboarding/template'
import {hashDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {assertEducationPackageUseCurrent,readEducationPackageForUse} from '../../modules/education-tools/package-reference.access'
import {educationPackageKey} from '../../modules/education-tools/package-reference.contracts'
import {fixedEducationPackageSelection,preservesEducationPackageSelection} from '../../modules/education-tools/package-reference.selection'
import type {TrainingContentSnapshot} from '../../modules/composite/training-content-binding'

const m=vi.hoisted(()=>({use:vi.fn(),source:vi.fn(),author:vi.fn(),headers:vi.fn()}))
vi.mock('../../modules/education-tools/public-source.catalog',()=>({readEducationPublicUse:m.use}))
vi.mock('../../modules/education-tools/package-reference.source',()=>({readEducationWholePackageSource:m.source}))
vi.mock('../../modules/education-tools/package-reference.headers',async original=>({...await original<typeof import('../../modules/education-tools/package-reference.headers')>(),readEducationPackageHeaders:m.headers}))
vi.mock('../../modules/education-tools/private-tool.access',()=>({authorizePrivateTool:m.author}))
const id=(n:number)=>`96000000-1111-4000-8000-${String(n).padStart(12,'0')}`
const ref={provider:'NATIVE_RELEASE' as const,versionId:id(1),contentHash:'a'.repeat(64)}
const scope={product:'TEACHER' as const,organizationId:id(2),actorId:id(3)},pinned={sourceRef:ref,grantId:id(4),grantVersion:1},tx={} as never
beforeEach(()=>{vi.resetAllMocks();m.use.mockResolvedValue(new Map([[educationPackageKey(ref),{grantId:id(4),grantVersion:1}]]));m.headers.mockResolvedValue(new Map([[educationPackageKey(ref),{family:'NATIVE_BUNDLE',nativeRespondentTypes:['SELF'],nativeInitiationModes:['TEACHER_ASSIGNMENT'],population:{subjectPopulation:'unspecified'}}]]));m.source.mockResolvedValue({kind:'NATIVE_BUNDLE',entry:{definition:scaffoldPackage('synthetic_p6_connection').manifest.definition}})})
describe('whole package connection boundaries',()=>{
 it('checks the original author and exact pinned U once without duplicating native START admission; a replacement grant does not repair revocation',async()=>{
  await assertEducationPackageUseCurrent(tx,scope,pinned)
  expect(m.author).toHaveBeenCalledTimes(1);expect(m.use).toHaveBeenCalledTimes(1);expect(m.headers).toHaveBeenCalledTimes(1);expect(m.source).not.toHaveBeenCalled()
  m.use.mockResolvedValue(new Map([[educationPackageKey(ref),{grantId:id(5),grantVersion:1}]]))
  await expect(assertEducationPackageUseCurrent(tx,scope,pinned)).rejects.toMatchObject({code:'EDUCATION_PACKAGE_USE_REQUIRED',statusCode:403})
  expect(m.headers).toHaveBeenCalledTimes(1);expect(m.source).not.toHaveBeenCalled()
 })
 it('does not read a source after author removal or U revocation',async()=>{
  m.author.mockRejectedValueOnce(Error('author removed'))
  await expect(assertEducationPackageUseCurrent(tx,scope,pinned)).rejects.toThrow('author removed')
  expect(m.use).not.toHaveBeenCalled();expect(m.source).not.toHaveBeenCalled()
  m.use.mockResolvedValue(new Map())
  await expect(assertEducationPackageUseCurrent(tx,scope,pinned)).rejects.toMatchObject({code:'EDUCATION_PACKAGE_USE_REQUIRED'})
  expect(m.source).not.toHaveBeenCalled()
 })
 it('keeps youth SELF out of Teacher and normalizes original release stoppage',async()=>{
  m.source.mockResolvedValueOnce({kind:'NATIVE_BUNDLE',entry:{definition:{...scaffoldPackage('synthetic_youth').manifest.definition,population:{subjectPopulation:'youth'}}}})
  await expect(readEducationPackageForUse(tx,ref,'TEACHER')).rejects.toMatchObject({code:'EDUCATION_PACKAGE_ADMINISTRATION_UNSUPPORTED',statusCode:400})
  m.source.mockRejectedValueOnce(Error('BUNDLE_PACKAGE_NOT_PUBLISHED'))
  await expect(readEducationPackageForUse(tx,ref,'SCHOOL')).rejects.toMatchObject({code:'EDUCATION_PACKAGE_SOURCE_UNAVAILABLE',statusCode:409})
 })
 it('retains original parameter priority and report, allowing only separately authorized missing target reports',()=>{
  const snapshot={units:[{itemId:id(6),referencePolicy:{choices:[{releaseId:id(7),entryKey:'original',priority:8}]},report:{releaseId:id(8)}},{itemId:id(9)}]} as unknown as TrainingContentSnapshot
  const fixed=fixedEducationPackageSelection(snapshot)
  expect(fixed.references.units[0].choices[0].priority).toBe(8)
  expect(preservesEducationPackageSelection(snapshot,fixed)).toBe(true)
  const changed=structuredClone(fixed);changed.references.units[0].choices[0].priority=0
  expect(preservesEducationPackageSelection(snapshot,changed)).toBe(false)
  expect(preservesEducationPackageSelection(snapshot,{...fixed,reports:[]})).toBe(false)
  expect(preservesEducationPackageSelection(snapshot,{...fixed,reports:[...fixed.reports,{itemId:id(9),releaseId:id(10)}]})).toBe(true)
 })
 it('uses one locked exact source read and rejects changed stored content before review/dependency work',async()=>{
  const content=scaffoldPackage('synthetic_p6_admission'),hash=hashDeclarativePackage(content)
  content.report.states.missing='changed stored report'
  const query=vi.fn(async(_strings:TemplateStringsArray,..._values:unknown[])=>[{id:ref.versionId,status:'PUBLISHED',bundleKey:content.manifest.definition.bundleKey,bundleVersion:'1.0.0',contentHash:hash,content}])
  await expect(readPackageReleaseAdmission({$queryRaw:query} as never,ref.versionId,hash)).rejects.toThrow('BUNDLE_PACKAGE_NOT_PUBLISHED')
  expect(query).toHaveBeenCalledTimes(1)
  expect(query.mock.calls[0][0].join(' ')).toContain('FOR SHARE')
 })
})
