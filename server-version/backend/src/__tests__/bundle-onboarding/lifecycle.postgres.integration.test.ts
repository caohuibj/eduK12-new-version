import { describe,it,expect,beforeAll,afterAll,vi } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { randomUUID,createHmac } from 'node:crypto'
import { mkdtempSync,rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { canonicalJsonString } from '../../modules/assessment-runtime/canonical'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { scaffoldPackage } from '../../modules/assessment-bundle/onboarding/template'
import { writePackage,loadPackage,generatePackages } from '../../modules/assessment-bundle/onboarding/loader'
import { hashDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'
import { installPackage,publishPackage,changePackageStatus } from '../../modules/bundle-product/package-release'
import { previewPackage, savePackage, approvePackage, getPackageDraft, refreshPublishedPackages } from '../../modules/bundle-product/admin-authoring'
import { packageEntry, generatedPackages } from '../../modules/assessment-bundle/onboarding/catalog'
import { BundleDefinitionProvider } from '../../modules/bundle-product/definition-provider'
import { getExecutableScalePackage } from '../../modules/scale/onboarding/executable-registry'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { freezeAssignmentProfile,freezeDataForWrite } from '../../modules/cognitive/profile-freeze'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { gonogoSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'
const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL')
const suite=url?describe:describe.skip
suite('unknown declarative packages: installation to frozen report',()=>{
  let db:PrismaClient,courseId:string,scaleId:string,assignmentId:string,scalePreviousStatus:any
  const suffix=randomUUID(),actor={userId:'b3-admin-'+suffix,role:UserRole.ADMIN},reviewer='b3-reviewer-'+suffix,student='b3-student-'+suffix
  const keys:string[]=[],root=mkdtempSync(path.join(os.tmpdir(),'b3-packages-'))
  const secret='b3-isolated-review-key-'+suffix
  let runtime:typeof import('../../modules/composite/composite.service'),analysis:typeof import('../../modules/bundle-product/analysis')
  const scale=getExecutableScalePackage('who5','1.0.0')!
  const oldKey=process.env.BUNDLE_REVIEW_SIGNING_KEY
  beforeAll(async()=>{
    process.env.DATABASE_URL=url!;process.env.BUNDLE_PRODUCTS_ENABLED='true';process.env.BUNDLE_REVIEW_SIGNING_KEY=secret
    db=new PrismaClient({datasources:{db:{url}}})
    for(const [id,role] of [[actor.userId,'ADMIN'],[reviewer,'ADMIN'],[student,'STUDENT']] as const)await db.user.create({data:{id,username:id,passwordHash:'fixture-only',role}})
    courseId=(await db.course.create({data:{creatorId:actor.userId,title:'B3 fixture',courseCode:'B3-'+suffix,status:'PUBLISHED'}})).id
    await db.courseStudent.create({data:{courseId,studentId:student,status:'ACTIVE'}})
    scaleId=((await db.scale.findUnique({where:{code:'who5'}})) ?? await db.scale.create({data:{code:'who5',name:'WHO5 isolated fixture',creatorId:actor.userId,status:'PUBLISHED',visibility:'HIDDEN',instrumentClass:'STANDARD',instrumentVersion:'1.0.0',definition:scale.definition as any,definitionHash:hashScaleDefinition(scale.definition),itemCount:5,dimensionCount:1}})).id
    scalePreviousStatus=(await db.scale.findUniqueOrThrow({where:{id:scaleId}})).status
    await db.scale.update({where:{id:scaleId},data:{status:'PUBLISHED'}})
    const entry=requireCognitiveRegistryEntry('gonogo','1.0.0','1.0.0'),freeze=freezeAssignmentProfile({entry,profile:'standard',baseConfig:{totalTrials:120,nogoRatio:0.25,stimulusMs:800,isiMs:500,validRtFloorMs:100,report:{reportVersion:'1.0.0',referenceMode:'none'}}})
    const config=await db.cognitiveTestConfig.upsert({where:{testType_configVersion:{testType:'gonogo',configVersion:'1.0.0'}},update:{},create:{testType:'gonogo',configVersion:'1.0.0',name:'B3 fixture',status:'PUBLISHED',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:freeze.resolvedConfig as any,accessPolicy:'OPEN'}})
    assignmentId=(await db.cognitiveAssignment.create({data:{configId:config.id,courseId,createdBy:actor.userId,title:'Go/No-Go',status:'PUBLISHED',listedStandalone:true,...freezeDataForWrite(freeze)}})).id
    runtime=await import('../../modules/composite/composite.service');analysis=await import('../../modules/bundle-product/analysis')
  },60000)
  afterAll(async()=>{
    if(db){
      const ids=(await db.compositeAssessment.findMany({where:{createdBy:actor.userId},select:{id:true}})).map(v=>v.id)
      const attempts=(await db.compositeAssessmentAttempt.findMany({where:{compositeAssessmentId:{in:ids}},select:{id:true}})).map(v=>v.id)
      await db.assessmentUnitSnapshot.deleteMany({where:{compositeAttemptId:{in:attempts}}})
      await db.situationalRawSubmission.deleteMany({where:{attempt:{compositeAttemptId:{in:attempts}}}})
      await db.situationalAttempt.deleteMany({where:{compositeAttemptId:{in:attempts}}})
      await db.cognitiveRawSubmission.deleteMany({where:{session:{compositeAttemptId:{in:attempts}}}})
      await db.cognitiveSession.deleteMany({where:{compositeAttemptId:{in:attempts}}})
      await db.assessment.deleteMany({where:{compositeAttemptId:{in:attempts}}})
      await db.compositeAssessment.deleteMany({where:{id:{in:ids}}})
      await db.cognitiveAssignment.deleteMany({where:{createdBy:actor.userId}})
      if(scaleId && scalePreviousStatus)await db.scale.update({where:{id:scaleId},data:{status:scalePreviousStatus}})
      await db.scale.deleteMany({where:{creatorId:actor.userId}})
      await db.course.deleteMany({where:{id:courseId}})
      await db.bundlePackageRelease.deleteMany({where:{installedBy:actor.userId}})
      await db.user.deleteMany({where:{id:{in:[actor.userId,reviewer,student]}}})
      await db.$disconnect()
    }
    rmSync(root,{recursive:true,force:true})
    if(oldKey===undefined)delete process.env.BUNDLE_REVIEW_SIGNING_KEY;else process.env.BUNDLE_REVIEW_SIGNING_KEY=oldKey
  })
  it.each(['scale_sjt','cognitive_scale'])('onboards %s without package-name branches, preserves old report after retirement',async combination=>{
    const key='unknown_'+combination+'_'+suffix.replace(/-/g,'');keys.push(key)
    const p=scaffoldPackage(key)
    if(combination==='cognitive_scale'){
      p.manifest.definition.slots=[{slotKey:'cognitive',unitType:'COGNITIVE',position:0,required:true,instrumentKey:'gonogo',instrumentVersion:'1.0.0',respondentType:'SELF',valueSelectors:['commissionRate']}]
      p.manifest.cognitiveDependencies=[{slotKey:'cognitive',configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',profile:'standard'}]
      p.evidence=[{evidenceKey:'cognitive.observation',slotKey:'cognitive',selector:'commissionRate',valueType:'number',unit:'ratio',construct:'inhibition',role:'PRIMARY',direction:'neutral',qualityPolicy:'allow_limited'}]
    }
    p.manifest.definition.slots.push({slotKey:'scale',unitType:'SCALE',position:1,required:true,instrumentKey:'who5',instrumentVersion:'1.0.0',respondentType:'SELF',valueSelectors:['raw_total']})
    p.evidence.push({evidenceKey:'scale.observation',slotKey:'scale',selector:'raw_total',valueType:'number',unit:'points',construct:'wellbeing',role:'SUPPORTING',direction:'neutral',qualityPolicy:'allow_limited'})
    p.rules.items[0]={...p.rules.items[0],kind:'cross_source_condition',when:{op:'all',conditions:p.evidence.map(e=>({op:'present',evidenceKey:e.evidenceKey}))},evidenceKeys:p.evidence.map(e=>e.evidenceKey),text:'本次两个来源均有可读取的描述性结果，不代表一致性或联合效度。'}
    p.fixtures=Object.fromEntries(['valid','missing','invalid','not-applicable'].map(name=>[name,{values:Object.fromEntries(p.evidence.map(e=>[e.evidenceKey,name==='valid'?{state:'present',value:1}:{state:name==='not-applicable'?'not_applicable':name}])),expectedRuleIds:name==='valid'?['observed']:[],expectedKind:'COMPUTED'}])) as any
    const dir=path.join(root,key,'1.0.0');writePackage(dir,p)
    const loaded=loadPackage(dir),hash=hashDeclarativePackage(loaded)
    generatePackages(root,path.join(root,'..',path.basename(root)+'-generated.json'))
    const installed=await installPackage(db,actor.userId,loaded)
    expect(installed.status).toBe('DRAFT');expect((await installPackage(db,actor.userId,loaded)).id).toBe(installed.id)
    await expect(installPackage(db,student,loaded)).rejects.toThrow('ADMIN')
    const changed=structuredClone(loaded);changed.rules.items[0].text='Different'
    await expect(installPackage(db,actor.userId,changed)).rejects.toThrow('IMMUTABLE')
    const material={contentHash:hash,reviewerId:reviewer,expiresAt:new Date(Date.now()+3600000).toISOString(),claims:['independent_summary','cross_source_condition'],scientific:true,rights:true,language:true,report:true}
    const review={...material,signature:createHmac('sha256',secret).update(canonicalJsonString(material)).digest('hex')}
    const selfMaterial = { ...material, reviewerId: actor.userId }
    const selfReview = { ...selfMaterial, signature: createHmac('sha256', secret).update(canonicalJsonString(selfMaterial)).digest('hex') }
    await expect(publishPackage(db, reviewer, key, '1.0.0', selfReview)).rejects.toThrow('BUNDLE_INDEPENDENT_REVIEW_REQUIRED')
    await expect(publishPackage(db,actor.userId,key,'1.0.0',{...review,contentHash:'0'.repeat(64)})).rejects.toThrow()
    const provider=new BundleDefinitionProvider([packageEntry(loaded)]),product=(await import('../../modules/bundle-product/service')).createBundleProductService(provider)
    await expect(product.eligible(actor,key,'1.0.0')).rejects.toThrow()
    await Promise.all([publishPackage(db,actor.userId,key,'1.0.0',review),publishPackage(db,actor.userId,key,'1.0.0',review)])
    const bindings=[{slotKey:'scale',resourceId:scaleId},...(combination==='scale_sjt'?[{slotKey:'situational'}]:[{slotKey:'cognitive',resourceId:assignmentId}])]
    let row=await product.create(actor,{requestId:randomUUID(),bundleKey:key,bundleVersion:'1.0.0',name:key,courseId,bindings})
    row=await product.publish(actor,row.id,row.revision)
    const started=await runtime.startUserAttempt(student,row.id),attemptId=started.attempt.id
    if(combination==='scale_sjt'){
      const child=await db.situationalAttempt.findFirstOrThrow({where:{compositeAttemptId:attemptId}})
      await (await import('../../modules/situational/situational-final-submit.service')).submitSituationalAttemptFinal({attemptId:child.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:child.definitionHash,instrumentVersion:child.instrumentVersion,compiledRuntimeHash:child.compiledRuntimeHash,scoringVersion:child.scoringVersion,responses:[{sceneKey:'AS-01',channelKey:'behavior',responseValue:'A'},{sceneKey:'AS-02',channelKey:'behavior',responseValue:'B'}],embedded:{compositeAttemptId:attemptId,compositeItemId:child.compositeItemId!,compositeSlotKey:compositeItemSlotKey(child.compositeItemId!,'SITUATIONAL'),userId:student}})
    }else{
      const cog=await db.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:attemptId},include:{assignment:true}})
      await (await import('../../modules/cognitive/final-submit.service')).submitCognitiveSessionFinal(student,{sessionId:cog.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:cog.assignment!.resolvedConfigHash!,contextSnapshotHash:null,trials:gonogoSequence(cog.randomSeed,120,0.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1000,endedAtPerfMs:trialIndex*1000+300,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}}))})
    }
    const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:attemptId}})
    const answers=scale.definition.items.map(i=>({itemCode:i.itemCode,responseValue:scale.definition.responseSets.find(r=>r.key===i.responseSetKey)!.options[0].value}))
    await (await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal({assessmentId:child.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:hashScaleDefinition(scale.definition),contextSnapshotHash:null,answers})
    await runtime.finalizeCompositeAttemptIfReady(attemptId)
    const initial=await analysis.readReport(attemptId,'admin')
    expect(initial.status).not.toBe('FAILED');expect(initial.status).not.toBe('PENDING');expect(initial.factsHash).toBeTruthy()
    expect(initial.view?.engineSummary.kind).toBe('COMPUTED')
    const next=await analysis.reanalyze(actor,attemptId,{requestId:randomUUID(),targetBundleKey:key,targetBundleVersion:'1.0.0',reason:'fixture',previousAnalysisId:initial.analysisId},provider,product.eligible)
    expect(next.analysisId).not.toBe(initial.analysisId)
    expect((await analysis.readReport(attemptId,'admin',initial.analysisId)).factsHash).toBe(initial.factsHash)
    await changePackageStatus(db,actor.userId,key,'1.0.0','RETIRED')
    await expect(product.eligible(actor,key,'1.0.0')).rejects.toThrow()
    await expect(changePackageStatus(db,actor.userId,key,'1.0.0','HOLD')).rejects.toThrow('RETIRED')
    await expect(publishPackage(db,actor.userId,key,'1.0.0',review)).rejects.toThrow('RETIRED')
    expect((await db.bundlePackageRelease.findUniqueOrThrow({where:{id:installed.id}})).review).toEqual(review)
    expect((await analysis.readReport(attemptId,'admin',initial.analysisId)).factsHash).toBe(initial.factsHash)
  },60000)
  it('supports admin authoring and independent signed approval without exposing signing material', async () => {
    const key = 'admin_authoring_' + suffix.replace(/-/g, '')
    keys.push(key)
    const pack = scaffoldPackage(key)
    const preview = previewPackage(actor, pack)
    expect(preview.blockers).toEqual([])
    expect(preview.scenarios.every(scenario => scenario.synthetic)).toBe(true)
    expect(() => previewPackage({ userId: student, role: UserRole.TEACHER }, pack)).toThrow()
    const saved = await savePackage(db, actor, pack)
    expect(saved.status).toBe('DRAFT')
    const material = { contentHash: saved.contentHash, scientific: true, rights: true, language: true, report: true, claims: preview.requiredClaims }
    await expect(approvePackage(db, actor, key, '1.0.0', material)).rejects.toMatchObject({ statusCode: 403 })
    await expect(approvePackage(db, { userId: reviewer, role: UserRole.ADMIN }, key, '1.0.0', { ...material, contentHash: 'f'.repeat(64) })).rejects.toMatchObject({ statusCode: 409 })
    const approved = await approvePackage(db, { userId: reviewer, role: UserRole.ADMIN }, key, '1.0.0', material)
    expect(approved.status).toBe('PUBLISHED')
    expect(approved.installedBy).toBe(actor.userId)
    expect(approved.publishedBy).toBe(reviewer)
    expect(approved.review).toMatchObject({ reviewerId: reviewer, contentHash: saved.contentHash })
    expect(approved.review).not.toHaveProperty('signature')
    const provider = new BundleDefinitionProvider([])
    await refreshPublishedPackages(db, provider)
    expect(provider.exact(key, '1.0.0')?.declarativePackage).toEqual(pack)
    await expect(savePackage(db, actor, { ...pack, manifest: { ...pack.manifest, definition: { ...pack.manifest.definition, name: 'Changed immutable title' } } })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('更换版本号') })
    expect((await getPackageDraft(db, actor, key, '1.0.0')).contentHash).toBe(saved.contentHash)
    const product = (await import('../../modules/bundle-product/service')).createBundleProductService(provider)
    expect((await product.eligible(actor, key, '1.0.0')).definition.bundleKey).toBe(key)
    // Advance only Date; real Prisma/HTTP timers remain available.
    const expiry = Date.parse(approved.review!.expiresAt)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(expiry + 1)
      await expect(product.eligible(actor, key, '1.0.0')).rejects.toMatchObject({ statusCode: 409 })
      await expect(approvePackage(db, actor, key, '1.0.0', material)).rejects.toMatchObject({ statusCode: 403 })
      const renewed = await approvePackage(db, { userId: reviewer, role: UserRole.ADMIN }, key, '1.0.0', material)
      expect(renewed).toMatchObject({ status: 'PUBLISHED', installedBy: actor.userId, publishedBy: reviewer, contentHash: saved.contentHash })
      expect(Date.parse(renewed.review!.expiresAt)).toBeGreaterThan(Date.now())
      expect(renewed.content).toEqual(saved.content)
      expect((await product.eligible(actor, key, '1.0.0')).definition.bundleKey).toBe(key)
      const previous = await db.bundleAnalysis.findFirstOrThrow({ where: { attempt: { userId: student } } })
      expect((await analysis.readReport(previous.attemptId, 'admin', previous.id)).factsHash).toBe(previous.factsHash)
    } finally { vi.useRealTimers() }
  })
  it('rejects changed code-catalog content before saving while allowing the identical immutable package', async () => {
    const pack = generatedPackages()[0], definition = pack.manifest.definition
    const where = { bundleKey_bundleVersion: { bundleKey: definition.bundleKey, bundleVersion: definition.bundleVersion } }
    const before = await db.bundlePackageRelease.findUnique({ where })
    const changed = structuredClone(pack)
    changed.manifest.definition.name += ' changed without a new version'
    await expect(installPackage(db, actor.userId, changed)).rejects.toThrow('BUNDLE_VERSION_IMMUTABLE')
    expect(await db.bundlePackageRelease.findUnique({ where })).toEqual(before)
    const installed = await installPackage(db, actor.userId, pack)
    expect(installed.contentHash).toBe(hashDeclarativePackage(pack))
    expect((await installPackage(db, actor.userId, pack)).id).toBe(installed.id)
    const provider = new BundleDefinitionProvider([packageEntry(pack)])
    expect(() => provider.register(packageEntry(installed.content))).not.toThrow()
  })
  it('requires a new independent signed review to restore HOLD and never restores RETIRED', async () => {
    const key = 'hold_review_' + suffix.replace(/-/g, '')
    keys.push(key)
    const pack = scaffoldPackage(key), preview = previewPackage(actor, pack), saved = await savePackage(db, actor, pack)
    const material = { contentHash: saved.contentHash, scientific: true, rights: true, language: true, report: true, claims: preview.requiredClaims }
    const independent = { userId: reviewer, role: UserRole.ADMIN }
    await approvePackage(db, independent, key, '1.0.0', material)
    const where = { bundleKey_bundleVersion: { bundleKey: key, bundleVersion: '1.0.0' } }
    const published = await db.bundlePackageRelease.findUniqueOrThrow({ where })
    await changePackageStatus(db, actor.userId, key, '1.0.0', 'HOLD')
    await expect(publishPackage(db, reviewer, key, '1.0.0', published.review)).rejects.toThrow('BUNDLE_HOLD_REVIEW_REQUIRED')
    await expect(approvePackage(db, actor, key, '1.0.0', material)).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.bundlePackageRelease.findUniqueOrThrow({ where })).status).toBe('HOLD')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 1000)
      const restored = await approvePackage(db, independent, key, '1.0.0', material)
      expect(restored).toMatchObject({ status: 'PUBLISHED', contentHash: saved.contentHash, installedBy: actor.userId, publishedBy: reviewer })
      expect(restored.content).toEqual(saved.content)
      expect((await db.bundlePackageRelease.findUniqueOrThrow({ where })).review).not.toEqual(published.review)
      await changePackageStatus(db, actor.userId, key, '1.0.0', 'RETIRED')
      await expect(approvePackage(db, independent, key, '1.0.0', material)).rejects.toMatchObject({ statusCode: 409 })
      await expect(changePackageStatus(db, reviewer, key, '1.0.0', 'HOLD')).rejects.toThrow('BUNDLE_RETIRED')
      expect((await db.bundlePackageRelease.findUniqueOrThrow({ where })).status).toBe('RETIRED')
    } finally { vi.useRealTimers() }
  })
})
