import { randomBytes, randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { GIT_RELEASE_USERNAME } from '../../utils/gitReleaseIdentity'
import { authController } from '../../controllers/authController'
import * as loginRate from '../../middleware/loginRateLimit'
import { loadCurrentPrincipal } from '../../modules/organization/principal'
import { adminSecretHash, beginAdminLogin, beginAdminRegistration, issueAdminSession } from '../../modules/admin-permissions/security'
import { beginAdminTotpRegistration } from '../../modules/admin-permissions/totp'
import { forceResetPasswordBySystemAdmin } from '../../services/accountAuthorityService'
import { setUserActiveState } from '../../services/userLifecycleService'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {prisma} from '../../config/database'
import {readApprovedToolEntryProducts} from '../../modules/assessment-governance/tool-entry-policy'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {syncGitScaleReleases, type GitScaleRelease} from '../../modules/scale/onboarding/git-release-publication'
import {ensureGitScalePublisher} from '../../modules/scale/onboarding/git-release-actor'
import {composeTriplet, sourceParts, type Part, type Triplet} from '../../modules/survey/standard-triplet.model'
import {standardReleaseRow, withdrawStandardTriplet} from '../../modules/survey/standard-triplet.service'
import {toolReference} from '../../modules/survey/tool-reference'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {resolveScaleStartDeployment} from '../../modules/scale/deployment/service'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {Prisma} from '@prisma/client'

const url=process.env.GIT_SCALE_RELEASE_TEST_DATABASE_URL
const suite=url?describe:describe.skip
const toolKey='academic_self_concept_physics_zh_cn'
const commit=(character:string)=>character.repeat(40)
let actorId:string
let adminId:string

function release(suffix:string,allowedEntries:GitScaleRelease['allowedEntries'],replaces?:string,key=toolKey):GitScaleRelease{
  const parts=Object.fromEntries(sourceParts(key,'1.0.0').map(part=>[part.axis,part])) as Triplet['parts']
  const report={...parts.REPORT.payload as Triplet['definition']['report'],reportVersion:'pg-'+suffix}
  const payload={definition:report}
  const changed:Part={...parts.REPORT,payload,version:report.reportVersion,hash:canonicalHash(payload),reference:toolReference('SCALE',key,{gitAsset:true})}
  return {releaseKey:'pg-'+suffix,triplet:composeTriplet(key,{...parts,REPORT:changed}),allowedEntries,state:'ONLINE',replaces}
}
const sync=(sha:string,releases:GitScaleRelease[])=>syncGitScaleReleases(prisma,{actorId,gitCommitSha:commit(sha),releases})

suite('Git policy uses the existing exact scale publication lifecycle',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    const userData={passwordHash:'synthetic-not-a-login',platformRole:'SYSTEM_ADMIN' as const,accountDomain:'TRAINING',mustChangePassword:false}
    actorId=await ensureGitScalePublisher(prisma)
    adminId=(await prisma.user.create({data:{...userData,username:'git_scale_test_admin_'+randomUUID()}})).id
  })
  afterAll(()=>prisma.$disconnect())

  it('replays, replaces and restores exact combinations and preserves manual withdrawal',async()=>{
    const first=release('first',['SURVEY'])
    const second=release('second',['SURVEY','TRAINING'],first.releaseKey)
    expect(first.triplet.blockers).toEqual([])
    expect(second.triplet.parts.CONTENT.hash).toBe(first.triplet.parts.CONTENT.hash)
    await expect(syncGitScaleReleases(prisma,{actorId:adminId,gitCommitSha:commit('a'),releases:[first]})).rejects.toMatchObject({statusCode:403})
    const grantsBefore=await prisma.materialGrant.count({where:{resourceType:'STANDARD_COMBINATION'}})
    const [a]=await sync('a',[first])
    expect(a.action).toBe('PUBLISHED')
    const older=await standardReleaseRow(prisma,a.releaseId)
    expect(older.state).toBe('ONLINE')
    expect(older.approved_by).toBe(actorId)
    expect(await prisma.$queryRaw`SELECT case_index FROM survey_standard_trials WHERE release_id=${a.releaseId}`).toHaveLength(3)
    expect(await readApprovedToolEntryProducts(prisma,{resourceKey:'standard-release:'+a.releaseId,fingerprint:older.combination_hash})).toMatchObject({approvedProducts:['SURVEY']})
    expect(await prisma.scale.findUnique({where:{code:toolKey}})).toMatchObject({status:'PUBLISHED',visibility:'HIDDEN'})
    expect(await sync('a',[first])).toEqual([{...a,action:'UNCHANGED'}])
    expect((await standardReleaseRow(prisma,a.releaseId)).latest_trial).toBe(older.latest_trial)

    await expect(sync('d',[
      {...first,state:'HOLD',allowedEntries:['TRAINING']},
      {...second,state:'HOLD'},
    ])).resolves.toEqual([])
    expect(await standardReleaseRow(prisma,a.releaseId)).toMatchObject({
      state:'ONLINE',version:older.version,latest_trial:older.latest_trial,
    })
    expect(await readApprovedToolEntryProducts(prisma,{resourceKey:'standard-release:'+a.releaseId,fingerprint:older.combination_hash}))
      .toMatchObject({approvedProducts:['SURVEY']})
    expect(await prisma.$queryRaw`SELECT id FROM survey_standard_releases WHERE combination_hash=${second.triplet.combinationHash}`).toEqual([])

    const broken={...second,triplet:{...second.triplet,blockers:['synthetic P/R binding conflict']}}
    await expect(sync('b',[first,broken])).rejects.toThrow('synthetic P/R binding conflict')
    expect((await standardReleaseRow(prisma,a.releaseId)).state).toBe('ONLINE')
    const published=await sync('b',[first,second])
    const b=published.find(entry=>entry.action==='PUBLISHED')!
    expect(published).toContainEqual({...a,action:'WITHDRAWN'})
    expect((await standardReleaseRow(prisma,a.releaseId)).state).toBe('WITHDRAWN')
    expect((await standardReleaseRow(prisma,b.releaseId)).state).toBe('ONLINE')
    expect(await sync('c',[first])).toEqual([{...a,action:'RESTORED'},{...b,action:'WITHDRAWN'}])
    const restored=await standardReleaseRow(prisma,a.releaseId)
    expect(restored.latest_trial).toBe(older.latest_trial)
    expect(restored.snapshot).toEqual(older.snapshot)
    await withdrawStandardTriplet(adminId,a.releaseId,restored.version,'synthetic manual withdrawal')
    expect(await sync('c',[first])).toEqual([{...a,action:'MANUAL_HOLD'}])
    expect((await standardReleaseRow(prisma,a.releaseId)).state).toBe('WITHDRAWN')
    expect(await prisma.materialGrant.count({where:{resourceType:'STANDARD_COMBINATION'}})).toBe(grantsBefore)
  },30000)

  it('enables the exact report when an existing legacy scale expands from Survey to Training',async()=>{
    const key='who5',instrumentVersion='1.0.0'
    const source=getScaleInstrumentSource(key,instrumentVersion)!
    const definition=source.executable!.definition
    const scale=await prisma.scale.create({data:{name:'WHO-5 fixture',code:key,instrumentVersion,
      instrumentClass:'STANDARD',status:'PUBLISHED',creatorId:adminId,
      definition:definition as unknown as Prisma.InputJsonValue,definitionHash:hashScaleDefinition(definition)}})
    const parts=Object.fromEntries(sourceParts(key,instrumentVersion).map(part=>[part.axis,part])) as Triplet['parts']
    const report={...definition.report,reportVersion:'pg-legacy-source-report'}
    const payload={definition:report,reportVisibility:{schemaVersion:1,policyVersion:'pg-legacy-r',unknownAudience:'DENY',
      audiences:{subject:{numericScores:true,references:false,scoreDerivedLabels:false,individualInterpretations:true,educationalContent:true,artwork:false}}}}
    const next=composeTriplet(key,{...parts,REPORT:{...parts.REPORT,payload,version:report.reportVersion,hash:canonicalHash(payload)}})
    const declaration:GitScaleRelease={releaseKey:'legacy-exact',triplet:next,allowedEntries:['SURVEY'],state:'ONLINE'}
    expect((await sync('d',[declaration])).find(entry=>entry.releaseKey===declaration.releaseKey)?.action).toBe('PUBLISHED')
    expect((await sync('e',[{...declaration,allowedEntries:['SURVEY','TRAINING']}])).find(entry=>entry.releaseKey===declaration.releaseKey)?.action).toBe('SCOPE_CHANGED')
    expect(await resolveScaleStartDeployment({db:prisma,scale,requestedMode:'STANDALONE'})).toMatchObject({kind:'LEGACY_V1',allowNewStarts:true})
    expect(await resolveScaleStartDeployment({db:prisma,scale,requestedMode:'COMPOSITE',exactStandard:{instrumentKey:key,instrumentVersion}}))
      .toMatchObject({kind:'MANAGED_V2',allowNewStarts:true})
  },30000)

  it('rolls back every tool when the second tool cannot publish',async()=>{
    const first = release('batch-first', ['SURVEY'])
    const conflictingKey='wibps7_adolescent_zh_cn_research'
    const broken = release('batch-second', ['SURVEY'], undefined, conflictingKey)
    // The manifest is structurally valid. Its second tool fails on a database
    // native-code collision after the first tool would otherwise be ONLINE.
    await prisma.scale.create({data:{code:conflictingKey,name:'Synthetic conflicting code',creatorId:adminId}})
    const eventCount = await prisma.surveyEvent.count({where:{actorUserId:actorId}})
    await expect(sync('d',[first,broken])).rejects.toThrow('STANDARD_NATIVE_CONFLICT:'+conflictingKey)
    expect(await prisma.$queryRaw`SELECT id FROM survey_standard_releases WHERE combination_hash IN (${first.triplet.combinationHash},${broken.triplet.combinationHash})`).toEqual([])
    expect(await prisma.surveyEvent.count({where:{actorUserId:actorId}})).toBe(eventCount)
  },30000)

  it('keeps the Git publisher out of interactive authentication and credential recovery', async () => {
    vi.stubEnv('ADMIN_AUTH_ORIGIN', 'http://localhost:5174')
    vi.stubEnv('ADMIN_WEBAUTHN_RP_ID', 'localhost')
    vi.stubEnv('ADMIN_MFA_ENCRYPTION_KEY', randomBytes(32).toString('hex'))
    const ticket = randomBytes(32).toString('base64url')
    const ordinaryTicket = randomBytes(32).toString('base64url')
    const accounts = [[actorId, ticket], [adminId, ordinaryTicket]]
    const req = { body: { username: GIT_RELEASE_USERNAME, password: 'UnusedPass0123' } } as Request
    const res = { locals: {}, status: vi.fn().mockReturnThis(), json: vi.fn(), append: vi.fn() } as unknown as Response
    try {
      expect(await ensureGitScalePublisher(prisma)).toBe(actorId)
      expect(await loadCurrentPrincipal(actorId)).toBeNull()
      expect(await loadCurrentPrincipal(adminId)).toMatchObject({ userId: adminId, platformRole: 'SYSTEM_ADMIN' })
      vi.spyOn(loginRate, 'recordLoginFailure').mockResolvedValue({ accountIpAllowed: true, accountGlobalAllowed: true, retryAfterSeconds: 0 })
      for (const trainingEntrance of [false, true]) {
        res.locals.trainingEntrance = trainingEntrance
        await authController.login(req, res)
        expect(res.status).toHaveBeenLastCalledWith(401)
      }
      await expect(forceResetPasswordBySystemAdmin({ actorUserId: adminId, targetUserId: actorId, passwordHash: 'unused-test-hash' })).rejects.toMatchObject({statusCode: 404})
      await expect(setUserActiveState({ actorUserId: adminId, targetUserId: actorId, isActive: true })).rejects.toMatchObject({statusCode: 404})
      for (const [userId, token] of accounts) {
        await prisma.adminSecurityChallenge.create({ data: { idHash: adminSecretHash(token), userId, purpose: 'ENROLLMENT',
          tokenVersion: 0, challenge: '', expiresAt: new Date(Date.now() + 60_000) } })
      }
      await expect(beginAdminLogin(req, res, actorId)).rejects.toMatchObject({statusCode: 403})
      await expect(beginAdminRegistration(req, res, actorId, ticket)).rejects.toMatchObject({statusCode: 403})
      await expect(beginAdminTotpRegistration(req, res, actorId, ticket)).rejects.toMatchObject({statusCode: 403})
      await expect(issueAdminSession(req, res, actorId, 0, 'TOTP')).rejects.toMatchObject({statusCode: 403})
      expect(res.append).not.toHaveBeenCalled()
      expect(await beginAdminTotpRegistration(req, res, adminId, ordinaryTicket)).toHaveProperty('otpauthUri')
    } finally {
      const ticketHashes = accounts.map(([, token]) => adminSecretHash(token))
      await prisma.adminSecurityChallenge.deleteMany({ where: { OR: [
        { idHash: { in: ticketHashes } }, { enrollmentHash: { in: ticketHashes } },
      ] } })
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
    }
  })
})
