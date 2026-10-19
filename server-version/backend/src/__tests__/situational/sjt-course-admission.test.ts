import { beforeEach, describe, expect, it, vi } from 'vitest'
import example from '../../modules/situational/authoring/examples/teacher-demonstration.json'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
const mock = vi.hoisted(() => ({ releases: vi.fn(), query: vi.fn(), grants: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { sjtAuthorRelease: { findMany: mock.releases }, $queryRaw: mock.query } }))
vi.mock('../../modules/situational/authoring/grants', async importOriginal => ({ ...await importOriginal<any>(), assertSjtCourseGrants: mock.grants }))
import { inspectSituationalReleases, resolveSituationalReleases, situationalReleaseKey } from '../../modules/situational/situational-release.service'
import { compositeSjtGrantScope } from '../../modules/composite/composite.service'
import { parseFrozenSituationalRuntimeSnapshot, hashFrozenSituationalRuntimeSnapshot } from '../../modules/assessment-runtime/situational-runtime-snapshot'
const c = compileSjtTemplate({ ...example, instrumentKey: 'c13-grant-student', respondentType: 'student_self_report' })
const identity = { instrumentKey: c.package.key, instrumentVersion: c.package.instrumentVersion }
const row = { id:'release', ...identity, status:'PUBLISHED', definitionHash:c.definitionHash, contentDigest:c.contentDigest, authorizationPolicy:'COURSE_GRANT_V1', package:{...c.package,releaseStatus:'PUBLISHED'} }
const scope={teacherId:'teacher',courseId:'course',purpose:'TRAINING_COURSE' as const}
const receipt={policy:'COURSE_GRANT_V1' as const,grantId:'grant',grantVersion:1,permission:'DISTRIBUTE' as const,releaseId:row.id,...identity,definitionHash:c.definitionHash,contentDigest:c.contentDigest,granteeTeacherId:scope.teacherId,courseId:scope.courseId,purpose:scope.purpose,validFrom:'2026-01-01T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',admittedAt:'2026-10-18T00:00:00.000Z'}
beforeEach(()=>{vi.clearAllMocks();mock.releases.mockResolvedValue([row]);mock.query.mockResolvedValue([{id:row.id}]);mock.grants.mockResolvedValue(new Map([[row.id,receipt]]))})
describe('controlled SJT course admission',()=>{
 it('uses one exact batch and freezes only the receipt, preserving hashes',async()=>{
  const result=await resolveSituationalReleases([identity,identity],undefined,true,scope)
  expect(mock.grants).toHaveBeenCalledTimes(1)
  expect(mock.grants.mock.calls[0].slice(2)).toEqual([scope,'DISTRIBUTE',{lock:true,releaseLocked:true}])
  const snapshot=result.get(situationalReleaseKey(identity))!.snapshot
  expect(snapshot.authorizationReceipt).toEqual(receipt)
  expect(snapshot.definitionHash).toBe(c.definitionHash)
  expect(parseFrozenSituationalRuntimeSnapshot(snapshot)).toEqual(snapshot)
  const forged=structuredClone(snapshot);forged.authorizationReceipt!.instrumentVersion='9.0.0';forged.snapshotHash=hashFrozenSituationalRuntimeSnapshot(forged)
  expect(()=>parseFrozenSituationalRuntimeSnapshot(forged)).toThrow('receipt identity')
 })
 it('keeps preflight failure local without retrying or querying every item',async()=>{
  mock.grants.mockRejectedValue(Object.assign(new Error('course grant rejected'),{statusCode:403}))
  const result=await inspectSituationalReleases([identity,identity],undefined,false,scope)
  expect(result.errors.size).toBe(1);expect(result.releases.size).toBe(0)
  expect(mock.releases).toHaveBeenCalledTimes(1);expect(mock.grants).toHaveBeenCalledTimes(1)
 })
 it('does not reauthorize an accepted frozen receipt during later restore',async()=>{
  const snapshot=(await resolveSituationalReleases([identity],undefined,true,scope)).get(situationalReleaseKey(identity))!.snapshot
  mock.grants.mockRejectedValue(Object.assign(new Error('revoked'),{statusCode:403}))
  expect(parseFrozenSituationalRuntimeSnapshot(snapshot)).toEqual(snapshot)
  expect(mock.grants).toHaveBeenCalledTimes(1)
  await expect(resolveSituationalReleases([identity],undefined,true,scope)).rejects.toThrow('revoked')
 })
 it('does not infer course purpose from standalone, GENERAL or ambiguous multi-course sources',()=>{
  expect(compositeSjtGrantScope({createdBy:'teacher'})).toBeUndefined()
  expect(compositeSjtGrantScope({createdBy:'teacher',productKind:'QUESTIONNAIRE',questionnaireType:'GENERAL',courseId:'forged'})).toBeUndefined()
  expect(compositeSjtGrantScope({createdBy:'teacher',productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',questionnaireCourses:[{courseId:'a'},{courseId:'b'}],deliveryCourseId:'a'})).toBeUndefined()
  expect(compositeSjtGrantScope({createdBy:'teacher',productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',questionnaireCourses:[{courseId:'course'}]})).toEqual(scope)
  expect(compositeSjtGrantScope({createdBy:'teacher',courseId:'course'})).toEqual(scope)
 })
})
