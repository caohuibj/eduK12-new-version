import {randomUUID} from 'node:crypto'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {prisma} from '../../config/database'
import {readApprovedToolEntryProducts} from '../../modules/assessment-governance/tool-entry-policy'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {syncGitScaleReleases, type GitScaleRelease} from '../../modules/scale/onboarding/git-release-publication'
import {composeTriplet, sourceParts, type Part, type Triplet} from '../../modules/survey/standard-triplet.model'
import {standardReleaseRow, withdrawStandardTriplet} from '../../modules/survey/standard-triplet.service'
import {toolReference} from '../../modules/survey/tool-reference'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'

const url=process.env.GIT_SCALE_RELEASE_TEST_DATABASE_URL
const suite=url?describe:describe.skip
const toolKey='academic_self_concept_physics_zh_cn'
const commit=(character:string)=>character.repeat(40)
let actorId:string
let adminId:string

function release(suffix:string,allowedEntries:GitScaleRelease['allowedEntries'],replaces?:string):GitScaleRelease{
  const parts=Object.fromEntries(sourceParts(toolKey,'1.0.0').map(part=>[part.axis,part])) as Triplet['parts']
  const report={...parts.REPORT.payload as Triplet['definition']['report'],reportVersion:'pg-'+suffix}
  const payload={definition:report}
  const changed:Part={...parts.REPORT,payload,version:report.reportVersion,hash:canonicalHash(payload),reference:toolReference('SCALE',toolKey,{gitAsset:true})}
  return {releaseKey:'pg-'+suffix,triplet:composeTriplet(toolKey,{...parts,REPORT:changed}),allowedEntries,state:'ONLINE',replaces}
}
const sync=(sha:string,releases:GitScaleRelease[])=>syncGitScaleReleases(prisma,{actorId,gitCommitSha:commit(sha),releases})

suite('Git policy uses the existing exact scale publication lifecycle',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    const userData={passwordHash:'synthetic-not-a-login',platformRole:'SYSTEM_ADMIN' as const,accountDomain:'TRAINING',mustChangePassword:false}
    actorId=(await prisma.user.upsert({where:{username:'SYSTEM_GIT_RELEASE'},update:{},create:{...userData,username:'SYSTEM_GIT_RELEASE'}})).id
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
})
